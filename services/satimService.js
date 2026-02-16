/**
 * Service d'intégration SATIM - Paiement CIB/EDAHABIA
 * 
 * Ce service gère l'intégration avec la passerelle de paiement SATIM
 * pour les cartes bancaires algériennes (CIB et EDAHABIA).
 * 
 * Documentation SATIM : https://satim.dz (contact commercial requis)
 * 
 * MODES DE FONCTIONNEMENT:
 * - SIMULATION: Pour le développement et les tests (par défaut)
 * - SANDBOX: Environnement de test SATIM
 * - PRODUCTION: Environnement de production SATIM
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Configuration SATIM
const SATIM_CONFIG = {
    // Mode actuel (simulation, sandbox, production)
    MODE: process.env.SATIM_MODE || 'simulation',

    // Credentials SATIM (à obtenir via contrat)
    MERCHANT_ID: process.env.SATIM_MERCHANT_ID || 'EATERZ_TEST',
    TERMINAL_ID: process.env.SATIM_TERMINAL_ID || 'TERM_001',
    SECRET_KEY: process.env.SATIM_SECRET_KEY || 'test_secret_key_32_characters_long',

    // URLs SATIM
    URLS: {
        sandbox: {
            payment: 'https://test.satim.dz/payment/rest/register.do',
            status: 'https://test.satim.dz/payment/rest/getOrderStatus.do',
            refund: 'https://test.satim.dz/payment/rest/refund.do',
            confirm: 'https://test.satim.dz/payment/rest/deposit.do'
        },
        production: {
            payment: 'https://cib.satim.dz/payment/rest/register.do',
            status: 'https://cib.satim.dz/payment/rest/getOrderStatus.do',
            refund: 'https://cib.satim.dz/payment/rest/refund.do',
            confirm: 'https://cib.satim.dz/payment/rest/deposit.do'
        }
    },

    // URLs de callback
    CALLBACK_URLS: {
        success: process.env.FRONTEND_URL + '/payment/success',
        failure: process.env.FRONTEND_URL + '/payment/failure',
        webhook: process.env.BACKEND_URL + '/api/paiements/webhook/satim'
    },

    // Montants limites (en DZD)
    LIMITS: {
        MIN_AMOUNT: 100,        // 100 DA minimum
        MAX_AMOUNT: 500000,     // 500,000 DA maximum
        DAILY_LIMIT: 1000000    // 1,000,000 DA par jour
    }
};

// Codes de réponse SATIM
const SATIM_RESPONSE_CODES = {
    '00': { success: true, message: 'Transaction approuvée' },
    '01': { success: false, message: 'Contactez votre banque' },
    '02': { success: false, message: 'Contactez votre banque' },
    '03': { success: false, message: 'Commerçant invalide' },
    '04': { success: false, message: 'Carte capturée' },
    '05': { success: false, message: 'Autorisation refusée' },
    '12': { success: false, message: 'Transaction invalide' },
    '13': { success: false, message: 'Montant invalide' },
    '14': { success: false, message: 'Numéro de carte invalide' },
    '15': { success: false, message: 'Émetteur inconnu' },
    '30': { success: false, message: 'Erreur de format' },
    '33': { success: false, message: 'Carte expirée' },
    '41': { success: false, message: 'Carte perdue' },
    '43': { success: false, message: 'Carte volée' },
    '51': { success: false, message: 'Fonds insuffisants' },
    '54': { success: false, message: 'Carte expirée' },
    '55': { success: false, message: 'Code PIN incorrect' },
    '56': { success: false, message: 'Carte non trouvée' },
    '57': { success: false, message: 'Transaction non autorisée' },
    '61': { success: false, message: 'Limite de retrait dépassée' },
    '62': { success: false, message: 'Carte restreinte' },
    '65': { success: false, message: 'Limite de transactions dépassée' },
    '75': { success: false, message: 'Trop de tentatives PIN' },
    '91': { success: false, message: 'Émetteur indisponible' },
    '96': { success: false, message: 'Erreur système' }
};

/**
 * Génère une signature HMAC-SHA256 pour sécuriser les requêtes
 */
const generateSignature = (data) => {
    const sortedData = Object.keys(data)
        .sort()
        .map(key => `${key}=${data[key]}`)
        .join('&');

    return crypto
        .createHmac('sha256', SATIM_CONFIG.SECRET_KEY)
        .update(sortedData)
        .digest('hex');
};

