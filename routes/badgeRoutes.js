const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const badgeService = require('../services/badgeService');

/**
 * @desc    Récupérer tous les badges de l'utilisateur
 * @route   GET /api/badges
 * @access  Private
 */
router.get('/', protect, async (req, res) => {
    try {
        const badges = await badgeService.getUserBadges(req.user.id);
        res.json({
            success: true,
            data: badges,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des badges',
        });
    }
});

/**
 * @desc    Récupérer les badges non vus
 * @route   GET /api/badges/unseen
 * @access  Private
 */
router.get('/unseen', protect, async (req, res) => {
    try {
        const badges = await badgeService.getUnseenBadges(req.user.id);
        res.json({
            success: true,
            data: badges,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des badges non vus',
        });
    }
});

/**
 * @desc    Marquer les badges comme vus
 * @route   POST /api/badges/mark-seen
 * @access  Private
 */
router.post('/mark-seen', protect, async (req, res) => {
    try {
        await badgeService.markBadgesAsSeen(req.user.id);
        res.json({
            success: true,
            message: 'Badges marqués comme vus',
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur lors du marquage des badges',
        });
    }
});

module.exports = router;
