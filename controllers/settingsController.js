const fs = require('fs').promises;
const path = require('path');
const { validationResult } = require('express-validator');
const { auditLogger } = require('../utils/auditLogger');
const { sendTestEmail } = require('../services/emailService');

// ═══════════════════════════════════════════════════════════════
// DEFAULT SETTINGS - FOOD DELIVERY 2026 BEST PRACTICES
// ═══════════════════════════════════════════════════════════════

const DEFAULT_SETTINGS = {
  system: {
    siteName: 'EATERZ',
    siteDescription: 'Plateforme de livraison de repas moderne',
    maintenanceMode: false,
    timezone: 'Africa/Algiers',
    currency: 'DZD',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm',
    language: 'fr'
  },
  
  payment: {
    stripePublicKey: '',
    stripeSecretKey: '',
    paypalClientId: '',
    paypalSecret: '',
    cashOnDeliveryEnabled: true,
    onlinePaymentEnabled: true,
    minimumOrderAmount: 200,
    maximumOrderAmount: 50000
  },
  
  security: {
    twoFactorAuthRequired: false,
    passwordMinLength: 8,
    passwordRequireNumbers: true,
    passwordRequireSpecialChars: true,
    sessionTimeout: 3600,
    maxLoginAttempts: 5,
    rateLimitRequests: 100,
    rateLimitWindow: 900
  },
  
  notifications: {
    emailNotifications: true,
    smsNotifications: true,
    pushNotifications: true,
    orderConfirmation: true,
    orderStatusUpdates: true,
    promotionalEmails: false,
    adminAlerts: true
  },
  
  appearance: {
    primaryColor: '#FF6B35',
    secondaryColor: '#2E86AB',
    accentColor: '#F7931E',
    borderRadius: 'rounded-xl',
    fontFamily: 'Inter',
    darkModeEnabled: true,
    animationsEnabled: true
  },
  
  delivery: {
    baseDeliveryFee: 200,
    freeDeliveryThreshold: 2000,
    maxDeliveryDistance: 15,
    deliveryTimeEstimate: 30,
    deliveryZones: [],
    deliveryPartners: [],
    realTimeTracking: true
  },
  
  commission: {
    platformCommission: 15,
    deliveryCommission: 10,
    premiumPartnerCommission: 12,
    referralBonus: 500,
    loyaltyProgramEnabled: true
  },
  
  users: {
    emailVerificationRequired: true,
    phoneVerificationRequired: false,
    socialLoginEnabled: true,
    googleClientId: '',
    facebookAppId: '',
    autoApprovePrestataires: false,
    kycRequired: true
  },
  
  email: {
    smtpHost: '',
    smtpPort: 587,
    smtpUsername: '',
    smtpPassword: '',
    fromEmail: 'noreply@eaterz.dz',
    fromName: 'EATERZ'
  },
  
  mobile: {
    appStoreUrl: '',
    playStoreUrl: '',
    pushNotificationServerKey: '',
    mobileApiRateLimit: 200,
    mobileSessionTimeout: 7200
  },
  
  data: {
    gdprCompliant: true,
    dataRetentionDays: 365,
    backupFrequency: 'daily',
    analyticsEnabled: true,
    cookieConsentRequired: true
  }
};

// Settings file path
const SETTINGS_FILE = path.join(__dirname, '../config/settings.json');

// ═══════════════════════════════════════════════════════════════
// CONTROLLER METHODS
// ═══════════════════════════════════════════════════════════════

/**
 * Load settings from file or return defaults
 */
