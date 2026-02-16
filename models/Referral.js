module.exports = (sequelize, DataTypes) => {
    const Referral = sequelize.define('Referral', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        referralCode: {
            type: DataTypes.STRING(10),
            unique: true,
            allowNull: false,
            comment: 'Code de parrainage unique (ex: ABC123XY)',
        },
        referrerId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'ID du parrain',
        },
        refereeId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'ID du filleul (renseigné après inscription)',
        },
        status: {
            type: DataTypes.ENUM('pending', 'claimed', 'expired'),
            defaultValue: 'pending',
            comment: 'Statut du parrainage',
        },
        rewardPoints: {
            type: DataTypes.INTEGER,
            defaultValue: 500,
            comment: 'Points de fidélité attribués au parrain',
        },
        refereeRewardPoints: {
            type: DataTypes.INTEGER,
            defaultValue: 200,
            comment: 'Points de fidélité attribués au filleul',
        },
        claimedAt: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'Date de réclamation de la récompense',
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'Date d\'expiration du code',
        },
    }, {
        tableName: 'referrals',
        timestamps: true,
        indexes: [
            { fields: ['referrerId'] },
            { fields: ['refereeId'] },
            { fields: ['status'] },
        ],
    });

    // Générer un code de parrainage unique
    Referral.generateCode = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    };

    return Referral;
};
