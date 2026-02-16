const express = require('express');
const router = express.Router();
const {
    getVapidPublicKey,
    subscribe,
    unsubscribe,
    sendNotification,
    broadcastNotification,
    getSubscriptionStatus,
} = require('../controllers/pushController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Routes publiques
router.get('/vapid-key', getVapidPublicKey);

// Routes authentifiées
router.use(protect);

router.post('/subscribe', subscribe);
router.post('/unsubscribe', unsubscribe);
router.get('/status', getSubscriptionStatus);

// Routes admin uniquement
router.post('/send', authorize('admin'), sendNotification);
router.post('/broadcast', authorize('admin'), broadcastNotification);

module.exports = router;