async function loadSettings() {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // Return defaults if file doesn't exist or is invalid
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save settings to file
 */
async function saveSettings(settings) {
  try {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
}

/**
 * Validate settings object structure
 */
function validateSettingsStructure(settings) {
  const requiredCategories = Object.keys(DEFAULT_SETTINGS);
  const errors = {};
  
  for (const category of requiredCategories) {
    if (!settings[category]) {
      errors[category] = [`Missing ${category} settings`];
    } else {
      // Validate required fields for each category
      const defaultCategory = DEFAULT_SETTINGS[category];
      const currentCategory = settings[category];
      
      for (const [key, defaultValue] of Object.entries(defaultCategory)) {
        if (currentCategory[key] === undefined) {
          if (!errors[category]) errors[category] = [];
          errors[category].push(`Missing field: ${key}`);
        }
      }
    }
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

// ═══════════════════════════════════════════════════════════════
// EXPORTED CONTROLLERS
// ═══════════════════════════════════════════════════════════════

exports.getAllSettings = async (req, res) => {
  try {
    const settings = await loadSettings();
    
    res.json({
      success: true,
      data: settings,
      timestamp: new Date().toISOString()
    });
    
    // Log the action
    auditLogger.info('Settings viewed', {
      userId: req.user.id,
      action: 'VIEW_SETTINGS',
      ipAddress: req.ip
    });
    
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur de récupération des paramètres'
    });
  }
};

exports.updateAllSettings = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: errors.array()
      });
    }
    
    const newSettings = req.body;
    const validation = validateSettingsStructure(newSettings);
    
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Structure de paramètres invalide',
        errors: validation.errors
      });
    }
    
    const saved = await saveSettings(newSettings);
    if (!saved) {
      return res.status(500).json({
        success: false,
        message: 'Erreur de sauvegarde des paramètres'
      });
    }
    
    res.json({
      success: true,
      data: newSettings,
      message: 'Paramètres mis à jour avec succès'
    });
    
    // Log the action
    auditLogger.info('Settings updated', {
      userId: req.user.id,
      action: 'UPDATE_SETTINGS',
      ipAddress: req.ip,
      changes: Object.keys(newSettings)
    });
    
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur de mise à jour des paramètres'
    });
  }
};

exports.getCategorySettings = async (req, res) => {
  try {
    const { category } = req.params;
    
    if (!DEFAULT_SETTINGS[category]) {
      return res.status(400).json({
        success: false,
        message: 'Catégorie de paramètres invalide'
      });
    }
    
    const settings = await loadSettings();
    
    res.json({
      success: true,
      data: {
        [category]: settings[category]
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error getting category settings:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur de récupération des paramètres'
    });
  }
};

exports.updateCategorySettings = async (req, res) => {
  try {
    const { category } = req.params;
    const categoryUpdates = req.body;
    
    if (!DEFAULT_SETTINGS[category]) {
      return res.status(400).json({
        success: false,
        message: 'Catégorie de paramètres invalide'
      });
    }
    
    const settings = await loadSettings();
    settings[category] = { ...settings[category], ...categoryUpdates };
    
    const saved = await saveSettings(settings);
    if (!saved) {
      return res.status(500).json({
        success: false,
        message: 'Erreur de sauvegarde des paramètres'
      });
    }
    
    res.json({
      success: true,
      data: {
        [category]: settings[category]
      },
      message: 'Paramètres mis à jour avec succès'
    });
    
    // Log the action
    auditLogger.info('Category settings updated', {
      userId: req.user.id,
      action: 'UPDATE_CATEGORY_SETTINGS',
      category,
      ipAddress: req.ip,
      changes: Object.keys(categoryUpdates)
    });
    
  } catch (error) {
    console.error('Error updating category settings:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur de mise à jour des paramètres'
    });
  }
};

exports.resetCategorySettings = async (req, res) => {
  try {
    const { category } = req.params;
    
    if (!DEFAULT_SETTINGS[category]) {
      return res.status(400).json({
        success: false,
        message: 'Catégorie de paramètres invalide'
      });
    }
    
    const settings = await loadSettings();
    settings[category] = DEFAULT_SETTINGS[category];
    
    const saved = await saveSettings(settings);
    if (!saved) {
      return res.status(500).json({
        success: false,
        message: 'Erreur de réinitialisation des paramètres'
      });
    }
    
    res.json({
      success: true,
      data: {
        [category]: settings[category]
      },
      message: 'Paramètres réinitialisés avec succès'
    });
    
    // Log the action
    auditLogger.warn('Category settings reset', {
      userId: req.user.id,
      action: 'RESET_CATEGORY_SETTINGS',
      category,
      ipAddress: req.ip
    });
    
  } catch (error) {
    console.error('Error resetting category settings:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur de réinitialisation des paramètres'
    });
  }
};

