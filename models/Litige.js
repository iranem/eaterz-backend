const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { DISPUTE_STATUS } = require('../utils/constants');

const Litige = sequelize.define('Litige', {
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
  commandeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'commandes',
      key: 'id'
    }
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
  adminId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  motif: {
    type: DataTypes.ENUM(
      'commande_non_recue',
      'qualite_insatisfaisante',
      'produit_different',
      'retard_livraison',
      'probleme_paiement',
      'autre'
    ),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  statut: {
    type: DataTypes.ENUM(Object.values(DISPUTE_STATUS)),
    defaultValue: DISPUTE_STATUS.OPEN
  },
  priorite: {
    type: DataTypes.ENUM('basse', 'normale', 'haute', 'urgente'),
    defaultValue: 'normale'
  },
  // Pièces jointes
  piecesJointes: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
    // Format: [{ nom: "photo1.jpg", url: "/uploads/litiges/xxx.jpg" }]
  },
  // Résolution
  resolution: {
    type: DataTypes.ENUM(
      'remboursement_total',
      'remboursement_partiel',
      'avoir',
      'faveur_prestataire',
      'sans_suite'
    ),
    allowNull: true
  },
  montantRembourse: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  commentaireResolution: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  dateResolution: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Historique des échanges
  messages: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
    // Format: [{ auteurId, auteurRole, message, date }]
  },
  datePriseEnCharge: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'litiges',
  timestamps: true,
  hooks: {
    beforeCreate: (litige) => {
      if (!litige.numero) {
        const date = new Date();
        const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        litige.numero = `LIT-${dateStr}-${random}`;
      }
    }
  },
  indexes: [
    { fields: ['commandeId'] },
    { fields: ['clientId'] },
    { fields: ['prestataireId'] },
    { fields: ['adminId'] },
    { fields: ['statut'] },
    { fields: ['priorite'] },
    { fields: ['numero'], unique: true }
  ]
});

// Méthodes d'instance
Litige.prototype.getMotifLabel = function() {
  const labels = {
    'commande_non_recue': 'Commande non reçue',
    'qualite_insatisfaisante': 'Qualité insatisfaisante',
    'produit_different': 'Produit différent de la description',
    'retard_livraison': 'Retard de livraison important',
    'probleme_paiement': 'Problème de paiement',
    'autre': 'Autre'
  };
  return labels[this.motif] || this.motif;
};

Litige.prototype.getStatutLabel = function() {
  const labels = {
    [DISPUTE_STATUS.OPEN]: 'Ouvert',
    [DISPUTE_STATUS.IN_PROGRESS]: 'En cours de traitement',
    [DISPUTE_STATUS.RESOLVED]: 'Résolu',
    [DISPUTE_STATUS.CLOSED]: 'Fermé'
  };
  return labels[this.statut] || this.statut;
};

Litige.prototype.addMessage = function(auteurId, auteurRole, message) {
  const messages = this.messages || [];
  messages.push({
    auteurId,
    auteurRole,
    message,
    date: new Date().toISOString()
  });
  this.messages = messages;
};

module.exports = Litige;
