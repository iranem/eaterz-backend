const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { ORDER_STATUS, PAYMENT_STATUS, PAYMENT_MODES } = require('../utils/constants');
const { generateOrderNumber } = require('../utils/helpers');

const Commande = sequelize.define('Commande', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  numero: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true
  },
  clientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  prestataireId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  promotionId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'promotions',
      key: 'id'
    }
  },
  statut: {
    type: DataTypes.ENUM(Object.values(ORDER_STATUS)),
    defaultValue: ORDER_STATUS.PENDING
  },
  // Montants
  sousTotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  reduction: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  fraisLivraison: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  // Livraison
  adresseLivraison: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  villeLivraison: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  telephoneLivraison: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  instructions: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  dateLivraisonSouhaitee: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Type de commande pour différenciation livraison
  typeCommande: {
    type: DataTypes.ENUM('plats', 'produits', 'mixte'),
    defaultValue: 'plats',
    comment: 'plats = repas chauds, produits = épicerie, mixte = les deux'
  },
  modeLivraison: {
    type: DataTypes.ENUM('immediat', 'differe'),
    defaultValue: 'immediat',
    comment: 'immediat = jour même, differe = j+1 (pour produits)'
  },
  // Commandes programmées
  isScheduled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Indique si la commande est programmée pour plus tard'
  },
  scheduledNotificationSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Notification envoyée au prestataire avant la date prévue'
  },
  // Paiement
  modePaiement: {
    type: DataTypes.ENUM(Object.values(PAYMENT_MODES)),
    defaultValue: PAYMENT_MODES.CASH
  },
  statutPaiement: {
    type: DataTypes.ENUM(Object.values(PAYMENT_STATUS)),
    defaultValue: PAYMENT_STATUS.PENDING
  },
  transactionId: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  paiementDetails: {
    type: DataTypes.JSON,
    allowNull: true
  },
  // Dates de changement de statut
  dateConfirmation: {
    type: DataTypes.DATE,
    allowNull: true
  },
  datePreparation: {
    type: DataTypes.DATE,
    allowNull: true
  },
  datePrete: {
    type: DataTypes.DATE,
    allowNull: true
  },
  dateLivraison: {
    type: DataTypes.DATE,
    allowNull: true
  },
  dateAnnulation: {
    type: DataTypes.DATE,
    allowNull: true
  },
  motifAnnulation: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Notes
  notesClient: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  notesPrestataire: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Code promo utilisé
  codePromoUtilise: {
    type: DataTypes.STRING(50),
    allowNull: true
  }
}, {
  tableName: 'commandes',
  timestamps: true,
  hooks: {
    beforeCreate: (commande) => {
      if (!commande.numero) {
        commande.numero = generateOrderNumber();
      }
    }
  },
  indexes: [
    { fields: ['clientId'] },
    { fields: ['prestataireId'] },
    { fields: ['statut'] },
    { fields: ['numero'], unique: true },
    { fields: ['createdAt'] }
  ]
});

// Méthodes d'instance
Commande.prototype.canBeCancelled = function () {
  return [ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED].includes(this.statut);
};

Commande.prototype.canBeModified = function () {
  return this.statut === ORDER_STATUS.PENDING;
};

Commande.prototype.getStatusLabel = function () {
  const labels = {
    [ORDER_STATUS.PENDING]: 'En attente',
    [ORDER_STATUS.CONFIRMED]: 'Confirmée',
    [ORDER_STATUS.PREPARING]: 'En préparation',
    [ORDER_STATUS.READY]: 'Prête',
    [ORDER_STATUS.DELIVERING]: 'En livraison',
    [ORDER_STATUS.DELIVERED]: 'Livrée',
    [ORDER_STATUS.CANCELLED]: 'Annulée'
  };
  return labels[this.statut] || this.statut;
};

module.exports = Commande;
