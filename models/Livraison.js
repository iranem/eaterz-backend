const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { DELIVERY_STATUS, LIVREUR_COMMISSION_RATE } = require('../utils/constants');

/**
 * Modèle Livraison - Gère le suivi des livraisons
 */
const Livraison = sequelize.define('Livraison', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    commandeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true, // Une commande = une livraison
        references: {
            model: 'commandes',
            key: 'id'
        }
    },
    livreurId: {
        type: DataTypes.INTEGER,
        allowNull: true, // null si pas encore assignée
        references: {
            model: 'users',
            key: 'id'
        }
    },
    statut: {
        type: DataTypes.ENUM(Object.values(DELIVERY_STATUS)),
        defaultValue: DELIVERY_STATUS.PENDING
    },

    // Timestamps du parcours
    dateAssignation: {
        type: DataTypes.DATE,
        allowNull: true
    },
    dateRecuperation: {
        type: DataTypes.DATE,
        allowNull: true
    },
    dateLivraison: {
        type: DataTypes.DATE,
        allowNull: true
    },

    // Adresses
    adresseRecuperation: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    adresseLivraison: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    villeRecuperation: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    villeLivraison: {
        type: DataTypes.STRING(100),
        allowNull: true
    },

    // Distance et temps
    distanceEstimee: {
        type: DataTypes.DECIMAL(5, 2), // en km
        allowNull: true
    },
    tempsEstime: {
        type: DataTypes.INTEGER, // en minutes
        allowNull: true
    },

    // Paiement livreur
    fraisLivraison: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    commission: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    pourboire: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },

    // Évaluation
    noteLivreur: {
        type: DataTypes.INTEGER, // 1-5
        allowNull: true,
        validate: {
            min: 1,
            max: 5
        }
    },
    commentaireLivraison: {
        type: DataTypes.TEXT,
        allowNull: true
    },

    // Confirmation
    codeConfirmation: {
        type: DataTypes.STRING(6),
        allowNull: true
    },
    preuvePhoto: {
        type: DataTypes.STRING(255),
        allowNull: true
    },

    // Position tracking
    positionActuelle: {
        type: DataTypes.JSON,
        allowNull: true
        // Format: { lat: 36.7538, lng: 3.0588, timestamp: Date }
    },
    historiquePositions: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: []
    },

    // Métadonnées
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    motifEchec: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'livraisons',
    timestamps: true,
    hooks: {
        beforeCreate: (livraison) => {
            // Générer code de confirmation (6 chiffres)
            livraison.codeConfirmation = Math.floor(100000 + Math.random() * 900000).toString();
        }
    },
    indexes: [
        { fields: ['commandeId'], unique: true },
        { fields: ['livreurId'] },
        { fields: ['statut'] },
        { fields: ['createdAt'] }
    ]
});

// Méthodes d'instance
Livraison.prototype.calculerCommission = function () {
    return this.fraisLivraison * LIVREUR_COMMISSION_RATE;
};

Livraison.prototype.getStatusLabel = function () {
    const labels = {
        [DELIVERY_STATUS.PENDING]: 'En attente',
        [DELIVERY_STATUS.ASSIGNED]: 'Assignée',
        [DELIVERY_STATUS.PICKED_UP]: 'Récupérée',
        [DELIVERY_STATUS.IN_TRANSIT]: 'En cours',
        [DELIVERY_STATUS.DELIVERED]: 'Livrée',
        [DELIVERY_STATUS.FAILED]: 'Échouée'
    };
    return labels[this.statut] || this.statut;
};

module.exports = Livraison;
