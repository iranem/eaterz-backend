const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate, paginationRules } = require('../middleware/validationMiddleware');
const { authenticate } = require('../middleware/authMiddleware');
const { isLivreur } = require('../middleware/roleMiddleware');

const {
    getDashboard,
    getCoursesAssignees,
    getCourseById,
    updateStatutCourse,
    updatePosition,
    toggleDisponibilite,
    getHistorique,
    getGains
} = require('../controllers/livreurController');

// Validation
const statutValidation = [
    body('statut')
        .isIn(['assignee', 'recuperee', 'en_cours', 'livree', 'echouee'])
        .withMessage('Statut invalide')
];

const positionValidation = [
    body('lat').isFloat().withMessage('Latitude invalide'),
    body('lng').isFloat().withMessage('Longitude invalide')
];

const disponibiliteValidation = [
    body('statut')
        .isIn(['disponible', 'occupe', 'hors_ligne'])
        .withMessage('Statut invalide')
];

// Routes Livreur
router.get('/dashboard', authenticate, isLivreur, getDashboard);
router.get('/courses', authenticate, isLivreur, getCoursesAssignees);
router.get('/courses/:id', authenticate, isLivreur, param('id').isInt(), validate, getCourseById);
router.put('/courses/:id/statut', authenticate, isLivreur, param('id').isInt(), statutValidation, validate, updateStatutCourse);
router.put('/position', authenticate, isLivreur, positionValidation, validate, updatePosition);
router.put('/disponibilite', authenticate, isLivreur, disponibiliteValidation, validate, toggleDisponibilite);
router.get('/historique', authenticate, isLivreur, paginationRules, validate, getHistorique);
router.get('/gains', authenticate, isLivreur, getGains);

module.exports = router;
