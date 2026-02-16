const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate, paginationRules } = require('../middleware/validationMiddleware');
const { authenticate, optionalAuth } = require('../middleware/authMiddleware');
const { isPrestataire, isBoutiqueOrMixte } = require('../middleware/roleMiddleware');
const { uploadPlatImage } = require('../middleware/uploadMiddleware');

const {
    getProduits,
    getFeaturedProduits,
    getOrigines,
    searchProduits,
    getProduitById,
    getMesProduits,
    createProduit,
    updateProduit,
    deleteProduit,
    updateStock,
    getBoutiqueStats
} = require('../controllers/produitController');

// Validation création/modification produit
const produitValidation = [
    body('categorieId')
        .isInt({ min: 1 })
        .withMessage('Catégorie requise'),
    body('nom.fr')
        .notEmpty()
        .withMessage('Le nom français est requis'),
    body('prix')
        .isFloat({ min: 0 })
        .withMessage('Le prix doit être positif'),
    body('stock')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Le stock doit être un entier positif'),
    body('unite')
        .optional()
        .isIn(['g', 'kg', 'ml', 'cl', 'l', 'unite'])
        .withMessage('Unité invalide'),
    body('poids_volume')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Le poids/volume doit être positif')
];

const stockValidation = [
    body('stock')
        .isInt({ min: 0 })
        .withMessage('Le stock doit être un entier positif'),
    body('operation')
        .optional()
        .isIn(['add', 'remove', 'set'])
        .withMessage('Opération invalide')
];

// ═══════════════════════════════════════════════════════════════
// ROUTES PUBLIQUES
// ═══════════════════════════════════════════════════════════════

// Liste des produits avec filtres
router.get('/', paginationRules, validate, getProduits);

// Produits mis en avant
router.get('/featured', getFeaturedProduits);

// Liste des origines (pour filtres)
router.get('/origines', getOrigines);

// Recherche avec suggestions
router.get('/search', searchProduits);

// Détail d'un produit
router.get('/:id', optionalAuth, param('id').isInt(), validate, getProduitById);

// ═══════════════════════════════════════════════════════════════
// ROUTES PRESTATAIRE (Boutique)
// ═══════════════════════════════════════════════════════════════

// Mes produits
router.get('/prestataire/mes-produits', authenticate, isPrestataire, paginationRules, validate, getMesProduits);

// Statistiques boutique
router.get('/prestataire/stats', authenticate, isPrestataire, getBoutiqueStats);

// Créer un produit
router.post('/', authenticate, isPrestataire, uploadPlatImage, produitValidation, validate, createProduit);

// Modifier un produit
router.put('/:id', authenticate, isPrestataire, uploadPlatImage, param('id').isInt(), validate, updateProduit);

// Supprimer un produit
router.delete('/:id', authenticate, isPrestataire, param('id').isInt(), validate, deleteProduit);

// Modifier le stock
router.put('/:id/stock', authenticate, isPrestataire, param('id').isInt(), stockValidation, validate, updateStock);

module.exports = router;
