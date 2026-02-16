const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate, paginationRules } = require('../middleware/validationMiddleware');
const { authenticate } = require('../middleware/authMiddleware');
const { isClient, isAdmin } = require('../middleware/roleMiddleware');
const { uploadLitigeFiles } = require('../middleware/uploadMiddleware');

const {
  createLitige,
  getMesLitiges,
  getAllLitiges,
  getLitigeById,
  prendreEnCharge,
  addMessage,
  resoudreLitige
} = require('../controllers/litigeController');

// Validation
const litigeValidation = [
  body('commandeId').isInt({ min: 1 }).withMessage('Commande requise'),
  body('motif').isIn(['commande_non_recue', 'qualite_insatisfaisante', 'produit_different', 'retard_livraison', 'probleme_paiement', 'autre']).withMessage('Motif invalide'),
  body('description').notEmpty().withMessage('Description requise')
];

// Routes Client
router.post('/', authenticate, isClient, uploadLitigeFiles, litigeValidation, validate, createLitige);
router.get('/mes-litiges', authenticate, isClient, paginationRules, validate, getMesLitiges);

// Routes Admin
router.get('/', authenticate, isAdmin, paginationRules, validate, getAllLitiges);
router.get('/:id', authenticate, isAdmin, param('id').isInt(), validate, getLitigeById);
router.put('/:id/prendre-en-charge', authenticate, isAdmin, param('id').isInt(), validate, prendreEnCharge);
router.post('/:id/message', authenticate, isAdmin, param('id').isInt(), body('message').notEmpty(), validate, addMessage);
router.put('/:id/resoudre', authenticate, isAdmin, param('id').isInt(), 
  body('resolution').isIn(['remboursement_total', 'remboursement_partiel', 'avoir', 'faveur_prestataire', 'sans_suite']),
  validate, resoudreLitige
);

module.exports = router;
