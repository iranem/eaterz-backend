const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Modèle Conversation - Représente une conversation entre deux utilisateurs
 */
const Conversation = sequelize.define('Conversation', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    // Premier participant (généralement le créateur)
    participant1Id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    // Deuxième participant
    participant2Id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    // Type de conversation pour catégorisation
    type: {
        type: DataTypes.ENUM('support', 'order', 'general', 'delivery'),
        defaultValue: 'general',
        allowNull: false
    },
    // Référence optionnelle à une commande
    commandeId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'commandes',
            key: 'id'
        }
    },
    // Dernier message pour affichage rapide
    lastMessageId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    // Timestamp du dernier message
    lastMessageAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    // Nombre de messages non lus par participant1
    unreadCount1: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    // Nombre de messages non lus par participant2
    unreadCount2: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    // Statut de la conversation
    status: {
        type: DataTypes.ENUM('active', 'archived', 'closed'),
        defaultValue: 'active'
    },
    // Métadonnées additionnelles
    metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {}
    }
}, {
    tableName: 'conversations',
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['participant1Id', 'participant2Id', 'commandeId'],
            name: 'unique_conversation'
        },
        {
            fields: ['participant1Id']
        },
        {
            fields: ['participant2Id']
        },
        {
            fields: ['lastMessageAt']
        }
    ]
});

// Méthodes d'instance
Conversation.prototype.getOtherParticipant = function (userId) {
    return this.participant1Id === userId ? this.participant2Id : this.participant1Id;
};

Conversation.prototype.getUnreadCountForUser = function (userId) {
    return this.participant1Id === userId ? this.unreadCount1 : this.unreadCount2;
};

module.exports = Conversation;
