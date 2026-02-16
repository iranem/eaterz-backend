const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// Table pour suivre l'utilisation des codes promo
const PromotionUsage = sequelize.define('PromotionUsage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  promotionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'promotions',
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  commandeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'commandes',
      key: 'id'
    }
  },
  montantReduction: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  }
}, {
  tableName: 'promotion_usages',
  timestamps: true,
  indexes: [
    { fields: ['promotionId'] },
    { fields: ['userId'] },
    { fields: ['commandeId'] },
    { fields: ['promotionId', 'userId'] }
  ]
});

module.exports = PromotionUsage;
