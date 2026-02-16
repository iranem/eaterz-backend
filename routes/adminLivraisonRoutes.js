const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate, paginationRules } = require('../middleware/validationMiddleware');
const { authenticate } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/roleMiddleware');

const {
    getLivreurs,
    getLivreurById,
    createLivreur,
    updateLivreur,
    toggleActivation,
    getCommandesAAssigner,
    assignerCommande,
    reassignerCommande,
    getStatsLivraisons,
    getLivreursDisponibles,
    autoAssignerCommande
} = require('../controllers/adminLivraisonController');

// Validation création livreur
const createLivreurValidation = [
    body('email').isEmail().withMessage('Email invalide'),
    body('password').isLength({ min: 6 }).withMessage('Mot de passe: 6 caractères minimum'),
    body('nom').notEmpty().withMessage('Nom requis'),
    body('prenom').notEmpty().withMessage('Prénom requis'),
    body('telephone').notEmpty().withMessage('Téléphone requis')
];

const assignerValidation = [
    body('commandeId').isInt().withMessage('Commande ID requis'),
    body('livreurId').isInt().withMessage('Livreur ID requis')
];

// Routes Admin - Livreurs
router.get('/livreurs', authenticate, isAdmin, paginationRules, validate, getLivreurs);
router.get('/livreurs/disponibles', authenticate, isAdmin, getLivreursDisponibles);
router.get('/livreurs/:id', authenticate, isAdmin, param('id').isInt(), validate, getLivreurById);
router.post('/livreurs', authenticate, isAdmin, createLivreurValidation, validate, createLivreur);
router.put('/livreurs/:id', authenticate, isAdmin, param('id').isInt(), validate, updateLivreur);
router.put('/livreurs/:id/activation', authenticate, isAdmin, param('id').isInt(), validate, toggleActivation);

// Routes Admin - Livraisons
router.get('/livraisons/a-assigner', authenticate, isAdmin, getCommandesAAssigner);
router.get('/livraisons/stats', authenticate, isAdmin, getStatsLivraisons);
router.post('/livraisons/assigner', authenticate, isAdmin, assignerValidation, validate, assignerCommande);
router.post('/livraisons/reassigner', authenticate, isAdmin, validate, reassignerCommande);
router.post('/livraisons/auto-assigner', authenticate, isAdmin, body('commandeId').isInt(), validate, autoAssignerCommande);

module.exports = router;
