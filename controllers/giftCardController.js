/**
 * Contrôleur pour les cartes cadeaux
 */
const asyncHandler = require('express-async-handler');
const { GiftCard, User, Notification } = require('../models');
const { sendPushToUser } = require('../services/pushService');
const { Op } = require('sequelize');
const nodemailer = require('nodemailer');

// Designs disponibles
const AVAILABLE_DESIGNS = [
    { id: 'default', name: 'Classique', color: '#F98805' },
    { id: 'birthday', name: 'Anniversaire', color: '#E91E63' },
    { id: 'celebration', name: 'Célébration', color: '#9C27B0' },
    { id: 'thanks', name: 'Merci', color: '#4CAF50' },
    { id: 'love', name: 'Amour', color: '#F44336' },
];

// Montants prédéfinis
const PREDEFINED_AMOUNTS = [500, 1000, 2000, 5000, 10000];

/**
 * @desc    Acheter une carte cadeau
 * @route   POST /api/gift-cards
 * @access  Private
 */
const purchaseGiftCard = asyncHandler(async (req, res) => {
    const acheteurId = req.user.id;
    const {
        montant,
        destinataireEmail,
        destinataireNom,
        messagePersonnel,
        design = 'default',
        dateEnvoi,
    } = req.body;

    // Validation
    if (!montant || montant < 100) {
        res.status(400);
        throw new Error('Montant minimum: 100 DA');
    }

    if (montant > 50000) {
        res.status(400);
        throw new Error('Montant maximum: 50,000 DA');
    }

    // Créer la carte
    const giftCard = await GiftCard.create({
        montantInitial: montant,
        montantRestant: montant,
        acheteurId,
        destinataireEmail,
        destinataireNom,
        messagePersonnel,
        design,
        dateEnvoi: dateEnvoi ? new Date(dateEnvoi) : new Date(),
        statut: 'pending',
    });

    // Si email fourni, programmer l'envoi
    if (destinataireEmail) {
        // En production: utiliser un job queue (Bull, etc.)
        await sendGiftCardEmail(giftCard);
        await giftCard.update({ statut: 'sent' });
    }

    res.status(201).json({
        success: true,
        message: 'Carte cadeau créée avec succès',
        data: {
            id: giftCard.id,
            code: giftCard.code,
            montant: giftCard.montantInitial,
            statut: giftCard.statut,
        },
    });
});

/**
 * @desc    Récupérer mes cartes achetées
 * @route   GET /api/gift-cards/purchased
 * @access  Private
 */
const getMyPurchasedCards = asyncHandler(async (req, res) => {
    const cards = await GiftCard.findAll({
        where: { acheteurId: req.user.id },
        order: [['createdAt', 'DESC']],
    });

    res.json({ success: true, data: cards });
});

/**
 * @desc    Récupérer mes cartes reçues/réclamées
 * @route   GET /api/gift-cards/received
 * @access  Private
 */
const getMyReceivedCards = asyncHandler(async (req, res) => {
    const cards = await GiftCard.findAll({
        where: { beneficiaireId: req.user.id },
        order: [['createdAt', 'DESC']],
    });

    res.json({ success: true, data: cards });
});

/**
 * @desc    Réclamer une carte cadeau avec un code
 * @route   POST /api/gift-cards/claim
 * @access  Private
 */
const claimGiftCard = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { code } = req.body;

    if (!code) {
        res.status(400);
        throw new Error('Code de carte cadeau requis');
    }

    const giftCard = await GiftCard.findOne({
        where: { code: code.toUpperCase().trim() },
    });

    if (!giftCard) {
        res.status(404);
        throw new Error('Carte cadeau non trouvée');
    }

    if (giftCard.beneficiaireId) {
        res.status(400);
        throw new Error('Cette carte a déjà été réclamée');
    }

    if (giftCard.statut === 'expired') {
        res.status(400);
        throw new Error('Cette carte a expiré');
    }

    if (giftCard.dateExpiration && new Date(giftCard.dateExpiration) < new Date()) {
        await giftCard.update({ statut: 'expired' });
        res.status(400);
        throw new Error('Cette carte a expiré');
    }

    // Réclamer la carte
    await giftCard.update({
        beneficiaireId: userId,
        statut: 'claimed',
    });

    // Notification à l'acheteur
    if (giftCard.acheteurId) {
        await Notification.create({
            userId: giftCard.acheteurId,
            type: 'giftcard',
            titre: '🎁 Votre carte cadeau a été réclamée !',
            message: `${req.user.prenom} a réclamé votre carte de ${giftCard.montantInitial} DA`,
            data: { giftCardId: giftCard.id },
        });

        await sendPushToUser(giftCard.acheteurId, {
            title: '🎁 Carte cadeau réclamée',
            body: `${req.user.prenom} a réclamé votre carte de ${giftCard.montantInitial} DA`,
            icon: '/icons/icon-192x192.png',
        });
    }

    res.json({
        success: true,
        message: 'Carte cadeau réclamée avec succès !',
        data: {
            id: giftCard.id,
            montantRestant: giftCard.montantRestant,
        },
    });
});

