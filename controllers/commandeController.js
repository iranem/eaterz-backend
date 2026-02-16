const { Commande, CommandeItem, CommandeHistorique, Plat, User, Promotion, PromotionUsage, sequelize } = require('../models');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { paginate, paginationResponse, generateOrderNumber } = require('../utils/helpers');
const { ORDER_STATUS, PAYMENT_STATUS, ORDER_REJECTION_REASONS } = require('../utils/constants');
const { sendOrderConfirmationEmail, sendOrderStatusEmail } = require('../services/emailService');
const { emitToUser, emitToPrestataire, emitToCommande } = require('../config/socket');
const { Op } = require('sequelize');

/**
 * @desc    Créer une commande (Client)
 * @route   POST /api/commandes
 * @access  Private/Client
 */
const createCommande = asyncHandler(async (req, res) => {
  const {
    prestataireId,
    items, // [{ platId, quantite, options?, instructions? }]
    adresseLivraison,
    villeLivraison,
    telephoneLivraison,
    instructions,
    dateLivraisonSouhaitee,
    modePaiement,
    codePromo
  } = req.body;

  // Validation de base
  if (!items || items.length === 0) {
    res.status(400);
    throw new Error('Le panier est vide');
  }

  // Démarrer une transaction
  const transaction = await sequelize.transaction();

  try {
    // Vérifier que tous les plats appartiennent au même prestataire et sont disponibles
    const platIds = items.map(item => item.platId);
    const plats = await Plat.findAll({
      where: { id: platIds, isDeleted: false },
      transaction
    });

    if (plats.length !== platIds.length) {
      throw new Error('Certains plats ne sont pas disponibles');
    }

    // Vérifier que tous les plats sont du même prestataire
    const prestataireIds = [...new Set(plats.map(p => p.prestataireId))];
    if (prestataireIds.length > 1) {
      throw new Error('Tous les plats doivent provenir du même prestataire');
    }

    if (prestataireIds[0] !== prestataireId) {
      throw new Error('Prestataire invalide');
    }

    // Vérifier la disponibilité et le stock
    for (const plat of plats) {
      const itemData = items.find(i => i.platId === plat.id);
      if (!plat.isAvailable) {
        throw new Error(`Le plat "${plat.getNom()}" n'est pas disponible`);
      }
      if (plat.stock !== -1 && plat.stock < itemData.quantite) {
        throw new Error(`Stock insuffisant pour "${plat.getNom()}"`);
      }
    }

    // Calculer le sous-total
    let sousTotal = 0;
    const commandeItems = [];

    for (const itemData of items) {
      const plat = plats.find(p => p.id === itemData.platId);
      const prixBase = plat.getPrixActuel();

      // Calculer les suppléments des options
      let supplementsTotal = 0;
      if (itemData.options && Array.isArray(itemData.options)) {
        for (const opt of itemData.options) {
          supplementsTotal += opt.supplement || 0;
        }
      }

      const prixUnitaire = prixBase + supplementsTotal;
      const itemSousTotal = prixUnitaire * itemData.quantite;
      sousTotal += itemSousTotal;

      commandeItems.push({
        platId: plat.id,
        quantite: itemData.quantite,
        prixUnitaire: prixBase,
        sousTotal: itemSousTotal,
        options: itemData.options || [],
        supplementsTotal,
        instructions: itemData.instructions,
        platSnapshot: {
          nom: plat.nom,
          description: plat.description,
          image: plat.image
        }
      });
    }

    // Appliquer le code promo si fourni
    let reduction = 0;
    let promotionId = null;
    let fraisLivraisonGratuits = false;

    if (codePromo) {
      const promotion = await Promotion.findOne({
        where: {
          code: codePromo.toUpperCase(),
          isActive: true,
          dateDebut: { [Op.lte]: new Date() },
          dateFin: { [Op.gte]: new Date() },
          [Op.or]: [
            { prestataireId: null, isGlobal: true },
            { prestataireId }
          ]
        },
        transaction
      });

      if (promotion) {
        // Vérifier les limites d'utilisation
        if (promotion.limiteUtilisationTotale !== -1 &&
          promotion.utilisationsActuelles >= promotion.limiteUtilisationTotale) {
          throw new Error('Ce code promo a atteint sa limite d\'utilisation');
        }

        // Vérifier l'utilisation par utilisateur
        const userUsages = await PromotionUsage.count({
          where: { promotionId: promotion.id, userId: req.user.id },
          transaction
        });

        if (userUsages >= promotion.limiteParUtilisateur) {
          throw new Error('Vous avez déjà utilisé ce code promo');
        }

        // Vérifier le montant minimum
        if (sousTotal < promotion.montantMinimum) {
          throw new Error(`Montant minimum requis: ${promotion.montantMinimum} DZD`);
        }

        // Calculer la réduction
        if (promotion.type === 'livraison_gratuite') {
          fraisLivraisonGratuits = true;
        } else {
          reduction = promotion.calculerReduction(sousTotal);
        }
        promotionId = promotion.id;
      }
    }

    // Frais de livraison
    const fraisLivraison = fraisLivraisonGratuits ? 0 : (parseFloat(process.env.DEFAULT_DELIVERY_FEE) || 200);

    // Total
    const total = sousTotal - reduction + fraisLivraison;

    // Créer la commande
    const commande = await Commande.create({
      numero: generateOrderNumber(),
      clientId: req.user.id,
      prestataireId,
      promotionId,
      statut: ORDER_STATUS.PENDING,
      sousTotal,
      reduction,
      fraisLivraison,
      total,
      adresseLivraison,
      villeLivraison,
      telephoneLivraison: telephoneLivraison || req.user.telephone,
      instructions,
      dateLivraisonSouhaitee,
      modePaiement,
      statutPaiement: modePaiement === 'especes' ? PAYMENT_STATUS.PENDING : PAYMENT_STATUS.PENDING,
      codePromoUtilise: codePromo?.toUpperCase()
    }, { transaction });

    // Créer les items de la commande
    for (const item of commandeItems) {
      await CommandeItem.create({
        commandeId: commande.id,
        ...item
      }, { transaction });
    }

    // Mettre à jour le stock des plats
    for (const itemData of items) {
      const plat = plats.find(p => p.id === itemData.platId);
      if (plat.stock !== -1) {
        await plat.decrement('stock', { by: itemData.quantite, transaction });
      }
      await plat.increment('nombreCommandes', { transaction });
    }

    // Mettre à jour l'utilisation du code promo
    if (promotionId) {
      await PromotionUsage.create({
        promotionId,
        userId: req.user.id,
        commandeId: commande.id,
        montantReduction: reduction
      }, { transaction });

      await Promotion.increment('utilisationsActuelles', {
        where: { id: promotionId },
        transaction
      });
    }

    // Valider la transaction
    await transaction.commit();

    // Récupérer la commande complète
    const commandeComplete = await Commande.findByPk(commande.id, {
      include: [
        { model: CommandeItem, as: 'items', include: [{ model: Plat, as: 'plat' }] },
        { model: User, as: 'client', attributes: ['id', 'prenom', 'nom', 'email'] },
        { model: User, as: 'prestataire', attributes: ['id', 'nomEtablissement'] }
      ]
    });

    // Envoyer les notifications
    try {
      // Email de confirmation au client
      await sendOrderConfirmationEmail(req.user, commandeComplete, commandeComplete.items);

      // Notification Socket au prestataire
      emitToPrestataire(prestataireId, 'commande:nouvelle', {
        commandeId: commande.id,
        numero: commande.numero,
        client: `${req.user.prenom} ${req.user.nom}`,
        total: commande.total,
        items: commandeItems.length
      });
    } catch (emailError) {
      console.error('Erreur envoi notification:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Commande créée avec succès',
      data: commandeComplete
    });

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
});

/**
 * @desc    Obtenir mes commandes (Client)
 * @route   GET /api/commandes/mes-commandes
 * @access  Private/Client
 */
const getMesCommandes = asyncHandler(async (req, res) => {
  const { page, limit, statut } = req.query;
  const { limit: limitNum, offset, page: pageNum } = paginate(page, limit);

  const where = { clientId: req.user.id };
  if (statut) where.statut = statut;

  const { count, rows: commandes } = await Commande.findAndCountAll({
    where,
    include: [
      {
        model: CommandeItem,
        as: 'items',
        include: [{ model: Plat, as: 'plat', attributes: ['id', 'nom', 'image'] }]
      },
      { model: User, as: 'prestataire', attributes: ['id', 'nomEtablissement', 'avatar'] }
    ],
    order: [['createdAt', 'DESC']],
    limit: limitNum,
    offset
  });

  res.json({
    success: true,
    ...paginationResponse(commandes, count, pageNum, limitNum)
  });
});

/**
 * @desc    Obtenir une commande par ID
 * @route   GET /api/commandes/:id
 * @access  Private
 */
const getCommandeById = asyncHandler(async (req, res) => {
  const commande = await Commande.findByPk(req.params.id, {
    include: [
      {
        model: CommandeItem,
        as: 'items',
        include: [{ model: Plat, as: 'plat' }]
      },
      { model: User, as: 'client', attributes: { exclude: ['password'] } },
      { model: User, as: 'prestataire', attributes: ['id', 'nomEtablissement', 'telephone', 'avatar'] },
      { model: Promotion, as: 'promotion' }
    ]
  });

  if (!commande) {
    res.status(404);
    throw new Error('Commande non trouvée');
  }

  // Vérifier l'accès
  if (req.user.role !== 'admin' &&
    commande.clientId !== req.user.id &&
    commande.prestataireId !== req.user.id) {
    res.status(403);
    throw new Error('Accès non autorisé');
  }

  res.json({
    success: true,
    data: commande
  });
});

/**
 * @desc    Commandes du prestataire
 * @route   GET /api/commandes/prestataire
 * @access  Private/Prestataire
 */
const getCommandesPrestataire = asyncHandler(async (req, res) => {
  const { page, limit, statut, dateDebut, dateFin } = req.query;
  const { limit: limitNum, offset, page: pageNum } = paginate(page, limit);

  const where = { prestataireId: req.user.id };
  if (statut) where.statut = statut;
  if (dateDebut || dateFin) {
    where.createdAt = {};
    if (dateDebut) where.createdAt[Op.gte] = new Date(dateDebut);
    if (dateFin) where.createdAt[Op.lte] = new Date(dateFin);
  }

  const { count, rows: commandes } = await Commande.findAndCountAll({
    where,
    include: [
      {
        model: CommandeItem,
        as: 'items',
        include: [{ model: Plat, as: 'plat', attributes: ['id', 'nom', 'image'] }]
      },
      { model: User, as: 'client', attributes: ['id', 'prenom', 'nom', 'telephone', 'avatar'] }
    ],
    order: [['createdAt', 'DESC']],
    limit: limitNum,
    offset
  });

  res.json({
    success: true,
    ...paginationResponse(commandes, count, pageNum, limitNum)
  });
});

/**
 * @desc    Changer le statut d'une commande (Prestataire)
 * @route   PUT /api/commandes/:id/statut
 * @access  Private/Prestataire
 */
const updateStatutCommande = asyncHandler(async (req, res) => {
  const { statut, motifAnnulation } = req.body;

  const commande = await Commande.findOne({
    where: { id: req.params.id, prestataireId: req.user.id },
    include: [{ model: User, as: 'client' }]
  });

  if (!commande) {
    res.status(404);
    throw new Error('Commande non trouvée');
  }

  // Valider la transition de statut
  const validTransitions = {
    [ORDER_STATUS.PENDING]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.CONFIRMED]: [ORDER_STATUS.PREPARING, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.PREPARING]: [ORDER_STATUS.READY],
    [ORDER_STATUS.READY]: [ORDER_STATUS.DELIVERING],
    [ORDER_STATUS.DELIVERING]: [ORDER_STATUS.DELIVERED],
    [ORDER_STATUS.DELIVERED]: [],
    [ORDER_STATUS.CANCELLED]: []
  };

  if (!validTransitions[commande.statut]?.includes(statut)) {
    res.status(400);
    throw new Error(`Transition de statut invalide: ${commande.statut} → ${statut}`);
  }

  // Mettre à jour les dates selon le statut
  const updateData = { statut };

  switch (statut) {
    case ORDER_STATUS.CONFIRMED:
      updateData.dateConfirmation = new Date();
      break;
    case ORDER_STATUS.PREPARING:
      updateData.datePreparation = new Date();
      break;
    case ORDER_STATUS.READY:
      updateData.datePrete = new Date();
      break;
    case ORDER_STATUS.DELIVERED:
      updateData.dateLivraison = new Date();
      if (commande.modePaiement === 'especes') {
        updateData.statutPaiement = PAYMENT_STATUS.SUCCESS;
      }
      break;
    case ORDER_STATUS.CANCELLED:
      updateData.dateAnnulation = new Date();
      updateData.motifAnnulation = motifAnnulation;
      // Remettre le stock
      const items = await CommandeItem.findAll({ where: { commandeId: commande.id } });
      for (const item of items) {
        const plat = await Plat.findByPk(item.platId);
        if (plat && plat.stock !== -1) {
          await plat.increment('stock', { by: item.quantite });
        }
      }
      break;
  }

  const ancienStatut = commande.statut;
  await commande.update(updateData);

  // Notifications
  try {
    // Email au client
    await sendOrderStatusEmail(commande.client, commande, statut);

    // Socket au client
    emitToUser(commande.clientId, 'commande:statut-update', {
      commandeId: commande.id,
      numero: commande.numero,
      ancienStatut,
      nouveauStatut: statut,
      date: new Date()
    });

    // Socket aux abonnés de cette commande
    emitToCommande(commande.id, 'commande:statut-update', {
      commandeId: commande.id,
      statut,
      date: new Date()
    });
  } catch (error) {
    console.error('Erreur notification:', error);
  }

  res.json({
    success: true,
    message: `Statut mis à jour: ${commande.getStatusLabel()}`,
    data: commande
  });
});

