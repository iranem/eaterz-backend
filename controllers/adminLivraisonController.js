const { User, Commande, Livraison, CommandeItem, Plat, sequelize } = require('../models');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { paginate, paginationResponse } = require('../utils/helpers');
const { DELIVERY_STATUS, LIVREUR_STATUS, ORDER_STATUS, ROLES, LIVREUR_COMMISSION_RATE } = require('../utils/constants');
const { emitToUser } = require('../config/socket');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');

/**
 * @desc    Liste des livreurs
 * @route   GET /api/admin/livreurs
 * @access  Private/Admin
 */
const getLivreurs = asyncHandler(async (req, res) => {
    const { page, limit, statut, search, isActive } = req.query;
    const { limit: limitNum, offset, page: pageNum } = paginate(page, limit);

    const where = { role: ROLES.LIVREUR };

    if (statut) where.livreurStatus = statut;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
        where[Op.or] = [
            { nom: { [Op.like]: `%${search}%` } },
            { prenom: { [Op.like]: `%${search}%` } },
            { email: { [Op.like]: `%${search}%` } },
            { telephone: { [Op.like]: `%${search}%` } }
        ];
    }

    const { count, rows } = await User.findAndCountAll({
        where,
        attributes: { exclude: ['password'] },
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
 * @desc    Détail d'un livreur avec stats
 * @route   GET /api/admin/livreurs/:id
 * @access  Private/Admin
 */
const getLivreurById = asyncHandler(async (req, res) => {
    const livreur = await User.findOne({
        where: { id: req.params.id, role: ROLES.LIVREUR },
        attributes: { exclude: ['password'] }
    });

    if (!livreur) {
        res.status(404);
        throw new Error('Livreur non trouvé');
    }

    // Stats
    const [totalLivraisons, livraisonsReussies, livraisonsEchouees, noteMoyenne, gainsTotal] = await Promise.all([
        Livraison.count({ where: { livreurId: livreur.id } }),
        Livraison.count({ where: { livreurId: livreur.id, statut: DELIVERY_STATUS.DELIVERED } }),
        Livraison.count({ where: { livreurId: livreur.id, statut: DELIVERY_STATUS.FAILED } }),
        Livraison.findOne({
            where: { livreurId: livreur.id, noteLivreur: { [Op.ne]: null } },
            attributes: [[sequelize.fn('AVG', sequelize.col('noteLivreur')), 'moyenne']]
        }),
        Livraison.sum('commission', { where: { livreurId: livreur.id, statut: DELIVERY_STATUS.DELIVERED } })
    ]);

    res.json({
        success: true,
        data: {
            livreur,
            stats: {
                totalLivraisons,
                livraisonsReussies,
                livraisonsEchouees,
                tauxReussite: totalLivraisons > 0 ? ((livraisonsReussies / totalLivraisons) * 100).toFixed(1) : 0,
                noteMoyenne: noteMoyenne?.dataValues?.moyenne ? parseFloat(noteMoyenne.dataValues.moyenne).toFixed(1) : '5.0',
                gainsTotal: parseFloat(gainsTotal || 0).toFixed(2)
            }
        }
    });
});

/**
 * @desc    Créer un livreur
 * @route   POST /api/admin/livreurs
 * @access  Private/Admin
 */
const createLivreur = asyncHandler(async (req, res) => {
    const { email, password, nom, prenom, telephone, vehiculeImmatriculation, livreurZones } = req.body;

    // Vérifier si email existe
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
        res.status(400);
        throw new Error('Cet email est déjà utilisé');
    }

    const livreur = await User.create({
        email,
        password,
        nom,
        prenom,
        telephone,
        role: ROLES.LIVREUR,
        vehiculeImmatriculation,
        livreurZones: livreurZones || [],
        livreurStatus: LIVREUR_STATUS.OFFLINE,
        isVerified: true,
        isActive: true
    });

    res.status(201).json({
        success: true,
        message: 'Livreur créé avec succès',
        data: livreur.toJSON()
    });
});

/**
 * @desc    Modifier un livreur
 * @route   PUT /api/admin/livreurs/:id
 * @access  Private/Admin
 */
const updateLivreur = asyncHandler(async (req, res) => {
    const livreur = await User.findOne({
        where: { id: req.params.id, role: ROLES.LIVREUR }
    });

    if (!livreur) {
        res.status(404);
        throw new Error('Livreur non trouvé');
    }

    const { nom, prenom, telephone, vehiculeImmatriculation, livreurZones } = req.body;

    await livreur.update({
        nom: nom || livreur.nom,
        prenom: prenom || livreur.prenom,
        telephone: telephone || livreur.telephone,
        vehiculeImmatriculation: vehiculeImmatriculation || livreur.vehiculeImmatriculation,
        livreurZones: livreurZones || livreur.livreurZones
    });

    res.json({
        success: true,
        message: 'Livreur modifié',
        data: livreur.toJSON()
    });
});

/**
 * @desc    Activer/Désactiver un livreur
 * @route   PUT /api/admin/livreurs/:id/activation
 * @access  Private/Admin
 */
const toggleActivation = asyncHandler(async (req, res) => {
    const livreur = await User.findOne({
        where: { id: req.params.id, role: ROLES.LIVREUR }
    });

    if (!livreur) {
        res.status(404);
        throw new Error('Livreur non trouvé');
    }

    await livreur.update({ isActive: !livreur.isActive });

    res.json({
        success: true,
        message: livreur.isActive ? 'Livreur activé' : 'Livreur désactivé',
        data: { isActive: livreur.isActive }
    });
});

/**
 * @desc    Commandes prêtes à assigner
 * @route   GET /api/admin/livraisons/a-assigner
 * @access  Private/Admin
 */
const getCommandesAAssigner = asyncHandler(async (req, res) => {
    // Commandes prêtes sans livraison assignée
    const commandes = await Commande.findAll({
        where: { statut: ORDER_STATUS.READY },
        include: [
            { model: User, as: 'client', attributes: ['id', 'prenom', 'nom', 'telephone'] },
            { model: User, as: 'prestataire', attributes: ['id', 'nomEtablissement', 'adresse', 'telephone'] },
            {
                model: Livraison,
                as: 'livraison',
                required: false
            }
        ],
        order: [['datePrete', 'ASC']]
    });

    // Filtrer celles sans livraison ou en attente
    const commandesAAssigner = commandes.filter(c =>
        !c.livraison || c.livraison.statut === DELIVERY_STATUS.PENDING
    );

    res.json({
        success: true,
        data: commandesAAssigner
    });
});

/**
 * @desc    Assigner une commande à un livreur
 * @route   POST /api/admin/livraisons/assigner
 * @access  Private/Admin
 */
const assignerCommande = asyncHandler(async (req, res) => {
    const { commandeId, livreurId } = req.body;

    // Vérifier la commande
    const commande = await Commande.findByPk(commandeId, {
        include: [
            { model: User, as: 'prestataire', attributes: ['id', 'adresse', 'ville'] },
            { model: Livraison, as: 'livraison' }
        ]
    });

    if (!commande) {
        res.status(404);
        throw new Error('Commande non trouvée');
    }

    if (commande.statut !== ORDER_STATUS.READY) {
        res.status(400);
        throw new Error('La commande doit être prête pour être assignée');
    }

    // Vérifier le livreur
    const livreur = await User.findOne({
        where: { id: livreurId, role: ROLES.LIVREUR, isActive: true }
    });

    if (!livreur) {
        res.status(404);
        throw new Error('Livreur non trouvé ou inactif');
    }

    // Créer ou mettre à jour la livraison
    let livraison = commande.livraison;

    if (livraison) {
        await livraison.update({
            livreurId,
            statut: DELIVERY_STATUS.ASSIGNED,
            dateAssignation: new Date()
        });
    } else {
        livraison = await Livraison.create({
            commandeId,
            livreurId,
            statut: DELIVERY_STATUS.ASSIGNED,
            dateAssignation: new Date(),
            adresseRecuperation: commande.prestataire.adresse,
            villeRecuperation: commande.prestataire.ville,
            adresseLivraison: commande.adresseLivraison,
            villeLivraison: commande.villeLivraison,
            fraisLivraison: commande.fraisLivraison
        });
    }

    // MAJ statut commande
    await commande.update({ statut: ORDER_STATUS.DELIVERING });

    // MAJ statut livreur
    await livreur.update({ livreurStatus: LIVREUR_STATUS.BUSY });

    // Notifications
    try {
        emitToUser(livreurId, 'livraison:assignee', {
            livraisonId: livraison.id,
            commandeId,
            prestataire: commande.prestataire?.nomEtablissement,
            adresse: commande.adresseLivraison
        });
    } catch (error) {
        console.error('Erreur notification:', error);
    }

    res.json({
        success: true,
        message: 'Commande assignée au livreur',
        data: livraison
    });
});

/**
 * @desc    Réassigner une commande
 * @route   POST /api/admin/livraisons/reassigner
 * @access  Private/Admin
 */
const reassignerCommande = asyncHandler(async (req, res) => {
    const { livraisonId, nouveauLivreurId, motif } = req.body;

    const livraison = await Livraison.findByPk(livraisonId, {
        include: [{ model: User, as: 'livreur' }]
    });

    if (!livraison) {
        res.status(404);
        throw new Error('Livraison non trouvée');
    }

    const nouveauLivreur = await User.findOne({
        where: { id: nouveauLivreurId, role: ROLES.LIVREUR, isActive: true }
    });

    if (!nouveauLivreur) {
        res.status(404);
        throw new Error('Nouveau livreur non trouvé');
    }

    const ancienLivreurId = livraison.livreurId;

    await livraison.update({
        livreurId: nouveauLivreurId,
        dateAssignation: new Date(),
        notes: `Réassigné: ${motif || 'Non spécifié'}`
    });

    // MAJ statut anciens livreur
    if (ancienLivreurId) {
        const autresCourses = await Livraison.count({
            where: {
                livreurId: ancienLivreurId,
                statut: { [Op.in]: [DELIVERY_STATUS.ASSIGNED, DELIVERY_STATUS.PICKED_UP, DELIVERY_STATUS.IN_TRANSIT] }
            }
        });
        if (autresCourses === 0) {
            await User.update(
                { livreurStatus: LIVREUR_STATUS.AVAILABLE },
                { where: { id: ancienLivreurId } }
            );
        }
    }

    // MAJ statut nouveau livreur
    await nouveauLivreur.update({ livreurStatus: LIVREUR_STATUS.BUSY });

    // Notifications
    try {
        emitToUser(nouveauLivreurId, 'livraison:assignee', {
            livraisonId: livraison.id,
            reassignation: true
        });
    } catch (error) {
        console.error('Erreur notification:', error);
    }

    res.json({
        success: true,
        message: 'Commande réassignée',
        data: livraison
    });
});

/**
 * @desc    Stats globales livraison
 * @route   GET /api/admin/livraisons/stats
 * @access  Private/Admin
 */
const getStatsLivraisons = asyncHandler(async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
        totalLivreurs,
        livreursActifs,
        livraisonsAujourdhui,
        livraisonsEnCours,
        livraisonsReussies,
        livraisonsEchouees,
        tempsLivraisonMoyen
    ] = await Promise.all([
        User.count({ where: { role: ROLES.LIVREUR } }),
        User.count({ where: { role: ROLES.LIVREUR, livreurStatus: LIVREUR_STATUS.AVAILABLE } }),
        Livraison.count({ where: { createdAt: { [Op.gte]: today } } }),
        Livraison.count({ where: { statut: { [Op.in]: [DELIVERY_STATUS.ASSIGNED, DELIVERY_STATUS.PICKED_UP, DELIVERY_STATUS.IN_TRANSIT] } } }),
        Livraison.count({ where: { statut: DELIVERY_STATUS.DELIVERED } }),
        Livraison.count({ where: { statut: DELIVERY_STATUS.FAILED } }),
        sequelize.query(`
      SELECT AVG(TIMESTAMPDIFF(MINUTE, dateAssignation, dateLivraison)) as moyenne
      FROM livraisons 
      WHERE statut = 'livree' AND dateAssignation IS NOT NULL AND dateLivraison IS NOT NULL
    `, { type: sequelize.QueryTypes.SELECT })
    ]);

    res.json({
        success: true,
        data: {
            totalLivreurs,
            livreursActifs,
            livraisonsAujourdhui,
            livraisonsEnCours,
            livraisonsReussies,
            livraisonsEchouees,
            tauxReussite: (livraisonsReussies + livraisonsEchouees) > 0
                ? ((livraisonsReussies / (livraisonsReussies + livraisonsEchouees)) * 100).toFixed(1)
                : 100,
            tempsLivraisonMoyen: tempsLivraisonMoyen[0]?.moyenne
                ? Math.round(tempsLivraisonMoyen[0].moyenne)
                : null
        }
    });
});

