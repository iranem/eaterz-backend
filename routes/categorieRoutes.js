const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validationMiddleware');
const { authenticate } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/roleMiddleware');

const {
  getCategories,
  getCategorie,
  createCategorie,
  updateCategorie,
  deleteCategorie,
  reorderCategories
} = require('../controllers/categorieController');

// Validation
const categorieValidation = [
  body('nom')
    .notEmpty()
    .withMessage('Le nom est requis'),
  body('nom.fr')
    .notEmpty()
    .withMessage('Le nom français est requis')
];

// Routes publiques
router.get('/', getCategories);
router.get('/:idOrSlug', getCategorie);

// Routes Admin
router.post('/', authenticate, isAdmin, categorieValidation, validate, createCategorie);
router.put('/reorder', authenticate, isAdmin, reorderCategories);
router.put('/:id', authenticate, isAdmin, param('id').isInt(), validate, updateCategorie);
router.delete('/:id', authenticate, isAdmin, param('id').isInt(), validate, deleteCategorie);

module.exports = router;
