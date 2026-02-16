const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate, paginationRules } = require('../middleware/validationMiddleware');
const { authenticate } = require('../middleware/authMiddleware');
const { isClient, isPrestataire, isAdmin } = require('../middleware/roleMiddleware');

const {
  createCommande,
  getMesCommandes,
  getCommandeById,
  getCommandesPrestataire,
  updateStatutCommande,
  recommander,
  getAllCommandes,
  forceRemboursement,
  cancelCommandeClient,
  refuseCommande,
  getCommandeHistorique
} = require('../controllers/commandeController');

// Validation
const commandeValidation = [
  body('prestataireId').isInt({ min: 1 }).withMessage('Prestataire requis'),
  body('items').isArray({ min: 1 }).withMessage('Panier vide'),
  body('items.*.platId').isInt({ min: 1 }).withMessage('Plat invalide'),
  body('items.*.quantite').isInt({ min: 1 }).withMessage('Quantité invalide'),
  body('adresseLivraison').notEmpty().withMessage('Adresse de livraison requise'),
  body('modePaiement').isIn(['cib', 'edahabia', 'especes']).withMessage('Mode de paiement invalide')
];

const statutValidation = [
  body('statut')
    .isIn(['en_attente', 'confirmee', 'en_preparation', 'prete', 'en_livraison', 'livree', 'annulee'])
    .withMessage('Statut invalide')
];

// Routes Client
router.post('/', authenticate, isClient, commandeValidation, validate, createCommande);
router.get('/mes-commandes', authenticate, isClient, paginationRules, validate, getMesCommandes);
router.post('/:id/recommander', authenticate, isClient, param('id').isInt(), validate, recommander);
router.post('/:id/annuler', authenticate, isClient, param('id').isInt(), validate, cancelCommandeClient);

// Routes Prestataire
router.get('/prestataire', authenticate, isPrestataire, paginationRules, validate, getCommandesPrestataire);
router.put('/:id/statut', authenticate, isPrestataire, param('id').isInt(), statutValidation, validate, updateStatutCommande);
router.post('/:id/refuser', authenticate, isPrestataire, param('id').isInt(), validate, refuseCommande);

// Routes Admin
router.get('/admin', authenticate, isAdmin, paginationRules, validate, getAllCommandes);
router.put('/admin/:id/rembourser', authenticate, isAdmin, param('id').isInt(), validate, forceRemboursement);

// Route commune (avec vérification d'accès dans le contrôleur)
router.get('/:id', authenticate, param('id').isInt(), validate, getCommandeById);
router.get('/:id/historique', authenticate, param('id').isInt(), validate, getCommandeHistorique);

module.exports = router;
