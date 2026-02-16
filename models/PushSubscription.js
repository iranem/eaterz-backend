const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PushSubscription = sequelize.define('PushSubscription', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    endpoint: {
        type: DataTypes.STRING(500), // L'endpoint peut être long mais UNIQUE nécessite une longueur définie en MySQL
        allowNull: false,
        unique: true
    },
    keys: {
        type: DataTypes.JSON,
        allowNull: false
        // Format: { "auth": "...", "p256dh": "..." }
    },
    userAgent: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    lastUsedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'push_subscriptions',
    timestamps: true,
    indexes: [
        {
            fields: ['userId']
        }
    ]
});

module.exports = PushSubscription;
