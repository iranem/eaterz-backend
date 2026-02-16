const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { isClient, isPrestataire, isAdmin } = require('../middleware/roleMiddleware');

const {
    exportClientCommandes,
    exportPrestataireCommandes,
    exportPrestataireRapportVentes,
    exportAdminCommandes,
    exportAdminUtilisateurs,
    exportAdminAvis,
    exportAdminLitiges
} = require('../controllers/exportController');

// ═══════════════════════════════════════════════════════════════
// Routes Client
// ═══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/export/client/commandes:
 *   get:
 *     tags: [Export]
 *     summary: Exporter l'historique des commandes du client
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [pdf, csv]
 *         description: Format d'export (pdf par défaut)
 *       - in: query
 *         name: dateDebut
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dateFin
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: statut
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Fichier PDF ou CSV
 */
router.get('/client/commandes', authenticate, isClient, exportClientCommandes);

// ═══════════════════════════════════════════════════════════════
// Routes Prestataire
// ═══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/export/prestataire/commandes:
 *   get:
 *     tags: [Export]
 *     summary: Exporter les commandes du prestataire
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [pdf, csv]
 *       - in: query
 *         name: dateDebut
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dateFin
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: statut
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Fichier PDF ou CSV
 */
router.get('/prestataire/commandes', authenticate, isPrestataire, exportPrestataireCommandes);

/**
 * @swagger
 * /api/export/prestataire/rapport-ventes:
 *   get:
 *     tags: [Export]
 *     summary: Rapport de ventes mensuel du prestataire (PDF)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: mois
 *         schema:
 *           type: integer
 *         description: Mois (1-12), défaut mois actuel
 *       - in: query
 *         name: annee
 *         schema:
 *           type: integer
 *         description: Année, défaut année actuelle
 *     responses:
 *       200:
 *         description: Fichier PDF
 */
router.get('/prestataire/rapport-ventes', authenticate, isPrestataire, exportPrestataireRapportVentes);

// ═══════════════════════════════════════════════════════════════
// Routes Admin
// ═══════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/export/admin/commandes:
 *   get:
 *     tags: [Export]
 *     summary: Exporter toutes les commandes (Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [pdf, csv]
 *       - in: query
 *         name: dateDebut
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dateFin
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: statut
 *         schema:
 *           type: string
 *       - in: query
 *         name: prestataireId
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Fichier PDF ou CSV
 */
router.get('/admin/commandes', authenticate, isAdmin, exportAdminCommandes);

/**
 * @swagger
 * /api/export/admin/utilisateurs:
 *   get:
 *     tags: [Export]
 *     summary: Exporter la liste des utilisateurs (Admin, CSV)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [client, prestataire, livreur, admin]
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Fichier CSV
 */
router.get('/admin/utilisateurs', authenticate, isAdmin, exportAdminUtilisateurs);

/**
 * @swagger
 * /api/export/admin/avis:
 *   get:
 *     tags: [Export]
 *     summary: Exporter les avis (Admin, CSV)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: note
 *         schema:
 *           type: integer
 *       - in: query
 *         name: dateDebut
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dateFin
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Fichier CSV
 */
router.get('/admin/avis', authenticate, isAdmin, exportAdminAvis);

/**
 * @swagger
 * /api/export/admin/litiges:
 *   get:
 *     tags: [Export]
 *     summary: Exporter les litiges (Admin, CSV)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: statut
 *         schema:
 *           type: string
 *       - in: query
 *         name: priorite
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Fichier CSV
 */
router.get('/admin/litiges', authenticate, isAdmin, exportAdminLitiges);

module.exports = router;
