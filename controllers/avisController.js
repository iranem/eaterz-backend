const { Avis, Plat, User, Commande, CommandeItem, sequelize } = require('../models');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { paginate, paginationResponse } = require('../utils/helpers');
const { emitToPrestataire } = require('../config/socket');
const { Op } = require('sequelize');

/**
 * @desc    Créer un avis (Client)
 * @route   POST /api/avis
 * @access  Private/Client
 */
const createAvis = asyncHandler(async (req, res) => {
  const { platId, commandeId, note, commentaire } = req.body;

  // Vérifier que le plat existe
  const plat = await Plat.findByPk(platId);
  if (!plat) {
    res.status(404);
    throw new Error('Plat non trouvé');
  }

  // Vérifier si l'avis existe déjà
  const existingAvis = await Avis.findOne({
    where: { clientId: req.user.id, platId }
  });

  if (existingAvis) {
    res.status(400);
    throw new Error('Vous avez déjà laissé un avis pour ce plat');
  }

  // Vérifier si c'est un achat vérifié
  let isVerifiedPurchase = false;
  if (commandeId) {
    const commandeItem = await CommandeItem.findOne({
      where: { platId },
      include: [{
        model: Commande,
        as: 'commande',
        where: { 
          id: commandeId,
          clientId: req.user.id,
          statut: 'livree'
        }
      }]
    });
    isVerifiedPurchase = !!commandeItem;
  }

  const avis = await Avis.create({
    clientId: req.user.id,
    platId,
    commandeId: commandeId || null,
    note,
    commentaire,
    isVerifiedPurchase
  });

  // Mettre à jour la note moyenne du plat
  const stats = await Avis.findAll({
    where: { platId, isVisible: true },
    attributes: [
      [sequelize.fn('AVG', sequelize.col('note')), 'moyenne'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'total']
    ],
    raw: true
  });

  await plat.update({
    noteMoyenne: parseFloat(stats[0].moyenne) || 0,
    nombreAvis: parseInt(stats[0].total) || 0
  });

  // Notification au prestataire
  emitToPrestataire(plat.prestataireId, 'avis:nouveau', {
    platId,
    platNom: plat.getNom(),
    note,
    client: req.user.prenom
  });

  res.status(201).json({
    success: true,
    message: 'Avis publié',
    data: avis
  });
});

/**
 * @desc    Mes avis (Client)
 * @route   GET /api/avis/mes-avis
 * @access  Private/Client
 */
const getMesAvis = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const { limit: limitNum, offset, page: pageNum } = paginate(page, limit);

  const { count, rows: avis } = await Avis.findAndCountAll({
    where: { clientId: req.user.id },
    include: [{
      model: Plat,
      as: 'plat',
      attributes: ['id', 'nom', 'image']
    }],
    order: [['createdAt', 'DESC']],
    limit: limitNum,
    offset
  });

  res.json({
    success: true,
    ...paginationResponse(avis, count, pageNum, limitNum)
  });
});

/**
 * @desc    Avis reçus (Prestataire)
 * @route   GET /api/avis/recus
 * @access  Private/Prestataire
 */
const getAvisRecus = asyncHandler(async (req, res) => {
  const { page, limit, note, platId } = req.query;
  const { limit: limitNum, offset, page: pageNum } = paginate(page, limit);

  const where = { isVisible: true };
  if (note) where.note = note;

  const platWhere = { prestataireId: req.user.id };
  if (platId) platWhere.id = platId;

  const { count, rows: avis } = await Avis.findAndCountAll({
    where,
    include: [
      {
        model: Plat,
        as: 'plat',
        where: platWhere,
        attributes: ['id', 'nom', 'image']
      },
      {
        model: User,
        as: 'client',
        attributes: ['id', 'prenom', 'avatar']
      }
    ],
    order: [['createdAt', 'DESC']],
    limit: limitNum,
    offset
  });

  res.json({
    success: true,
    ...paginationResponse(avis, count, pageNum, limitNum)
  });
});

