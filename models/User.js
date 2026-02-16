const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');
const { sequelize } = require('../config/database');
const { ROLES, LANGUAGES, LIVREUR_STATUS, PRESTATAIRE_TYPES } = require('../utils/constants');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: {
        msg: 'Email invalide'
      }
    }
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM(Object.values(ROLES)),
    defaultValue: ROLES.CLIENT,
    allowNull: false
  },
  nom: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      len: {
        args: [2, 100],
        msg: 'Le nom doit contenir entre 2 et 100 caractères'
      }
    }
  },
  prenom: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      len: {
        args: [2, 100],
        msg: 'Le prénom doit contenir entre 2 et 100 caractères'
      }
    }
  },
  telephone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  avatar: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  adresse: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  ville: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  codePostal: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  // Champs spécifiques prestataire
  nomEtablissement: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  descriptionEtablissement: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  horairesOuverture: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null
    // Format: { "lundi": { "ouvert": true, "debut": "08:00", "fin": "22:00" }, ... }
  },
  zonesLivraison: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
    // Format: ["Alger Centre", "Bab El Oued", ...]
  },
  prestataireType: {
    type: DataTypes.ENUM(Object.values(PRESTATAIRE_TYPES)),
    defaultValue: PRESTATAIRE_TYPES.RESTAURANT, // On garde restaurant par défaut pour la compatibilité
    allowNull: true // Seuleument pour les prestataires
  },
  // Champs spécifiques livreur
  vehiculeImmatriculation: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  livreurStatus: {
    type: DataTypes.ENUM(Object.values(LIVREUR_STATUS)),
    defaultValue: LIVREUR_STATUS.OFFLINE,
    allowNull: true
  },
  livreurZones: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
    // Format: ["Alger Centre", "Hussein Dey", ...]
  },
  positionActuelle: {
    type: DataTypes.JSON,
    allowNull: true
    // Format: { lat: 36.7538, lng: 3.0588 }
  },
  dernierePingPosition: {
    type: DataTypes.DATE,
    allowNull: true
  },
  noteLivreur: {
    type: DataTypes.DECIMAL(2, 1),
    allowNull: true,
    defaultValue: 5.0
  },
  nombreLivraisons: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  // Vérification et statut
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  verificationToken: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  verificationTokenExpires: {
    type: DataTypes.DATE,
    allowNull: true
  },
  resetPasswordToken: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  resetPasswordExpires: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Préférences
  langue: {
    type: DataTypes.ENUM(LANGUAGES),
    defaultValue: 'fr'
  },
  theme: {
    type: DataTypes.ENUM('light', 'dark'),
    defaultValue: 'light'
  },
  notificationsEmail: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  notificationsPush: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  // Token version pour invalidation
  tokenVersion: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Programme de fidélité
  loyaltyPoints: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  loyaltyTier: {
    type: DataTypes.ENUM('bronze', 'silver', 'gold', 'platinum'),
    defaultValue: 'bronze'
  }
}, {
  tableName: 'users',
  timestamps: true,
  hooks: {
    // Hash du mot de passe avant création
    beforeCreate: async (user) => {
      if (user.password) {
        const salt = await bcrypt.genSalt(12);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
    // Hash du mot de passe avant mise à jour
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        const salt = await bcrypt.genSalt(12);
        user.password = await bcrypt.hash(user.password, salt);
      }
    }
  }
});

// Méthodes d'instance
User.prototype.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

User.prototype.toJSON = function () {
  const values = { ...this.get() };
  delete values.password;
  delete values.verificationToken;
  delete values.verificationTokenExpires;
  delete values.resetPasswordToken;
  delete values.resetPasswordExpires;
  delete values.tokenVersion;
  return values;
};

User.prototype.getFullName = function () {
  return `${this.prenom} ${this.nom}`;
};

// Méthodes de classe
User.findByEmail = async function (email) {
  return this.findOne({ where: { email: email.toLowerCase() } });
};

module.exports = User;
