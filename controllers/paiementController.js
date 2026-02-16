const { Commande, User } = require('../models');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { PAYMENT_STATUS } = require('../utils/constants');
const { emitToUser } = require('../config/socket');
const satimService = require('../services/satimService');

/**
 * @desc    Initier un paiement SATIM (CIB/EDAHABIA)
 * @route   POST /api/paiements/initiate
 * @access  Private
 */
const initiatePayment = asyncHandler(async (req, res) => {
  const { commandeId, cardType, returnUrl } = req.body;

  // Récupérer la commande
  const commande = await Commande.findOne({
    where: { id: commandeId, clientId: req.user.id }
  });

  if (!commande) {
    res.status(404);
    throw new Error('Commande non trouvée');
  }

  // Vérifier que la commande peut être payée
  if (commande.statutPaiement === PAYMENT_STATUS.SUCCESS) {
    res.status(400);
    throw new Error('Cette commande a déjà été payée');
  }

  if (commande.modePaiement === 'especes') {
    res.status(400);
    throw new Error('Cette commande est prévue pour un paiement en espèces');
  }

  // Initialiser la session de paiement SATIM
  const result = await satimService.initializePayment({
    orderId: commande.numero,
    amount: parseFloat(commande.total),
    description: `Commande EATERZ #${commande.numero}`,
    customerEmail: req.user.email,
    customerPhone: req.user.telephone,
    cardType: cardType || commande.modePaiement,
    returnUrl,
    language: 'FR'
  });

  if (result.success) {
    // Mettre à jour le statut en "en attente"
    await commande.update({
      statutPaiement: PAYMENT_STATUS.PENDING,
      transactionId: result.sessionId
    });

    res.json({
      success: true,
      data: {
        sessionId: result.sessionId,
        orderNumber: result.orderNumber,
        paymentUrl: result.paymentUrl,
        expiresAt: result.expiresAt,
        amount: result.amount,
        cardType: result.cardType
      }
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error,
      code: result.code
    });
  }
});

/**
 * @desc    Traiter un paiement direct (sans redirection)
 * @route   POST /api/paiements/process
 * @access  Private
 */
const processPayment = asyncHandler(async (req, res) => {
  const {
    orderId,
    amount,
    cardType,
    cardNumber,
    cardholderName,
    expiryMonth,
    expiryYear,
    cvv
  } = req.body;

  // Récupérer la commande
  const commande = await Commande.findOne({
    where: { numero: orderId, clientId: req.user.id }
  });

  if (!commande) {
    // Essayer avec l'ID direct
    const commandeById = await Commande.findOne({
      where: { id: orderId, clientId: req.user.id }
    });

    if (!commandeById) {
      res.status(404);
      throw new Error('Commande non trouvée');
    }
  }

  const targetCommande = commande || await Commande.findOne({
    where: { id: orderId, clientId: req.user.id }
  });

  // Vérifier que la commande peut être payée
  if (targetCommande.statutPaiement === PAYMENT_STATUS.SUCCESS) {
    res.status(400);
    throw new Error('Cette commande a déjà été payée');
  }

  // Mettre à jour le statut en "en cours de traitement"
  await targetCommande.update({ statutPaiement: PAYMENT_STATUS.PROCESSING });

  // Traiter le paiement via SATIM
  const result = await satimService.processDirectPayment({
    sessionId: targetCommande.transactionId || targetCommande.numero,
    cardNumber,
    expiryMonth,
    expiryYear,
    cvv,
    cardholderName,
    amount: parseFloat(amount || targetCommande.total),
    cardType
  });

  if (result.success) {
    // Paiement réussi
    await targetCommande.update({
      statutPaiement: PAYMENT_STATUS.SUCCESS,
      transactionId: result.transactionId,
      paiementDetails: {
        cardLast4: result.cardLast4,
        cardType: result.cardType,
        authorizationCode: result.authorizationCode,
        responseCode: result.responseCode,
        timestamp: result.timestamp
      }
    });

    // Notification Socket au client
    emitToUser(req.user.id, 'paiement:success', {
      commandeId: targetCommande.id,
      transactionId: result.transactionId,
      amount: result.amount
    });

    // Notification Socket au prestataire
    if (targetCommande.prestataireId) {
      emitToUser(targetCommande.prestataireId, 'commande:payee', {
        commandeId: targetCommande.id,
        numero: targetCommande.numero
      });
    }

    res.json({
      success: true,
      message: 'Paiement effectué avec succès',
      data: {
        transactionId: result.transactionId,
        authorizationCode: result.authorizationCode,
        cardLast4: result.cardLast4,
        cardType: result.cardType,
        amount: result.amount,
        responseCode: result.responseCode
      }
    });
  } else {
    // Paiement échoué
    await targetCommande.update({
      statutPaiement: PAYMENT_STATUS.FAILED,
      paiementDetails: {
        error: result.error,
        code: result.code,
        transactionId: result.transactionId,
        timestamp: new Date().toISOString()
      }
    });

    res.status(400).json({
      success: false,
      error: result.error,
      code: result.code,
      transactionId: result.transactionId
    });
  }
});