/**
 * @desc    Livreurs disponibles en temps réel
 * @route   GET /api/admin/livreurs/disponibles
 * @access  Private/Admin
 */
const getLivreursDisponibles = asyncHandler(async (req, res) => {
    const livreurs = await User.findAll({
        where: {
            role: ROLES.LIVREUR,
            isActive: true,
            livreurStatus: LIVREUR_STATUS.AVAILABLE
        },
        attributes: ['id', 'nom', 'prenom', 'telephone', 'positionActuelle', 'dernierePingPosition', 'noteLivreur', 'nombreLivraisons', 'livreurZones']
    });

    res.json({
        success: true,
        data: livreurs
    });
});

/**
 * @desc    Auto-assigner une commande au livreur le plus proche disponible
 * @route   POST /api/admin/livraisons/auto-assigner
 * @access  Private/Admin
 */
const autoAssignerCommande = asyncHandler(async (req, res) => {
    const { commandeId } = req.body;

    const commande = await Commande.findByPk(commandeId, {
        include: [
            { model: User, as: 'prestataire', attributes: ['id', 'adresse', 'ville', 'positionActuelle'] }
        ]
    });

    if (!commande) {
        res.status(404);
        throw new Error('Commande non trouvée');
    }

    // Trouver le livreur disponible avec la meilleure note
    const livreur = await User.findOne({
        where: {
            role: ROLES.LIVREUR,
            isActive: true,
            livreurStatus: LIVREUR_STATUS.AVAILABLE
        },
        order: [
            ['noteLivreur', 'DESC'],
            ['nombreLivraisons', 'DESC']
        ]
    });

    if (!livreur) {
        res.status(400);
        throw new Error('Aucun livreur disponible');
    }

    // Utiliser la fonction d'assignation existante
    req.body.livreurId = livreur.id;
    return assignerCommande(req, res);
});

module.exports = {
    getLivreurs,
    getLivreurById,
    createLivreur,
    updateLivreur,
    toggleActivation,
    getCommandesAAssigner,
    assignerCommande,
    reassignerCommande,
    getStatsLivraisons,
    getLivreursDisponibles,
    autoAssignerCommande
};
