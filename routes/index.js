const express = require('express');
const router = express.Router();

// Import des routes
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const categorieRoutes = require('./categorieRoutes');
const platRoutes = require('./platRoutes');
const commandeRoutes = require('./commandeRoutes');
const promotionRoutes = require('./promotionRoutes');
const avisRoutes = require('./avisRoutes');
const favoriRoutes = require('./favoriRoutes');
const notificationRoutes = require('./notificationRoutes');
const litigeRoutes = require('./litigeRoutes');
const paiementRoutes = require('./paiementRoutes');
const statsRoutes = require('./statsRoutes');
const settingsRoutes = require('./settingsRoutes');
const livreurRoutes = require('./livreurRoutes');
const adminLivraisonRoutes = require('./adminLivraisonRoutes');
const prestataireLivraisonRoutes = require('./prestataireLivraisonRoutes');
const produitRoutes = require('./produitRoutes');
const chatRoutes = require('./chatRoutes');
const loyaltyRoutes = require('./loyaltyRoutes');
const exportRoutes = require('./exportRoutes');
const pushRoutes = require('./pushRoutes');
const referralRoutes = require('./referralRoutes');
const badgeRoutes = require('./badgeRoutes');
const subscriptionRoutes = require('./subscriptionRoutes');

// Montage des routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/categories', categorieRoutes);
router.use('/plats', platRoutes);
router.use('/commandes', commandeRoutes);
router.use('/promotions', promotionRoutes);
router.use('/avis', avisRoutes);
router.use('/favoris', favoriRoutes);
router.use('/notifications', notificationRoutes);
router.use('/litiges', litigeRoutes);
router.use('/paiements', paiementRoutes);
router.use('/stats', statsRoutes);
router.use('/admin/settings', settingsRoutes);
router.use('/livreur', livreurRoutes);
router.use('/admin', adminLivraisonRoutes);
router.use('/prestataire', prestataireLivraisonRoutes);
router.use('/produits', produitRoutes);
router.use('/chat', chatRoutes);
router.use('/loyalty', loyaltyRoutes);
router.use('/export', exportRoutes);
router.use('/push', pushRoutes);
router.use('/referral', referralRoutes);
router.use('/badges', badgeRoutes);
router.use('/subscriptions', subscriptionRoutes);

// Gift Cards
const giftCardRoutes = require('./giftCardRoutes');
router.use('/gift-cards', giftCardRoutes);

// Nutrition
const nutritionRoutes = require('./nutritionRoutes');
router.use('/nutrition', nutritionRoutes);

// Tracking GPS
const trackingRoutes = require('./trackingRoutes');
router.use('/tracking', trackingRoutes);

// SATIM Payment
const satimRoutes = require('./satimRoutes');
router.use('/satim', satimRoutes);

// Route d'information API
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'EATERZ API v1.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      categories: '/api/categories',
      plats: '/api/plats',
      commandes: '/api/commandes',
      promotions: '/api/promotions',
      avis: '/api/avis',
      favoris: '/api/favoris',
      notifications: '/api/notifications',
      litiges: '/api/litiges',
      paiements: '/api/paiements',
      stats: '/api/stats',
      export: '/api/export',
      admin: {
        settings: '/api/admin/settings',
        livreurs: '/api/admin/livreurs',
        livraisons: '/api/admin/livraisons'
      },
      livreur: '/api/livreur',
      chat: '/api/chat',
      csrf: '/api/csrf-token'
    },
    documentation: '/api/docs'
  });
});

// Route CSRF Token
const { getCsrfTokenHandler } = require('../middleware/csrfMiddleware');
router.get('/csrf-token', getCsrfTokenHandler);

module.exports = router;
