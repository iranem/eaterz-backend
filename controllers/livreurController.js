const { User, Commande, Livraison, CommandeItem, Plat, LoyaltyTransaction, sequelize } = require('../models');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { paginate, paginationResponse } = require('../utils/helpers');
const { DELIVERY_STATUS, LIVREUR_STATUS, ORDER_STATUS, LIVREUR_COMMISSION_RATE } = require('../utils/constants');
const { emitToUser, emitToPrestataire } = require('../config/socket');
const { Op } = require('sequelize');

/**
 * @desc    Dashboard livreur
 * @route   GET /api/livreur/dashboard
 * @access  Private/Livreur
 */
const getDashboard = asyncHandler(async (req, res) => {
    const livreurId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
        coursesAujourdhui,
        coursesEnCours,
        gainsAujourdhui,
        gainsMois,
        noteGlobale
    ] = await Promise.all([
        // Courses livrées aujourd'hui
        Livraison.count({
            where: {
                livreurId,
                statut: DELIVERY_STATUS.DELIVERED,
                dateLivraison: { [Op.gte]: today }
            }
        }),
        // Courses en cours
        Livraison.count({
            where: {
                livreurId,
                statut: { [Op.in]: [DELIVERY_STATUS.ASSIGNED, DELIVERY_STATUS.PICKED_UP, DELIVERY_STATUS.IN_TRANSIT] }
            }
        }),
        // Gains aujourd'hui
        Livraison.sum('commission', {
            where: {
                livreurId,
                statut: DELIVERY_STATUS.DELIVERED,
                dateLivraison: { [Op.gte]: today }
            }
        }),
        // Gains ce mois
        Livraison.sum('commission', {
            where: {
                livreurId,
                statut: DELIVERY_STATUS.DELIVERED,
                dateLivraison: { [Op.gte]: new Date(today.getFullYear(), today.getMonth(), 1) }
            }
        }),
        // Note moyenne
        Livraison.findOne({
            where: { livreurId, noteLivreur: { [Op.ne]: null } },
            attributes: [[sequelize.fn('AVG', sequelize.col('noteLivreur')), 'moyenne']]
        })
    ]);

    res.json({
        success: true,
        data: {
            statut: req.user.livreurStatus,
            kpis: {
                coursesAujourdhui: coursesAujourdhui || 0,
                coursesEnCours: coursesEnCours || 0,
                gainsAujourdhui: parseFloat(gainsAujourdhui || 0).toFixed(2),
                gainsMois: parseFloat(gainsMois || 0).toFixed(2),
                noteGlobale: noteGlobale?.dataValues?.moyenne
                    ? parseFloat(noteGlobale.dataValues.moyenne).toFixed(1)
                    : '5.0'
            }
        }
    });
});

/**
 * @desc    Courses assignées au livreur
 * @route   GET /api/livreur/courses
 * @access  Private/Livreur
 */
const getCoursesAssignees = asyncHandler(async (req, res) => {
    const { statut } = req.query;

    const where = { livreurId: req.user.id };
    if (statut) {
        where.statut = statut;
    } else {
        // Par défaut : courses actives
        where.statut = { [Op.in]: [DELIVERY_STATUS.ASSIGNED, DELIVERY_STATUS.PICKED_UP, DELIVERY_STATUS.IN_TRANSIT] };
    }

    const courses = await Livraison.findAll({
        where,
        include: [
            {
                model: Commande,
                as: 'commande',
                include: [
                    { model: User, as: 'client', attributes: ['id', 'prenom', 'nom', 'telephone'] },
                    { model: User, as: 'prestataire', attributes: ['id', 'nomEtablissement', 'telephone', 'adresse'] },
                    { model: CommandeItem, as: 'items', include: [{ model: Plat, as: 'plat' }] }
                ]
            }
        ],
        order: [['dateAssignation', 'ASC']]
    });

    res.json({
        success: true,
        data: courses
    });
});

/**
 * @desc    Détail d'une course
 * @route   GET /api/livreur/courses/:id
 * @access  Private/Livreur
 */
const getCourseById = asyncHandler(async (req, res) => {
    const course = await Livraison.findOne({
        where: { id: req.params.id, livreurId: req.user.id },
        include: [
            {
                model: Commande,
                as: 'commande',
                include: [
                    { model: User, as: 'client', attributes: { exclude: ['password'] } },
                    { model: User, as: 'prestataire', attributes: ['id', 'nomEtablissement', 'telephone', 'adresse', 'avatar'] },
                    { model: CommandeItem, as: 'items', include: [{ model: Plat, as: 'plat' }] }
                ]
            }
        ]
    });

    if (!course) {
        res.status(404);
        throw new Error('Course non trouvée');
    }

    res.json({
        success: true,
        data: course
    });
});

/**
 * @desc    Mettre à jour le statut d'une course
 * @route   PUT /api/livreur/courses/:id/statut
 * @access  Private/Livreur
 */
