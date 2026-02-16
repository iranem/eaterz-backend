/**
 * Contrôleur pour l'intégration SATIM (Paiement par carte bancaire Algérienne)
 * Note: En production, remplacer les URLs sandbox par les URLs de production
 */
const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const axios = require('axios');
const { Commande, User, Notification } = require('../models');
const { getIO } = require('../config/socket');
const logger = require('../config/logger');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../utils/constants');

// Configuration SATIM
const SATIM_CONFIG = {
    merchantId: process.env.SATIM_MERCHANT_ID,
    terminalId: process.env.SATIM_TERMINAL_ID,
    secretKey: process.env.SATIM_SECRET_KEY,
    baseUrl: process.env.SATIM_BASE_URL || 'https://test.satim.dz/payment/rest',
    returnUrl: process.env.SATIM_RETURN_URL || `${process.env.FRONTEND_URL}/payment/callback`,
    failUrl: process.env.SATIM_FAIL_URL || `${process.env.FRONTEND_URL}/payment/failed`,
};

/**
 * Générer la signature HMAC pour SATIM
 */
const generateSignature = (data) => {
    const sortedKeys = Object.keys(data).sort();
    const signatureString = sortedKeys.map((key) => `${key}=${data[key]}`).join('&');
    return crypto
        .createHmac('sha256', SATIM_CONFIG.secretKey)
        .update(signatureString)
        .digest('hex')
        .toUpperCase();
};

/**
 * @desc    Initier un paiement SATIM
 * @route   POST /api/satim/initiate
 * @access  Private
 */
const initiatePayment = asyncHandler(async (req, res) => {
    const { orderId } = req.body;
    const userId = req.user.id;

    if (!orderId) {
        res.status(400);
        throw new Error('orderId requis');
    }

    // Vérifier la commande
    const commande = await Commande.findOne({
        where: { id: orderId, clientId: userId },
        include: [{ model: User, as: 'client', attributes: ['email', 'telephone'] }],
    });

    if (!commande) {
        res.status(404);
        throw new Error('Commande non trouvée');
    }

    if (commande.statutPaiement === PAYMENT_STATUS.PAID) {
        res.status(400);
        throw new Error('Cette commande a déjà été payée');
    }

    // Convertir le montant en centimes (SATIM utilise les centimes)
    const amountInCents = Math.round(parseFloat(commande.total) * 100);

    // Générer un orderNumber unique pour SATIM
    const satimOrderNumber = `EATZ-${commande.numero}-${Date.now()}`;

    // Préparer les données de paiement
    const paymentData = {
        userName: SATIM_CONFIG.merchantId,
        password: SATIM_CONFIG.secretKey,
        orderNumber: satimOrderNumber,
        amount: amountInCents,
        currency: '012', // Code DZD
        returnUrl: `${SATIM_CONFIG.returnUrl}?orderId=${orderId}`,
        failUrl: `${SATIM_CONFIG.failUrl}?orderId=${orderId}`,
        description: `Commande EATERZ #${commande.numero}`,
        language: 'FR',
        email: commande.client?.email,
        phone: commande.client?.telephone,
    };

    try {
        // Appel à l'API SATIM pour créer la transaction
        const response = await axios.post(
            `${SATIM_CONFIG.baseUrl}/register.do`,
            null,
            { params: paymentData }
        );

        if (response.data.errorCode) {
            logger.error('[SATIM] Erreur initiation:', response.data);
            res.status(400);
            throw new Error(response.data.errorMessage || 'Erreur SATIM');
        }

        // Sauvegarder la référence de transaction
        await commande.update({
            transactionId: response.data.orderId,
            paiementDetails: {
                satimOrderNumber,
                satimOrderId: response.data.orderId,
                initiatedAt: new Date().toISOString(),
            },
        });

        res.json({
            success: true,
            data: {
                paymentUrl: response.data.formUrl,
                transactionId: response.data.orderId,
            },
        });
    } catch (error) {
        logger.error('[SATIM] Erreur API:', error.message);
        res.status(500);
        throw new Error('Erreur lors de l\'initialisation du paiement');
    }
});

/**
 * @desc    Callback de confirmation de paiement SATIM
 * @route   POST /api/satim/callback
 * @access  Public (webhook)
 */
