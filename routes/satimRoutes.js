const express = require('express');
const router = express.Router();
const {
    initiatePayment,
    paymentCallback,
    getPaymentStatus,
    requestRefund,
} = require('../controllers/satimController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Route webhook publique (callback SATIM)
router.get('/callback', paymentCallback);
router.post('/callback', paymentCallback);

// Routes protégées
router.use(protect);

router.post('/initiate', initiatePayment);
router.get('/status/:orderId', getPaymentStatus);

// Routes admin
router.post('/refund', authorize('admin'), requestRefund);

module.exports = router;
