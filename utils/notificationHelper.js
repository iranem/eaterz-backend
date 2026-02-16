/**
 * Service de gestion des notifications
 * Centralise la création et l'envoi des notifications
 */

const { Notification, User } = require('../models');
const { emitToUser, emitToPrestataire, emitToAdmins, emitToAll } = require('../config/socket');
const { NOTIFICATION_TYPES } = require('./constants');

/**
 * Templates de notifications prédéfinis
 */
const NOTIFICATION_TEMPLATES = {
    // Commandes
    ORDER_NEW: {
        titre: {
            fr: 'Nouvelle commande',
            en: 'New order',
            ar: 'طلب جديد'
        },
        getMessage: (data) => ({
            fr: `Vous avez reçu une nouvelle commande #${data.orderNumber} d'un montant de ${data.total} DA`,
            en: `You received a new order #${data.orderNumber} for ${data.total} DA`,
            ar: `تلقيت طلبًا جديدًا #${data.orderNumber} بمبلغ ${data.total} دج`
        })
    },
    ORDER_CONFIRMED: {
        titre: {
            fr: 'Commande confirmée',
            en: 'Order confirmed',
            ar: 'تم تأكيد الطلب'
        },
        getMessage: (data) => ({
            fr: `Votre commande #${data.orderNumber} a été confirmée et sera bientôt préparée`,
            en: `Your order #${data.orderNumber} has been confirmed and will be prepared soon`,
            ar: `تم تأكيد طلبك #${data.orderNumber} وسيتم تحضيره قريبًا`
        })
    },
    ORDER_READY: {
        titre: {
            fr: 'Commande prête',
            en: 'Order ready',
            ar: 'الطلب جاهز'
        },
        getMessage: (data) => ({
            fr: `Votre commande #${data.orderNumber} est prête${data.deliveryType === 'livraison' ? ' et sera bientôt en livraison' : ' à récupérer'}`,
            en: `Your order #${data.orderNumber} is ready${data.deliveryType === 'livraison' ? ' and will be delivered soon' : ' for pickup'}`,
            ar: `طلبك #${data.orderNumber} جاهز${data.deliveryType === 'livraison' ? ' وسيتم توصيله قريبًا' : ' للاستلام'}`
        })
    },
    ORDER_DELIVERING: {
        titre: {
            fr: 'Commande en livraison',
            en: 'Order on the way',
            ar: 'الطلب في الطريق'
        },
        getMessage: (data) => ({
            fr: `Votre commande #${data.orderNumber} est en cours de livraison par ${data.livreurName || 'notre livreur'}`,
            en: `Your order #${data.orderNumber} is being delivered by ${data.livreurName || 'our driver'}`,
            ar: `طلبك #${data.orderNumber} في طريقه إليك مع ${data.livreurName || 'السائق'}`
        })
    },
    ORDER_DELIVERED: {
        titre: {
            fr: 'Commande livrée',
            en: 'Order delivered',
            ar: 'تم توصيل الطلب'
        },
        getMessage: (data) => ({
            fr: `Votre commande #${data.orderNumber} a été livrée. Bon appétit ! 🍽️`,
            en: `Your order #${data.orderNumber} has been delivered. Enjoy your meal! 🍽️`,
            ar: `تم توصيل طلبك #${data.orderNumber}. بالعافية! 🍽️`
        })
    },
    ORDER_CANCELLED: {
        titre: {
            fr: 'Commande annulée',
            en: 'Order cancelled',
            ar: 'تم إلغاء الطلب'
        },
        getMessage: (data) => ({
            fr: `La commande #${data.orderNumber} a été annulée. ${data.reason || ''}`,
            en: `Order #${data.orderNumber} has been cancelled. ${data.reason || ''}`,
            ar: `تم إلغاء الطلب #${data.orderNumber}. ${data.reason || ''}`
        })
    },

    // Livreur
    DELIVERY_ASSIGNED: {
        titre: {
            fr: 'Nouvelle livraison assignée',
            en: 'New delivery assigned',
            ar: 'تعيين توصيل جديد'
        },
        getMessage: (data) => ({
            fr: `Une nouvelle livraison vous a été assignée. Récupérez la commande chez ${data.prestataireNom}`,
            en: `A new delivery has been assigned to you. Pick up the order from ${data.prestataireNom}`,
            ar: `تم تعيين توصيل جديد لك. استلم الطلب من ${data.prestataireNom}`
        })
    },

    // Avis
    NEW_REVIEW: {
        titre: {
            fr: 'Nouvel avis reçu',
            en: 'New review received',
            ar: 'تقييم جديد'
        },
        getMessage: (data) => ({
            fr: `Un client a laissé un avis ${data.note}/5 sur votre plat "${data.platNom}"`,
            en: `A customer left a ${data.note}/5 rating on your dish "${data.platNom}"`,
            ar: `ترك أحد العملاء تقييم ${data.note}/5 على طبقك "${data.platNom}"`
        })
    },

    // Litiges
    DISPUTE_OPENED: {
        titre: {
            fr: 'Litige ouvert',
            en: 'Dispute opened',
            ar: 'فتح نزاع'
        },
        getMessage: (data) => ({
            fr: `Un litige a été ouvert pour la commande #${data.orderNumber}`,
            en: `A dispute has been opened for order #${data.orderNumber}`,
            ar: `تم فتح نزاع للطلب #${data.orderNumber}`
        })
    },
    DISPUTE_RESOLVED: {
        titre: {
            fr: 'Litige résolu',
            en: 'Dispute resolved',
            ar: 'تم حل النزاع'
        },
        getMessage: (data) => ({
            fr: `Le litige concernant la commande #${data.orderNumber} a été résolu`,
            en: `The dispute for order #${data.orderNumber} has been resolved`,
            ar: `تم حل النزاع المتعلق بالطلب #${data.orderNumber}`
        })
    },

    // Paiement
    PAYMENT_SUCCESS: {
        titre: {
            fr: 'Paiement reçu',
            en: 'Payment received',
            ar: 'تم استلام الدفع'
        },
        getMessage: (data) => ({
            fr: `Votre paiement de ${data.amount} DA a été reçu avec succès`,
            en: `Your payment of ${data.amount} DA has been received successfully`,
            ar: `تم استلام دفعتك بمبلغ ${data.amount} دج بنجاح`
        })
    },
    PAYMENT_FAILED: {
        titre: {
            fr: 'Échec du paiement',
            en: 'Payment failed',
            ar: 'فشل الدفع'
        },
        getMessage: (data) => ({
            fr: `Le paiement de ${data.amount} DA a échoué. Veuillez réessayer`,
            en: `Payment of ${data.amount} DA failed. Please try again`,
            ar: `فشل الدفع بمبلغ ${data.amount} دج. يرجى المحاولة مرة أخرى`
        })
    },

    // Promotions
    NEW_PROMO: {
        titre: {
            fr: 'Nouvelle promotion !',
            en: 'New promotion!',
            ar: 'عرض جديد!'
        },
        getMessage: (data) => ({
            fr: `Utilisez le code ${data.code} pour bénéficier de ${data.valeur}${data.type === 'pourcentage' ? '%' : ' DA'} de réduction !`,
            en: `Use code ${data.code} to get ${data.valeur}${data.type === 'pourcentage' ? '%' : ' DA'} off!`,
            ar: `استخدم الرمز ${data.code} للحصول على خصم ${data.valeur}${data.type === 'pourcentage' ? '%' : ' دج'}!`
        })
    },

    // Bienvenue
    WELCOME: {
        titre: {
            fr: 'Bienvenue sur EATERZ !',
            en: 'Welcome to EATERZ!',
            ar: '!EATERZ مرحبًا بك في'
        },
        getMessage: (data) => ({
            fr: `Bonjour ${data.prenom}, bienvenue sur EATERZ ! Découvrez nos plats healthy préparés avec passion.`,
            en: `Hello ${data.prenom}, welcome to EATERZ! Discover our healthy dishes made with passion.`,
            ar: `مرحبًا ${data.prenom}، أهلاً بك في EATERZ! اكتشف أطباقنا الصحية المحضرة بشغف.`
        })
    }
};