/**
 * Vérifie la signature d'une réponse SATIM
 */
const verifySignature = (data, signature) => {
    const expectedSignature = generateSignature(data);
    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
};

/**
 * Génère un numéro de commande unique
 */
const generateOrderNumber = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `EATZ-${timestamp}-${random}`;
};

/**
 * Simule un délai réseau réaliste
 */
const simulateNetworkDelay = async (min = 800, max = 2000) => {
    if (SATIM_CONFIG.MODE === 'simulation') {
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        await new Promise(resolve => setTimeout(resolve, delay));
    }
};

/**
 * Initialise une session de paiement SATIM
 * @param {Object} params - Paramètres de paiement
 * @returns {Object} - Session de paiement ou erreur
 */
const initializePayment = async ({
    orderId,
    amount,
    currency = 'DZD',
    description,
    customerEmail,
    customerPhone,
    cardType, // 'cib' ou 'edahabia'
    returnUrl,
    language = 'FR'
}) => {
    // Validation du montant
    if (amount < SATIM_CONFIG.LIMITS.MIN_AMOUNT) {
        return {
            success: false,
            error: `Montant minimum: ${SATIM_CONFIG.LIMITS.MIN_AMOUNT} DA`,
            code: 'MIN_AMOUNT_ERROR'
        };
    }

    if (amount > SATIM_CONFIG.LIMITS.MAX_AMOUNT) {
        return {
            success: false,
            error: `Montant maximum: ${SATIM_CONFIG.LIMITS.MAX_AMOUNT} DA`,
            code: 'MAX_AMOUNT_ERROR'
        };
    }

    const orderNumber = generateOrderNumber();
    const sessionId = uuidv4();

    // Données de la requête
    const requestData = {
        merchantId: SATIM_CONFIG.MERCHANT_ID,
        terminalId: SATIM_CONFIG.TERMINAL_ID,
        orderNumber,
        amount: Math.round(amount * 100), // Montant en centimes
        currency: currency === 'DZD' ? '012' : currency,
        description: description || `Commande EATERZ #${orderId}`,
        email: customerEmail,
        phone: customerPhone,
        cardType: cardType.toUpperCase(),
        returnUrl: returnUrl || SATIM_CONFIG.CALLBACK_URLS.success,
        failUrl: SATIM_CONFIG.CALLBACK_URLS.failure,
        language,
        sessionId,
        timestamp: new Date().toISOString()
    };

    // Ajouter la signature
    requestData.signature = generateSignature(requestData);

    // Mode simulation
    if (SATIM_CONFIG.MODE === 'simulation') {
        await simulateNetworkDelay();

        return {
            success: true,
            sessionId,
            orderNumber,
            paymentUrl: `/payment/checkout?session=${sessionId}`,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min
            amount,
            cardType: cardType.toUpperCase()
        };
    }

    // Mode sandbox/production - Appel réel à l'API SATIM
    try {
        const apiUrl = SATIM_CONFIG.MODE === 'production'
            ? SATIM_CONFIG.URLS.production.payment
            : SATIM_CONFIG.URLS.sandbox.payment;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();

        if (result.errorCode === '0' || result.success) {
            return {
                success: true,
                sessionId: result.orderId || sessionId,
                orderNumber: result.orderNumber || orderNumber,
                paymentUrl: result.formUrl || result.redirectUrl,
                expiresAt: result.expirationDate,
                amount,
                cardType: cardType.toUpperCase()
            };
        }

        return {
            success: false,
            error: result.errorMessage || 'Erreur lors de l\'initialisation du paiement',
            code: result.errorCode || 'INIT_ERROR'
        };

    } catch (error) {
        console.error('Erreur SATIM:', error);
        return {
            success: false,
            error: 'Service de paiement temporairement indisponible',
            code: 'SERVICE_UNAVAILABLE'
        };
    }
};

/**
 * Traite le paiement avec les informations de carte
 * Utilisé pour le mode de paiement direct (sans redirection)
 */
