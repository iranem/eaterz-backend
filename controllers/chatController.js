const { Op } = require('sequelize');
const { User, Conversation, Message, Commande } = require('../models');
const { getIO, emitToUser } = require('../config/socket');
const logger = require('../config/logger');

/**
 * @desc    Récupérer toutes les conversations de l'utilisateur
 * @route   GET /api/chat/conversations
 * @access  Private
 */
const getConversations = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20, status = 'active' } = req.query;
        const offset = (page - 1) * limit;

        const conversations = await Conversation.findAndCountAll({
            where: {
                [Op.or]: [
                    { participant1Id: userId },
                    { participant2Id: userId }
                ],
                status
            },
            include: [
                {
                    model: User,
                    as: 'participant1',
                    attributes: ['id', 'nom', 'prenom', 'avatar', 'role', 'nomEtablissement']
                },
                {
                    model: User,
                    as: 'participant2',
                    attributes: ['id', 'nom', 'prenom', 'avatar', 'role', 'nomEtablissement']
                },
                {
                    model: Commande,
                    as: 'commande',
                    attributes: ['id', 'numero', 'statut'],
                    required: false
                }
            ],
            order: [['lastMessageAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        // Ajouter le dernier message à chaque conversation
        const conversationsWithLastMessage = await Promise.all(
            conversations.rows.map(async (conv) => {
                const lastMessage = await Message.findOne({
                    where: { conversationId: conv.id, isDeleted: false },
                    order: [['createdAt', 'DESC']],
                    include: [
                        {
                            model: User,
                            as: 'sender',
                            attributes: ['id', 'nom', 'prenom']
                        }
                    ]
                });

                const convJson = conv.toJSON();
                convJson.lastMessage = lastMessage;
                convJson.unreadCount = conv.participant1Id === userId
                    ? conv.unreadCount1
                    : conv.unreadCount2;

                // Déterminer l'autre participant
                convJson.otherParticipant = conv.participant1Id === userId
                    ? conv.participant2
                    : conv.participant1;

                return convJson;
            })
        );

        res.json({
            success: true,
            data: conversationsWithLastMessage,
            pagination: {
                total: conversations.count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(conversations.count / limit)
            }
        });
    } catch (error) {
        logger.error('Erreur lors de la récupération des conversations:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des conversations'
        });
    }
};

/**
 * @desc    Récupérer ou créer une conversation avec un utilisateur
 * @route   POST /api/chat/conversations
 * @access  Private
 */
const getOrCreateConversation = async (req, res) => {
    try {
        const userId = req.user.id;
        const { participantId, commandeId, type = 'general' } = req.body;

        if (!participantId) {
            return res.status(400).json({
                success: false,
                message: 'L\'ID du participant est requis'
            });
        }

        if (participantId === userId) {
            return res.status(400).json({
                success: false,
                message: 'Vous ne pouvez pas créer une conversation avec vous-même'
            });
        }

        // Vérifier que l'autre utilisateur existe
        const otherUser = await User.findByPk(participantId, {
            attributes: ['id', 'nom', 'prenom', 'avatar', 'role', 'nomEtablissement', 'isActive']
        });

        if (!otherUser || !otherUser.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé'
            });
        }

        // Chercher une conversation existante
        const whereClause = {
            [Op.or]: [
                { participant1Id: userId, participant2Id: participantId },
                { participant1Id: participantId, participant2Id: userId }
            ]
        };

        // Si commandeId est fourni, chercher une conversation liée à cette commande
        if (commandeId) {
            whereClause.commandeId = commandeId;
        }

        let conversation = await Conversation.findOne({
            where: whereClause,
            include: [
                {
                    model: User,
                    as: 'participant1',
                    attributes: ['id', 'nom', 'prenom', 'avatar', 'role', 'nomEtablissement']
                },
                {
                    model: User,
                    as: 'participant2',
                    attributes: ['id', 'nom', 'prenom', 'avatar', 'role', 'nomEtablissement']
                }
            ]
        });

        // Créer une nouvelle conversation si elle n'existe pas
        if (!conversation) {
            // Vérifier la commande si fournie
            if (commandeId) {
                const commande = await Commande.findByPk(commandeId);
                if (!commande) {
                    return res.status(404).json({
                        success: false,
                        message: 'Commande non trouvée'
                    });
                }
            }

            conversation = await Conversation.create({
                participant1Id: userId,
                participant2Id: participantId,
                commandeId: commandeId || null,
                type,
                status: 'active'
            });

            // Recharger avec les associations
            conversation = await Conversation.findByPk(conversation.id, {
                include: [
                    {
                        model: User,
                        as: 'participant1',
                        attributes: ['id', 'nom', 'prenom', 'avatar', 'role', 'nomEtablissement']
                    },
                    {
                        model: User,
                        as: 'participant2',
                        attributes: ['id', 'nom', 'prenom', 'avatar', 'role', 'nomEtablissement']
                    }
                ]
            });
        }

        // Réactiver la conversation si elle était archivée
        if (conversation.status === 'archived' || conversation.status === 'closed') {
            await conversation.update({ status: 'active' });
        }

        const convJson = conversation.toJSON();
        convJson.otherParticipant = conversation.participant1Id === userId
            ? conversation.participant2
            : conversation.participant1;

        res.status(201).json({
            success: true,
            data: convJson
        });
    } catch (error) {
        logger.error('Erreur lors de la création/récupération de la conversation:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création de la conversation'
        });
    }
};

