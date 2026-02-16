const webPush = require('web-push');
const { PushSubscription, User } = require('../models');

// Configuration VAPID
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webPush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
} else {
    console.warn('⚠️ Web Push VAPID keys not configured');
}

/**
 * Enregistrer un nouvel abonnement Push
 */
const saveSubscription = async (userId, subscription, userAgent) => {
    try {
        // Vérifier si l'endpoint existe déjà
        const existing = await PushSubscription.findOne({
            where: { endpoint: subscription.endpoint }
        });

        if (existing) {
            await existing.update({
                userId, // Update user in case device changed owner or logged in with different account
                keys: subscription.keys,
                userAgent,
                lastUsedAt: new Date()
            });
            return existing;
        }

        return await PushSubscription.create({
            userId,
            endpoint: subscription.endpoint,
            keys: subscription.keys,
            userAgent
        });
    } catch (error) {
        console.error('Erreur saveSubscription:', error);
        throw error;
    }
};

/**
 * Envoyer une notification Push à un utilisateur
 */
const sendPushToUser = async (userId, payload) => {
    if (!process.env.VAPID_PUBLIC_KEY) return;

    try {
        // Récupérer tous les abonnements de l'utilisateur
        const subscriptions = await PushSubscription.findAll({
            where: { userId }
        });

        if (!subscriptions || subscriptions.length === 0) return;

        const notificationPayload = JSON.stringify(payload);

        const promises = subscriptions.map(async (sub) => {
            try {
                await webPush.sendNotification({
                    endpoint: sub.endpoint,
                    keys: sub.keys
                }, notificationPayload);

                // Update last used
                await sub.update({ lastUsedAt: new Date() });

            } catch (error) {
                if (error.statusCode === 410 || error.statusCode === 404) {
                    // Subscription expired or invalid
                    console.log(`Suppression abonnement expiré: ${sub.id}`);
                    await sub.destroy();
                } else {
                    console.error(`Erreur envoi push vers ${sub.id}:`, error.message);
                }
            }
        });

        await Promise.all(promises);

    } catch (error) {
        console.error('Erreur sendPushToUser:', error);
    }
};

module.exports = {
    saveSubscription,
    sendPushToUser
};