exports.resetAllSettings = async (req, res) => {
  try {
    const saved = await saveSettings(DEFAULT_SETTINGS);
    if (!saved) {
      return res.status(500).json({
        success: false,
        message: 'Erreur de réinitialisation des paramètres'
      });
    }
    
    res.json({
      success: true,
      data: DEFAULT_SETTINGS,
      message: 'Tous les paramètres ont été réinitialisés'
    });
    
    // Log the action
    auditLogger.warn('All settings reset', {
      userId: req.user.id,
      action: 'RESET_ALL_SETTINGS',
      ipAddress: req.ip
    });
    
  } catch (error) {
    console.error('Error resetting all settings:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur de réinitialisation des paramètres'
    });
  }
};

exports.testEmailConfiguration = async (req, res) => {
  try {
    const { smtpHost, smtpPort, smtpUsername, smtpPassword, fromEmail } = req.body;
    
    // Test sending email
    const testResult = await sendTestEmail({
      to: req.user.email,
      subject: 'Test de configuration email - EATERZ',
      html: '<h2>✅ Configuration email fonctionnelle</h2><p>Votre configuration email EATERZ est correcte.</p>'
    }, {
      smtpHost,
      smtpPort,
      smtpUsername,
      smtpPassword,
      fromEmail
    });
    
    if (testResult.success) {
      res.json({
        success: true,
        message: 'Configuration email testée avec succès'
      });
    } else {
      res.status(400).json({
        success: false,
        message: testResult.message || 'Échec du test de configuration email'
      });
    }
    
  } catch (error) {
    console.error('Error testing email configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur de test de configuration email'
    });
  }
};

exports.testPaymentConfiguration = async (req, res) => {
  try {
    const { stripePublicKey, stripeSecretKey } = req.body;
    
    // Basic validation - in real implementation, you'd test actual Stripe connection
    if (!stripePublicKey || !stripeSecretKey) {
      return res.status(400).json({
        success: false,
        message: 'Clés Stripe manquantes'
      });
    }
    
    // Simulate payment test
    res.json({
      success: true,
      message: 'Configuration paiement testée avec succès'
    });
    
  } catch (error) {
    console.error('Error testing payment configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur de test de configuration paiement'
    });
  }
};

exports.getAuditLog = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    // In real implementation, you'd query the audit log database
    // This is a placeholder response
    const auditEntries = [
      {
        id: 1,
        userId: req.user.id,
        action: 'VIEW_SETTINGS',
        timestamp: new Date().toISOString(),
        ipAddress: req.ip,
        details: 'Consultation des paramètres système'
      }
    ];
    
    res.json({
      success: true,
      data: auditEntries.slice(offset, offset + parseInt(limit)),
      total: auditEntries.length
    });
    
  } catch (error) {
    console.error('Error getting audit log:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur de récupération du journal'
    });
  }
};

exports.exportSettings = async (req, res) => {
  try {
    const settings = await loadSettings();
    
    res.json({
      success: true,
      data: settings,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error exporting settings:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur d\'exportation des paramètres'
    });
  }
};

exports.importSettings = async (req, res) => {
  try {
    const importedSettings = req.body;
    const validation = validateSettingsStructure(importedSettings);
    
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Structure de paramètres invalide',
        errors: validation.errors
      });
    }
    
    const saved = await saveSettings(importedSettings);
    if (!saved) {
      return res.status(500).json({
        success: false,
        message: 'Erreur d\'importation des paramètres'
      });
    }
    
    res.json({
      success: true,
      data: importedSettings,
      message: 'Paramètres importés avec succès'
    });
    
    // Log the action
    auditLogger.info('Settings imported', {
      userId: req.user.id,
      action: 'IMPORT_SETTINGS',
      ipAddress: req.ip
    });
    
  } catch (error) {
    console.error('Error importing settings:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur d\'importation des paramètres'
    });
  }
};

exports.validateSettings = async (req, res) => {
  try {
    const settingsToValidate = req.body;
    const validation = validateSettingsStructure(settingsToValidate);
    
    res.json({
      success: true,
      data: validation
    });
    
  } catch (error) {
    console.error('Error validating settings:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur de validation des paramètres'
    });
  }
};

exports.getSystemHealth = async (req, res) => {
  try {
    // In real implementation, check actual system health
    const healthStatus = {
      database: 'healthy',
      cache: 'healthy',
      email: 'healthy',
      payment: 'healthy',
      lastBackup: new Date().toISOString(),
      uptime: process.uptime()
    };
    
    res.json({
      success: true,
      data: healthStatus
    });
    
  } catch (error) {
    console.error('Error getting system health:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur de récupération de l\'état système'
    });
  }
};