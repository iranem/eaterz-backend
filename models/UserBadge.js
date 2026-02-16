module.exports = (sequelize, DataTypes) => {
    const UserBadge = sequelize.define('UserBadge', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id',
            },
        },
        badgeId: {
            type: DataTypes.STRING(50),
            allowNull: false,
            references: {
                model: 'badges',
                key: 'id',
            },
        },
        unlockedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            comment: 'Date de déblocage du badge',
        },
        seen: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            comment: 'L\'utilisateur a-t-il vu le nouveau badge ?',
        },
    }, {
        tableName: 'user_badges',
        timestamps: true,
        indexes: [
            { fields: ['userId'] },
            { fields: ['badgeId'] },
            { unique: true, fields: ['userId', 'badgeId'] },
        ],
    });

    return UserBadge;
};
