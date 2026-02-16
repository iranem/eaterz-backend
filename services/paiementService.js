/**
 * Service de simulation de paiement CIB/EDAHABIA
 * 
 * Ce service simule le flux de paiement des cartes algériennes
 * pour le MVP. En production, il faudrait intégrer avec SATIM.
 */

const { v4: uuidv4 } = require('uuid');
const { isValidCIBCard, isValidEdahabiaCard } = require('../utils/helpers');

/**
 * Délai simulé pour reproduire le temps de traitement réel
 */
const simulateDelay = (min = 1000, max = 3000) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
};

/**
 * Génère un numéro de transaction unique
 */
const generateTransactionId = (type) => {
  const prefix = type === 'cib' ? 'CIB' : 'EDA';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

/**
 * Valide les informations de carte CIB
 * Format: 19 chiffres commençant par 6
 */
const validateCIBCard = (cardInfo) => {
  const { cardNumber, expiryMonth, expiryYear, cvv, cardholderName } = cardInfo;

  // Nettoyer le numéro de carte
  const cleanNumber = cardNumber.replace(/\s/g, '');

  // Validation du format
  if (!isValidCIBCard(cleanNumber)) {
    return {
      valid: false,
      error: 'Numéro de carte CIB invalide. Doit être 19 chiffres commençant par 6.'
    };
  }

  // Validation de la date d'expiration
  const now = new Date();
  const expiry = new Date(2000 + parseInt(expiryYear), parseInt(expiryMonth) - 1);
  if (expiry < now) {
    return { valid: false, error: 'Carte expirée' };
  }

  // Validation du CVV (3 chiffres)
  if (!/^\d{3}$/.test(cvv)) {
    return { valid: false, error: 'CVV invalide (3 chiffres)' };
  }

  // Validation du nom
  if (!cardholderName || cardholderName.length < 3) {
    return { valid: false, error: 'Nom du titulaire requis' };
  }

  return { valid: true };
};

/**
 * Valide les informations de carte EDAHABIA
 * Format: 16 chiffres
 */
const validateEdahabiaCard = (cardInfo) => {
  const { cardNumber, expiryMonth, expiryYear, cvv, cardholderName } = cardInfo;

  const cleanNumber = cardNumber.replace(/\s/g, '');

  if (!isValidEdahabiaCard(cleanNumber)) {
    return {
      valid: false,
      error: 'Numéro de carte EDAHABIA invalide. Doit être 16 chiffres.'
    };
  }

  const now = new Date();
  const expiry = new Date(2000 + parseInt(expiryYear), parseInt(expiryMonth) - 1);
  if (expiry < now) {
    return { valid: false, error: 'Carte expirée' };
  }

  if (!/^\d{3,4}$/.test(cvv)) {
    return { valid: false, error: 'Code de sécurité invalide' };
  }

  if (!cardholderName || cardholderName.length < 3) {
    return { valid: false, error: 'Nom du titulaire requis' };
  }

  return { valid: true };
};

/**
 * Simule un paiement CIB
 */
const processPaymentCIB = async (cardInfo, amount, orderId) => {
  // Valider la carte
  const validation = validateCIBCard(cardInfo);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      code: 'VALIDATION_ERROR'
    };
  }

  // Simuler le délai de traitement
  await simulateDelay(2000, 4000);

  // Simuler différents scénarios (90% succès, 10% échec)
  const random = Math.random();

  // Carte de test pour forcer l'échec: se termine par 0000
  const cleanNumber = cardInfo.cardNumber.replace(/\s/g, '');
  if (cleanNumber.endsWith('0000')) {
    return {
      success: false,
      error: 'Transaction refusée par la banque',
      code: 'BANK_DECLINED',
      transactionId: generateTransactionId('cib')
    };
  }

  // Carte de test pour forcer le succès: se termine par 1111
  if (cleanNumber.endsWith('1111') || random < 0.9) {
    return {
      success: true,
      transactionId: generateTransactionId('cib'),
      amount,
      orderId,
      cardLast4: cleanNumber.slice(-4),
      cardType: 'CIB',
      timestamp: new Date().toISOString(),
      authorizationCode: `AUTH${Math.random().toString(36).substring(2, 8).toUpperCase()}`
    };
  }

  // Échec aléatoire
  const failureReasons = [
    { error: 'Fonds insuffisants', code: 'INSUFFICIENT_FUNDS' },
    { error: 'Limite de carte dépassée', code: 'CARD_LIMIT_EXCEEDED' },
    { error: 'Transaction temporairement indisponible', code: 'SERVICE_UNAVAILABLE' }
  ];
  const failure = failureReasons[Math.floor(Math.random() * failureReasons.length)];

  return {
    success: false,
    ...failure,
    transactionId: generateTransactionId('cib')
  };
};

