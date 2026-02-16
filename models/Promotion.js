const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { PROMO_TYPES } = require('../utils/constants');

const Promotion = sequelize.define('Promotion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  prestataireId: {
    type: DataTypes.INTEGER,
    allowNull: true, // null = promotion globale (admin)
    references: {
      model: 'users',
      key: 'id'
    }
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  type: {
    type: DataTypes.ENUM(Object.values(PROMO_TYPES)),
    allowNull: false,
    defaultValue: PROMO_TYPES.PERCENTAGE
  },
  valeur: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: {
        args: [0],
        msg: 'La valeur doit être positive'
      }
    }
  },
  description: {
    type: DataTypes.JSON,
    allowNull: true
    // Format: { "fr": "10% de réduction", "en": "10% off", "ar": "خصم 10%" }
  },
  // Conditions d'application
  montantMinimum: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  montantMaxReduction: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
    // Plafond de réduction pour les pourcentages
  },
  // Validité
  dateDebut: {
    type: DataTypes.DATE,
    allowNull: false
  },
  dateFin: {
    type: DataTypes.DATE,
    allowNull: false
  },
  // Limites d'utilisation
  limiteUtilisationTotale: {
    type: DataTypes.INTEGER,
    defaultValue: -1 // -1 = illimité
  },
  limiteParUtilisateur: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  utilisationsActuelles: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  // Restrictions
  categoriesApplicables: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [] // Vide = toutes les catégories
  },
  platsApplicables: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [] // Vide = tous les plats
  },
  nouveauxClientsUniquement: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  // Statut
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isGlobal: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'promotions',
  timestamps: true,
  indexes: [
    { fields: ['code'], unique: true },
    { fields: ['prestataireId'] },
    { fields: ['isActive'] },
    { fields: ['dateDebut', 'dateFin'] }
  ]
});

// Méthodes d'instance
Promotion.prototype.isValid = function() {
  const now = new Date();
  return this.isActive &&
    new Date(this.dateDebut) <= now &&
    new Date(this.dateFin) >= now &&
    (this.limiteUtilisationTotale === -1 || this.utilisationsActuelles < this.limiteUtilisationTotale);
};

Promotion.prototype.calculerReduction = function(montant) {
  if (!this.isValid()) return 0;
  if (montant < parseFloat(this.montantMinimum)) return 0;

  let reduction = 0;

  switch (this.type) {
    case PROMO_TYPES.PERCENTAGE:
      reduction = montant * (parseFloat(this.valeur) / 100);
      if (this.montantMaxReduction && reduction > parseFloat(this.montantMaxReduction)) {
        reduction = parseFloat(this.montantMaxReduction);
      }
      break;
    case PROMO_TYPES.FIXED:
      reduction = Math.min(parseFloat(this.valeur), montant);
      break;
    case PROMO_TYPES.FREE_DELIVERY:
      // Retourne la valeur qui représente les frais de livraison à annuler
      reduction = parseFloat(this.valeur);
      break;
  }

  return Math.round(reduction * 100) / 100;
};

Promotion.prototype.getDescription = function(lang = 'fr') {
  return this.description?.[lang] || this.description?.fr || '';
};

module.exports = Promotion;
