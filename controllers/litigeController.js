const { Litige, Commande, User } = require('../models');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { paginate, paginationResponse } = require('../utils/helpers');
const { DISPUTE_STATUS } = require('../utils/constants');
const { emitToUser, emitToAdmins } = require('../config/socket');
const { Op } = require('sequelize');

/**
 * @desc    Ouvrir un litige (Client)
 * @route   POST /api/litiges
 * @access  Private/Client
 */
const createLitige = asyncHandler(async (req, res) => {
  const { commandeId, motif, description } = req.body;

  // Vérifier la commande
  const commande = await Commande.findOne({
    where: { id: commandeId, clientId: req.user.id }
  });

  if (!commande) {
    res.status(404);
    throw new Error('Commande non trouvée');
  }

  // Vérifier qu'il n'y a pas déjà un litige
  const existingLitige = await Litige.findOne({
    where: { commandeId }
  });

  if (existingLitige) {
    res.status(400);
    throw new Error('Un litige existe déjà pour cette commande');
  }

  const litige = await Litige.create({
    commandeId,
    clientId: req.user.id,
    prestataireId: commande.prestataireId,
    motif,
    description,
    messages: [{
      auteurId: req.user.id,
      auteurRole: 'client',
      message: description,
      date: new Date().toISOString()
    }]
  });

  // Gérer l'upload des pièces jointes si présent
  if (req.files && req.files.length > 0) {
    const piecesJointes = req.files.map(f => ({
      nom: f.originalname,
      url: `/uploads/litiges/${f.filename}`
    }));
    await litige.update({ piecesJointes });
  }

  // Notifications
  emitToAdmins('litige:nouveau', {
    litigeId: litige.id,
    numero: litige.numero,
    motif: litige.getMotifLabel()
  });

  res.status(201).json({
    success: true,
    message: 'Litige ouvert',
    data: litige
  });
});

/**
 * @desc    Mes litiges (Client)
 * @route   GET /api/litiges/mes-litiges
 * @access  Private/Client
 */
const getMesLitiges = asyncHandler(async (req, res) => {
  const { page, limit, statut } = req.query;
  const { limit: limitNum, offset, page: pageNum } = paginate(page, limit);

  const where = { clientId: req.user.id };
  if (statut) where.statut = statut;

  const { count, rows: litiges } = await Litige.findAndCountAll({
    where,
    include: [{
      model: Commande,
      as: 'commande',
      attributes: ['id', 'numero', 'total']
    }],
    order: [['createdAt', 'DESC']],
    limit: limitNum,
    offset
  });

  res.json({
    success: true,
    ...paginationResponse(litiges, count, pageNum, limitNum)
  });
});

// ═══════════════════════════════════════════════════════════════
// ROUTES ADMIN
// ═══════════════════════════════════════════════════════════════

/**
 * @desc    Tous les litiges (Admin)
 * @route   GET /api/litiges
 * @access  Private/Admin
 */
const getAllLitiges = asyncHandler(async (req, res) => {
  const { page, limit, statut, priorite, adminId } = req.query;
  const { limit: limitNum, offset, page: pageNum } = paginate(page, limit);

  const where = {};
  if (statut) where.statut = statut;
  if (priorite) where.priorite = priorite;
  if (adminId) where.adminId = adminId;

  const { count, rows: litiges } = await Litige.findAndCountAll({
    where,
    include: [
      { model: Commande, as: 'commande', attributes: ['id', 'numero', 'total'] },
      { model: User, as: 'client', attributes: ['id', 'prenom', 'nom', 'email'] },
      { model: User, as: 'prestataire', attributes: ['id', 'nomEtablissement'] },
      { model: User, as: 'admin', attributes: ['id', 'prenom', 'nom'] }
    ],
    order: [
      ['priorite', 'DESC'],
      ['createdAt', 'ASC']
    ],
    limit: limitNum,
    offset
  });

  res.json({
    success: true,
    ...paginationResponse(litiges, count, pageNum, limitNum)
  });
});