/**
 * @desc    Confirmer un paiement en espèces
 * @route   POST /api/paiements/cash
 * @access  Private
 */
const confirmCashPayment = asyncHandler(async (req, res) => {
  const { orderId } = req.body;

  const commande = await Commande.findOne({
    where: {
      [require('sequelize').Op.or]: [
        { id: orderId },
        { numero: orderId }
      ],
      clientId: req.user.id
    }
  });

  if (!commande) {
    res.status(404);
    throw new Error('Commande non trouvée');
  }

  // Mettre à jour pour paiement en espèces
  await commande.update({
    modePaiement: 'especes',
    statutPaiement: PAYMENT_STATUS.PENDING // En attente de réception par le livreur
  });

  const cashInfo = satimService.generateCashPaymentInfo(commande.numero, parseFloat(commande.total));

  res.json({
    success: true,
    message: 'Paiement en espèces confirmé',
    data: {
      ...cashInfo,
      commandeId: commande.id,
      commandeNumero: commande.numero
    }
  });
});

/**
 * @desc    Vérifier le statut d'un paiement
 * @route   GET /api/paiements/status/:transactionId
 * @access  Private
 */
const getPaymentStatus = asyncHandler(async (req, res) => {
  const { transactionId } = req.params;

  // Vérifier que la transaction appartient à l'utilisateur
  const commande = await Commande.findOne({
    where: {
      transactionId,
      clientId: req.user.id
    }
  });

  if (!commande) {
    res.status(404);
    throw new Error('Transaction non trouvée');
  }

  // Vérifier le statut auprès de SATIM
  const status = await satimService.checkPaymentStatus(transactionId);

  res.json({
    success: true,
    data: {
      transactionId,
      commandeId: commande.id,
      commandeNumero: commande.numero,
      statutPaiement: commande.statutPaiement,
      satimStatus: status.status,
      montant: commande.total,
      modePaiement: commande.modePaiement,
      timestamp: status.timestamp
    }
  });
});

/**
 * @desc    Historique des paiements
 * @route   GET /api/paiements/historique
 * @access  Private
 */
const getPaymentHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const { count, rows: commandes } = await Commande.findAndCountAll({
    where: {
      clientId: req.user.id,
      statutPaiement: {
        [require('sequelize').Op.not]: null
      }
    },
    attributes: [
      'id', 'numero', 'total', 'modePaiement',
      'statutPaiement', 'transactionId', 'paiementDetails', 'createdAt'
    ],
    order: [['createdAt', 'DESC']],
    limit: parseInt(limit),
    offset: parseInt(offset)
  });

  res.json({
    success: true,
    data: commandes,
    pagination: {
      total: count,
      pages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      perPage: parseInt(limit)
    }
  });
});

/**
 * @desc    Demander un remboursement
 * @route   POST /api/paiements/refund
 * @access  Private/Admin
 */
const requestRefund = asyncHandler(async (req, res) => {
  const { commandeId, montant, motif } = req.body;

  const commande = await Commande.findByPk(commandeId);

  if (!commande) {
    res.status(404);
    throw new Error('Commande non trouvée');
  }

  if (commande.statutPaiement !== PAYMENT_STATUS.SUCCESS) {
    res.status(400);
    throw new Error('Cette commande ne peut pas être remboursée');
  }

  if (!commande.transactionId || commande.modePaiement === 'especes') {
    res.status(400);
    throw new Error('Pas de transaction à rembourser (paiement en espèces)');
  }

  const montantRemboursement = montant || parseFloat(commande.total);

  // Traiter le remboursement via SATIM
  const result = await satimService.initiateRefund(
    commande.transactionId,
    montantRemboursement,
    motif || 'Remboursement client'
  );

  if (result.success) {
    await commande.update({
      statutPaiement: PAYMENT_STATUS.REFUNDED,
      paiementDetails: {
        ...commande.paiementDetails,
        refund: {
          refundId: result.refundId,
          amount: result.amount,
          reason: result.reason,
          status: result.status,
          timestamp: result.timestamp,
          estimatedDelay: result.estimatedDelay
        }
      }
    });

    // Notification au client
    emitToUser(commande.clientId, 'paiement:refund', {
      commandeId: commande.id,
      refundId: result.refundId,
      amount: result.amount,
      estimatedDelay: result.estimatedDelay
    });

    res.json({
      success: true,
      message: 'Remboursement initié avec succès',
      data: {
        refundId: result.refundId,
        amount: result.amount,
        status: result.status,
        estimatedDelay: result.estimatedDelay
      }
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error,
      code: result.code
    });
  }
});