const processDirectPayment = async ({
    sessionId,
    cardNumber,
    expiryMonth,
    expiryYear,
    cvv,
    cardholderName,
    amount,
    cardType
}) => {
    await simulateNetworkDelay(1500, 3500);

    // Nettoyer le numéro de carte
    const cleanCardNumber = cardNumber.replace(/\s/g, '');

    // Validation basique
    if (cardType === 'cib' && (cleanCardNumber.length !== 19 || !cleanCardNumber.startsWith('6'))) {
        return {
            success: false,
            error: 'Numéro de carte CIB invalide',
            code: 'INVALID_CARD'
        };
    }

    if (cardType === 'edahabia' && cleanCardNumber.length !== 16) {
        return {
            success: false,
            error: 'Numéro de carte EDAHABIA invalide',
            code: 'INVALID_CARD'
        };
    }

    // Vérifier la date d'expiration
    const now = new Date();
    const expiry = new Date(2000 + parseInt(expiryYear), parseInt(expiryMonth) - 1);
    if (expiry < now) {
        return {
            success: false,
            error: 'Carte expirée',
            code: 'CARD_EXPIRED'
        };
    }

    // Mode simulation
    if (SATIM_CONFIG.MODE === 'simulation') {
        // Carte de test pour forcer l'échec
        if (cleanCardNumber.endsWith('0000')) {
            return {
                success: false,
                error: 'Transaction refusée par la banque',
                code: '05',
                transactionId: generateOrderNumber()
            };
        }

        // Simulation de succès (95%)
        if (cleanCardNumber.endsWith('1111') || Math.random() < 0.95) {
            const transactionId = generateOrderNumber();

            return {
                success: true,
                transactionId,
                authorizationCode: `AUTH${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                cardLast4: cleanCardNumber.slice(-4),
                cardType: cardType.toUpperCase(),
                amount,
                timestamp: new Date().toISOString(),
                responseCode: '00',
                message: 'Transaction approuvée'
            };
        }

        // Simulation d'échec aléatoire
        const failureCodes = ['51', '55', '61', '65'];
        const randomCode = failureCodes[Math.floor(Math.random() * failureCodes.length)];

        return {
            success: false,
            error: SATIM_RESPONSE_CODES[randomCode]?.message || 'Transaction refusée',
            code: randomCode,
            transactionId: generateOrderNumber()
        };
    }

    // Mode sandbox/production
    try {
        const apiUrl = SATIM_CONFIG.MODE === 'production'
            ? SATIM_CONFIG.URLS.production.confirm
            : SATIM_CONFIG.URLS.sandbox.confirm;

        const requestData = {
            merchantId: SATIM_CONFIG.MERCHANT_ID,
            orderId: sessionId,
            pan: cleanCardNumber,
            expiry: `${expiryMonth}${expiryYear}`,
            cvc: cvv,
            cardholderName,
            amount: Math.round(amount * 100)
        };

        requestData.signature = generateSignature(requestData);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();
        const responseInfo = SATIM_RESPONSE_CODES[result.actionCode] || { success: false, message: 'Erreur inconnue' };

        if (responseInfo.success) {
            return {
                success: true,
                transactionId: result.orderId || result.transactionId,
                authorizationCode: result.approvalCode,
                cardLast4: cleanCardNumber.slice(-4),
                cardType: cardType.toUpperCase(),
                amount,
                timestamp: new Date().toISOString(),
                responseCode: result.actionCode,
                message: responseInfo.message
            };
        }

        return {
            success: false,
            error: responseInfo.message,
            code: result.actionCode,
            transactionId: result.orderId
        };

    } catch (error) {
        console.error('Erreur paiement SATIM:', error);
        return {
            success: false,
            error: 'Erreur de connexion au serveur de paiement',
            code: 'CONNECTION_ERROR'
        };
    }
};

/**
 * Vérifie le statut d'une transaction
 */
const checkPaymentStatus = async (orderId) => {
    if (SATIM_CONFIG.MODE === 'simulation') {
        await simulateNetworkDelay(500, 1000);

        // Simulation de différents statuts
        const statuses = [
            { status: 'COMPLETED', message: 'Paiement confirmé' },
            { status: 'PENDING', message: 'En attente de confirmation' },
            { status: 'PROCESSING', message: 'Traitement en cours' }
        ];

        return {
            success: true,
            orderId,
            ...statuses[0], // Toujours retourner COMPLETED en simulation
            timestamp: new Date().toISOString()
        };
    }

    try {
        const apiUrl = SATIM_CONFIG.MODE === 'production'
            ? SATIM_CONFIG.URLS.production.status
            : SATIM_CONFIG.URLS.sandbox.status;

        const requestData = {
            merchantId: SATIM_CONFIG.MERCHANT_ID,
            orderId,
            language: 'FR'
        };

        requestData.signature = generateSignature(requestData);

        const response = await fetch(`${apiUrl}?${new URLSearchParams(requestData)}`);
        const result = await response.json();

        return {
            success: true,
            orderId,
            status: result.orderStatus === 2 ? 'COMPLETED' :
                result.orderStatus === 1 ? 'PROCESSING' :
                    result.orderStatus === 0 ? 'PENDING' : 'FAILED',
            amount: result.amount / 100,
            cardLast4: result.Pan?.slice(-4),
            timestamp: result.date
        };

    } catch (error) {
        console.error('Erreur vérification statut:', error);
        return {
            success: false,
            error: 'Impossible de vérifier le statut',
            code: 'STATUS_CHECK_ERROR'
        };
    }
};

/**
 * Initie un remboursement
 */
const initiateRefund = async (transactionId, amount, reason) => {
    if (SATIM_CONFIG.MODE === 'simulation') {
        await simulateNetworkDelay(1000, 2500);

        // 95% de succès pour les remboursements
        if (Math.random() < 0.95) {
            return {
                success: true,
                refundId: `RFD-${uuidv4().slice(0, 8).toUpperCase()}`,
                originalTransactionId: transactionId,
                amount,
                reason,
                status: 'PROCESSED',
                timestamp: new Date().toISOString(),
                estimatedDelay: '3-5 jours ouvrables'
            };
        }

        return {
            success: false,
            error: 'Remboursement temporairement indisponible',
            code: 'REFUND_UNAVAILABLE'
        };
    }

    try {
        const apiUrl = SATIM_CONFIG.MODE === 'production'
            ? SATIM_CONFIG.URLS.production.refund
            : SATIM_CONFIG.URLS.sandbox.refund;

        const requestData = {
            merchantId: SATIM_CONFIG.MERCHANT_ID,
            orderId: transactionId,
            amount: Math.round(amount * 100),
            currency: '012'
        };

        requestData.signature = generateSignature(requestData);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();

        if (result.errorCode === '0') {
            return {
                success: true,
                refundId: result.refundOrderId,
                originalTransactionId: transactionId,
                amount,
                reason,
                status: 'PROCESSED',
                timestamp: new Date().toISOString()
            };
        }

        return {
            success: false,
            error: result.errorMessage || 'Erreur de remboursement',
            code: result.errorCode
        };

    } catch (error) {
        console.error('Erreur remboursement SATIM:', error);
        return {
            success: false,
            error: 'Service de remboursement indisponible',
            code: 'REFUND_ERROR'
        };
    }
};

/**
 * Traite un webhook/callback SATIM
 */
const handleWebhook = async (webhookData) => {
    const { orderId, amount, status, signature, actionCode } = webhookData;

    // Vérifier la signature
    const dataToVerify = { orderId, amount, status, actionCode };
    if (!verifySignature(dataToVerify, signature)) {
        console.warn('Signature webhook invalide');
        return {
            success: false,
            error: 'Signature invalide',
            code: 'INVALID_SIGNATURE'
        };
    }

    const responseInfo = SATIM_RESPONSE_CODES[actionCode] || { success: false };

    return {
        success: responseInfo.success,
        orderId,
        amount: amount / 100,
        status: responseInfo.success ? 'COMPLETED' : 'FAILED',
        message: responseInfo.message,
        actionCode,
        timestamp: new Date().toISOString()
    };
};

/**
 * Génère les informations pour le paiement en espèces
 */
const generateCashPaymentInfo = (orderId, amount) => {
    return {
        success: true,
        paymentMethod: 'CASH',
        orderId,
        amount,
        instructions: [
            'Préparez le montant exact si possible',
            'Le livreur vous remettra un reçu',
            'Vous pouvez suivre votre commande en temps réel'
        ],
        message: 'Paiement en espèces à la livraison'
    };
};

module.exports = {
    // Configuration
    SATIM_CONFIG,
    SATIM_RESPONSE_CODES,

    // Fonctions principales
    initializePayment,
    processDirectPayment,
    checkPaymentStatus,
    initiateRefund,
    handleWebhook,

    // Utilitaires
    generateSignature,
    verifySignature,
    generateOrderNumber,
    generateCashPaymentInfo
};
