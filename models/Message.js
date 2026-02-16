const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Modèle Message - Représente un message dans une conversation
 */
const Message = sequelize.define('Message', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    // Référence à la conversation
    conversationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'conversations',
            key: 'id'
        }
    },
    // Expéditeur du message
    senderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    // Destinataire du message
    receiverId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    // Contenu du message
    content: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
            notEmpty: {
                msg: 'Le message ne peut pas être vide'
            },
            len: {
                args: [1, 5000],
                msg: 'Le message doit contenir entre 1 et 5000 caractères'
            }
        }
    },
    // Type de message
    messageType: {
        type: DataTypes.ENUM('text', 'image', 'file', 'system', 'order_update'),
        defaultValue: 'text'
    },
    // URL du fichier/image si applicable
    attachmentUrl: {
        type: DataTypes.STRING(500),
        allowNull: true
    },
    // Nom du fichier original
    attachmentName: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    // Type MIME du fichier
    attachmentType: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    // Taille du fichier en bytes
    attachmentSize: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    // Statut de lecture
    isRead: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    // Date de lecture
    readAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    // Statut de livraison
    deliveredAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    // Message supprimé (soft delete)
    isDeleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    // Date de suppression
    deletedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    // Qui a supprimé (pour qui le message est masqué)
    deletedBy: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: []
        // Format: [userId1, userId2, ...]
    },
    // Message édité
    isEdited: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    // Date d'édition
    editedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    // Métadonnées du message (pour les messages système, etc.)
    metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {}
    }
}, {
    tableName: 'messages',
    timestamps: true,
    indexes: [
        {
            fields: ['conversationId']
        },
        {
            fields: ['senderId']
        },
        {
            fields: ['receiverId']
        },
        {
            fields: ['createdAt']
        },
        {
            fields: ['isRead']
        }
    ]
});

// Méthodes d'instance
Message.prototype.markAsRead = async function () {
    this.isRead = true;
    this.readAt = new Date();
    await this.save();
    return this;
};

Message.prototype.markAsDelivered = async function () {
    if (!this.deliveredAt) {
        this.deliveredAt = new Date();
        await this.save();
    }
    return this;
};

Message.prototype.softDelete = async function (userId) {
    const deletedBy = this.deletedBy || [];
    if (!deletedBy.includes(userId)) {
        deletedBy.push(userId);
        this.deletedBy = deletedBy;
        this.deletedAt = new Date();
        this.isDeleted = true;
        await this.save();
    }
    return this;
};

Message.prototype.toJSON = function () {
    const values = { ...this.get() };
    // Masquer le contenu si supprimé
    if (values.isDeleted) {
        values.content = 'Message supprimé';
        values.attachmentUrl = null;
        values.attachmentName = null;
    }
    return values;
};

module.exports = Message;
