const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Subscription = sequelize.define('Subscription', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id',
        },
    },
    prestataireId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id',
        },
        comment: 'Prestataire pour commandes automatiques',
    },
    // Plat ou panier à recommander
    type: {
        type: DataTypes.ENUM('plat', 'panier'),
        defaultValue: 'plat',
        comment: 'Type: plat unique ou panier sauvegardé',
    },
    platId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'plats',
            key: 'id',
        },
    },
    panierItems: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Items du panier si type=panier [{platId, quantite}]',
    },
    // Fréquence
    frequence: {
        type: DataTypes.ENUM('quotidien', 'hebdomadaire', 'mensuel'),
        defaultValue: 'hebdomadaire',
    },
    joursSemaine: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [1, 3, 5], // Lundi, Mercredi, Vendredi
        comment: 'Jours de la semaine (0=Dimanche, 6=Samedi)',
    },
    heureLivraison: {
        type: DataTypes.TIME,
        defaultValue: '12:30:00',
        comment: 'Heure de livraison souhaitée',
    },
    // Livraison
    adresseLivraison: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    villeLivraison: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    telephoneLivraison: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    // Paiement
    modePaiement: {
        type: DataTypes.ENUM('especes', 'carte', 'edahabia'),
        defaultValue: 'especes',
    },
    // Status
    statut: {
        type: DataTypes.ENUM('active', 'paused', 'cancelled'),
        defaultValue: 'active',
    },
    pausedUntil: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Date de fin de pause',
    },
    // Stats
    nombreCommandes: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: 'Nombre de commandes générées',
    },
    derniereCommande: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    prochaineCommande: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // Dates
    dateDebut: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    dateFin: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Date de fin optionnelle',
    },
}, {
    tableName: 'subscriptions',
    timestamps: true,
    indexes: [
        { fields: ['clientId'] },
        { fields: ['statut'] },
        { fields: ['prochaineCommande'] },
    ],
});

module.exports = Subscription;
