/**
 * Job CRON pour les rappels intelligents
 * Envoie des notifications push personnalisées basées sur le comportement utilisateur
 */
const cron = require('node-cron');
const { Op, fn, col, literal } = require('sequelize');
const { User, Commande, Plat, Favori, Promotion, Notification } = require('../models');
const { sendPushToUser } = require('./pushService');
const logger = require('../config/logger');

/**
 * Types de rappels
 */
const REMINDER_TYPES = {
    FAVORITE_PROMO: 'favorite_promo',        // Plat favori en promo
    REORDER_SUGGESTION: 'reorder_suggestion', // Suggestion de recommande
    INACTIVE_USER: 'inactive_user',           // Utilisateur inactif
    LUNCH_REMINDER: 'lunch_reminder',         // Rappel déjeuner
};

/**
 * Envoyer rappels pour plats favoris en promo
 */
const sendFavoritePromoReminders = async () => {
    try {
        // Trouver les plats avec promo active
        const promoPlats = await Plat.findAll({
            where: {
                enPromo: true,
                disponible: true,
            },
            attributes: ['id', 'nom', 'prixPromo', 'prix'],
        });

        if (promoPlats.length === 0) return;

        const platIds = promoPlats.map(p => p.id);

        // Trouver les utilisateurs qui ont ces plats en favoris
        const favoris = await Favori.findAll({
            where: { platId: { [Op.in]: platIds } },
            include: [
                { model: User, as: 'client', attributes: ['id', 'prenom', 'langue'] },
                { model: Plat, as: 'plat', attributes: ['id', 'nom', 'prixPromo', 'prix'] },
            ],
        });

        for (const fav of favoris) {
            if (!fav.client || !fav.plat) continue;

            const reduction = Math.round(
                ((fav.plat.prix - fav.plat.prixPromo) / fav.plat.prix) * 100
            );

            // Créer notification interne
            await Notification.create({
                userId: fav.client.id,
                type: 'promo',
                titre: '🔥 Votre plat préféré est en promo !',
                message: `${fav.plat.nom} est à -${reduction}% ! Ne manquez pas cette offre.`,
                data: { platId: fav.plat.id, type: REMINDER_TYPES.FAVORITE_PROMO },
            });

            // Envoyer push
            await sendPushToUser(fav.client.id, {
                title: '🔥 Votre plat préféré en promo !',
                body: `${fav.plat.nom} à -${reduction}% !`,
                icon: '/icons/icon-192x192.png',
                data: { url: `/plats/${fav.plat.id}` },
            });
        }

        if (favoris.length > 0) {
            logger.info(`[SmartReminders] ${favoris.length} rappels promo favoris envoyés`);
        }
    } catch (error) {
        logger.error('[SmartReminders] Erreur favoris promo:', error);
    }
};

/**
 * Envoyer suggestions de re-commande (utilisateurs qui commandent régulièrement)
 */
const sendReorderSuggestions = async () => {
    try {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

        // Utilisateurs avec commande il y a 1-2 semaines mais pas cette semaine
        const usersToRemind = await User.findAll({
            where: {
                role: 'client',
                isActive: true,
            },
            include: [
                {
                    model: Commande,
                    as: 'commandesClient',
                    required: true,
                    where: {
                        statut: 'livree',
                        createdAt: {
                            [Op.gte]: twoWeeksAgo,
                            [Op.lt]: oneWeekAgo,
                        },
                    },
                    include: [
                        {
                            model: User,
                            as: 'prestataire',
                            attributes: ['id', 'nom'],
                        },
                    ],
                    limit: 1,
                    order: [['createdAt', 'DESC']],
                },
            ],
        });

        // Filtrer ceux qui n'ont pas commandé cette semaine
        for (const user of usersToRemind) {
            const recentOrder = await Commande.findOne({
                where: {
                    clientId: user.id,
                    createdAt: { [Op.gte]: oneWeekAgo },
                },
            });

            if (recentOrder) continue; // A commandé récemment, skip

            const lastOrder = user.commandesClient[0];
            const restaurantName = lastOrder?.prestataire?.nom || 'votre restaurant préféré';

            await Notification.create({
                userId: user.id,
                type: 'rappel',
                titre: '😋 Envie de commander ?',
                message: `Ça fait un moment ! ${restaurantName} vous attend.`,
                data: { type: REMINDER_TYPES.REORDER_SUGGESTION },
            });

            await sendPushToUser(user.id, {
                title: '😋 Envie de commander ?',
                body: `${restaurantName} vous attend !`,
                icon: '/icons/icon-192x192.png',
                data: { url: '/explore' },
            });
        }

        if (usersToRemind.length > 0) {
            logger.info(`[SmartReminders] ${usersToRemind.length} suggestions re-commande envoyées`);
        }
    } catch (error) {
        logger.error('[SmartReminders] Erreur suggestions:', error);
    }
};

/**
 * Rappel déjeuner (11h30)
 */
const sendLunchReminders = async () => {
    try {
        // Utilisateurs actifs avec au moins 3 commandes
        const activeUsers = await User.findAll({
            attributes: ['id', 'prenom'],
            where: {
                role: 'client',
                isActive: true,
            },
            include: [
                {
                    model: Commande,
                    as: 'commandesClient',
                    attributes: [],
                    required: true,
                },
            ],
            group: ['User.id'],
            having: literal('COUNT(`commandesClient`.`id`) >= 3'),
            limit: 50, // Limiter pour éviter spam
        });

        // Randomiser - n'envoyer qu'à 20% des utilisateurs pour éviter le spam
        const selectedUsers = activeUsers.filter(() => Math.random() < 0.2);

        for (const user of selectedUsers) {
            await sendPushToUser(user.id, {
                title: `🍽️ ${user.prenom}, c'est l'heure du déjeuner !`,
                body: 'Découvrez nos plats du jour',
                icon: '/icons/icon-192x192.png',
                data: { url: '/explore' },
            });
        }

        if (selectedUsers.length > 0) {
            logger.info(`[SmartReminders] ${selectedUsers.length} rappels déjeuner envoyés`);
        }
    } catch (error) {
        logger.error('[SmartReminders] Erreur rappels déjeuner:', error);
    }
};

/**
 * Initialiser les jobs CRON de rappels intelligents
 */
const initSmartRemindersJob = () => {
    // Tous les jours à 10h - Vérifier promos sur favoris
    cron.schedule('0 10 * * *', async () => {
        logger.debug('[SmartReminders] Exécution rappels promos favoris');
        await sendFavoritePromoReminders();
    });

    // Tous les dimanches à 18h - Suggestions de re-commande
    cron.schedule('0 18 * * 0', async () => {
        logger.debug('[SmartReminders] Exécution suggestions re-commande');
        await sendReorderSuggestions();
    });

    // Lundi-Vendredi à 11h30 - Rappel déjeuner
    cron.schedule('30 11 * * 1-5', async () => {
        logger.debug('[SmartReminders] Exécution rappels déjeuner');
        await sendLunchReminders();
    });

    logger.info('[SmartReminders] Jobs CRON initialisés');
};

module.exports = {
    initSmartRemindersJob,
    sendFavoritePromoReminders,
    sendReorderSuggestions,
    sendLunchReminders,
    REMINDER_TYPES,
};
