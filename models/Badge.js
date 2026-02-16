module.exports = (sequelize, DataTypes) => {
    const Badge = sequelize.define('Badge', {
        id: {
            type: DataTypes.STRING(50),
            primaryKey: true,
            comment: 'Identifiant unique du badge (ex: first_order)',
        },
        name: {
            type: DataTypes.STRING(100),
            allowNull: false,
            comment: 'Nom du badge',
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Description des conditions pour obtenir le badge',
        },
        icon: {
            type: DataTypes.STRING(10),
            allowNull: false,
            defaultValue: '🏆',
            comment: 'Emoji du badge',
        },
        points: {
            type: DataTypes.INTEGER,
            defaultValue: 50,
            comment: 'Points de fidélité attribués',
        },
        category: {
            type: DataTypes.ENUM('commandes', 'fidelite', 'social', 'special'),
            defaultValue: 'commandes',
            comment: 'Catégorie du badge',
        },
        condition: {
            type: DataTypes.JSON,
            allowNull: true,
            comment: 'Conditions JSON pour débloquer (type, value)',
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        sortOrder: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
    }, {
        tableName: 'badges',
        timestamps: true,
    });

    return Badge;
};
