/**
 * Contrôleur pour le tracking GPS des livreurs
 */
const asyncHandler = require('express-async-handler');
const { Livraison, Commande, User } = require('../models');
const { getIO } = require('../config/socket');
const { ORDER_STATUS } = require('../utils/constants');

// Cache en mémoire pour les positions (en production, utiliser Redis)
const positionsCache = new Map();

/**
 * @desc    Mettre à jour la position du livreur
 * @route   POST /api/livreur/tracking/position
 * @access  Private (livreur)
 */
const updatePosition = asyncHandler(async (req, res) => {
    const livreurId = req.user.id;
    const { lat, lng, heading, speed } = req.body;

    if (!lat || !lng) {
        res.status(400);
        throw new Error('Latitude et longitude requises');
    }

    // Mettre à jour le cache
    const positionData = {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        heading: heading || null,
        speed: speed || null,
        updatedAt: new Date().toISOString(),
    };

    positionsCache.set(`livreur_${livreurId}`, positionData);

    // Trouver les livraisons actives du livreur
    const activeLivraisons = await Livraison.findAll({
        where: {
            livreurId,
            statut: ['assigned', 'picked_up', 'in_transit'],
        },
        include: [
            {
                model: Commande,
                as: 'commande',
                attributes: ['id', 'clientId'],
            },
        ],
    });

    const io = getIO();

    // Émettre la position à tous les clients concernés
    for (const livraison of activeLivraisons) {
        if (livraison.commande && io) {
            // Calculer ETA approximatif (en vrai, utiliser un service de routing)
            const eta = calculateETA(positionData.speed);

            // Émettre au client
            io.to(`order_${livraison.commande.id}`).emit('livreur:position', {
                lat: positionData.lat,
                lng: positionData.lng,
                heading: positionData.heading,
                eta,
            });

            // Émettre à la room du client
            io.to(`user_${livraison.commande.clientId}`).emit('livreur:position', {
                orderId: livraison.commande.id,
                lat: positionData.lat,
                lng: positionData.lng,
                heading: positionData.heading,
                eta,
            });
        }
    }

    res.json({
        success: true,
        message: 'Position mise à jour',
        data: positionData,
    });
});

/**
 * @desc    Obtenir la position actuelle d'un livreur
 * @route   GET /api/livreur/tracking/:livreurId/position
 * @access  Private
 */
const getLivreurPosition = asyncHandler(async (req, res) => {
    const { livreurId } = req.params;

    const position = positionsCache.get(`livreur_${livreurId}`);

    if (!position) {
        // Essayer de récupérer la dernière position connue depuis la DB
        const livreur = await User.findByPk(livreurId, {
            attributes: ['id', 'lastLatitude', 'lastLongitude', 'lastPositionUpdate'],
        });

        if (livreur && livreur.lastLatitude && livreur.lastLongitude) {
            return res.json({
                success: true,
                data: {
                    lat: livreur.lastLatitude,
                    lng: livreur.lastLongitude,
                    updatedAt: livreur.lastPositionUpdate,
                    isStale: true,
                },
            });
        }

        return res.json({
            success: false,
            message: 'Position non disponible',
        });
    }

    res.json({
        success: true,
        data: position,
    });
});

/**
 * @desc    Obtenir la position du livreur pour une commande
 * @route   GET /api/livreur/tracking/order/:orderId
 * @access  Private (client de la commande)
 */
const getOrderTrackingInfo = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user.id;

    // Vérifier que l'utilisateur a accès à cette commande
    const commande = await Commande.findOne({
        where: {
            id: orderId,
            clientId: userId,
            statut: [ORDER_STATUS.DELIVERING],
        },
        include: [
            {
                model: Livraison,
                as: 'livraison',
                include: [
                    {
                        model: User,
                        as: 'livreur',
                        attributes: ['id', 'prenom', 'nom', 'telephone'],
                    },
                ],
            },
            {
                model: User,
                as: 'prestataire',
                attributes: ['id', 'nom', 'adresse', 'latitude', 'longitude'],
            },
        ],
    });

    if (!commande) {
        res.status(404);
        throw new Error('Commande non trouvée ou non en livraison');
    }

    const livreurId = commande.livraison?.livreurId;
    const livreurPosition = livreurId ? positionsCache.get(`livreur_${livreurId}`) : null;

    res.json({
        success: true,
        data: {
            orderId: commande.id,
            status: commande.statut,
            livreur: commande.livraison?.livreur
                ? {
                    id: commande.livraison.livreur.id,
                    name: `${commande.livraison.livreur.prenom} ${commande.livraison.livreur.nom.charAt(0)}.`,
                    phone: commande.livraison.livreur.telephone,
                }
                : null,
            livreurPosition: livreurPosition
                ? {
                    lat: livreurPosition.lat,
                    lng: livreurPosition.lng,
                    updatedAt: livreurPosition.updatedAt,
                }
                : null,
            restaurant: commande.prestataire
                ? {
                    name: commande.prestataire.nom,
                    address: commande.prestataire.adresse,
                    position: {
                        lat: commande.prestataire.latitude,
                        lng: commande.prestataire.longitude,
                    },
                }
                : null,
            clientAddress: commande.adresseLivraison,
        },
    });
});

/**
 * Calculer ETA approximatif basé sur la vitesse
 */
function calculateETA(speed) {
    if (!speed || speed < 1) {
        return '~10 min';
    }

    // Estimation basique (en vrai, utiliser distance restante)
    const minutes = Math.ceil(5 + Math.random() * 10);
    return `~${minutes} min`;
}

/**
 * Sauvegarder la dernière position en DB (appelé périodiquement)
 */
const savePositionToDb = async (livreurId, position) => {
    try {
        await User.update(
            {
                lastLatitude: position.lat,
                lastLongitude: position.lng,
                lastPositionUpdate: new Date(),
            },
            { where: { id: livreurId } }
        );
    } catch (error) {
        console.error('Erreur sauvegarde position:', error);
    }
};

module.exports = {
    updatePosition,
    getLivreurPosition,
    getOrderTrackingInfo,
    positionsCache,
    savePositionToDb,
};
