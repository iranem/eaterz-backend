const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/roleMiddleware');
const settingsController = require('../controllers/settingsController');

// ═══════════════════════════════════════════════════════════════
// ADMIN SETTINGS ROUTES - FOOD DELIVERY 2026 BEST PRACTICES
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/settings
 * Get all system settings
 * Access: Admin only
 */
router.get('/', authenticate, isAdmin, settingsController.getAllSettings);

/**
 * PUT /api/admin/settings
 * Update all system settings
 * Access: Admin only
 */
router.put('/', authenticate, isAdmin, settingsController.updateAllSettings);

/**
 * GET /api/admin/settings/:category
 * Get specific category settings
 * Access: Admin only
 */
router.get('/:category', authenticate, isAdmin, settingsController.getCategorySettings);

/**
 * PUT /api/admin/settings/:category
 * Update specific category settings
 * Access: Admin only
 */
router.put('/:category', authenticate, isAdmin, settingsController.updateCategorySettings);

/**
 * POST /api/admin/settings/:category/reset
 * Reset specific category to defaults
 * Access: Admin only
 */
router.post('/:category/reset', authenticate, isAdmin, settingsController.resetCategorySettings);

/**
 * POST /api/admin/settings/reset
 * Reset all settings to defaults
 * Access: Admin only
 */
router.post('/reset', authenticate, isAdmin, settingsController.resetAllSettings);

/**
 * POST /api/admin/settings/test-email
 * Test email configuration
 * Access: Admin only
 */
router.post('/test-email', authenticate, isAdmin, settingsController.testEmailConfiguration);

/**
 * POST /api/admin/settings/test-payment
 * Test payment configuration
 * Access: Admin only
 */
router.post('/test-payment', authenticate, isAdmin, settingsController.testPaymentConfiguration);

/**
 * GET /api/admin/settings/audit-log
 * Get settings audit log
 * Access: Admin only
 */
router.get('/audit-log', authenticate, isAdmin, settingsController.getAuditLog);

/**
 * GET /api/admin/settings/export
 * Export settings to JSON
 * Access: Admin only
 */
router.get('/export', authenticate, isAdmin, settingsController.exportSettings);

/**
 * POST /api/admin/settings/import
 * Import settings from JSON
 * Access: Admin only
 */
router.post('/import', authenticate, isAdmin, settingsController.importSettings);

/**
 * POST /api/admin/settings/validate
 * Validate settings before saving
 * Access: Admin only
 */
router.post('/validate', authenticate, isAdmin, settingsController.validateSettings);

/**
 * GET /api/admin/settings/health
 * Get system health status
 * Access: Admin only
 */
router.get('/health', authenticate, isAdmin, settingsController.getSystemHealth);

module.exports = router;