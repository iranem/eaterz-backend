const { Commande, Livraison, User, CommandeItem, Plat, sequelize } = require('../models');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { DELIVERY_STATUS, ORDER_STATUS } = require('../utils/constants');
const { Op } = require('sequelize');

/**
 * Controller Prestataire - Gestion des livraisons
 * Modèle Hybride: Le prestataire peut voir et interagir avec les livraisons de ses commandes
 */

/**
 * Obtenir les commandes du prestataire avec infos livraison
 * GET /api/prestataire/livraisons
 */
const getCommandesAvecLivraison = asyncHandler(async (req, res) => {
    const prestataireId = req.user.id;
    const { statut, page = 1, limit = 20 } = req.query;

    const where = { prestataireId };

    // Filtrer par statut de commande si spécifié
    if (statut) {
        where.statut = statut;
    }

    const offset = (page - 1) * limit;

    const { count, rows: commandes } = await Commande.findAndCountAll({
        where,
        include: [
            {
                model: User,
                as: 'client',
                attributes: ['id', 'prenom', 'nom', 'telephone']
            },
            {
                model: Livraison,
                as: 'livraison',
                include: [
                    {
                        model: User,
                        as: 'livreur',
                        attributes: ['id', 'prenom', 'nom', 'telephone', 'livreurStatus', 'positionActuelle', 'noteLivreur']
                    }
                ]
            },
            {
                model: CommandeItem,
                as: 'items',
                include: [{ model: Plat, as: 'plat', attributes: ['nom'] }]
            }
        ],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset
    });

    res.json({
        success: true,
        data: commandes,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count,
            totalPages: Math.ceil(count / limit)
        }
    });
});

/**
 * Marquer une commande comme prête pour livraison
 * Déclenche la possibilité d'assignation par l'admin ou auto-assignation
 * PUT /api/prestataire/commandes/:id/prete
 */
const marquerCommandePrete = asyncHandler(async (req, res) => {
    const prestataireId = req.user.id;
    const { id } = req.params;

    const commande = await Commande.findOne({
        where: { id, prestataireId }
    });

    if (!commande) {
        return res.status(404).json({
            success: false,
            message: 'Commande non trouvée'
        });
    }

    // Vérifier que la commande est en préparation
    if (commande.statut !== ORDER_STATUS.PREPARING) {
        return res.status(400).json({
            success: false,
            message: 'La commande doit être en préparation pour être marquée prête'
        });
    }

    // Mettre à jour le statut
    commande.statut = ORDER_STATUS.READY;
    await commande.save();

    // Créer une entrée Livraison en attente si elle n'existe pas
    let livraison = await Livraison.findOne({ where: { commandeId: id } });

    if (!livraison) {
        // Récupérer les infos du prestataire pour l'adresse de récupération
        const prestataire = await User.findByPk(prestataireId);

        livraison = await Livraison.create({
            commandeId: id,
            statut: DELIVERY_STATUS.PENDING,
            adresseRecuperation: prestataire.adresse || '',
            villeRecuperation: prestataire.ville || 'Alger',
            adresseLivraison: commande.adresseLivraison || '',
            villeLivraison: commande.villeLivraison || 'Alger',
            fraisLivraison: commande.fraisLivraison || 0
        });
    }

    res.json({
        success: true,
        message: 'Commande marquée prête pour livraison',
        data: { commande, livraison }
    });
});

/**
 * Voir le détail d'une livraison (livreur, position, statut)
 * GET /api/prestataire/livraisons/:id
 */
const getDetailLivraison = asyncHandler(async (req, res) => {
    const prestataireId = req.user.id;
    const { id } = req.params;

    const commande = await Commande.findOne({
        where: { id, prestataireId },
        include: [
            {
                model: User,
                as: 'client',
                attributes: ['id', 'prenom', 'nom', 'telephone', 'adresse']
            },
            {
                model: Livraison,
                as: 'livraison',
                include: [
                    {
                        model: User,
                        as: 'livreur',
                        attributes: ['id', 'prenom', 'nom', 'telephone', 'livreurStatus', 'positionActuelle', 'noteLivreur', 'nombreLivraisons']
                    }
                ]
            }
        ]
    });

    if (!commande) {
        return res.status(404).json({
            success: false,
            message: 'Commande non trouvée'
        });
    }

    res.json({
        success: true,
        data: commande
    });
});

