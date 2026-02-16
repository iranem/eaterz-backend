const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    createSubscription,
    getMySubscriptions,
    getSubscription,
    updateSubscription,
    pauseSubscription,
    resumeSubscription,
    cancelSubscription,
} = require('../controllers/subscriptionController');

// Toutes les routes nécessitent authentification
router.use(protect);

// Routes CRUD
router.route('/')
    .get(getMySubscriptions)
    .post(createSubscription);

router.route('/:id')
    .get(getSubscription)
    .put(updateSubscription)
    .delete(cancelSubscription);

// Actions spécifiques
router.post('/:id/pause', pauseSubscription);
router.post('/:id/resume', resumeSubscription);

module.exports = router;
