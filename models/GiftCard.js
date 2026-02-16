const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const crypto = require('crypto');

const GiftCard = sequelize.define('GiftCard', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    code: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        comment: 'Code unique de la carte cadeau (ex: GIFT-XXXX-XXXX)',
    },
    // Valeur
    montantInitial: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Montant initial de la carte',
    },
    montantRestant: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Montant restant à utiliser',
    },
    // Expédition / Achat
    acheteurId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id',
        },
        comment: 'Utilisateur qui a acheté la carte (null si admin)',
    },
    destinataireEmail: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Email du destinataire pour envoi',
    },
    destinataireNom: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    messagePersonnel: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Message personnalisé pour le destinataire',
    },
    // Utilisation
    beneficiaireId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id',
        },
        comment: 'Utilisateur qui a réclamé/utilisé la carte',
    },
    // Statut
    statut: {
        type: DataTypes.ENUM('pending', 'sent', 'claimed', 'used', 'expired'),
        defaultValue: 'pending',
        comment: 'pending=en attente, sent=envoyée, claimed=réclamée, used=utilisée, expired=expirée',
    },
    // Dates
    dateEnvoi: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Date d\'envoi programmée',
    },
    dateExpiration: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Date d\'expiration de la carte',
    },
    dateUtilisation: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // Design
    design: {
        type: DataTypes.STRING(50),
        defaultValue: 'default',
        comment: 'Template de design de la carte',
    },
}, {
    tableName: 'gift_cards',
    timestamps: true,
    indexes: [
        { unique: true, fields: ['code'] },
        { fields: ['acheteurId'] },
        { fields: ['beneficiaireId'] },
        { fields: ['statut'] },
    ],
    hooks: {
        beforeCreate: async (giftCard) => {
            if (!giftCard.code) {
                giftCard.code = generateGiftCardCode();
            }
            if (!giftCard.montantRestant) {
                giftCard.montantRestant = giftCard.montantInitial;
            }
            if (!giftCard.dateExpiration) {
                // Expiration dans 1 an par défaut
                const expDate = new Date();
                expDate.setFullYear(expDate.getFullYear() + 1);
                giftCard.dateExpiration = expDate;
            }
        },
    },
});

// Générer un code unique
function generateGiftCardCode() {
    const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `GIFT-${part1}-${part2}`;
}

module.exports = GiftCard;
