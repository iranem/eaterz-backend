const { Promotion, PromotionUsage, User, Commande } = require('../models');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { paginate, paginationResponse, generatePromoCode } = require('../utils/helpers');
const { PROMO_TYPES } = require('../utils/constants');
const { Op } = require('sequelize');

/**
 * @desc    Valider un code promo
 * @route   POST /api/promotions/valider
 * @access  Private
 */
const validerCodePromo = asyncHandler(async (req, res) => {
  const { code, prestataireId, montant } = req.body;

  const promotion = await Promotion.findOne({
    where: {
      code: code.toUpperCase(),
      isActive: true,
      dateDebut: { [Op.lte]: new Date() },
      dateFin: { [Op.gte]: new Date() },
      [Op.or]: [
        { prestataireId: null, isGlobal: true },
        { prestataireId }
      ]
    }
  });

  if (!promotion) {
    res.status(404);
    throw new Error('Code promo invalide ou expiré');
  }

  // Vérifier les limites
  if (promotion.limiteUtilisationTotale !== -1 && 
      promotion.utilisationsActuelles >= promotion.limiteUtilisationTotale) {
    res.status(400);
    throw new Error('Ce code promo a atteint sa limite d\'utilisation');
  }

  // Vérifier l'utilisation par utilisateur
  const userUsages = await PromotionUsage.count({
    where: { promotionId: promotion.id, userId: req.user.id }
  });

  if (userUsages >= promotion.limiteParUtilisateur) {
    res.status(400);
    throw new Error('Vous avez déjà utilisé ce code promo');
  }

  // Vérifier le montant minimum
  if (montant && montant < promotion.montantMinimum) {
    res.status(400);
    throw new Error(`Montant minimum requis: ${promotion.montantMinimum} DZD`);
  }

  // Calculer la réduction
  const reduction = promotion.calculerReduction(montant || 0);

  res.json({
    success: true,
    data: {
      code: promotion.code,
      type: promotion.type,
      valeur: promotion.valeur,
      reduction,
      description: promotion.description,
      montantMinimum: promotion.montantMinimum,
      dateFin: promotion.dateFin
    }
  });
});

/**
 * @desc    Mes promotions (Prestataire)
 * @route   GET /api/promotions/mes-promotions
 * @access  Private/Prestataire
 */
const getMesPromotions = asyncHandler(async (req, res) => {
  const { page, limit, isActive } = req.query;
  const { limit: limitNum, offset, page: pageNum } = paginate(page, limit);

  const where = { prestataireId: req.user.id };
  if (isActive !== undefined) where.isActive = isActive === 'true';

  const { count, rows: promotions } = await Promotion.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: limitNum,
    offset
  });

  res.json({
    success: true,
    ...paginationResponse(promotions, count, pageNum, limitNum)
  });
});

/**
 * @desc    Créer une promotion (Prestataire)
 * @route   POST /api/promotions
 * @access  Private/Prestataire
 */
const createPromotion = asyncHandler(async (req, res) => {
  const {
    code,
    type,
    valeur,
    description,
    montantMinimum,
    montantMaxReduction,
    dateDebut,
    dateFin,
    limiteUtilisationTotale,
    limiteParUtilisateur,
    categoriesApplicables,
    platsApplicables,
    nouveauxClientsUniquement
  } = req.body;

  // Générer un code si non fourni
  const promoCode = code ? code.toUpperCase() : generatePromoCode();

  // Vérifier que le code n'existe pas
  const existing = await Promotion.findOne({ where: { code: promoCode } });
  if (existing) {
    res.status(400);
    throw new Error('Ce code promo existe déjà');
  }

  const promotion = await Promotion.create({
    prestataireId: req.user.id,
    code: promoCode,
    type: type || PROMO_TYPES.PERCENTAGE,
    valeur,
    description,
    montantMinimum: montantMinimum || 0,
    montantMaxReduction,
    dateDebut: new Date(dateDebut),
    dateFin: new Date(dateFin),
    limiteUtilisationTotale: limiteUtilisationTotale || -1,
    limiteParUtilisateur: limiteParUtilisateur || 1,
    categoriesApplicables: categoriesApplicables || [],
    platsApplicables: platsApplicables || [],
    nouveauxClientsUniquement: nouveauxClientsUniquement || false,
    isGlobal: false
  });

  res.status(201).json({
    success: true,
    message: 'Promotion créée',
    data: promotion
  });
});