const updateStatutCourse = asyncHandler(async (req, res) => {
    const { statut, motifEchec, positionActuelle } = req.body;

    const course = await Livraison.findOne({
        where: { id: req.params.id, livreurId: req.user.id },
        include: [{ model: Commande, as: 'commande' }]
    });

    if (!course) {
        res.status(404);
        throw new Error('Course non trouvée');
    }

    // Valider les transitions
    const validTransitions = {
        [DELIVERY_STATUS.ASSIGNED]: [DELIVERY_STATUS.PICKED_UP, DELIVERY_STATUS.FAILED],
        [DELIVERY_STATUS.PICKED_UP]: [DELIVERY_STATUS.IN_TRANSIT, DELIVERY_STATUS.FAILED],
        [DELIVERY_STATUS.IN_TRANSIT]: [DELIVERY_STATUS.DELIVERED, DELIVERY_STATUS.FAILED],
        [DELIVERY_STATUS.DELIVERED]: [],
        [DELIVERY_STATUS.FAILED]: []
    };

    if (!validTransitions[course.statut]?.includes(statut)) {
        res.status(400);
        throw new Error(`Transition invalide: ${course.statut} → ${statut}`);
    }

    const updateData = { statut };

    switch (statut) {
        case DELIVERY_STATUS.PICKED_UP:
            updateData.dateRecuperation = new Date();
            break;
        case DELIVERY_STATUS.DELIVERED:
            updateData.dateLivraison = new Date();
            updateData.commission = course.fraisLivraison * 0.8; // Supposons 80% commission
            // MAJ statut commande
            await course.commande.update({ statut: 'livree', dateLivraison: new Date() }); // 'livree' au lieu de ORDER_STATUS.DELIVERED si non importé
            // MAJ stats livreur
            await req.user.increment('nombreLivraisons');

            // 🎁 Programme de Fidélité
            try {
                const client = await User.findByPk(course.commande.clientId);
                if (client) {
                    // 1 point par 100 DA
                    const pointsGagnes = Math.floor(course.commande.total / 100);

                    if (pointsGagnes > 0) {
                        await client.increment('loyaltyPoints', { by: pointsGagnes });

                        // Enregistrer transaction
                        await LoyaltyTransaction.create({
                            clientId: client.id,
                            type: 'earn',
                            points: pointsGagnes,
                            description: `Commande #${course.commande.numero}`,
                            referenceType: 'commande',
                            referenceId: course.commande.id.toString()
                        });

                        // Upgrade de niveau (Tier)
                        const nouveauSolde = client.loyaltyPoints + pointsGagnes;
                        let nouveauNiveau = client.loyaltyTier;

                        if (nouveauSolde >= 10000) nouveauNiveau = 'platinum';
                        else if (nouveauSolde >= 5000) nouveauNiveau = 'gold';
                        else if (nouveauSolde >= 1000) nouveauNiveau = 'silver';

                        if (nouveauNiveau !== client.loyaltyTier) {
                            await client.update({ loyaltyTier: nouveauNiveau });
                            // Notification upgrade
                            emitToUser(client.id, 'loyalty:upgrade', {
                                tier: nouveauNiveau,
                                message: `Félicitations ! Vous êtes maintenant membre ${nouveauNiveau.toUpperCase()} 🌟`
                            });
                        }

                        // Notification points
                        emitToUser(client.id, 'loyalty:earned', {
                            points: pointsGagnes,
                            total: nouveauSolde,
                            message: `+${pointsGagnes} points gagnés !`
                        });

                        console.log(`🎁 ${pointsGagnes} points attribués au client ${client.id}`);
                    }
                }
            } catch (loyaltyError) {
                console.error('Erreur attribution points fidélité:', loyaltyError);
            }
            break;
        case DELIVERY_STATUS.FAILED:
            updateData.motifEchec = motifEchec;
            break;
    }

    if (positionActuelle) {
        updateData.positionActuelle = { ...positionActuelle, timestamp: new Date() };
    }

    await course.update(updateData);

    // Notifications
    try {
        emitToUser(course.commande.clientId, 'livraison:statut', {
            livraisonId: course.id,
            commandeId: course.commandeId,
            statut,
            position: positionActuelle
        });
    } catch (error) {
        console.error('Erreur notification:', error);
    }

    res.json({
        success: true,
        message: `Statut mis à jour: ${course.getStatusLabel()}`,
        data: course
    });
});

/**
 * @desc    Mettre à jour la position GPS
 * @route   PUT /api/livreur/position
 * @access  Private/Livreur
 */
const { emitLivreurPosition } = require('../config/socket');

/**
 * @desc    Mettre à jour la position GPS
 * @route   PUT /api/livreur/position
 * @access  Private/Livreur
 */
