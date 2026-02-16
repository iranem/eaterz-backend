const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LoyaltyTransaction = sequelize.define('LoyaltyTransaction', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    clientId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    type: {
        type: DataTypes.ENUM('earn', 'burn', 'expire', 'adjustment'),
        allowNull: false
    },
    points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            notEmpty: true
        }
    },
    description: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    referenceType: {
        type: DataTypes.STRING(50), // 'commande', 'parrainage', 'bonus', 'recompense'
        allowNull: true
    },
    referenceId: {
        type: DataTypes.STRING(50), // ID de la commande ou autre
        allowNull: true
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'loyalty_transactions',
    timestamps: true,
    indexes: [
        {
            fields: ['clientId']
        }
    ]
});

module.exports = LoyaltyTransaction;
