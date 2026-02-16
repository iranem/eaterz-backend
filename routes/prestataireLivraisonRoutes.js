const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { isPrestataire } = require('../middleware/roleMiddleware');
const {
    getCommandesAvecLivraison,
    marquerCommandePrete,
    getDetailLivraison,
    getStatsLivraisons,
    demanderLivreur
} = require('../controllers/prestataireLivraisonController');

// Toutes les routes nécessitent authentification + rôle prestataire
router.use(authenticate, isPrestataire);

/**
 * @swagger
 * /api/prestataire/livraisons:
 *   get:
 *     summary: Liste des commandes avec infos livraison
 *     tags: [Prestataire - Livraisons]
 */
router.get('/livraisons', getCommandesAvecLivraison);

/**
 * @swagger
 * /api/prestataire/livraisons/stats:
 *   get:
 *     summary: Statistiques livraisons du prestataire
 *     tags: [Prestataire - Livraisons]
 */
router.get('/livraisons/stats', getStatsLivraisons);

/**
 * @swagger
 * /api/prestataire/livraisons/:id:
 *   get:
 *     summary: Détail d'une livraison (livreur, position)
 *     tags: [Prestataire - Livraisons]
 */
router.get('/livraisons/:id', getDetailLivraison);

/**
 * @swagger
 * /api/prestataire/commandes/:id/prete:
 *   put:
 *     summary: Marquer une commande prête pour livraison
 *     tags: [Prestataire - Livraisons]
 */
router.put('/commandes/:id/prete', marquerCommandePrete);

/**
 * @swagger
 * /api/prestataire/commandes/:id/demander-livreur:
 *   post:
 *     summary: Demander un livreur pour une commande
 *     tags: [Prestataire - Livraisons]
 */
router.post('/commandes/:id/demander-livreur', demanderLivreur);

module.exports = router;