/**
 * @desc    Re-commander depuis l'historique (Client)
 * @route   POST /api/commandes/:id/recommander
 * @access  Private/Client
 */
const recommander = asyncHandler(async (req, res) => {
  const commandeOriginale = await Commande.findOne({
    where: { id: req.params.id, clientId: req.user.id },
    include: [{ model: CommandeItem, as: 'items' }]
  });

  if (!commandeOriginale) {
    res.status(404);
    throw new Error('Commande non trouvée');
  }

  // Récupérer les plats encore disponibles
  const items = [];
  for (const item of commandeOriginale.items) {
    const plat = await Plat.findOne({
      where: { id: item.platId, isAvailable: true, isDeleted: false }
    });
    if (plat) {
      items.push({
        platId: plat.id,
        quantite: item.quantite,
        options: item.options
      });
    }
  }

  if (items.length === 0) {
    res.status(400);
    throw new Error('Aucun plat de cette commande n\'est disponible');
  }

  res.json({
    success: true,
    message: 'Panier pré-rempli',
    data: {
      prestataireId: commandeOriginale.prestataireId,
      items,
      adresseLivraison: commandeOriginale.adresseLivraison,
      villeLivraison: commandeOriginale.villeLivraison
    }
  });
});

/**
 * @desc    Toutes les commandes (Admin)
 * @route   GET /api/commandes/admin
 * @access  Private/Admin
 */