const updatePosition = asyncHandler(async (req, res) => {
    const { lat, lng } = req.body;

    if (!lat || !lng) {
        res.status(400);
        throw new Error('Coordonnées GPS requises');
    }

    const position = { lat, lng };

    await req.user.update({
        positionActuelle: position,
        dernierePingPosition: new Date()
    });

    // MAJ position sur les courses en cours
    const coursesActives = await Livraison.findAll({
        where: {
            livreurId: req.user.id,
            statut: { [Op.in]: [DELIVERY_STATUS.PICKED_UP, DELIVERY_STATUS.IN_TRANSIT] }
        },
        include: [{ model: Commande, as: 'commande' }]
    });

    for (const course of coursesActives) {
        // Update delivery position in DB
        await course.update({ positionActuelle: { ...position, timestamp: new Date() } });

        // Broadcast position via Socket
        emitLivreurPosition(
            course.id,
            course.commandeId,
            course.commande.clientId,
            { ...position, timestamp: new Date() }
        );
    }

    res.json({
        success: true,
        message: 'Position mise à jour'
    });
});

/**
 * @desc    Toggle disponibilité
 * @route   PUT /api/livreur/disponibilite
 * @access  Private/Livreur
 */
const toggleDisponibilite = asyncHandler(async (req, res) => {
    const { statut } = req.body;

    if (!Object.values(LIVREUR_STATUS).includes(statut)) {
        res.status(400);
        throw new Error('Statut invalide');
    }

    await req.user.update({ livreurStatus: statut });

    res.json({
        success: true,
        message: `Statut: ${statut}`,
        data: { livreurStatus: statut }
    });
});

/**
 * @desc    Historique des livraisons
 * @route   GET /api/livreur/historique
 * @access  Private/Livreur
 */
const getHistorique = asyncHandler(async (req, res) => {
    const { page, limit, dateDebut, dateFin } = req.query;
    const { limit: limitNum, offset, page: pageNum } = paginate(page, limit);

    const where = {
        livreurId: req.user.id,
        statut: { [Op.in]: [DELIVERY_STATUS.DELIVERED, DELIVERY_STATUS.FAILED] }
    };

    if (dateDebut || dateFin) {
        where.createdAt = {};
        if (dateDebut) where.createdAt[Op.gte] = new Date(dateDebut);
        if (dateFin) where.createdAt[Op.lte] = new Date(dateFin);
    }

    const { count, rows } = await Livraison.findAndCountAll({
        where,
        include: [
            {
                model: Commande,
                as: 'commande',
                include: [
                    { model: User, as: 'prestataire', attributes: ['id', 'nomEtablissement'] }
                ]
            }
        ],
        order: [['createdAt', 'DESC']],
        limit: limitNum,
        offset
    });

    res.json({
        success: true,
        ...paginationResponse(rows, count, pageNum, limitNum)
    });
});

/**
 * @desc    Statistiques de gains
 * @route   GET /api/livreur/gains
 * @access  Private/Livreur
 */
const getGains = asyncHandler(async (req, res) => {
    const livreurId = req.user.id;
    const today = new Date();

    const [gainsJour, gainsSemaine, gainsMois, totalLivraisons, pourboires] = await Promise.all([
        // Aujourd'hui
        Livraison.sum('commission', {
            where: {
                livreurId,
                statut: DELIVERY_STATUS.DELIVERED,
                dateLivraison: { [Op.gte]: new Date(today.setHours(0, 0, 0, 0)) }
            }
        }),
        // Cette semaine
        Livraison.sum('commission', {
            where: {
                livreurId,
                statut: DELIVERY_STATUS.DELIVERED,
                dateLivraison: { [Op.gte]: new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay()) }
            }
        }),
        // Ce mois
        Livraison.sum('commission', {
            where: {
                livreurId,
                statut: DELIVERY_STATUS.DELIVERED,
                dateLivraison: { [Op.gte]: new Date(today.getFullYear(), today.getMonth(), 1) }
            }
        }),
        // Total livraisons
        Livraison.count({
            where: { livreurId, statut: DELIVERY_STATUS.DELIVERED }
        }),
        // Pourboires
        Livraison.sum('pourboire', {
            where: { livreurId, statut: DELIVERY_STATUS.DELIVERED }
        })
    ]);

    res.json({
        success: true,
        data: {
            gainsJour: parseFloat(gainsJour || 0).toFixed(2),
            gainsSemaine: parseFloat(gainsSemaine || 0).toFixed(2),
            gainsMois: parseFloat(gainsMois || 0).toFixed(2),
            totalLivraisons: totalLivraisons || 0,
            pourboires: parseFloat(pourboires || 0).toFixed(2)
        }
    });
});

module.exports = {
    getDashboard,
    getCoursesAssignees,
    getCourseById,
    updateStatutCourse,
    updatePosition,
    toggleDisponibilite,
    getHistorique,
    getGains
};
