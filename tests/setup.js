/**
 * Jest Test Setup
 * 
 * Global setup and utilities for testing.
 */

require('dotenv').config({ path: '.env.test' });

const { sequelize } = require('../config/database');

// Set test environment
process.env.NODE_ENV = 'test';

// Mock logger to reduce noise during tests
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  http: jest.fn(),
  logRequest: jest.fn(),
  logError: jest.fn(),
  logDB: jest.fn(),
  logAuth: jest.fn(),
  logEvent: jest.fn(),
  stream: { write: jest.fn() }
}));

// Global test timeout
jest.setTimeout(30000);

// Database connection handling
beforeAll(async () => {
  try {
    await sequelize.authenticate();
    // Sync all models
    await sequelize.sync({ force: true });
  } catch (error) {
    console.error('Test database connection failed:', error);
    process.exit(1);
  }
});

afterAll(async () => {
  try {
    await sequelize.close();
  } catch (error) {
    console.error('Error closing database:', error);
  }
});

// Clean up database between tests
afterEach(async () => {
  // Truncate all tables
  const models = Object.values(sequelize.models);
  for (const model of models) {
    await model.destroy({ where: {}, truncate: true, cascade: true, force: true });
  }
});

/**
 * Test Factories
 */
const factories = {
  /**
   * Create a test user
   */
  createUser: async (overrides = {}) => {
    const { User } = require('../models');
    const defaultUser = {
      email: `test${Date.now()}@test.com`,
      password: 'Test@123',
      nom: 'Test',
      prenom: 'User',
      role: 'client',
      isVerified: true,
      isActive: true,
      ...overrides
    };
    return User.create(defaultUser);
  },

  /**
   * Create a test prestataire
   */
  createPrestataire: async (overrides = {}) => {
    return factories.createUser({
      role: 'prestataire',
      nomEtablissement: 'Test Restaurant',
      ...overrides
    });
  },

  /**
   * Create a test admin
   */
  createAdmin: async (overrides = {}) => {
    return factories.createUser({
      role: 'admin',
      ...overrides
    });
  },

  /**
   * Create a test category
   */
  createCategorie: async (overrides = {}) => {
    const { Categorie } = require('../models');
    const defaultCategorie = {
      nom: { fr: 'Test Category', en: 'Test Category' },
      slug: `test-category-${Date.now()}`,
      isActive: true,
      ...overrides
    };
    return Categorie.create(defaultCategorie);
  },

  /**
   * Create a test plat
   */
  createPlat: async (prestataireId, categorieId, overrides = {}) => {
    const { Plat } = require('../models');
    const defaultPlat = {
      prestataireId,
      categorieId,
      nom: { fr: 'Test Plat', en: 'Test Dish' },
      description: { fr: 'Description test', en: 'Test description' },
      prix: 500,
      isAvailable: true,
      ...overrides
    };
    return Plat.create(defaultPlat);
  },

  /**
   * Create a test commande
   */
  createCommande: async (clientId, prestataireId, overrides = {}) => {
    const { Commande } = require('../models');
    const defaultCommande = {
      numero: `TEST-${Date.now()}`,
      clientId,
      prestataireId,
      statut: 'en_attente',
      sousTotal: 500,
      total: 700,
      adresseLivraison: '123 Test Street',
      modePaiement: 'especes',
      ...overrides
    };
    return Commande.create(defaultCommande);
  }
};

/**
 * Authentication helpers
 */
const authHelpers = {
  /**
   * Generate auth tokens for a user
   */
  getAuthTokens: (user) => {
    const { generateTokens } = require('../utils/generateToken');
    return generateTokens(user);
  },

  /**
   * Create auth header with token
   */
  getAuthHeader: (user) => {
    const tokens = authHelpers.getAuthTokens(user);
    return `Bearer ${tokens.accessToken}`;
  }
};

/**
 * Request helpers
 */
const requestHelpers = {
  /**
   * Create authenticated request options
   */
  withAuth: (user) => ({
    headers: {
      Authorization: authHelpers.getAuthHeader(user)
    }
  })
};

// Export helpers globally
global.factories = factories;
global.authHelpers = authHelpers;
global.requestHelpers = requestHelpers;

module.exports = {
  factories,
  authHelpers,
  requestHelpers
};
