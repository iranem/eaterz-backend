const { Notification, User } = require('../models');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { paginate, paginationResponse } = require('../utils/helpers');
const { emitToUser, emitToAll } = require('../config/socket');
const { NOTIFICATION_TYPES } = require('../utils/constants');
const { Op } = require('sequelize');
const { saveSubscription, sendPushToUser } = require('../services/pushService');

/**
 * @desc    Obtenir mes notifications
 * @route   GET /api/notifications
 * @access  Private
 */
const getMesNotifications = asyncHandler(async (req, res) => {
  const { page, limit, type, isRead } = req.query;
  const { limit: limitNum, offset, page: pageNum } = paginate(page, limit);

  const where = { userId: req.user.id };
  if (type) where.type = type;
  if (isRead !== undefined) where.isRead = isRead === 'true';

  const { count, rows: notifications } = await Notification.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: limitNum,
    offset
  });

  res.json({
    success: true,
    ...paginationResponse(notifications, count, pageNum, limitNum)
  });
});

/**
 * @desc    Nombre de notifications non lues
 * @route   GET /api/notifications/non-lues/count
 * @access  Private
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.count({
    where: { userId: req.user.id, isRead: false }
  });

  res.json({
    success: true,
    data: { count }
  });
});

/**
 * @desc    Marquer une notification comme lue
 * @route   PUT /api/notifications/:id/lire
 * @access  Private
 */
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({
    where: { id: req.params.id, userId: req.user.id }
  });

  if (!notification) {
    res.status(404);
    throw new Error('Notification non trouvée');
  }

  await notification.update({
    isRead: true,
    readAt: new Date()
  });

  res.json({
    success: true,
    message: 'Notification marquée comme lue'
  });
});

/**
 * @desc    Marquer toutes les notifications comme lues
 * @route   PUT /api/notifications/lire-toutes
 * @access  Private
 */
const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.update(
    { isRead: true, readAt: new Date() },
    { where: { userId: req.user.id, isRead: false } }
  );

  res.json({
    success: true,
    message: 'Toutes les notifications marquées comme lues'
  });
});

/**
 * @desc    Supprimer une notification
 * @route   DELETE /api/notifications/:id
 * @access  Private
 */
const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({
    where: { id: req.params.id, userId: req.user.id }
  });

  if (!notification) {
    res.status(404);
    throw new Error('Notification non trouvée');
  }

  await notification.destroy();

  res.json({
    success: true,
    message: 'Notification supprimée'
  });
});

// ═══════════════════════════════════════════════════════════════
// SERVICE DE CRÉATION DE NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * @desc    Enregistrer l'abonnement push
 * @route   POST /api/notifications/subscribe
 * @access  Private
 */
const subscribePush = asyncHandler(async (req, res) => {
  const subscription = req.body;
  const userAgent = req.headers['user-agent'] || 'Unknown';

  if (!subscription || !subscription.endpoint || !subscription.keys) {
    res.status(400);
    throw new Error('Subscription invalide');
  }

  await saveSubscription(req.user.id, subscription, userAgent);

  res.status(201).json({
    success: true,
    message: 'Abonnement push enregistré'
  });
});

/**
 * Crée et envoie une notification à un utilisateur
 */
const createNotification = async (userId, type, titre, message, lien = null, data = null) => {
  const notification = await Notification.create({
    userId,
    type,
    titre,
    message,
    lien,
    data
  });

  // Envoyer via Socket.io
  emitToUser(userId, 'notification:nouvelle', {
    id: notification.id,
    type,
    titre,
    message,
    lien,
    createdAt: notification.createdAt
  });

  // Envoyer via Web Push
  // On le fait de manière asynchrone sans attendre pour ne pas bloquer
  User.findByPk(userId).then(user => {
    if (user && user.notificationsPush) {
      sendPushToUser(userId, {
        title: titre,
        message: message,
        url: lien
      }).catch(err => console.error('Erreur push:', err));
    }
  });

  return notification;
};

// ═══════════════════════════════════════════════════════════════
// ROUTES ADMIN
// ═══════════════════════════════════════════════════════════════

/**
 * @desc    Envoyer une notification de masse (Admin)
 * @route   POST /api/notifications/broadcast
 * @access  Private/Admin
 */
const broadcastNotification = asyncHandler(async (req, res) => {
  const { titre, message, lien, cible } = req.body;
  // cible: 'all', 'clients', 'prestataires', ou un array d'IDs

  let userIds = [];

  if (cible === 'all') {
    const users = await User.findAll({
      where: { isActive: true },
      attributes: ['id']
    });
    userIds = users.map(u => u.id);
  } else if (cible === 'clients') {
    const users = await User.findAll({
      where: { isActive: true, role: 'client' },
      attributes: ['id']
    });
    userIds = users.map(u => u.id);
  } else if (cible === 'prestataires') {
    const users = await User.findAll({
      where: { isActive: true, role: 'prestataire' },
      attributes: ['id']
    });
    userIds = users.map(u => u.id);
  } else if (Array.isArray(cible)) {
    userIds = cible;
  }

  // Créer les notifications en bulk
  const notifications = userIds.map(userId => ({
    userId,
    type: NOTIFICATION_TYPES.SYSTEM,
    titre,
    message,
    lien
  }));

  await Notification.bulkCreate(notifications);

  // Émettre via Socket
  emitToAll('notification:broadcast', {
    type: NOTIFICATION_TYPES.SYSTEM,
    titre,
    message,
    lien
  });

  res.json({
    success: true,
    message: `Notification envoyée à ${userIds.length} utilisateurs`
  });
});

module.exports = {
  getMesNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  broadcastNotification,
  subscribePush,
  createNotification
};