/**
 * @desc    Utiliser une carte cadeau (appelé lors du checkout)
 * @route   POST /api/gift-cards/:id/use
 * @access  Private
 */
const useGiftCard = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { montant } = req.body;
    const userId = req.user.id;

    const giftCard = await GiftCard.findByPk(id);

    if (!giftCard) {
        res.status(404);
        throw new Error('Carte cadeau non trouvée');
    }

    if (giftCard.beneficiaireId !== userId) {
        res.status(403);
        throw new Error('Cette carte ne vous appartient pas');
    }

    if (giftCard.statut === 'used' || giftCard.statut === 'expired') {
        res.status(400);
        throw new Error('Cette carte ne peut plus être utilisée');
    }

    if (montant > parseFloat(giftCard.montantRestant)) {
        res.status(400);
        throw new Error(`Solde insuffisant. Disponible: ${giftCard.montantRestant} DA`);
    }

    // Déduire le montant
    const nouveauSolde = parseFloat(giftCard.montantRestant) - montant;
    await giftCard.update({
        montantRestant: nouveauSolde,
        statut: nouveauSolde === 0 ? 'used' : 'claimed',
        dateUtilisation: nouveauSolde === 0 ? new Date() : giftCard.dateUtilisation,
    });

    res.json({
        success: true,
        message: `${montant} DA utilisés`,
        data: {
            montantUtilise: montant,
            montantRestant: nouveauSolde,
        },
    });
});

/**
 * @desc    Vérifier le solde d'une carte
 * @route   GET /api/gift-cards/check/:code
 * @access  Public
 */
const checkGiftCardBalance = asyncHandler(async (req, res) => {
    const { code } = req.params;

    const giftCard = await GiftCard.findOne({
        where: { code: code.toUpperCase().trim() },
        attributes: ['code', 'montantRestant', 'statut', 'dateExpiration'],
    });

    if (!giftCard) {
        res.status(404);
        throw new Error('Carte cadeau non trouvée');
    }

    res.json({
        success: true,
        data: giftCard,
    });
});

/**
 * @desc    Obtenir les designs disponibles
 * @route   GET /api/gift-cards/designs
 * @access  Public
 */
const getDesigns = asyncHandler(async (req, res) => {
    res.json({
        success: true,
        data: {
            designs: AVAILABLE_DESIGNS,
            amounts: PREDEFINED_AMOUNTS,
        },
    });
});

/**
 * Envoyer l'email avec le code de la carte
 */
async function sendGiftCardEmail(giftCard) {
    // Configuration email (à adapter selon environnement)
    if (!process.env.SMTP_HOST) {
        console.log(`[GiftCard] Email simulation: Carte ${giftCard.code} envoyée à ${giftCard.destinataireEmail}`);
        return;
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    await transporter.sendMail({
        from: '"EATERZ" <noreply@eaterz.dz>',
        to: giftCard.destinataireEmail,
        subject: `🎁 ${giftCard.destinataireNom || 'Vous avez'} reçu une carte cadeau EATERZ !`,
        html: `
            <div style="font-family: Arial; max-width: 500px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #F98805;">🎁 Carte Cadeau EATERZ</h1>
                <p>Bonjour${giftCard.destinataireNom ? ` ${giftCard.destinataireNom}` : ''} !</p>
                <p>Vous avez reçu une carte cadeau d'une valeur de <strong>${giftCard.montantInitial} DA</strong> !</p>
                ${giftCard.messagePersonnel ? `<blockquote style="border-left: 3px solid #F98805; padding-left: 10px; color: #666;">${giftCard.messagePersonnel}</blockquote>` : ''}
                <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 10px; margin: 20px 0;">
                    <p style="font-size: 12px; color: #666;">Votre code :</p>
                    <h2 style="font-size: 28px; letter-spacing: 2px; color: #264414;">${giftCard.code}</h2>
                </div>
                <p>Utilisez ce code lors de votre prochaine commande sur EATERZ !</p>
                <p style="color: #999; font-size: 12px;">Valide jusqu'au ${new Date(giftCard.dateExpiration).toLocaleDateString('fr-FR')}</p>
            </div>
        `,
    });
}

module.exports = {
    purchaseGiftCard,
    getMyPurchasedCards,
    getMyReceivedCards,
    claimGiftCard,
    useGiftCard,
    checkGiftCardBalance,
    getDesigns,
    AVAILABLE_DESIGNS,
    PREDEFINED_AMOUNTS,
};
