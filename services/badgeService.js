/**
 * Service de gestion des badges (Gamification)
 * Vérifie et attribue automatiquement les badges aux utilisateurs
 */
const { Badge, UserBadge, User, Commande, Avis, LoyaltyTransaction, Notification, Referral } = require('../models');
const { Op } = require('sequelize');
const { getIO } = require('../config/socket');
const logger = require('../config/logger');

// Configuration des badges prédéfinis
const BADGE_DEFINITIONS = [
    {
        id: 'first_order', name: 'Première commande', icon: '🎉', points: 50, category: 'commandes',
        description: 'Passez votre première commande', condition: { type: 'orders_count', value: 1 }
    },
    {
        id: 'order_5', name: 'Client régulier', icon: '🛒', points: 100, category: 'commandes',
        description: 'Passez 5 commandes', condition: { type: 'orders_count', value: 5 }
    },
    {
        id: 'order_25', name: 'Client fidèle', icon: '💎', points: 250, category: 'commandes',
        description: 'Passez 25 commandes', condition: { type: 'orders_count', value: 25 }
    },
    {
        id: 'order_50', name: 'Super client', icon: '👑', points: 500, category: 'commandes',
        description: 'Passez 50 commandes', condition: { type: 'orders_count', value: 50 }
    },
    {
        id: 'big_spender', name: 'Panier généreux', icon: '💰', points: 100, category: 'commandes',
        description: 'Passez une commande de plus de 5000 DA', condition: { type: 'order_amount', value: 5000 }
    },
    {
        id: 'reviewer', name: 'Critique culinaire', icon: '⭐', points: 100, category: 'social',
        description: 'Laissez 5 avis', condition: { type: 'reviews_count', value: 5 }
    },
    {
        id: 'reviewer_pro', name: 'Critique expert', icon: '📝', points: 200, category: 'social',
        description: 'Laissez 20 avis', condition: { type: 'reviews_count', value: 20 }
    },
    {
        id: 'referrer', name: 'Ambassadeur', icon: '🤝', points: 150, category: 'social',
        description: 'Parrainez votre premier ami', condition: { type: 'referrals_count', value: 1 }
    },
    {
        id: 'referrer_pro', name: 'Super ambassadeur', icon: '🏆', points: 500, category: 'social',
        description: 'Parrainez 10 amis', condition: { type: 'referrals_count', value: 10 }
    },
    {
        id: 'early_bird', name: 'Lève-tôt', icon: '🌅', points: 75, category: 'special',
        description: 'Commandez avant 8h du matin', condition: { type: 'early_order', value: 8 }
    },
    {
        id: 'night_owl', name: 'Oiseau de nuit', icon: '🦉', points: 75, category: 'special',
        description: 'Commandez après 22h', condition: { type: 'night_order', value: 22 }
    },
];

/**
 * Synchroniser les badges prédéfinis avec la base de données
 */
const syncBadges = async () => {
    try {
        for (const badgeDef of BADGE_DEFINITIONS) {
            await Badge.upsert(badgeDef);
        }
        logger.info(`[BadgeService] ${BADGE_DEFINITIONS.length} badges synchronisés`);
    } catch (error) {
        logger.error('[BadgeService] Erreur synchronisation badges:', error);
    }
};

/**
 * Vérifier et attribuer les badges à un utilisateur
 * @param {number} userId - ID de l'utilisateur
 * @param {object} context - Contexte de l'événement déclencheur
 * @returns {Array} Liste des nouveaux badges débloqués
 */
