const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { NOTIFICATION_TYPES } = require('../utils/constants');

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.ENUM(Object.values(NOTIFICATION_TYPES)),
    allowNull: false,
    defaultValue: NOTIFICATION_TYPES.SYSTEM
  },
  titre: {
    type: DataTypes.JSON,
    allowNull: false
    // Format: { "fr": "Nouvelle commande", "en": "New order", "ar": "طلب جديد" }
  },
  message: {
    type: DataTypes.JSON,
    allowNull: false
    // Format: { "fr": "Vous avez reçu...", "en": "You received...", "ar": "لقد تلقيت..." }
  },
  lien: {
    type: DataTypes.STRING(255),
    allowNull: true
    // Lien vers la ressource concernée
  },
  data: {
    type: DataTypes.JSON,
    allowNull: true
    // Données additionnelles (commandeId, platId, etc.)
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'notifications',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['type'] },
    { fields: ['isRead'] },
    { fields: ['createdAt'] }
  ]
});

// Méthodes d'instance
Notification.prototype.getTitre = function(lang = 'fr') {
  return this.titre?.[lang] || this.titre?.fr || '';
};

Notification.prototype.getMessage = function(lang = 'fr') {
  return this.message?.[lang] || this.message?.fr || '';
};

module.exports = Notification;
