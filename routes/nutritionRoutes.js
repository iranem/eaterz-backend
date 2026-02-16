const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    getNutritionSummary,
    getNutritionCalendar,
    getNutritionTrends,
} = require('../controllers/nutritionController');

// Toutes les routes nécessitent authentification
router.use(protect);

router.get('/summary', getNutritionSummary);
router.get('/calendar', getNutritionCalendar);
router.get('/trends', getNutritionTrends);

module.exports = router;