const getAllCommandes = asyncHandler(async (req, res) => {
  const { page, limit, statut, prestataireId, clientId, dateDebut, dateFin } = req.query;
  const { limit: limitNum, offset, page: pageNum } = paginate(page, limit);

  const where = {};
  if (statut) where.statut = statut;
  if (prestataireId) where.prestataireId = prestataireId;
  if (clientId) where.clientId = clientId;
  if (dateDebut || dateFin) {
    where.createdAt = {};
    if (dateDebut) where.createdAt[Op.gte] = new Date(dateDebut);
    if (dateFin) where.createdAt[Op.lte] = new Date(dateFin);
  }

  const { count, rows: commandes } = await Commande.findAndCountAll({
    where,
    include: [
      { model: User, as: 'client', attributes: ['id', 'prenom', 'nom', 'email'] },
      { model: User, as: 'prestataire', attributes: ['id', 'nomEtablissement'] }
    ],
    order: [['createdAt', 'DESC']],
    limit: limitNum,
    offset
  });

  res.json({
    success: true,
    ...paginationResponse(commandes, count, pageNum, limitNum)
  });
});

/**
 * @desc    Forcer un remboursement (Admin)
 * @route   PUT /api/commandes/admin/:id/rembourser
 * @access  Private/Admin
 */
