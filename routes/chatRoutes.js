const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const {
    getConversations,
    getOrCreateConversation,
    getMessages,
    sendMessage,
    markAsRead,
    deleteMessage,
    editMessage,
    archiveConversation,
    getUnreadCount,
    searchMessages
} = require('../controllers/chatController');

// Toutes les routes nécessitent une authentification
router.use(authenticate);

/**
 * @swagger
 * /api/chat/conversations:
 *   get:
 *     summary: Récupérer toutes les conversations de l'utilisateur
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Numéro de page
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Nombre de conversations par page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, archived, closed]
 *         description: Filtrer par statut
 *     responses:
 *       200:
 *         description: Liste des conversations
 */
router.get('/conversations', getConversations);

/**
 * @swagger
 * /api/chat/conversations:
 *   post:
 *     summary: Créer ou récupérer une conversation avec un utilisateur
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - participantId
 *             properties:
 *               participantId:
 *                 type: integer
 *               commandeId:
 *                 type: integer
 *               type:
 *                 type: string
 *                 enum: [support, order, general, delivery]
 *     responses:
 *       201:
 *         description: Conversation créée ou récupérée
 */
router.post('/conversations', getOrCreateConversation);

/**
 * @swagger
 * /api/chat/conversations/{conversationId}/messages:
 *   get:
 *     summary: Récupérer les messages d'une conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Récupérer les messages avant cette date
 *     responses:
 *       200:
 *         description: Liste des messages
 */
router.get('/conversations/:conversationId/messages', getMessages);

/**
 * @swagger
 * /api/chat/conversations/{conversationId}/messages:
 *   post:
 *     summary: Envoyer un message
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *               messageType:
 *                 type: string
 *                 enum: [text, image, file, system, order_update]
 *               attachmentUrl:
 *                 type: string
 *               attachmentName:
 *                 type: string
 *               attachmentType:
 *                 type: string
 *               attachmentSize:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Message envoyé
 */
router.post('/conversations/:conversationId/messages', sendMessage);

/**
 * @swagger
 * /api/chat/conversations/{conversationId}/read:
 *   put:
 *     summary: Marquer les messages d'une conversation comme lus
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Messages marqués comme lus
 */
router.put('/conversations/:conversationId/read', markAsRead);

/**
 * @swagger
 * /api/chat/conversations/{conversationId}/archive:
 *   put:
 *     summary: Archiver une conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Conversation archivée
 */
router.put('/conversations/:conversationId/archive', archiveConversation);

/**
 * @swagger
 * /api/chat/messages/{messageId}:
 *   put:
 *     summary: Modifier un message
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message modifié
 */
router.put('/messages/:messageId', editMessage);

/**
 * @swagger
 * /api/chat/messages/{messageId}:
 *   delete:
 *     summary: Supprimer un message
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Message supprimé
 */
router.delete('/messages/:messageId', deleteMessage);

/**
 * @swagger
 * /api/chat/unread-count:
 *   get:
 *     summary: Obtenir le nombre total de messages non lus
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Nombre de messages non lus
 */
router.get('/unread-count', getUnreadCount);

/**
 * @swagger
 * /api/chat/search:
 *   get:
 *     summary: Rechercher dans les messages
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Résultats de recherche
 */
router.get('/search', searchMessages);

module.exports = router;
