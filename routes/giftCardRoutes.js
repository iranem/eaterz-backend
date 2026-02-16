const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    purchaseGiftCard,
    getMyPurchasedCards,
    getMyReceivedCards,
    claimGiftCard,
    useGiftCard,
    checkGiftCardBalance,
    getDesigns,
} = require('../controllers/giftCardController');

// Routes publiques
router.get('/designs', getDesigns);
router.get('/check/:code', checkGiftCardBalance);

// Routes protégées
router.use(protect);

router.post('/', purchaseGiftCard);
router.get('/purchased', getMyPurchasedCards);
router.get('/received', getMyReceivedCards);
router.post('/claim', claimGiftCard);
router.post('/:id/use', useGiftCard);

module.exports = router;
