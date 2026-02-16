const express = require('express');
const router = express.Router();
const { param } = require('express-validator');
const { validate, paginationRules } = require('../middleware/validationMiddleware');
const { authenticate } = require('../middleware/authMiddleware');

const {
  getMesFavoris,
  ajouterFavori,
  retirerFavori,
  checkFavori
} = require('../controllers/favoriController');

// Routes
router.get('/', authenticate, paginationRules, validate, getMesFavoris);
router.post('/:platId', authenticate, param('platId').isInt(), validate, ajouterFavori);
router.delete('/:platId', authenticate, param('platId').isInt(), validate, retirerFavori);
router.get('/check/:platId', authenticate, param('platId').isInt(), validate, checkFavori);

module.exports = router;
