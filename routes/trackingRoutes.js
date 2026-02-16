const express = require('express');
const router = express.Router();
const {
    updatePosition,
    getLivreurPosition,
    getOrderTrackingInfo,
} = require('../controllers/trackingController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Toutes les routes sont protégées
router.use(protect);

// Routes livreur
router.post('/position', authorize('livreur'), updatePosition);

// Routes pour obtenir les positions
router.get('/:livreurId/position', getLivreurPosition);
router.get('/order/:orderId', getOrderTrackingInfo);

module.exports = router;