/**
 * Simule un paiement EDAHABIA
 */
const processPaymentEdahabia = async (cardInfo, amount, orderId) => {
  // Valider la carte
  const validation = validateEdahabiaCard(cardInfo);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      code: 'VALIDATION_ERROR'
    };
  }

  // Simuler le délai de traitement (EDAHABIA est généralement plus rapide)
  await simulateDelay(1000, 2500);

  // Simuler différents scénarios
  const random = Math.random();
  const cleanNumber = cardInfo.cardNumber.replace(/\s/g, '');

  // Carte de test pour forcer l'échec
  if (cleanNumber.endsWith('0000')) {
    return {
      success: false,
      error: 'Solde insuffisant sur la carte',
      code: 'INSUFFICIENT_BALANCE',
      transactionId: generateTransactionId('eda')
    };
  }

  // 92% de succès pour EDAHABIA
  if (cleanNumber.endsWith('1111') || random < 0.92) {
    return {
      success: true,
      transactionId: generateTransactionId('eda'),
      amount,
      orderId,
      cardLast4: cleanNumber.slice(-4),
      cardType: 'EDAHABIA',
      timestamp: new Date().toISOString(),
      referenceNumber: `REF${Date.now()}`
    };
  }

  const failureReasons = [
    { error: 'Solde insuffisant', code: 'INSUFFICIENT_BALANCE' },
    { error: 'Carte bloquée', code: 'CARD_BLOCKED' },
    { error: 'Erreur de connexion au serveur', code: 'CONNECTION_ERROR' }
  ];
  const failure = failureReasons[Math.floor(Math.random() * failureReasons.length)];

  return {
    success: false,
    ...failure,
    transactionId: generateTransactionId('eda')
  };
};

/**
 * Point d'entrée principal pour traiter un paiement
 */
const processPayment = async (paymentType, cardInfo, amount, orderId) => {
  if (amount <= 0) {
    return {
      success: false,
      error: 'Montant invalide',
      code: 'INVALID_AMOUNT'
    };
  }

  switch (paymentType) {
    case 'cib':
      return processPaymentCIB(cardInfo, amount, orderId);
    case 'edahabia':
      return processPaymentEdahabia(cardInfo, amount, orderId);
    default:
      return {
        success: false,
        error: 'Type de paiement non supporté',
        code: 'UNSUPPORTED_PAYMENT_TYPE'
      };
  }
};

/**
 * Simule un remboursement
 */
const processRefund = async (transactionId, amount, reason) => {
  await simulateDelay(1500, 3000);

  // 95% de succès pour les remboursements
  if (Math.random() < 0.95) {
    return {
      success: true,
      refundId: `RFD-${uuidv4().slice(0, 8).toUpperCase()}`,
      originalTransactionId: transactionId,
      amount,
      reason,
      timestamp: new Date().toISOString(),
      status: 'processed',
      estimatedDelay: '3-5 jours ouvrables'
    };
  }

  return {
    success: false,
    error: 'Impossible de traiter le remboursement actuellement',
    code: 'REFUND_FAILED',
    originalTransactionId: transactionId
  };
};

/**
 * Vérifie le statut d'une transaction
 */
const checkTransactionStatus = async (transactionId) => {
  await simulateDelay(500, 1000);

  // Simuler les statuts possibles
  const statuses = ['completed', 'pending', 'failed', 'refunded'];
  const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

  return {
    transactionId,
    status: randomStatus,
    lastUpdate: new Date().toISOString()
  };
};

module.exports = {
  processPayment,
  processRefund,
  checkTransactionStatus,
  validateCIBCard,
  validateEdahabiaCard
};