/**
 * Obtenir les statistiques de livraison du prestataire
 * GET /api/prestataire/livraisons/stats
 */
const getStatsLivraisons = asyncHandler(async (req, res) => {
    const prestataireId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Commandes prêtes en attente de livreur
    const commandesPretesCount = await Commande.count({
        where: {
            prestataireId,
            statut: ORDER_STATUS.READY
        }
    });

    // Livraisons en cours aujourd'hui
    const livraisonsEnCoursCount = await Commande.count({
        where: {
            prestataireId,
            statut: ORDER_STATUS.DELIVERING
        }
    });

    // Livraisons terminées aujourd'hui
    const livraisonsTermineesCount = await Commande.count({
        where: {
            prestataireId,
            statut: ORDER_STATUS.DELIVERED,
            updatedAt: { [Op.gte]: today }
        }
    });

    // Temps moyen de livraison (dernières 30 livraisons)
    const livraisonsRecentes = await Livraison.findAll({
        include: [{
            model: Commande,
            as: 'commande',
            where: { prestataireId },
            attributes: []
        }],
        where: {
            statut: DELIVERY_STATUS.DELIVERED,
            dateLivraison: { [Op.ne]: null },
            dateRecuperation: { [Op.ne]: null }
        },
        order: [['dateLivraison', 'DESC']],
        limit: 30
    });

    let tempsMoyenMinutes = null;
    if (livraisonsRecentes.length > 0) {
        const totalMinutes = livraisonsRecentes.reduce((sum, l) => {
            const diff = new Date(l.dateLivraison) - new Date(l.dateRecuperation);
            return sum + (diff / 60000);
        }, 0);
        tempsMoyenMinutes = Math.round(totalMinutes / livraisonsRecentes.length);
    }

    res.json({
        success: true,
        data: {
            commandesPretesEnAttente: commandesPretesCount,
            livraisonsEnCours: livraisonsEnCoursCount,
            livraisonsAujourdhui: livraisonsTermineesCount,
            tempsMoyenLivraison: tempsMoyenMinutes
        }
    });
});

/**
 * Demander un livreur (notification à l'admin pour assignation prioritaire)
 * POST /api/prestataire/commandes/:id/demander-livreur
 */
const demanderLivreur = asyncHandler(async (req, res) => {
    const prestataireId = req.user.id;
    const { id } = req.params;
    const { urgent = false, notes } = req.body;

    const commande = await Commande.findOne({
        where: { id, prestataireId },
        include: [{ model: Livraison, as: 'livraison' }]
    });

    if (!commande) {
        return res.status(404).json({
            success: false,
            message: 'Commande non trouvée'
        });
    }

    if (commande.livraison?.livreurId) {
        return res.status(400).json({
            success: false,
            message: 'Un livreur est déjà assigné à cette commande'
        });
    }

    // Ici on pourrait créer une notification pour l'admin
    // ou déclencher une auto-assignation si disponible

    // Pour l'instant, on met à jour les notes de la livraison
    if (commande.livraison) {
        commande.livraison.notes = notes || (urgent ? 'URGENT - Demande prioritaire du prestataire' : 'Demande du prestataire');
        await commande.livraison.save();
    }

    res.json({
        success: true,
        message: urgent
            ? 'Demande urgente envoyée à l\'administration'
            : 'Demande de livreur envoyée',
        data: { commandeId: id }
    });
});

module.exports = {
    getCommandesAvecLivraison,
    marquerCommandePrete,
    getDetailLivraison,
    getStatsLivraisons,
    demanderLivreur
};
