const asyncHandler = require('express-async-handler');
const { User, LoyaltyTransaction, Promotion, sequelize } = require('../models');
const { Op } = require('sequelize');

// Constantes du programme de fidélité
const LOYALTY_RULES = {
    EARN_RATE: 1, // 1 point par 100 DA
    LEVELS: {
        BRONZE: 0,
        SILVER: 1000,
        GOLD: 5000,
        PLATINUM: 10000
    },
    REWARDS: {
        '100DA': { points: 500, value: 100 },
        '500DA': { points: 2000, value: 500 },
        '1000DA': { points: 3500, value: 1000 },
        'FREE_DELIVERY': { points: 300, type: 'livraison_gratuite' }
    }
};

/**
 * @desc    Obtenir le solde et l'historique des points
 * @route   GET /api/loyalty/balance
 * @access  Private
 */
const getBalance = asyncHandler(async (req, res) => {
    const user = await User.findByPk(req.user.id, {
        attributes: ['id', 'loyaltyPoints', 'loyaltyTier']
    });

    const transactions = await LoyaltyTransaction.findAll({
        where: { clientId: req.user.id },
        order: [['createdAt', 'DESC']],
        limit: 20
    });

    // Calculer les stats
    const totalEarned = await LoyaltyTransaction.sum('points', {
        where: { clientId: req.user.id, type: 'earn' }
    }) || 0;

    const nextTier = getNextTier(user.loyaltyPoints);

    res.json({
        success: true,
        data: {
            points: user.loyaltyPoints,
            tier: user.loyaltyTier,
            nextTier,
            transactions,
            stats: {
                totalEarned
            },
            rewards: LOYALTY_RULES.REWARDS
        }
    });
});

/**
 * @desc    Convertir des points en récompense
 * @route   POST /api/loyalty/convert
 * @access  Private
 */
const convertPoints = asyncHandler(async (req, res) => {
    const { rewardId } = req.body;
    const reward = LOYALTY_RULES.REWARDS[rewardId];

    if (!reward) {
        res.status(400);
        throw new Error('Récompense invalide');
    }

    const user = await User.findByPk(req.user.id);

    if (user.loyaltyPoints < reward.points) {
        res.status(400);
        throw new Error('Solde de points insuffisant');
    }

    // Transaction
    const t = await sequelize.transaction();

    try {
        // 1. Déduire les points
        await user.decrement('loyaltyPoints', { by: reward.points, transaction: t });

        // 2. Enregistrer la transaction
        await LoyaltyTransaction.create({
            clientId: user.id,
            type: 'burn',
            points: -reward.points,
            description: `Echange contre récompense ${rewardId}`,
            referenceType: 'recompense',
            referenceId: rewardId
        }, { transaction: t });

        // 3. Créer le code promo (ou autre récompense)
        // Ici on simplifie en retournant juste un succès, mais idéalement on créerait un UserReward ou Coupon
        // Pour l'instant, disons qu'on applique un crédit ou on génère un code promo temporaire

        // Exemple: Créer une promotion unique pour l'utilisateur
        const code = `LOYALTY-${user.id}-${Date.now().toString(36).toUpperCase()}`;
        const promo = await Promotion.create({
            code,
            type: reward.type === 'livraison_gratuite' ? 'livraison_gratuite' : 'montant_fixe',
            valeur: reward.value || 0,
            montantMinimum: 0,
            dateDebut: new Date(),
            dateFin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 jours
            limiteUtilisationTotale: 1,
            limiteParUtilisateur: 1,
            isActive: true,
            isGlobal: false
            // Note: Il faudrait un champ userId pour lier la promo à un user spécifique, 
            // ou utiliser un système de coupon user.
        }, { transaction: t });

        await t.commit();

        res.json({
            success: true,
            data: {
                newBalance: user.loyaltyPoints - reward.points,
                reward: {
                    code: promo.code,
                    description: `Récompense ${rewardId} activée`
                }
            }
        });

    } catch (error) {
        await t.rollback();
        res.status(500);
        throw new Error('Erreur lors de la conversion des points');
    }
});

/**
 * Helper: Déterminer le prochain niveau
 */
const getNextTier = (points) => {
    const levels = LOYALTY_RULES.LEVELS;
    if (points < levels.SILVER) return { name: 'silver', pointsRequired: levels.SILVER - points };
    if (points < levels.GOLD) return { name: 'gold', pointsRequired: levels.GOLD - points };
    if (points < levels.PLATINUM) return { name: 'platinum', pointsRequired: levels.PLATINUM - points };
    return null; // Max level reached
};

module.exports = {
    getBalance,
    convertPoints,
    LOYALTY_RULES,
    getNextTier
};