const paymentCallback = asyncHandler(async (req, res) => {
    const { orderId: satimOrderId, orderNumber } = req.query;

    if (!satimOrderId) {
        res.status(400);
        throw new Error('orderId manquant');
    }

    logger.info('[SATIM] Callback reçu:', { satimOrderId, orderNumber });

    try {
        // Vérifier le statut de la transaction via l'API SATIM
        const statusResponse = await axios.post(
            `${SATIM_CONFIG.baseUrl}/getOrderStatus.do`,
            null,
            {
                params: {
                    userName: SATIM_CONFIG.merchantId,
                    password: SATIM_CONFIG.secretKey,
                    orderId: satimOrderId,
                },
            }
        );

        const { orderStatus, errorCode, errorMessage } = statusResponse.data;

        // Trouver la commande par transactionId
        const commande = await Commande.findOne({
            where: { transactionId: satimOrderId },
            include: [
                { model: User, as: 'client', attributes: ['id'] },
                { model: User, as: 'prestataire', attributes: ['id'] },
            ],
        });

        if (!commande) {
            logger.warn('[SATIM] Commande non trouvée pour transaction:', satimOrderId);
            return res.redirect(`${SATIM_CONFIG.failUrl}?error=order_not_found`);
        }

        const io = getIO();

        if (orderStatus === 2) {
            // Paiement réussi
            await commande.update({
                statutPaiement: PAYMENT_STATUS.PAID,
                statut: ORDER_STATUS.CONFIRMED,
                dateConfirmation: new Date(),
                paiementDetails: {
                    ...commande.paiementDetails,
                    confirmedAt: new Date().toISOString(),
                    satimStatus: 'SUCCESS',
                },
            });

            // Notifier le client
            await Notification.create({
                userId: commande.clientId,
                type: 'paiement',
                titre: 'Paiement confirmé ✓',
                message: `Votre paiement de ${commande.total} DA pour la commande #${commande.numero} a été confirmé.`,
                data: { commandeId: commande.id },
            });

            // Notifier le prestataire
            await Notification.create({
                userId: commande.prestataireId,
                type: 'commande',
                titre: 'Nouvelle commande payée',
                message: `Nouvelle commande #${commande.numero} - Montant: ${commande.total} DA`,
                data: { commandeId: commande.id },
            });

            if (io) {
                io.to(`user_${commande.clientId}`).emit('payment:success', {
                    orderId: commande.id,
                    amount: commande.total,
                });
                io.to(`user_${commande.prestataireId}`).emit('commande:nouvelle', {
                    commandeId: commande.id,
                });
            }

            logger.info('[SATIM] Paiement réussi:', commande.numero);
            return res.redirect(`${process.env.FRONTEND_URL}/client/orders/${commande.id}?payment=success`);
        } else {
            // Paiement échoué
            await commande.update({
                statutPaiement: PAYMENT_STATUS.FAILED,
                paiementDetails: {
                    ...commande.paiementDetails,
                    failedAt: new Date().toISOString(),
                    satimStatus: 'FAILED',
                    errorCode,
                    errorMessage,
                },
            });

            logger.warn('[SATIM] Paiement échoué:', { orderNumber: commande.numero, errorCode });
            return res.redirect(`${SATIM_CONFIG.failUrl}?orderId=${commande.id}&error=${errorCode}`);
        }
    } catch (error) {
        logger.error('[SATIM] Erreur callback:', error.message);
        return res.redirect(`${SATIM_CONFIG.failUrl}?error=server_error`);
    }
});

/**
 * @desc    Vérifier le statut d'un paiement
 * @route   GET /api/satim/status/:orderId
 * @access  Private
 */
const getPaymentStatus = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user.id;

    const commande = await Commande.findOne({
        where: { id: orderId, clientId: userId },
        attributes: ['id', 'numero', 'total', 'statutPaiement', 'transactionId', 'paiementDetails'],
    });

    if (!commande) {
        res.status(404);
        throw new Error('Commande non trouvée');
    }

    res.json({
        success: true,
        data: {
            orderId: commande.id,
            orderNumber: commande.numero,
            amount: commande.total,
            paymentStatus: commande.statutPaiement,
            transactionId: commande.transactionId,
            details: commande.paiementDetails,
        },
    });
});

/**
 * @desc    Demander un remboursement SATIM
 * @route   POST /api/satim/refund
 * @access  Admin
 */
const requestRefund = asyncHandler(async (req, res) => {
    const { orderId, amount, reason } = req.body;

    const commande = await Commande.findByPk(orderId);

    if (!commande || !commande.transactionId) {
        res.status(404);
        throw new Error('Commande ou transaction non trouvée');
    }

    if (commande.statutPaiement !== PAYMENT_STATUS.PAID) {
        res.status(400);
        throw new Error('Cette commande n\'est pas payée');
    }

    const refundAmount = amount || commande.total;
    const refundAmountCents = Math.round(parseFloat(refundAmount) * 100);

    try {
        const refundResponse = await axios.post(
            `${SATIM_CONFIG.baseUrl}/refund.do`,
            null,
            {
                params: {
                    userName: SATIM_CONFIG.merchantId,
                    password: SATIM_CONFIG.secretKey,
                    orderId: commande.transactionId,
                    amount: refundAmountCents,
                },
            }
        );

        if (refundResponse.data.errorCode === '0') {
            await commande.update({
                statutPaiement: PAYMENT_STATUS.REFUNDED,
                paiementDetails: {
                    ...commande.paiementDetails,
                    refundedAt: new Date().toISOString(),
                    refundAmount,
                    refundReason: reason,
                },
            });

            logger.info('[SATIM] Remboursement effectué:', commande.numero);

            res.json({
                success: true,
                message: 'Remboursement effectué',
                data: { refundAmount },
            });
        } else {
            res.status(400);
            throw new Error(refundResponse.data.errorMessage || 'Erreur de remboursement');
        }
    } catch (error) {
        logger.error('[SATIM] Erreur remboursement:', error.message);
        res.status(500);
        throw new Error('Erreur lors du remboursement');
    }
});

module.exports = {
    initiatePayment,
    paymentCallback,
    getPaymentStatus,
    requestRefund,
};
