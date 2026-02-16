const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { getBalance, convertPoints } = require('../controllers/loyaltyController');

router.get('/balance', authenticate, getBalance);
router.post('/convert', authenticate, convertPoints);

module.exports = router;