/**
 * @desc    Récupérer les messages d'une conversation
 * @route   GET /api/chat/conversations/:conversationId/messages
 * @access  Private
 */
const getMessages = async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;
        const { page = 1, limit = 50, before } = req.query;
        const offset = (page - 1) * limit;

        // Vérifier que l'utilisateur fait partie de la conversation
        const conversation = await Conversation.findByPk(conversationId);

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation non trouvée'
            });
        }

        if (conversation.participant1Id !== userId && conversation.participant2Id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Accès non autorisé à cette conversation'
            });
        }

        // Construire la requête
        const whereClause = {
            conversationId,
            [Op.or]: [
                { isDeleted: false },
                { deletedBy: { [Op.notLike]: `%${userId}%` } }
            ]
        };

        // Si 'before' est fourni, récupérer les messages avant cette date
        if (before) {
            whereClause.createdAt = { [Op.lt]: new Date(before) };
        }

        const messages = await Message.findAndCountAll({
            where: whereClause,
            include: [
                {
                    model: User,
                    as: 'sender',
                    attributes: ['id', 'nom', 'prenom', 'avatar', 'role']
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        // Marquer les messages comme lus
        await Message.update(
            { isRead: true, readAt: new Date() },
            {
                where: {
                    conversationId,
                    receiverId: userId,
                    isRead: false
                }
            }
        );

        // Réinitialiser le compteur de non-lus
        if (conversation.participant1Id === userId) {
            await conversation.update({ unreadCount1: 0 });
        } else {
            await conversation.update({ unreadCount2: 0 });
        }

        // Notifier l'autre utilisateur que les messages ont été lus
        const otherUserId = conversation.participant1Id === userId
            ? conversation.participant2Id
            : conversation.participant1Id;

        emitToUser(otherUserId, 'messages:read', {
            conversationId,
            readBy: userId,
            readAt: new Date()
        });

        res.json({
            success: true,
            data: messages.rows.reverse(), // Renvoyer dans l'ordre chronologique
            pagination: {
                total: messages.count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(messages.count / limit),
                hasMore: messages.count > offset + messages.rows.length
            }
        });
    } catch (error) {
        logger.error('Erreur lors de la récupération des messages:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des messages'
        });
    }
};

/**
 * @desc    Envoyer un message
 * @route   POST /api/chat/conversations/:conversationId/messages
 * @access  Private
 */
const sendMessage = async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;
        const { content, messageType = 'text', attachmentUrl, attachmentName, attachmentType, attachmentSize } = req.body;

        if (!content && !attachmentUrl) {
            return res.status(400).json({
                success: false,
                message: 'Le contenu du message est requis'
            });
        }

        // Vérifier la conversation
        const conversation = await Conversation.findByPk(conversationId);

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation non trouvée'
            });
        }

        if (conversation.participant1Id !== userId && conversation.participant2Id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Accès non autorisé à cette conversation'
            });
        }

        const receiverId = conversation.participant1Id === userId
            ? conversation.participant2Id
            : conversation.participant1Id;

        // Créer le message
        const message = await Message.create({
            conversationId,
            senderId: userId,
            receiverId,
            content: content || '',
            messageType,
            attachmentUrl,
            attachmentName,
            attachmentType,
            attachmentSize
        });

        // Mettre à jour la conversation
        const updateData = {
            lastMessageId: message.id,
            lastMessageAt: new Date()
        };

        // Incrémenter le compteur de non-lus pour le destinataire
        if (conversation.participant1Id === receiverId) {
            updateData.unreadCount1 = (conversation.unreadCount1 || 0) + 1;
        } else {
            updateData.unreadCount2 = (conversation.unreadCount2 || 0) + 1;
        }

        await conversation.update(updateData);

        // Récupérer le message avec les associations
        const fullMessage = await Message.findByPk(message.id, {
            include: [
                {
                    model: User,
                    as: 'sender',
                    attributes: ['id', 'nom', 'prenom', 'avatar', 'role']
                }
            ]
        });

        // Émettre le message en temps réel
        emitToUser(receiverId, 'message:new', {
            message: fullMessage,
            conversationId
        });

        // Émettre également à l'expéditeur pour synchronisation multi-appareils
        emitToUser(userId, 'message:sent', {
            message: fullMessage,
            conversationId
        });

        res.status(201).json({
            success: true,
            data: fullMessage
        });
    } catch (error) {
        logger.error('Erreur lors de l\'envoi du message:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'envoi du message'
        });
    }
};

