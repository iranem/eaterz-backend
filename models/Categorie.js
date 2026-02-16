const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Categorie = sequelize.define('Categorie', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nom: {
    type: DataTypes.JSON,
    allowNull: false,
    // Format: { "fr": "Salades", "en": "Salads", "ar": "سلطات" }
    validate: {
      notNull: {
        msg: 'Le nom est requis'
      }
    }
  },
  description: {
    type: DataTypes.JSON,
    allowNull: true
    // Format: { "fr": "Description...", "en": "Description...", "ar": "وصف..." }
  },
  image: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  icone: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'utensils'
    // Nom de l'icône Lucide
  },
  slug: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  ordre: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  // Type de catégorie (pour différencier plats et produits)
  type: {
    type: DataTypes.ENUM('plat', 'produit'),
    defaultValue: 'plat',
    comment: 'plat = catégorie de repas, produit = catégorie épicerie fine'
  },
  // Métadonnées
  nombrePlats: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'categories',
  timestamps: true,
  hooks: {
    beforeValidate: (categorie) => {
      // Générer le slug à partir du nom français
      if (categorie.nom && categorie.nom.fr && !categorie.slug) {
        categorie.slug = categorie.nom.fr
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      }
    }
  }
});

// Méthode pour obtenir le nom dans une langue
Categorie.prototype.getNom = function (lang = 'fr') {
  return this.nom?.[lang] || this.nom?.fr || 'Sans nom';
};

Categorie.prototype.getDescription = function (lang = 'fr') {
  return this.description?.[lang] || this.description?.fr || '';
};

module.exports = Categorie;