const forceRemboursement = asyncHandler(async (req, res) => {
  const { montant, motif } = req.body;

  const commande = await Commande.findByPk(req.params.id);

  if (!commande) {
    res.status(404);
    throw new Error('Commande non trouvée');
  }

  await commande.update({
    statutPaiement: PAYMENT_STATUS.REFUNDED,
    notesPrestataire: `[ADMIN] Remboursement forcé: ${montant} DZD - ${motif}`
  });

  res.json({
    success: true,
    message: 'Remboursement enregistré',
    data: commande
  });
});

/**
 * @desc    Annuler une commande (Client)
 * @route   POST /api/commandes/:id/annuler
 * @access  Private/Client
 */
const cancelCommandeClient = asyncHandler(async (req, res) => {
  const { motif } = req.body;

  const commande = await Commande.findOne({
    where: { id: req.params.id, clientId: req.user.id },
    include: [{ model: User, as: 'prestataire' }]
  });

  if (!commande) {
    res.status(404);
    throw new Error('Commande non trouvée');
  }

  // Vérifier si la commande peut être annulée
  if (!commande.canBeCancelled()) {
    res.status(400);
    throw new Error('Cette commande ne peut plus être annulée');
  }

  const ancienStatut = commande.statut;

  // Restaurer le stock des plats
  const items = await CommandeItem.findAll({ where: { commandeId: commande.id } });
  for (const item of items) {
    const plat = await Plat.findByPk(item.platId);
    if (plat && plat.stock !== -1) {
      await plat.increment('stock', { by: item.quantite });
    }
  }

  // Mettre à jour la commande
  await commande.update({
    statut: ORDER_STATUS.CANCELLED,
    dateAnnulation: new Date(),
    motifAnnulation: motif || 'Annulée par le client'
  });

  // Enregistrer dans l'historique
  await CommandeHistorique.create({
    commandeId: commande.id,
    ancienStatut,
    nouveauStatut: ORDER_STATUS.CANCELLED,
    acteurId: req.user.id,
    acteurType: 'client',
    motif: motif || 'Annulée par le client'
  });

  // Notifier le prestataire
  try {
    emitToPrestataire(commande.prestataireId, 'commande:annulee', {
      commandeId: commande.id,
      numero: commande.numero,
      motif: motif || 'Annulée par le client',
      annulePar: 'client'
    });
  } catch (error) {
    console.error('Erreur notification:', error);
  }

  res.json({
    success: true,
    message: 'Commande annulée avec succès',
    data: commande
  });
});

