const asyncHandler = require('express-async-handler');
const { Referral, User, LoyaltyTransaction } = require('../models');
const { Op } = require('sequelize');

/**
 * @desc    Obtenir ou créer le code de parrainage de l'utilisateur
 * @route   GET /api/referral/my-code
 * @access  Private
 */
const getMyReferralCode = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // Chercher un code existant
    let referral = await Referral.findOne({
        where: {
            referrerId: userId,
            status: 'pending',
            [Op.or]: [
                { expiresAt: null },
                { expiresAt: { [Op.gt]: new Date() } },
            ],
        },
    });

    // Créer un nouveau code si nécessaire
    if (!referral) {
        let code;
        let isUnique = false;

        // Générer un code unique
        while (!isUnique) {
            code = Referral.generateCode();
            const existing = await Referral.findOne({ where: { referralCode: code } });
            if (!existing) isUnique = true;
        }

        // Créer le parrainage avec expiration dans 30 jours
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        referral = await Referral.create({
            referralCode: code,
            referrerId: userId,
            expiresAt,
        });
    }

    // Compter les parrainages réussis
    const successfulReferrals = await Referral.count({
        where: {
            referrerId: userId,
            status: 'claimed',
        },
    });

    // Calculer les points gagnés par parrainage
    const totalPointsEarned = await Referral.sum('rewardPoints', {
        where: {
            referrerId: userId,
            status: 'claimed',
        },
    }) || 0;

    res.json({
        success: true,
        data: {
            code: referral.referralCode,
            expiresAt: referral.expiresAt,
            shareLink: `${process.env.FRONTEND_URL}/register?ref=${referral.referralCode}`,
            stats: {
                successfulReferrals,
                totalPointsEarned,
            },
        },
    });
});

/**
 * @desc    Statistiques détaillées de parrainage
 * @route   GET /api/referral/stats
 * @access  Private
 */
const getReferralStats = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // Parrainages par statut
    const pending = await Referral.count({
        where: { referrerId: userId, status: 'pending' },
    });
    const claimed = await Referral.count({
        where: { referrerId: userId, status: 'claimed' },
    });
    const expired = await Referral.count({
        where: { referrerId: userId, status: 'expired' },
    });

    // Points totaux
    const totalPoints = await Referral.sum('rewardPoints', {
        where: { referrerId: userId, status: 'claimed' },
    }) || 0;

    // Liste des filleuls
    const referees = await Referral.findAll({
        where: {
            referrerId: userId,
            status: 'claimed',
            refereeId: { [Op.ne]: null },
        },
        include: [
            {
                model: User,
                as: 'referee',
                attributes: ['id', 'nom', 'prenom', 'createdAt'],
            },
        ],
        order: [['claimedAt', 'DESC']],
        limit: 10,
    });

    res.json({
        success: true,
        data: {
            stats: {
                pending,
                claimed,
                expired,
                total: pending + claimed + expired,
                totalPoints,
            },
            recentReferees: referees.map((r) => ({
                id: r.referee?.id,
                name: r.referee ? `${r.referee.prenom} ${r.referee.nom.charAt(0)}.` : null,
                joinedAt: r.claimedAt,
                pointsEarned: r.rewardPoints,
            })),
        },
    });
});

/**
 * @desc    Utiliser un code de parrainage lors de l'inscription
 * @route   POST /api/referral/claim/:code
 * @access  Private (nouvel utilisateur)
 */
const claimReferralCode = asyncHandler(async (req, res) => {
    const { code } = req.params;
    const refereeId = req.user.id;

    // Vérifier que l'utilisateur n'a pas déjà utilisé un code
    const existingClaim = await Referral.findOne({
        where: { refereeId },
    });

    if (existingClaim) {
        res.status(400);
        throw new Error('Vous avez déjà utilisé un code de parrainage');
    }

    // Trouver le code de parrainage
    const referral = await Referral.findOne({
        where: {
            referralCode: code.toUpperCase(),
            status: 'pending',
        },
    });

    if (!referral) {
        res.status(404);
        throw new Error('Code de parrainage invalide ou expiré');
    }

    // Vérifier que le parrain n'est pas le même que le filleul
    if (referral.referrerId === refereeId) {
        res.status(400);
        throw new Error('Vous ne pouvez pas utiliser votre propre code');
    }

    // Vérifier l'expiration
    if (referral.expiresAt && new Date(referral.expiresAt) < new Date()) {
        await referral.update({ status: 'expired' });
        res.status(400);
        throw new Error('Ce code de parrainage a expiré');
    }

    // Récupérer les utilisateurs
    const referrer = await User.findByPk(referral.referrerId);
    const referee = await User.findByPk(refereeId);

    if (!referrer || !referee) {
        res.status(404);
        throw new Error('Utilisateur non trouvé');
    }

    // Attribuer les points au parrain
    await referrer.update({
        loyaltyPoints: (referrer.loyaltyPoints || 0) + referral.rewardPoints,
    });

    // Attribuer les points au filleul
    await referee.update({
        loyaltyPoints: (referee.loyaltyPoints || 0) + referral.refereeRewardPoints,
    });

    // Créer les transactions de fidélité
    await LoyaltyTransaction.bulkCreate([
        {
            userId: referrer.id,
            points: referral.rewardPoints,
            type: 'earn',
            reason: `Parrainage réussi - ${referee.prenom} ${referee.nom.charAt(0)}.`,
        },
        {
            userId: refereeId,
            points: referral.refereeRewardPoints,
            type: 'earn',
            reason: 'Bonus de bienvenue - Parrainage',
        },
    ]);

    // Mettre à jour le parrainage
    await referral.update({
        refereeId,
        status: 'claimed',
        claimedAt: new Date(),
    });

    res.json({
        success: true,
        message: 'Code de parrainage utilisé avec succès !',
        data: {
            pointsEarned: referral.refereeRewardPoints,
            referrerName: `${referrer.prenom} ${referrer.nom.charAt(0)}.`,
        },
    });
});

/**
 * @desc    Vérifier si un code de parrainage est valide
 * @route   GET /api/referral/validate/:code
 * @access  Public
 */
const validateReferralCode = asyncHandler(async (req, res) => {
    const { code } = req.params;

    const referral = await Referral.findOne({
        where: {
            referralCode: code.toUpperCase(),
            status: 'pending',
        },
        include: [
            {
                model: User,
                as: 'referrer',
                attributes: ['id', 'prenom', 'nom'],
            },
        ],
    });

    if (!referral) {
        return res.json({
            success: false,
            valid: false,
            message: 'Code invalide',
        });
    }

    // Vérifier l'expiration
    if (referral.expiresAt && new Date(referral.expiresAt) < new Date()) {
        return res.json({
            success: false,
            valid: false,
            message: 'Code expiré',
        });
    }

    res.json({
        success: true,
        valid: true,
        data: {
            referrerName: referral.referrer
                ? `${referral.referrer.prenom} ${referral.referrer.nom.charAt(0)}.`
                : null,
            bonusPoints: referral.refereeRewardPoints,
        },
    });
});

module.exports = {
    getMyReferralCode,
    getReferralStats,
    claimReferralCode,
    validateReferralCode,
};