/**
 * @desc    Marquer les messages comme lus
 * @route   PUT /api/chat/conversations/:conversationId/read
 * @access  Private
 */
const markAsRead = async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;

        const conversation = await Conversation.findByPk(conversationId);

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation non trouvée'
            });
        }

        if (conversation.participant1Id !== userId && conversation.participant2Id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Accès non autorisé'
            });
        }

        // Marquer tous les messages reçus comme lus
        await Message.update(
            { isRead: true, readAt: new Date() },
            {
                where: {
                    conversationId,
                    receiverId: userId,
                    isRead: false
                }
            }
        );

        // Réinitialiser le compteur
        if (conversation.participant1Id === userId) {
            await conversation.update({ unreadCount1: 0 });
        } else {
            await conversation.update({ unreadCount2: 0 });
        }

        // Notifier l'autre utilisateur
        const otherUserId = conversation.participant1Id === userId
            ? conversation.participant2Id
            : conversation.participant1Id;

        emitToUser(otherUserId, 'messages:read', {
            conversationId,
            readBy: userId,
            readAt: new Date()
        });

        res.json({
            success: true,
            message: 'Messages marqués comme lus'
        });
    } catch (error) {
        logger.error('Erreur lors du marquage des messages:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors du marquage des messages'
        });
    }
};

/**
 * @desc    Supprimer un message (soft delete)
 * @route   DELETE /api/chat/messages/:messageId
 * @access  Private
 */
const deleteMessage = async (req, res) => {
    try {
        const userId = req.user.id;
        const { messageId } = req.params;

        const message = await Message.findByPk(messageId);

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message non trouvé'
            });
        }

        // Vérifier que l'utilisateur est l'expéditeur
        if (message.senderId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Vous ne pouvez supprimer que vos propres messages'
            });
        }

        await message.softDelete(userId);

        // Notifier le destinataire
        emitToUser(message.receiverId, 'message:deleted', {
            messageId,
            conversationId: message.conversationId
        });

        res.json({
            success: true,
            message: 'Message supprimé'
        });
    } catch (error) {
        logger.error('Erreur lors de la suppression du message:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression du message'
        });
    }
};

/**
 * @desc    Modifier un message
 * @route   PUT /api/chat/messages/:messageId
 * @access  Private
 */
const editMessage = async (req, res) => {
    try {
        const userId = req.user.id;
        const { messageId } = req.params;
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({
                success: false,
                message: 'Le contenu du message est requis'
            });
        }

        const message = await Message.findByPk(messageId);

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message non trouvé'
            });
        }

        if (message.senderId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Vous ne pouvez modifier que vos propres messages'
            });
        }

        // Vérifier que le message n'est pas trop vieux (max 15 minutes)
        const messageAge = Date.now() - new Date(message.createdAt).getTime();
        const maxEditTime = 15 * 60 * 1000; // 15 minutes

        if (messageAge > maxEditTime) {
            return res.status(400).json({
                success: false,
                message: 'Impossible de modifier un message de plus de 15 minutes'
            });
        }

        await message.update({
            content,
            isEdited: true,
            editedAt: new Date()
        });

        const updatedMessage = await Message.findByPk(messageId, {
            include: [
                {
                    model: User,
                    as: 'sender',
                    attributes: ['id', 'nom', 'prenom', 'avatar', 'role']
                }
            ]
        });

        // Notifier le destinataire
        emitToUser(message.receiverId, 'message:edited', {
            message: updatedMessage,
            conversationId: message.conversationId
        });

        res.json({
            success: true,
            data: updatedMessage
        });
    } catch (error) {
        logger.error('Erreur lors de la modification du message:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la modification du message'
        });
    }
};

/**
 * @desc    Archiver une conversation
 * @route   PUT /api/chat/conversations/:conversationId/archive
 * @access  Private
 */
