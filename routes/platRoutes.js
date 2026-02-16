const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate, paginationRules } = require('../middleware/validationMiddleware');
const { authenticate, optionalAuth } = require('../middleware/authMiddleware');
const { isPrestataire, isAdmin, authorize } = require('../middleware/roleMiddleware');
const { uploadPlatImage } = require('../middleware/uploadMiddleware');

const {
  getPlats,
  getFeaturedPlats,
  searchPlats,
  getPlatById,
  getPlatAvis,
  createPlat,
  updatePlat,
  deletePlat,
  toggleDisponibilite,
  updatePrix
} = require('../controllers/platController');

// Validation
const platValidation = [
  body('categorieId')
    .isInt({ min: 1 })
    .withMessage('Catégorie requise'),
  body('nom.fr')
    .notEmpty()
    .withMessage('Le nom français est requis'),
  body('prix')
    .isFloat({ min: 0 })
    .withMessage('Le prix doit être positif')
];

const prixValidation = [
  body('prix')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Le prix doit être positif'),
  body('prixPromo')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Le prix promo doit être positif')
];

// Routes publiques
router.get('/', paginationRules, validate, getPlats);
router.get('/featured', getFeaturedPlats);
router.get('/search', searchPlats);
router.get('/:id', optionalAuth, param('id').isInt(), validate, getPlatById);
router.get('/:id/avis', param('id').isInt(), paginationRules, validate, getPlatAvis);

// Routes Prestataire
router.post('/', authenticate, isPrestataire, uploadPlatImage, platValidation, validate, createPlat);
router.put('/:id', authenticate, isPrestataire, uploadPlatImage, param('id').isInt(), validate, updatePlat);
router.delete('/:id', authenticate, isPrestataire, param('id').isInt(), validate, deletePlat);
router.put('/:id/disponibilite', authenticate, isPrestataire, param('id').isInt(), validate, toggleDisponibilite);
router.put('/:id/prix', authenticate, isPrestataire, param('id').isInt(), prixValidation, validate, updatePrix);

module.exports = router;
