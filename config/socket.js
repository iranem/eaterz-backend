const { Server } = require('socket.io');
const { verifyAccessToken } = require('../utils/generateToken');

let io;

/**
 * Initialise Socket.io
 */
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Middleware d'authentification Socket.io
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
      const decoded = verifyAccessToken(token);
      if (decoded) {
        socket.user = decoded;
        return next();
      }
    }
    // Permettre les connexions non authentifiées (mode invité)
    socket.user = null;
    next();
  });

  // Gestion des connexions
  io.on('connection', (socket) => {
    console.log(`🔌 Nouvelle connexion Socket: ${socket.id}`);

    // Rejoindre la room utilisateur si authentifié
    if (socket.user) {
      socket.join(`user_${socket.user.id}`);
      console.log(`👤 User ${socket.user.id} a rejoint sa room`);

      // Si prestataire, rejoindre aussi la room prestataire
      if (socket.user.role === 'prestataire') {
        socket.join(`prestataire_${socket.user.id}`);
        console.log(`🍳 Prestataire ${socket.user.id} a rejoint sa room`);
      }

      // Si admin, rejoindre la room admin
      if (socket.user.role === 'admin') {
        socket.join('admins');
        console.log(`🛡️ Admin ${socket.user.id} a rejoint la room admins`);
      }

      // Si livreur, rejoindre la room livreur
      if (socket.user.role === 'livreur') {
        socket.join(`livreur_${socket.user.id}`);
        console.log(`🚴 Livreur ${socket.user.id} a rejoint sa room`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CHAT EVENTS
    // ═══════════════════════════════════════════════════════════════

    // Événement: Rejoindre une room de conversation
    socket.on('join:conversation', async ({ conversationId }) => {
      if (!socket.user) {
        socket.emit('error', { message: 'Authentification requise' });
        return;
      }

      try {
        const { Conversation } = require('../models');
        const conversation = await Conversation.findByPk(conversationId);

        if (!conversation) {
          socket.emit('error', { message: 'Conversation non trouvée' });
          return;
        }

        const isParticipant =
          conversation.participant1Id === socket.user.id ||
          conversation.participant2Id === socket.user.id;

        if (!isParticipant && socket.user.role !== 'admin') {
          socket.emit('error', { message: 'Accès non autorisé à cette conversation' });
          return;
        }

        socket.join(`conversation_${conversationId}`);
        console.log(`💬 User ${socket.user.id} a rejoint la conversation ${conversationId}`);

        // Notifier l'autre participant que l'utilisateur est en ligne
        const otherUserId = conversation.participant1Id === socket.user.id
          ? conversation.participant2Id
          : conversation.participant1Id;

        io.to(`user_${otherUserId}`).emit('user:online', {
          conversationId,
          userId: socket.user.id
        });
      } catch (error) {
        console.error('Erreur join:conversation:', error);
        socket.emit('error', { message: 'Erreur lors de la connexion à la conversation' });
      }
    });

    // Événement: Quitter une room de conversation
    socket.on('leave:conversation', ({ conversationId }) => {
      socket.leave(`conversation_${conversationId}`);
      console.log(`💬 User ${socket.user?.id || 'unknown'} a quitté la conversation ${conversationId}`);
    });

    // Événement: Indicateur de frappe
    socket.on('typing:start', async ({ conversationId }) => {
      if (!socket.user) return;

      try {
        const { Conversation } = require('../models');
        const conversation = await Conversation.findByPk(conversationId);

        if (!conversation) return;

        const otherUserId = conversation.participant1Id === socket.user.id
          ? conversation.participant2Id
          : conversation.participant1Id;

        io.to(`user_${otherUserId}`).emit('typing:indicator', {
          conversationId,
          userId: socket.user.id,
          isTyping: true
        });
      } catch (error) {
        console.error('Erreur typing:start:', error);
      }
    });

    // Événement: Fin de frappe
    socket.on('typing:stop', async ({ conversationId }) => {
      if (!socket.user) return;

      try {
        const { Conversation } = require('../models');
        const conversation = await Conversation.findByPk(conversationId);

        if (!conversation) return;

        const otherUserId = conversation.participant1Id === socket.user.id
          ? conversation.participant2Id
          : conversation.participant1Id;

        io.to(`user_${otherUserId}`).emit('typing:indicator', {
          conversationId,
          userId: socket.user.id,
          isTyping: false
        });
      } catch (error) {
        console.error('Erreur typing:stop:', error);
      }
    });

    // Événement: Message lu (envoyé depuis le client)
    socket.on('message:read', async ({ conversationId, messageId }) => {
      if (!socket.user) return;

      try {
        const { Conversation, Message } = require('../models');

        // Marquer le message comme lu
        if (messageId) {
          await Message.update(
            { isRead: true, readAt: new Date() },
            { where: { id: messageId, receiverId: socket.user.id } }
          );
        }

        const conversation = await Conversation.findByPk(conversationId);
        if (!conversation) return;

        const otherUserId = conversation.participant1Id === socket.user.id
          ? conversation.participant2Id
          : conversation.participant1Id;

        io.to(`user_${otherUserId}`).emit('messages:read', {
          conversationId,
          readBy: socket.user.id,
          readAt: new Date()
        });
      } catch (error) {
        console.error('Erreur message:read:', error);
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // ORDER TRACKING EVENTS
    // ═══════════════════════════════════════════════════════════════

    // Événement: Rejoindre une room de suivi de commande
    // Security: Only allow authenticated users to join order rooms
    socket.on('join:commande', async ({ commandeId }) => {
      if (!socket.user) {
        socket.emit('error', { message: 'Authentication required to track orders' });
        return;
      }

      // Validate that user has access to this order (client, prestataire, or admin)
      try {
        const { Commande } = require('../models');
        const commande = await Commande.findByPk(commandeId, {
          attributes: ['id', 'clientId', 'prestataireId']
        });

        if (!commande) {
          socket.emit('error', { message: 'Order not found' });
          return;
        }

        const isAuthorized =
          socket.user.role === 'admin' ||
          commande.clientId === socket.user.id ||
          commande.prestataireId === socket.user.id;

        if (!isAuthorized) {
          socket.emit('error', { message: 'Access denied to this order' });
          return;
        }

        socket.join(`commande_${commandeId}`);
        console.log(`📦 Socket ${socket.id} (user ${socket.user.id}) tracking order ${commandeId}`);
      } catch (error) {
        console.error('Error joining order room:', error);
        socket.emit('error', { message: 'Failed to join order tracking' });
      }
    });

    // Événement: Quitter le suivi d'une commande
    socket.on('leave:commande', ({ commandeId }) => {
      socket.leave(`commande_${commandeId}`);
      console.log(`📦 Socket ${socket.id} ne suit plus la commande ${commandeId}`);
    });

    // Événement: Rejoindre une room de suivi de livraison
    socket.on('join:livraison', async ({ livraisonId }) => {
      if (!socket.user) {
        socket.emit('error', { message: 'Authentication required to track deliveries' });
        return;
      }

      try {
        const { Livraison, Commande, User } = require('../models');
        const livraison = await Livraison.findByPk(livraisonId, {
          include: [
            {
              model: Commande,
              as: 'commande',
              attributes: ['id', 'clientId', 'prestataireId']
            },
            {
              model: User,
              as: 'livreur',
              attributes: ['id', 'prenom', 'nom', 'telephone', 'avatar', 'positionActuelle']
            }
          ]
        });

        if (!livraison) {
          socket.emit('error', { message: 'Delivery not found' });
          return;
        }

        const isAuthorized =
          socket.user.role === 'admin' ||
          socket.user.role === 'livreur' && livraison.livreurId === socket.user.id ||
          livraison.commande?.clientId === socket.user.id ||
          livraison.commande?.prestataireId === socket.user.id;

        if (!isAuthorized) {
          socket.emit('error', { message: 'Access denied to this delivery' });
          return;
        }

        socket.join(`livraison_${livraisonId}`);
        console.log(`🚚 Socket ${socket.id} tracking delivery ${livraisonId}`);

        // Send initial tracking data
        const trackingData = {
          livraisonId: livraison.id,
          commandeId: livraison.commandeId,
          livreurId: livraison.livreurId,
          livreurNom: livraison.livreur ? `${livraison.livreur.prenom} ${livraison.livreur.nom}` : null,
          livreurTelephone: livraison.livreur?.telephone,
          livreurAvatar: livraison.livreur?.avatar,
          position: livraison.positionActuelle,
          statut: livraison.statut,
        };

        socket.emit('livraison:data', trackingData);
      } catch (error) {
        console.error('Error joining delivery room:', error);
        socket.emit('error', { message: 'Failed to join delivery tracking' });
      }
    });

    // Événement: Quitter le suivi d'une livraison
    socket.on('leave:livraison', ({ livraisonId }) => {
      socket.leave(`livraison_${livraisonId}`);
      console.log(`🚚 Socket ${socket.id} stopped tracking delivery ${livraisonId}`);
    });

    // Événement: Mise à jour position livreur (pour l'interface livreur)
    socket.on('livreur:position', async ({ lat, lng }) => {
      if (!socket.user || socket.user.role !== 'livreur') {
        socket.emit('error', { message: 'Only deliverers can update position' });
        return;
      }

      try {
        const { User, Livraison, Commande } = require('../models');
        const { Op } = require('sequelize');
        const { DELIVERY_STATUS } = require('../utils/constants');

        const position = { lat, lng, timestamp: new Date() };

        // Update livreur position
        await User.update(
          { positionActuelle: { lat, lng }, dernierePingPosition: new Date() },
          { where: { id: socket.user.id } }
        );

        // Update active deliveries and notify clients
        const activeDeliveries = await Livraison.findAll({
          where: {
            livreurId: socket.user.id,
            statut: { [Op.in]: [DELIVERY_STATUS.PICKED_UP, DELIVERY_STATUS.IN_TRANSIT] }
          },
          include: [{ model: Commande, as: 'commande' }]
        });

        for (const delivery of activeDeliveries) {
          // Update delivery position
          await delivery.update({ positionActuelle: position });

          // Emit to all tracking this delivery
          io.to(`livraison_${delivery.id}`).emit('livraison:position', {
            livraisonId: delivery.id,
            position,
          });

          // Also emit to user room
          if (delivery.commande?.clientId) {
            io.to(`user_${delivery.commande.clientId}`).emit('livraison:position', {
              livraisonId: delivery.id,
              commandeId: delivery.commandeId,
              position,
            });
          }
        }

        console.log(`📍 Livreur ${socket.user.id} position updated: ${lat}, ${lng}`);
      } catch (error) {
        console.error('Error updating livreur position:', error);
        socket.emit('error', { message: 'Failed to update position' });
      }
    });

    // Déconnexion
    socket.on('disconnect', () => {
      console.log(`🔌 Déconnexion Socket: ${socket.id}`);

      // Notifier les conversations actives que l'utilisateur est hors ligne
      if (socket.user) {
        io.emit('user:offline', { userId: socket.user.id });
      }
    });
  });

  console.log('✅ Socket.io initialisé');
  return io;
};

/**
 * Récupère l'instance Socket.io
 */
const getIO = () => {
  if (!io) {
    throw new Error('Socket.io non initialisé');
  }
  return io;
};

/**
 * Émet un événement à un utilisateur spécifique
 */
const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user_${userId}`).emit(event, data);
  }
};

/**
 * Émet un événement à un prestataire spécifique
 */
const emitToPrestataire = (prestataireId, event, data) => {
  if (io) {
    io.to(`prestataire_${prestataireId}`).emit(event, data);
  }
};

/**
 * Émet un événement aux administrateurs
 */
const emitToAdmins = (event, data) => {
  if (io) {
    io.to('admins').emit(event, data);
  }
};

/**
 * Émet un événement aux abonnés d'une commande
 */
const emitToCommande = (commandeId, event, data) => {
  if (io) {
    io.to(`commande_${commandeId}`).emit(event, data);
  }
};

/**
 * Émet un événement à tous les utilisateurs connectés
 */
const emitToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

/**
 * Émet un événement aux abonnés d'une livraison
 */
const emitToLivraison = (livraisonId, event, data) => {
  if (io) {
    io.to(`livraison_${livraisonId}`).emit(event, data);
  }
};

/**
 * Émet une mise à jour de position de livreur
 */
const emitLivreurPosition = (livraisonId, commandeId, clientId, position) => {
  if (io) {
    const data = { livraisonId, commandeId, position };
    io.to(`livraison_${livraisonId}`).emit('livraison:position', data);
    io.to(`commande_${commandeId}`).emit('livraison:position', data);
    if (clientId) {
      io.to(`user_${clientId}`).emit('livraison:position', data);
    }
  }
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToPrestataire,
  emitToAdmins,
  emitToCommande,
  emitToAll,
  emitToLivraison,
  emitLivreurPosition
};

