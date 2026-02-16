const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate, paginationRules } = require('../middleware/validationMiddleware');
const { authenticate } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/roleMiddleware');

const {
  getMesNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  broadcastNotification,
  subscribePush
} = require('../controllers/notificationController');

// Routes utilisateur
router.get('/', authenticate, paginationRules, validate, getMesNotifications);
router.post('/subscribe', authenticate, subscribePush);
router.get('/non-lues/count', authenticate, getUnreadCount);
router.put('/:id/lire', authenticate, param('id').isInt(), validate, markAsRead);
router.put('/lire-toutes', authenticate, markAllAsRead);
router.delete('/:id', authenticate, param('id').isInt(), validate, deleteNotification);

// Routes Admin
router.post('/broadcast', authenticate, isAdmin,
  body('titre').notEmpty(),
  body('message').notEmpty(),
  body('cible').notEmpty(),
  validate,
  broadcastNotification
);

module.exports = router;
