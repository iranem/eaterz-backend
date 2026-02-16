const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validationMiddleware');
const { authenticate } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/roleMiddleware');

const {
  initiatePayment,
  processPayment,
  confirmCashPayment,
  getPaymentStatus,
  getPaymentHistory,
  requestRefund,
  satimWebhook,
  paymentWebhook,
  getPaymentMethods
} = require('../controllers/paiementController');

// ========================================
// VALIDATION SCHEMAS
// ========================================

// Validation pour initier un paiement
const initiateValidation = [
  body('commandeId').isInt({ min: 1 }).withMessage('ID de commande invalide'),
  body('cardType').isIn(['cib', 'edahabia']).withMessage('Type de carte invalide (cib ou edahabia)')
];

// Validation pour traiter un paiement direct
const processValidation = [
  body('orderId').notEmpty().withMessage('ID de commande requis'),
  body('cardType').isIn(['cib', 'edahabia']).withMessage('Type de carte invalide'),
  body('cardNumber').notEmpty().withMessage('Numéro de carte requis')
    .custom((value, { req }) => {
      const cleanNumber = value.replace(/\s/g, '');
      if (req.body.cardType === 'cib' && cleanNumber.length !== 19) {
        throw new Error('Numéro CIB invalide (19 chiffres)');
      }
      if (req.body.cardType === 'edahabia' && cleanNumber.length !== 16) {
        throw new Error('Numéro EDAHABIA invalide (16 chiffres)');
      }
      return true;
    }),
  body('expiryMonth').isInt({ min: 1, max: 12 }).withMessage('Mois d\'expiration invalide'),
  body('expiryYear').isInt({ min: 24, max: 40 }).withMessage('Année d\'expiration invalide'),
  body('cvv').matches(/^\d{3,4}$/).withMessage('CVV invalide (3-4 chiffres)'),
  body('cardholderName').isLength({ min: 3 }).withMessage('Nom du titulaire requis (min 3 caractères)')
];

// Validation pour paiement en espèces
const cashValidation = [
  body('orderId').notEmpty().withMessage('ID de commande requis')
];

// Validation pour remboursement
const refundValidation = [
  body('commandeId').isInt({ min: 1 }).withMessage('ID de commande invalide'),
  body('montant').optional().isFloat({ min: 0.01 }).withMessage('Montant invalide'),
  body('motif').optional().isString().isLength({ max: 500 }).withMessage('Motif trop long')
];

// ========================================
// ROUTES PUBLIQUES
// ========================================

/**
 * @swagger
 * /api/paiements/methods:
 *   get:
 *     summary: Obtenir les méthodes de paiement disponibles
 *     tags: [Paiements]
 *     responses:
 *       200:
 *         description: Liste des méthodes de paiement
 */
router.get('/methods', getPaymentMethods);

// ========================================
// ROUTES CLIENT (Authentifiées)
// ========================================

/**
 * @swagger
 * /api/paiements/initiate:
 *   post:
 *     summary: Initier une session de paiement SATIM
 *     tags: [Paiements]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               commandeId:
 *                 type: integer
 *               cardType:
 *                 type: string
 *                 enum: [cib, edahabia]
 */
router.post('/initiate', authenticate, initiateValidation, validate, initiatePayment);

/**
 * @swagger
 * /api/paiements/process:
 *   post:
 *     summary: Traiter un paiement direct par carte
 *     tags: [Paiements]
 *     security:
 *       - bearerAuth: []
 */
router.post('/process', authenticate, processValidation, validate, processPayment);

/**
 * @swagger
 * /api/paiements/cash:
 *   post:
 *     summary: Confirmer un paiement en espèces
 *     tags: [Paiements]
 *     security:
 *       - bearerAuth: []
 */
router.post('/cash', authenticate, cashValidation, validate, confirmCashPayment);

/**
 * @swagger
 * /api/paiements/status/{transactionId}:
 *   get:
 *     summary: Vérifier le statut d'un paiement
 *     tags: [Paiements]
 *     security:
 *       - bearerAuth: []
 */
router.get('/status/:transactionId', authenticate, getPaymentStatus);

/**
 * @swagger
 * /api/paiements/historique:
 *   get:
 *     summary: Historique des paiements
 *     tags: [Paiements]
 *     security:
 *       - bearerAuth: []
 */
router.get('/historique', authenticate, getPaymentHistory);

// Rétrocompatibilité avec l'ancien endpoint
router.post('/create-intent', authenticate, processValidation, validate, processPayment);

// ========================================
// ROUTES ADMIN
// ========================================

/**
 * @swagger
 * /api/paiements/refund:
 *   post:
 *     summary: Initier un remboursement
 *     tags: [Paiements]
 *     security:
 *       - bearerAuth: []
 */
router.post('/refund', authenticate, isAdmin, refundValidation, validate, requestRefund);

// ========================================
// WEBHOOKS (Publics, vérifiés par signature)
// ========================================

/**
 * @swagger
 * /api/paiements/webhook/satim:
 *   post:
 *     summary: Webhook SATIM pour les notifications de paiement
 *     tags: [Webhooks]
 */
router.post('/webhook/satim', satimWebhook);

/**
 * @swagger
 * /api/paiements/webhook:
 *   post:
 *     summary: Webhook générique (rétrocompatibilité)
 *     tags: [Webhooks]
 */
router.post('/webhook', paymentWebhook);

module.exports = router;