/**
 * @desc    Webhook SATIM pour les notifications de paiement
 * @route   POST /api/paiements/webhook/satim
 * @access  Public (avec signature)
 */
const satimWebhook = asyncHandler(async (req, res) => {
  const { orderId, amount, status, actionCode, signature } = req.body;

  console.log('Webhook SATIM reçu:', { orderId, amount, status, actionCode });

  // Traiter le webhook
  const result = await satimService.handleWebhook({
    orderId,
    amount,
    status,
    actionCode,
    signature
  });

  if (!result.success) {
    console.error('Erreur webhook SATIM:', result.error);
    return res.status(400).json({ error: result.error });
  }

  // Trouver et mettre à jour la commande
  const commande = await Commande.findOne({
    where: {
      [require('sequelize').Op.or]: [
        { transactionId: orderId },
        { numero: orderId }
      ]
    }
  });

  if (commande) {
    const newStatus = result.status === 'COMPLETED'
      ? PAYMENT_STATUS.SUCCESS
      : PAYMENT_STATUS.FAILED;

    await commande.update({
      statutPaiement: newStatus,
      paiementDetails: {
        ...commande.paiementDetails,
        webhookReceived: true,
        webhookTimestamp: result.timestamp,
        actionCode: result.actionCode
      }
    });

    // Notification au client
    emitToUser(commande.clientId, `paiement:${result.status.toLowerCase()}`, {
      commandeId: commande.id,
      transactionId: orderId,
      amount: result.amount
    });

    // Notification au prestataire si succès
    if (newStatus === PAYMENT_STATUS.SUCCESS && commande.prestataireId) {
      emitToUser(commande.prestataireId, 'commande:payee', {
        commandeId: commande.id,
        numero: commande.numero
      });
    }
  }

  // Toujours répondre 200 pour confirmer la réception
  res.status(200).json({
    received: true,
    processed: !!commande,
    orderId
  });
});

/**
 * @desc    Webhook générique (rétrocompatibilité)
 * @route   POST /api/paiements/webhook
 * @access  Public
 */
const paymentWebhook = asyncHandler(async (req, res) => {
  const { event, data } = req.body;
  console.log('Webhook générique reçu:', event, data);

  // Rediriger vers le webhook SATIM si applicable
  if (data?.orderId && data?.actionCode) {
    return satimWebhook(req, res);
  }

  res.status(200).json({ received: true });
});

/**
 * @desc    Obtenir les méthodes de paiement disponibles
 * @route   GET /api/paiements/methods
 * @access  Public
 */
const getPaymentMethods = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: 'cib',
        name: 'Carte CIB',
        description: 'Carte interbancaire algérienne',
        icon: 'credit-card',
        enabled: true,
        limits: {
          min: satimService.SATIM_CONFIG.LIMITS.MIN_AMOUNT,
          max: satimService.SATIM_CONFIG.LIMITS.MAX_AMOUNT
        }
      },
      {
        id: 'edahabia',
        name: 'Carte EDAHABIA',
        description: 'Carte postale Algérie Poste',
        icon: 'wallet',
        enabled: true,
        limits: {
          min: satimService.SATIM_CONFIG.LIMITS.MIN_AMOUNT,
          max: satimService.SATIM_CONFIG.LIMITS.MAX_AMOUNT
        }
      },
      {
        id: 'especes',
        name: 'Paiement à la livraison',
        description: 'Espèces au livreur',
        icon: 'banknote',
        enabled: true,
        limits: {
          min: 100,
          max: 50000
        }
      }
    ]
  });
});

module.exports = {
  initiatePayment,
  processPayment,
  confirmCashPayment,
  getPaymentStatus,
  getPaymentHistory,
  requestRefund,
  satimWebhook,
  paymentWebhook,
  getPaymentMethods
};