/**
 * @desc    Refuser une commande (Prestataire)
 * @route   POST /api/commandes/:id/refuser
 * @access  Private/Prestataire
 */
const refuseCommande = asyncHandler(async (req, res) => {
  const { motifCode, motifDetails } = req.body;

  // Valider le motif
  if (!motifCode || !Object.values(ORDER_REJECTION_REASONS).includes(motifCode)) {
    res.status(400);
    throw new Error('Motif de refus invalide');
  }

  const commande = await Commande.findOne({
    where: { id: req.params.id, prestataireId: req.user.id },
    include: [{ model: User, as: 'client' }]
  });

  if (!commande) {
    res.status(404);
    throw new Error('Commande non trouvée');
  }

  // Vérifier que la commande est en attente
  if (commande.statut !== ORDER_STATUS.PENDING) {
    res.status(400);
    throw new Error('Seules les commandes en attente peuvent être refusées');
  }

  const ancienStatut = commande.statut;

  // Restaurer le stock des plats
  const items = await CommandeItem.findAll({ where: { commandeId: commande.id } });
  for (const item of items) {
    const plat = await Plat.findByPk(item.platId);
    if (plat && plat.stock !== -1) {
      await plat.increment('stock', { by: item.quantite });
    }
  }

  // Labels pour les motifs
  const motifLabels = {
    [ORDER_REJECTION_REASONS.OUT_OF_STOCK]: 'Rupture de stock',
    [ORDER_REJECTION_REASONS.TOO_BUSY]: 'Trop occupé actuellement',
    [ORDER_REJECTION_REASONS.OUTSIDE_HOURS]: 'Hors horaires d\'ouverture',
    [ORDER_REJECTION_REASONS.DELIVERY_ZONE]: 'Zone de livraison non desservie',
    [ORDER_REJECTION_REASONS.OTHER]: 'Autre raison'
  };

  const motifComplet = motifDetails
    ? `${motifLabels[motifCode]} - ${motifDetails}`
    : motifLabels[motifCode];

  // Mettre à jour la commande
  await commande.update({
    statut: ORDER_STATUS.CANCELLED,
    dateAnnulation: new Date(),
    motifAnnulation: motifComplet
  });

  // Enregistrer dans l'historique
  await CommandeHistorique.create({
    commandeId: commande.id,
    ancienStatut,
    nouveauStatut: ORDER_STATUS.CANCELLED,
    acteurId: req.user.id,
    acteurType: 'prestataire',
    motif: motifComplet,
    motifCode
  });

  // Notifier le client
  try {
    emitToUser(commande.clientId, 'commande:refusee', {
      commandeId: commande.id,
      numero: commande.numero,
      motif: motifComplet
    });

    await sendOrderStatusEmail(commande.client, commande, ORDER_STATUS.CANCELLED);
  } catch (error) {
    console.error('Erreur notification:', error);
  }

  res.json({
    success: true,
    message: 'Commande refusée',
    data: commande
  });
});

/**
 * @desc    Obtenir l'historique des statuts d'une commande
 * @route   GET /api/commandes/:id/historique
 * @access  Private
 */
const getCommandeHistorique = asyncHandler(async (req, res) => {
  const commande = await Commande.findByPk(req.params.id);

  if (!commande) {
    res.status(404);
    throw new Error('Commande non trouvée');
  }

  // Vérifier l'accès
  if (req.user.role !== 'admin' &&
    commande.clientId !== req.user.id &&
    commande.prestataireId !== req.user.id) {
    res.status(403);
    throw new Error('Accès non autorisé');
  }

  const historique = await CommandeHistorique.findAll({
    where: { commandeId: commande.id },
    include: [{
      model: User,
      as: 'acteur',
      attributes: ['id', 'nom', 'prenom', 'role']
    }],
    order: [['createdAt', 'ASC']]
  });

  res.json({
    success: true,
    data: historique
  });
});

module.exports = {
  createCommande,
  getMesCommandes,
  getCommandeById,
  getCommandesPrestataire,
  updateStatutCommande,
  recommander,
  getAllCommandes,
  forceRemboursement,
  cancelCommandeClient,
  refuseCommande,
  getCommandeHistorique
};