const archiveConversation = async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;

        const conversation = await Conversation.findByPk(conversationId);

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation non trouvée'
            });
        }

        if (conversation.participant1Id !== userId && conversation.participant2Id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Accès non autorisé'
            });
        }

        await conversation.update({ status: 'archived' });

        res.json({
            success: true,
            message: 'Conversation archivée'
        });
    } catch (error) {
        logger.error('Erreur lors de l\'archivage:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'archivage de la conversation'
        });
    }
};

/**
 * @desc    Obtenir le nombre total de messages non lus
 * @route   GET /api/chat/unread-count
 * @access  Private
 */
const getUnreadCount = async (req, res) => {
    try {
        const userId = req.user.id;

        const conversations = await Conversation.findAll({
            where: {
                [Op.or]: [
                    { participant1Id: userId },
                    { participant2Id: userId }
                ],
                status: 'active'
            },
            attributes: ['id', 'participant1Id', 'unreadCount1', 'unreadCount2']
        });

        const totalUnread = conversations.reduce((sum, conv) => {
            const unread = conv.participant1Id === userId
                ? conv.unreadCount1
                : conv.unreadCount2;
            return sum + (unread || 0);
        }, 0);

        res.json({
            success: true,
            data: {
                totalUnread,
                conversationsWithUnread: conversations
                    .filter(conv => {
                        const unread = conv.participant1Id === userId
                            ? conv.unreadCount1
                            : conv.unreadCount2;
                        return unread > 0;
                    })
                    .map(conv => ({
                        conversationId: conv.id,
                        unreadCount: conv.participant1Id === userId
                            ? conv.unreadCount1
                            : conv.unreadCount2
                    }))
            }
        });
    } catch (error) {
        logger.error('Erreur lors du comptage des non-lus:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors du comptage des messages non lus'
        });
    }
};

/**
 * @desc    Rechercher dans les messages
 * @route   GET /api/chat/search
 * @access  Private
 */
const searchMessages = async (req, res) => {
    try {
        const userId = req.user.id;
        const { query, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        if (!query || query.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'La recherche doit contenir au moins 2 caractères'
            });
        }

        // Trouver les conversations de l'utilisateur
        const userConversations = await Conversation.findAll({
            where: {
                [Op.or]: [
                    { participant1Id: userId },
                    { participant2Id: userId }
                ]
            },
            attributes: ['id']
        });

        const conversationIds = userConversations.map(c => c.id);

        // Rechercher dans les messages
        const messages = await Message.findAndCountAll({
            where: {
                conversationId: { [Op.in]: conversationIds },
                content: { [Op.like]: `%${query}%` },
                isDeleted: false
            },
            include: [
                {
                    model: User,
                    as: 'sender',
                    attributes: ['id', 'nom', 'prenom', 'avatar']
                },
                {
                    model: Conversation,
                    as: 'conversation',
                    include: [
                        {
                            model: User,
                            as: 'participant1',
                            attributes: ['id', 'nom', 'prenom', 'nomEtablissement']
                        },
                        {
                            model: User,
                            as: 'participant2',
                            attributes: ['id', 'nom', 'prenom', 'nomEtablissement']
                        }
                    ]
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            data: messages.rows,
            pagination: {
                total: messages.count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(messages.count / limit)
            }
        });
    } catch (error) {
        logger.error('Erreur lors de la recherche:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la recherche'
        });
    }
};

/**
 * @desc    Envoyer un message système (pour les mises à jour de commande, etc.)
 * @access  Internal
 */
const sendSystemMessage = async (conversationId, content, metadata = {}) => {
    try {
        const conversation = await Conversation.findByPk(conversationId);
        if (!conversation) return null;

        const message = await Message.create({
            conversationId,
            senderId: conversation.participant1Id, // Le système utilise l'ID du premier participant
            receiverId: conversation.participant2Id,
            content,
            messageType: 'system',
            metadata
        });

        await conversation.update({
            lastMessageId: message.id,
            lastMessageAt: new Date()
        });

        // Notifier les deux participants
        emitToUser(conversation.participant1Id, 'message:new', {
            message,
            conversationId
        });
        emitToUser(conversation.participant2Id, 'message:new', {
            message,
            conversationId
        });

        return message;
    } catch (error) {
        logger.error('Erreur lors de l\'envoi du message système:', error);
        return null;
    }
};

module.exports = {
    getConversations,
    getOrCreateConversation,
    getMessages,
    sendMessage,
    markAsRead,
    deleteMessage,
    editMessage,
    archiveConversation,
    getUnreadCount,
    searchMessages,
    sendSystemMessage
};
