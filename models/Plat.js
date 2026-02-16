const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Plat = sequelize.define('Plat', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  prestataireId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  categorieId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'categories',
      key: 'id'
    }
  },
  nom: {
    type: DataTypes.JSON,
    allowNull: false
    // Format: { "fr": "Salade César", "en": "Caesar Salad", "ar": "سلطة سيزر" }
  },
  description: {
    type: DataTypes.JSON,
    allowNull: true
  },
  prix: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: {
        args: [0],
        msg: 'Le prix doit être positif'
      }
    }
  },
  prixPromo: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  image: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  images: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
    // Galerie d'images additionnelles
  },
  ingredients: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
    // Format: ["Laitue romaine", "Parmesan", "Croûtons", ...]
  },
  // Informations nutritionnelles
  calories: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  proteines: {
    type: DataTypes.DECIMAL(5, 1),
    allowNull: true
  },
  glucides: {
    type: DataTypes.DECIMAL(5, 1),
    allowNull: true
  },
  lipides: {
    type: DataTypes.DECIMAL(5, 1),
    allowNull: true
  },
  fibres: {
    type: DataTypes.DECIMAL(5, 1),
    allowNull: true
  },
  allergenes: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
    // Format: ["gluten", "lait", "oeufs", ...]
  },
  tempPreparation: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 30
    // En minutes
  },
  isAvailable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  stock: {
    type: DataTypes.INTEGER,
    defaultValue: -1
    // -1 = illimité, > 0 = stock fini (pour produits)
  },
  // Nouveaux champs pour produits healthy
  type: {
    type: DataTypes.ENUM('plat', 'produit'),
    defaultValue: 'plat',
    allowNull: false
  },
  unite: {
    type: DataTypes.ENUM('g', 'kg', 'ml', 'cl', 'l', 'unite'),
    allowNull: true
  },
  poids_volume: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  format: {
    type: DataTypes.STRING(100),
    allowNull: true
    // Ex: "Bouteille en verre", "Pot de 500g"
  },
  origine: {
    type: DataTypes.STRING(100),
    allowNull: true
    // Ex: "Kabylie", "Biskra"
  },
  isFeatured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  // Statistiques
  nombreCommandes: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  noteMoyenne: {
    type: DataTypes.DECIMAL(2, 1),
    defaultValue: 0
  },
  nombreAvis: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  // Tags/Options
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
    // Format: ["vegan", "sans-gluten", "bio", ...]
  },
  options: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
    // Format: [{ nom: "Taille", choix: [{ label: "Normal", supplement: 0 }, { label: "Large", supplement: 200 }] }]
  }
}, {
  tableName: 'plats',
  timestamps: true,
  paranoid: false, // On utilise isDeleted manuellement
  indexes: [
    { fields: ['prestataireId'] },
    { fields: ['categorieId'] },
    { fields: ['isAvailable'] },
    { fields: ['isFeatured'] },
    { fields: ['prix'] },
    { fields: ['noteMoyenne'] }
  ]
});

// Méthodes d'instance
Plat.prototype.getNom = function (lang = 'fr') {
  return this.nom?.[lang] || this.nom?.fr || 'Sans nom';
};

Plat.prototype.getDescription = function (lang = 'fr') {
  return this.description?.[lang] || this.description?.fr || '';
};

Plat.prototype.getPrixActuel = function () {
  if (this.prixPromo && parseFloat(this.prixPromo) > 0 && parseFloat(this.prixPromo) < parseFloat(this.prix)) {
    return parseFloat(this.prixPromo);
  }
  return parseFloat(this.prix);
};

Plat.prototype.getReduction = function () {
  if (this.prixPromo && parseFloat(this.prixPromo) > 0 && parseFloat(this.prixPromo) < parseFloat(this.prix)) {
    return Math.round((1 - parseFloat(this.prixPromo) / parseFloat(this.prix)) * 100);
  }
  return 0;
};

Plat.prototype.isInStock = function () {
  return this.isAvailable && (this.stock === -1 || this.stock > 0);
};

module.exports = Plat;