const checkAndAwardBadges = async (userId, context = {}) => {
    const unlockedBadges = [];

    try {
        const user = await User.findByPk(userId);
        if (!user) return unlockedBadges;

        // Récupérer les badges déjà obtenus
        const existingBadges = await UserBadge.findAll({
            where: { userId },
            attributes: ['badgeId'],
        });
        const existingBadgeIds = existingBadges.map(b => b.badgeId);

        // Récupérer tous les badges actifs
        const allBadges = await Badge.findAll({ where: { isActive: true } });

        // Statistiques de l'utilisateur (calculées à la demande)
        const stats = await getUserStats(userId);

        for (const badge of allBadges) {
            // Skip si déjà obtenu
            if (existingBadgeIds.includes(badge.id)) continue;

            // Vérifier la condition
            const isUnlocked = checkBadgeCondition(badge, stats, context);

            if (isUnlocked) {
                // Attribuer le badge
                await UserBadge.create({
                    userId,
                    badgeId: badge.id,
                    unlockedAt: new Date(),
                });

                // Attribuer les points
                if (badge.points > 0) {
                    await user.update({
                        loyaltyPoints: (user.loyaltyPoints || 0) + badge.points,
                    });

                    await LoyaltyTransaction.create({
                        userId,
                        points: badge.points,
                        type: 'earn',
                        reason: `Badge débloqué : ${badge.name}`,
                    });
                }

                // Créer notification
                await Notification.create({
                    userId,
                    type: 'badge',
                    titre: '🏆 Nouveau badge débloqué !',
                    message: `Vous avez débloqué le badge "${badge.name}" ${badge.icon}`,
                    data: { badgeId: badge.id, points: badge.points },
                });

                // Émettre via Socket.io
                const io = getIO();
                if (io) {
                    io.to(`user_${userId}`).emit('badge:unlocked', {
                        badge: {
                            id: badge.id,
                            name: badge.name,
                            icon: badge.icon,
                            points: badge.points,
                        },
                    });
                }

                unlockedBadges.push(badge);
                logger.info(`[BadgeService] Badge "${badge.name}" débloqué pour user ${userId}`);
            }
        }

        return unlockedBadges;
    } catch (error) {
        logger.error('[BadgeService] Erreur vérification badges:', error);
        return unlockedBadges;
    }
};

/**
 * Récupérer les statistiques d'un utilisateur pour la vérification des badges
 */
const getUserStats = async (userId) => {
    const [ordersCount, reviewsCount, referralsCount] = await Promise.all([
        Commande.count({ where: { clientId: userId, statut: 'livree' } }),
        Avis.count({ where: { clientId: userId } }),
        Referral.count({ where: { referrerId: userId, status: 'claimed' } }),
    ]);

    return {
        ordersCount,
        reviewsCount,
        referralsCount,
    };
};

/**
 * Vérifier si une condition de badge est remplie
 */
const checkBadgeCondition = (badge, stats, context) => {
    const { condition } = badge;
    if (!condition) return false;

    switch (condition.type) {
        case 'orders_count':
            return stats.ordersCount >= condition.value;
        case 'reviews_count':
            return stats.reviewsCount >= condition.value;
        case 'referrals_count':
            return stats.referralsCount >= condition.value;
        case 'order_amount':
            return context.orderAmount && context.orderAmount >= condition.value;
        case 'early_order':
            return context.orderHour !== undefined && context.orderHour < condition.value;
        case 'night_order':
            return context.orderHour !== undefined && context.orderHour >= condition.value;
        default:
            return false;
    }
};

/**
 * Récupérer tous les badges d'un utilisateur
 */
const getUserBadges = async (userId) => {
    const userBadges = await UserBadge.findAll({
        where: { userId },
        include: [{ model: Badge, as: 'badge' }],
        order: [['unlockedAt', 'DESC']],
    });

    const allBadges = await Badge.findAll({
        where: { isActive: true },
        order: [['sortOrder', 'ASC']],
    });

    const unlockedIds = userBadges.map(ub => ub.badgeId);

    return allBadges.map(badge => ({
        ...badge.toJSON(),
        unlocked: unlockedIds.includes(badge.id),
        unlockedAt: userBadges.find(ub => ub.badgeId === badge.id)?.unlockedAt || null,
    }));
};

/**
 * Marquer les badges comme vus
 */
const markBadgesAsSeen = async (userId) => {
    await UserBadge.update(
        { seen: true },
        { where: { userId, seen: false } }
    );
};

/**
 * Récupérer les nouveaux badges non vus
 */
const getUnseenBadges = async (userId) => {
    const unseenBadges = await UserBadge.findAll({
        where: { userId, seen: false },
        include: [{ model: Badge, as: 'badge' }],
    });

    return unseenBadges.map(ub => ({
        id: ub.badge.id,
        name: ub.badge.name,
        icon: ub.badge.icon,
        points: ub.badge.points,
        unlockedAt: ub.unlockedAt,
    }));
};

module.exports = {
    syncBadges,
    checkAndAwardBadges,
    getUserBadges,
    markBadgesAsSeen,
    getUnseenBadges,
    BADGE_DEFINITIONS,
};