/**
 * @desc    Répondre à un avis (Prestataire)
 * @route   PUT /api/avis/:id/reponse
 * @access  Private/Prestataire
 */
const repondreAvis = asyncHandler(async (req, res) => {
  const { reponse } = req.body;

  const avis = await Avis.findByPk(req.params.id, {
    include: [{
      model: Plat,
      as: 'plat',
      where: { prestataireId: req.user.id }
    }]
  });

  if (!avis) {
    res.status(404);
    throw new Error('Avis non trouvé');
  }

  if (avis.reponse) {
    res.status(400);
    throw new Error('Vous avez déjà répondu à cet avis');
  }

  await avis.update({
    reponse,
    dateReponse: new Date()
  });

  res.json({
    success: true,
    message: 'Réponse publiée',
    data: avis
  });
});

/**
 * @desc    Signaler un avis (Prestataire)
 * @route   POST /api/avis/:id/signaler
 * @access  Private/Prestataire
 */
const signalerAvis = asyncHandler(async (req, res) => {
  const { motif } = req.body;

  const avis = await Avis.findByPk(req.params.id, {
    include: [{
      model: Plat,
      as: 'plat',
      where: { prestataireId: req.user.id }
    }]
  });

  if (!avis) {
    res.status(404);
    throw new Error('Avis non trouvé');
  }

  await avis.update({
    isSignale: true,
    motifSignalement: motif,
    dateSignalement: new Date()
  });

  res.json({
    success: true,
    message: 'Avis signalé, il sera examiné par nos équipes'
  });
});

/**
 * @desc    Avis signalés (Admin)
 * @route   GET /api/avis/signales
 * @access  Private/Admin
 */
const getAvisSignales = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const { limit: limitNum, offset, page: pageNum } = paginate(page, limit);

  const { count, rows: avis } = await Avis.findAndCountAll({
    where: { isSignale: true },
    include: [
      { model: Plat, as: 'plat', attributes: ['id', 'nom'] },
      { model: User, as: 'client', attributes: ['id', 'prenom', 'nom', 'email'] }
    ],
    order: [['dateSignalement', 'DESC']],
    limit: limitNum,
    offset
  });

  res.json({
    success: true,
    ...paginationResponse(avis, count, pageNum, limitNum)
  });
});

/**
 * @desc    Modérer un avis (Admin)
 * @route   PUT /api/avis/:id/moderer
 * @access  Private/Admin
 */
const modererAvis = asyncHandler(async (req, res) => {
  const { action } = req.body; // 'approve', 'hide', 'delete'

  const avis = await Avis.findByPk(req.params.id);

  if (!avis) {
    res.status(404);
    throw new Error('Avis non trouvé');
  }

  switch (action) {
    case 'approve':
      await avis.update({ isSignale: false, motifSignalement: null });
      break;
    case 'hide':
      await avis.update({ isVisible: false });
      break;
    case 'delete':
      await avis.destroy();
      return res.json({ success: true, message: 'Avis supprimé' });
  }

  // Recalculer la note moyenne si nécessaire
  if (action === 'hide') {
    const plat = await Plat.findByPk(avis.platId);
    const stats = await Avis.findAll({
      where: { platId: avis.platId, isVisible: true },
      attributes: [
        [sequelize.fn('AVG', sequelize.col('note')), 'moyenne'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'total']
      ],
      raw: true
    });
    await plat.update({
      noteMoyenne: parseFloat(stats[0].moyenne) || 0,
      nombreAvis: parseInt(stats[0].total) || 0
    });
  }

  res.json({
    success: true,
    message: 'Avis modéré',
    data: avis
  });
});

module.exports = {
  createAvis,
  getMesAvis,
  getAvisRecus,
  repondreAvis,
  signalerAvis,
  getAvisSignales,
  modererAvis
};