/**
 * Crée et envoie une notification à un utilisateur
 * @param {Object} options - Options de la notification
 * @param {number} options.userId - ID de l'utilisateur
 * @param {string} options.type - Type de notification (voir NOTIFICATION_TYPES)
 * @param {string} options.template - Template prédéfini à utiliser
 * @param {Object} options.templateData - Données pour le template
 * @param {Object} options.customTitre - Titre personnalisé (si pas de template)
 * @param {Object} options.customMessage - Message personnalisé (si pas de template)
 * @param {string} options.lien - Lien vers la ressource concernée
 * @param {Object} options.data - Données additionnelles
 * @returns {Promise<Notification>}
 */
async function sendNotification(options) {
    const {
        userId,
        type = NOTIFICATION_TYPES.SYSTEM,
        template,
        templateData = {},
        customTitre,
        customMessage,
        lien = null,
        data = null
    } = options;

    let titre, message;

    if (template && NOTIFICATION_TEMPLATES[template]) {
        const tpl = NOTIFICATION_TEMPLATES[template];
        titre = tpl.titre;
        message = typeof tpl.getMessage === 'function'
            ? tpl.getMessage(templateData)
            : tpl.message;
    } else {
        titre = customTitre || { fr: 'Notification' };
        message = customMessage || { fr: 'Vous avez une nouvelle notification' };
    }

    try {
        const notification = await Notification.create({
            userId,
            type,
            titre,
            message,
            lien,
            data
        });

        // Émettre via Socket.io
        emitToUser(userId, 'notification:nouvelle', {
            id: notification.id,
            type,
            titre,
            message,
            lien,
            data,
            createdAt: notification.createdAt
        });

        return notification;
    } catch (error) {
        console.error('Erreur création notification:', error);
        throw error;
    }
}

