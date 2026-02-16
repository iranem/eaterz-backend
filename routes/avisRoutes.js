const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate, paginationRules, ratingRules } = require('../middleware/validationMiddleware');
const { authenticate } = require('../middleware/authMiddleware');
const { isClient, isPrestataire, isAdmin } = require('../middleware/roleMiddleware');

const {
  createAvis,
  getMesAvis,
  getAvisRecus,
  repondreAvis,
  signalerAvis,
  getAvisSignales,
  modererAvis
} = require('../controllers/avisController');

// Validation
const avisValidation = [
  body('platId').isInt({ min: 1 }).withMessage('Plat requis'),
  body('note').isInt({ min: 1, max: 5 }).withMessage('Note entre 1 et 5')
];

// Routes Client
router.post('/', authenticate, isClient, avisValidation, validate, createAvis);
router.get('/mes-avis', authenticate, isClient, paginationRules, validate, getMesAvis);

// Routes Prestataire
router.get('/recus', authenticate, isPrestataire, paginationRules, validate, getAvisRecus);
router.put('/:id/reponse', authenticate, isPrestataire, param('id').isInt(), body('reponse').notEmpty(), validate, repondreAvis);
router.post('/:id/signaler', authenticate, isPrestataire, param('id').isInt(), body('motif').notEmpty(), validate, signalerAvis);

// Routes Admin
router.get('/signales', authenticate, isAdmin, paginationRules, validate, getAvisSignales);
router.put('/:id/moderer', authenticate, isAdmin, param('id').isInt(), body('action').isIn(['approve', 'hide', 'delete']), validate, modererAvis);

module.exports = router;
