const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { ORDER_STATUS } = require('../utils/constants');

/**
 * Modèle pour l'historique des changements de statut des commandes
 * Permet de tracer chaque transition avec l'acteur responsable
 */
const CommandeHistorique = sequelize.define('CommandeHistorique', {
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
    ancienStatut: {
        type: DataTypes.ENUM(Object.values(ORDER_STATUS)),
        allowNull: true // null pour la création initiale
    },
    nouveauStatut: {
        type: DataTypes.ENUM(Object.values(ORDER_STATUS)),
        allowNull: false
    },
    acteurId: {
        type: DataTypes.INTEGER,
        allowNull: true, // null pour les actions système
        references: {
            model: 'users',
            key: 'id'
        }
    },
    acteurType: {
        type: DataTypes.ENUM('client', 'prestataire', 'admin', 'system'),
        allowNull: false
    },
    motif: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    motifCode: {
        type: DataTypes.STRING(50),
        allowNull: true // Code du motif de refus si applicable
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true // Données supplémentaires
    }
}, {
    tableName: 'commande_historique',
    timestamps: true,
    updatedAt: false, // Pas besoin de updatedAt pour un log
    indexes: [
        { fields: ['commandeId'] },
        { fields: ['acteurId'] },
        { fields: ['createdAt'] }
    ]
});

module.exports = CommandeHistorique;
