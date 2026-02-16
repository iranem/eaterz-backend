const express = require('express');
const router = express.Router();
const { validate } = require('../middleware/validationMiddleware');
const { authenticate } = require('../middleware/authMiddleware');
const { isClient, isPrestataire, isAdmin } = require('../middleware/roleMiddleware');

const {
  getClientDashboard,
  getClientDepenses,
  getClientHabitudes,
  getClientPreferences,
  getPrestataireDashboard,
  getPrestataireVentes,
  getAdminDashboard,
  getAdminUsersStats,
  getAdminOrdersStats,
  getAdminRevenueStats,
  getAdminAvisStats,
  getAdminLitigesStats
} = require('../controllers/statsController');

// Routes Client
router.get('/client/dashboard', authenticate, isClient, getClientDashboard);
router.get('/client/depenses', authenticate, isClient, getClientDepenses);
router.get('/client/habitudes', authenticate, isClient, getClientHabitudes);
router.get('/client/preferences', authenticate, isClient, getClientPreferences);

// Routes Prestataire
router.get('/prestataire/dashboard', authenticate, isPrestataire, getPrestataireDashboard);
router.get('/prestataire/ventes', authenticate, isPrestataire, getPrestataireVentes);

// Routes Admin
router.get('/admin/dashboard', authenticate, isAdmin, getAdminDashboard);
router.get('/admin/utilisateurs', authenticate, isAdmin, getAdminUsersStats);
router.get('/admin/commandes', authenticate, isAdmin, getAdminOrdersStats);
router.get('/admin/revenus', authenticate, isAdmin, getAdminRevenueStats);
router.get('/admin/avis', authenticate, isAdmin, getAdminAvisStats);
router.get('/admin/litiges', authenticate, isAdmin, getAdminLitigesStats);

module.exports = router;

