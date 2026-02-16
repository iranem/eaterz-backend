const asyncHandler = require('express-async-handler');
const webpush = require('web-push');
const { PushSubscription, User } = require('../models');

// Configuration Web Push avec les clés VAPID
webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:contact@eaterz.dz',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

/**
 * @desc    Récupérer la clé publique VAPID
 * @route   GET /api/push/vapid-key
 * @access  Public
 */
const getVapidPublicKey = asyncHandler(async (req, res) => {
    res.json({
        success: true,
        publicKey: process.env.VAPID_PUBLIC_KEY,
    });
});

/**
 * @desc    S'abonner aux notifications push
 * @route   POST /api/push/subscribe
 * @access  Private
 */
const subscribe = asyncHandler(async (req, res) => {
    const { subscription } = req.body;
    const userId = req.user.id;

    if (!subscription || !subscription.endpoint) {
        res.status(400);
        throw new Error('Subscription invalide');
    }

    // Vérifier si l'abonnement existe déjà
    const existing = await PushSubscription.findOne({
        where: { endpoint: subscription.endpoint },
    });

    if (existing) {
        // Mettre à jour si l'utilisateur change
        if (existing.userId !== userId) {
            await existing.update({ userId });
        }
        return res.json({
            success: true,
            message: 'Abonnement mis à jour',
        });
    }

    // Créer nouvel abonnement
    await PushSubscription.create({
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
    });

    res.status(201).json({
        success: true,
        message: 'Abonné aux notifications push',
    });
});

/**
 * @desc    Se désabonner des notifications push
 * @route   POST /api/push/unsubscribe
 * @access  Private
 */
const unsubscribe = asyncHandler(async (req, res) => {
    const { endpoint } = req.body;
    const userId = req.user.id;

    if (!endpoint) {
        res.status(400);
        throw new Error('Endpoint requis');
    }

    const deleted = await PushSubscription.destroy({
        where: { userId, endpoint },
    });

    res.json({
        success: true,
        message: deleted ? 'Désabonné des notifications' : 'Abonnement non trouvé',
    });
});

/**
 * @desc    Envoyer une notification push à un utilisateur
 * @route   POST /api/push/send
 * @access  Admin
 */
const sendNotification = asyncHandler(async (req, res) => {
    const { userId, title, body, icon, url, data } = req.body;

    if (!userId || !title || !body) {
        res.status(400);
        throw new Error('userId, title et body sont requis');
    }

    const subscriptions = await PushSubscription.findAll({
        where: { userId },
    });

    if (subscriptions.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'Aucun abonnement push pour cet utilisateur',
        });
    }

    const payload = JSON.stringify({
        title,
        body,
        icon: icon || '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        url: url || '/',
        timestamp: Date.now(),
        ...data,
    });

    const results = await Promise.allSettled(
        subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: {
                            p256dh: sub.p256dh,
                            auth: sub.auth,
                        },
                    },
                    payload
                );
                return { success: true, endpoint: sub.endpoint };
            } catch (error) {
                // Supprimer abonnement invalide
                if (error.statusCode === 410 || error.statusCode === 404) {
                    await sub.destroy();
                }
                return { success: false, endpoint: sub.endpoint, error: error.message };
            }
        })
    );

    res.json({
        success: true,
        results: results.map((r) => r.value || r.reason),
    });
});

/**
 * @desc    Envoyer une notification à tous les utilisateurs (broadcast)
 * @route   POST /api/push/broadcast
 * @access  Admin
 */
const broadcastNotification = asyncHandler(async (req, res) => {
    const { title, body, icon, url, roles } = req.body;

    if (!title || !body) {
        res.status(400);
        throw new Error('title et body sont requis');
    }

    // Récupérer les subscriptions, éventuellement filtrées par rôle
    let whereClause = {};
    if (roles && roles.length > 0) {
        const users = await User.findAll({
            where: { role: roles },
            attributes: ['id'],
        });
        const userIds = users.map((u) => u.id);
        whereClause = { userId: userIds };
    }

    const subscriptions = await PushSubscription.findAll({ where: whereClause });

    const payload = JSON.stringify({
        title,
        body,
        icon: icon || '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        url: url || '/',
        timestamp: Date.now(),
    });

    let successCount = 0;
    let failCount = 0;

    await Promise.allSettled(
        subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: { p256dh: sub.p256dh, auth: sub.auth },
                    },
                    payload
                );
                successCount++;
            } catch (error) {
                if (error.statusCode === 410 || error.statusCode === 404) {
                    await sub.destroy();
                }
                failCount++;
            }
        })
    );

    res.json({
        success: true,
        message: `Notification envoyée à ${successCount} appareils, ${failCount} échecs`,
        stats: { success: successCount, failed: failCount },
    });
});

/**
 * @desc    Vérifier le statut d'abonnement de l'utilisateur
 * @route   GET /api/push/status
 * @access  Private
 */
const getSubscriptionStatus = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const subscriptions = await PushSubscription.findAll({
        where: { userId },
        attributes: ['id', 'createdAt'],
    });

    res.json({
        success: true,
        isSubscribed: subscriptions.length > 0,
        deviceCount: subscriptions.length,
    });
});

module.exports = {
    getVapidPublicKey,
    subscribe,
    unsubscribe,
    sendNotification,
    broadcastNotification,
    getSubscriptionStatus,
};
