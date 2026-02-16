const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CommandeItem = sequelize.define('CommandeItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  commandeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'commandes',
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
  quantite: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    validate: {
      min: {
        args: [1],
        msg: 'La quantité doit être au moins 1'
      }
    }
  },
  prixUnitaire: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  sousTotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  // Options sélectionnées
  options: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
    // Format: [{ nom: "Taille", choix: "Large", supplement: 200 }]
  },
  supplementsTotal: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  // Instructions spéciales pour ce plat
  instructions: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Snapshot du plat au moment de la commande
  platSnapshot: {
    type: DataTypes.JSON,
    allowNull: true
    // Contient nom, description, image au moment de la commande
  }
}, {
  tableName: 'commande_items',
  timestamps: true,
  hooks: {
    beforeCreate: (item) => {
      // Calculer le sous-total
      const prixBase = parseFloat(item.prixUnitaire) || 0;
      const supplements = parseFloat(item.supplementsTotal) || 0;
      item.sousTotal = (prixBase + supplements) * item.quantite;
    },
    beforeUpdate: (item) => {
      if (item.changed('quantite') || item.changed('prixUnitaire') || item.changed('supplementsTotal')) {
        const prixBase = parseFloat(item.prixUnitaire) || 0;
        const supplements = parseFloat(item.supplementsTotal) || 0;
        item.sousTotal = (prixBase + supplements) * item.quantite;
      }
    }
  },
  indexes: [
    { fields: ['commandeId'] },
    { fields: ['platId'] }
  ]
});

module.exports = CommandeItem;
