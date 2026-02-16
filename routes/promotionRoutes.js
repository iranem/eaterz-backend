const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate, paginationRules } = require('../middleware/validationMiddleware');
const { authenticate } = require('../middleware/authMiddleware');
const { isPrestataire, isAdmin } = require('../middleware/roleMiddleware');

const {
  validerCodePromo,
  getMesPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  getPromotionStats,
  getAllPromotions,
  createPromotionGlobale
} = require('../controllers/promotionController');

// Validation
const promoValidation = [
  body('valeur').isFloat({ min: 0 }).withMessage('Valeur invalide'),
  body('dateDebut').isISO8601().withMessage('Date de début invalide'),
  body('dateFin').isISO8601().withMessage('Date de fin invalide')
];

// Route publique (validation de code)
router.post('/valider', authenticate, validerCodePromo);

// Routes Prestataire
router.get('/mes-promotions', authenticate, isPrestataire, paginationRules, validate, getMesPromotions);
router.post('/', authenticate, isPrestataire, promoValidation, validate, createPromotion);
router.put('/:id', authenticate, isPrestataire, param('id').isInt(), validate, updatePromotion);
router.delete('/:id', authenticate, isPrestataire, param('id').isInt(), validate, deletePromotion);
router.get('/:id/stats', authenticate, isPrestataire, param('id').isInt(), validate, getPromotionStats);

// Routes Admin
router.get('/', authenticate, isAdmin, paginationRules, validate, getAllPromotions);
router.post('/globale', authenticate, isAdmin, promoValidation, validate, createPromotionGlobale);

module.exports = router;
