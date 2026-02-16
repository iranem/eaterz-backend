const express = require('express');
const router = express.Router();
const {
    getMyReferralCode,
    getReferralStats,
    claimReferralCode,
    validateReferralCode,
} = require('../controllers/referralController');
const { protect } = require('../middleware/authMiddleware');

// Route publique pour valider un code
router.get('/validate/:code', validateReferralCode);

// Routes protégées
router.use(protect);

router.get('/my-code', getMyReferralCode);
router.get('/stats', getReferralStats);
router.post('/claim/:code', claimReferralCode);

module.exports = router;