/**
 * @desc    Détail d'un litige (Admin)
 * @route   GET /api/litiges/:id
 * @access  Private/Admin
 */
const getLitigeById = asyncHandler(async (req, res) => {
  const litige = await Litige.findByPk(req.params.id, {
    include: [
      { model: Commande, as: 'commande' },
      { model: User, as: 'client', attributes: { exclude: ['password'] } },
      { model: User, as: 'prestataire', attributes: { exclude: ['password'] } },
      { model: User, as: 'admin', attributes: { exclude: ['password'] } }
    ]
  });

  if (!litige) {
    res.status(404);
    throw new Error('Litige non trouvé');
  }

  res.json({
    success: true,
    data: litige
  });
});

/**
 * @desc    Prendre en charge un litige (Admin)
 * @route   PUT /api/litiges/:id/prendre-en-charge
 * @access  Private/Admin
 */
const prendreEnCharge = asyncHandler(async (req, res) => {
  const litige = await Litige.findByPk(req.params.id);

  if (!litige) {
    res.status(404);
    throw new Error('Litige non trouvé');
  }

  if (litige.adminId && litige.adminId !== req.user.id) {
    res.status(400);
    throw new Error('Ce litige est déjà pris en charge par un autre admin');
  }

  await litige.update({
    adminId: req.user.id,
    statut: DISPUTE_STATUS.IN_PROGRESS,
    datePriseEnCharge: new Date()
  });

  // Ajouter un message système
  litige.addMessage(req.user.id, 'admin', `Litige pris en charge par ${req.user.prenom} ${req.user.nom}`);
  await litige.save();

  // Notification au client
  emitToUser(litige.clientId, 'litige:update', {
    litigeId: litige.id,
    statut: litige.statut,
    message: 'Votre litige est en cours de traitement'
  });

  res.json({
    success: true,
    message: 'Litige pris en charge',
    data: litige
  });
});

/**
 * @desc    Ajouter un message au litige (Admin)
 * @route   POST /api/litiges/:id/message
 * @access  Private/Admin
 */
const addMessage = asyncHandler(async (req, res) => {
  const { message } = req.body;

  const litige = await Litige.findByPk(req.params.id);

  if (!litige) {
    res.status(404);
    throw new Error('Litige non trouvé');
  }

  litige.addMessage(req.user.id, req.user.role, message);
  await litige.save();

  // Notifier les parties concernées
  emitToUser(litige.clientId, 'litige:message', {
    litigeId: litige.id,
    message: 'Nouveau message sur votre litige'
  });
  emitToUser(litige.prestataireId, 'litige:message', {
    litigeId: litige.id,
    message: 'Nouveau message sur un litige vous concernant'
  });

  res.json({
    success: true,
    message: 'Message ajouté',
    data: litige.messages
  });
});

/**
 * @desc    Résoudre un litige (Admin)
 * @route   PUT /api/litiges/:id/resoudre
 * @access  Private/Admin
 */
const resoudreLitige = asyncHandler(async (req, res) => {
  const { resolution, montantRembourse, commentaireResolution } = req.body;

  const litige = await Litige.findByPk(req.params.id);

  if (!litige) {
    res.status(404);
    throw new Error('Litige non trouvé');
  }

  await litige.update({
    statut: DISPUTE_STATUS.RESOLVED,
    resolution,
    montantRembourse: montantRembourse || null,
    commentaireResolution,
    dateResolution: new Date()
  });

  // Ajouter un message de résolution
  litige.addMessage(req.user.id, 'admin', `Litige résolu: ${resolution}. ${commentaireResolution || ''}`);
  await litige.save();

  // Notifications
  emitToUser(litige.clientId, 'litige:resolu', {
    litigeId: litige.id,
    resolution,
    montantRembourse
  });

  res.json({
    success: true,
    message: 'Litige résolu',
    data: litige
  });
});

module.exports = {
  createLitige,
  getMesLitiges,
  getAllLitiges,
  getLitigeById,
  prendreEnCharge,
  addMessage,
  resoudreLitige
};