/**
 * Envoie une notification à plusieurs utilisateurs
 * @param {number[]} userIds - IDs des utilisateurs
 * @param {Object} options - Options de notification (même que sendNotification sauf userId)
 */
async function sendNotificationToMany(userIds, options) {
    const notifications = await Promise.all(
        userIds.map(userId => sendNotification({ ...options, userId }))
    );
    return notifications;
}

/**
 * Envoie une notification à tous les utilisateurs d'un rôle
 * @param {string} role - Rôle des utilisateurs (client, prestataire, livreur, admin)
 * @param {Object} options - Options de notification
 */
async function sendNotificationByRole(role, options) {
    const users = await User.findAll({
        where: { role, isActive: true },
        attributes: ['id']
    });

    const userIds = users.map(u => u.id);
    return sendNotificationToMany(userIds, options);
}

/**
 * Envoie une notification de commande
 */
async function notifyOrderStatus(order, newStatus, additionalData = {}) {
    const statusTemplates = {
        'confirmee': 'ORDER_CONFIRMED',
        'en_preparation': 'ORDER_CONFIRMED',
        'prete': 'ORDER_READY',
        'en_livraison': 'ORDER_DELIVERING',
        'livree': 'ORDER_DELIVERED',
        'annulee': 'ORDER_CANCELLED'
    };

    const template = statusTemplates[newStatus];
    if (!template) return;

    // Notifier le client
    await sendNotification({
        userId: order.clientId,
        type: NOTIFICATION_TYPES.ORDER_STATUS,
        template,
        templateData: {
            orderNumber: order.numero,
            ...additionalData
        },
        lien: `/client/commandes/${order.id}`,
        data: { commandeId: order.id, statut: newStatus }
    });
}

/**
 * Envoie notification de nouvelle commande au prestataire
 */
async function notifyNewOrder(order) {
    await sendNotification({
        userId: order.prestataireId,
        type: NOTIFICATION_TYPES.ORDER_NEW,
        template: 'ORDER_NEW',
        templateData: {
            orderNumber: order.numero,
            total: order.total
        },
        lien: `/prestataire/commandes/${order.id}`,
        data: { commandeId: order.id }
    });
}

/**
 * Envoie notification d'assignation au livreur
 */
async function notifyDeliveryAssigned(livraison, prestataire) {
    await sendNotification({
        userId: livraison.livreurId,
        type: NOTIFICATION_TYPES.DELIVERY,
        template: 'DELIVERY_ASSIGNED',
        templateData: {
            prestataireNom: prestataire.nomEtablissement || `${prestataire.prenom} ${prestataire.nom}`,
            commandeId: livraison.commandeId
        },
        lien: `/livreur/livraisons/${livraison.id}`,
        data: { livraisonId: livraison.id, commandeId: livraison.commandeId }
    });
}

/**
 * Envoie notification de nouvel avis au prestataire
 */
async function notifyNewReview(avis, plat) {
    await sendNotification({
        userId: plat.prestataireId,
        type: NOTIFICATION_TYPES.REVIEW,
        template: 'NEW_REVIEW',
        templateData: {
            note: avis.note,
            platNom: plat.nom?.fr || plat.nom
        },
        lien: `/prestataire/avis`,
        data: { avisId: avis.id, platId: plat.id }
    });
}

/**
 * Envoie notification de bienvenue
 */
async function notifyWelcome(user) {
    await sendNotification({
        userId: user.id,
        type: NOTIFICATION_TYPES.SYSTEM,
        template: 'WELCOME',
        templateData: {
            prenom: user.prenom
        },
        lien: user.role === 'prestataire' ? '/prestataire/dashboard' : '/menu',
        data: { isWelcome: true }
    });
}

module.exports = {
    NOTIFICATION_TEMPLATES,
    sendNotification,
    sendNotificationToMany,
    sendNotificationByRole,
    notifyOrderStatus,
    notifyNewOrder,
    notifyDeliveryAssigned,
    notifyNewReview,
    notifyWelcome
};
