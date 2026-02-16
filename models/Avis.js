const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Avis = sequelize.define('Avis', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  clientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  platId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'plats',
      key: 'id'
    }
  },
  commandeId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'commandes',
      key: 'id'
    }
  },
  note: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: {
        args: [1],
        msg: 'La note minimum est 1'
      },
      max: {
        args: [5],
        msg: 'La note maximum est 5'
      }
    }
  },
  commentaire: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Réponse du prestataire
  reponse: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  dateReponse: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Modération
  isVisible: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isSignale: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  motifSignalement: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  dateSignalement: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Métadonnées
  isVerifiedPurchase: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'avis',
  timestamps: true,
  indexes: [
    { fields: ['clientId'] },
    { fields: ['platId'] },
    { fields: ['commandeId'] },
    { fields: ['note'] },
    { fields: ['isVisible'] },
    { fields: ['isSignale'] }
  ]
});

module.exports = Avis;