/**
 * @desc    Modifier une promotion (Prestataire)
 * @route   PUT /api/promotions/:id
 * @access  Private/Prestataire
 */
const updatePromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findOne({
    where: { id: req.params.id, prestataireId: req.user.id }
  });

  if (!promotion) {
    res.status(404);
    throw new Error('Promotion non trouvée');
  }

  await promotion.update(req.body);

  res.json({
    success: true,
    message: 'Promotion mise à jour',
    data: promotion
  });
});

/**
 * @desc    Supprimer une promotion (Prestataire)
 * @route   DELETE /api/promotions/:id
 * @access  Private/Prestataire
 */
const deletePromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findOne({
    where: { id: req.params.id, prestataireId: req.user.id }
  });

  if (!promotion) {
    res.status(404);
    throw new Error('Promotion non trouvée');
  }

  await promotion.destroy();

  res.json({
    success: true,
    message: 'Promotion supprimée'
  });
});

/**
 * @desc    Statistiques d'utilisation (Prestataire)
 * @route   GET /api/promotions/:id/stats
 * @access  Private/Prestataire
 */
const getPromotionStats = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findOne({
    where: { id: req.params.id, prestataireId: req.user.id }
  });

  if (!promotion) {
    res.status(404);
    throw new Error('Promotion non trouvée');
  }

  const usages = await PromotionUsage.findAll({
    where: { promotionId: promotion.id },
    include: [
      { model: User, as: 'user', attributes: ['id', 'prenom', 'nom'] },
      { model: Commande, as: 'commande', attributes: ['id', 'numero', 'total'] }
    ],
    order: [['createdAt', 'DESC']]
  });

  const totalReduction = usages.reduce((sum, u) => sum + parseFloat(u.montantReduction), 0);

  res.json({
    success: true,
    data: {
      promotion,
      stats: {
        nombreUtilisations: usages.length,
        totalReduction,
        reductionMoyenne: usages.length > 0 ? totalReduction / usages.length : 0
      },
      usages
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// ROUTES ADMIN
// ═══════════════════════════════════════════════════════════════

/**
 * @desc    Toutes les promotions (Admin)
 * @route   GET /api/promotions
 * @access  Private/Admin
 */
const getAllPromotions = asyncHandler(async (req, res) => {
  const { page, limit, isGlobal, prestataireId } = req.query;
  const { limit: limitNum, offset, page: pageNum } = paginate(page, limit);

  const where = {};
  if (isGlobal !== undefined) where.isGlobal = isGlobal === 'true';
  if (prestataireId) where.prestataireId = prestataireId;

  const { count, rows: promotions } = await Promotion.findAndCountAll({
    where,
    include: [
      { model: User, as: 'prestataire', attributes: ['id', 'nomEtablissement'] }
    ],
    order: [['createdAt', 'DESC']],
    limit: limitNum,
    offset
  });

  res.json({
    success: true,
    ...paginationResponse(promotions, count, pageNum, limitNum)
  });
});

/**
 * @desc    Créer une promotion globale (Admin)
 * @route   POST /api/promotions/globale
 * @access  Private/Admin
 */
const createPromotionGlobale = asyncHandler(async (req, res) => {
  const { code, type, valeur, description, dateDebut, dateFin, ...rest } = req.body;

  const promoCode = code ? code.toUpperCase() : generatePromoCode();

  const existing = await Promotion.findOne({ where: { code: promoCode } });
  if (existing) {
    res.status(400);
    throw new Error('Ce code promo existe déjà');
  }

  const promotion = await Promotion.create({
    prestataireId: null,
    code: promoCode,
    type: type || PROMO_TYPES.PERCENTAGE,
    valeur,
    description,
    dateDebut: new Date(dateDebut),
    dateFin: new Date(dateFin),
    isGlobal: true,
    ...rest
  });

  res.status(201).json({
    success: true,
    message: 'Promotion globale créée',
    data: promotion
  });
});

module.exports = {
  validerCodePromo,
  getMesPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  getPromotionStats,
  getAllPromotions,
  createPromotionGlobale
};
