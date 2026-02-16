const { Plat, Categorie, User, Avis, Favori, sequelize } = require('../models');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { paginate, paginationResponse } = require('../utils/helpers');
const { deleteFile, getFileUrl } = require('../middleware/uploadMiddleware');
const { Op } = require('sequelize');

/**
 * @desc    Liste les plats avec filtres avancés
 * @route   GET /api/plats
 * @access  Public
 */
const getPlats = asyncHandler(async (req, res) => {
  const {
    categorieId,
    prestataireId,
    search,
    prixMin,
    prixMax,
    caloriesMin,
    caloriesMax,
    allergenes,
    noteMin,
    isAvailable,
    isFeatured,
    tags,
    sortBy,
    sortOrder,
    page,
    limit
  } = req.query;

  const { limit: limitNum, offset, page: pageNum } = paginate(page, limit);

  // Construction des filtres
  const where = {
    isDeleted: false
  };

  if (categorieId) where.categorieId = categorieId;
  if (prestataireId) where.prestataireId = prestataireId;
  if (isAvailable !== undefined) where.isAvailable = isAvailable === 'true';
  if (isFeatured === 'true') where.isFeatured = true;

  // Recherche textuelle
  if (search) {
    where[Op.or] = [
      sequelize.where(
        sequelize.fn('JSON_EXTRACT', sequelize.col('nom'), '$.fr'),
        { [Op.like]: `%${search}%` }
      ),
      sequelize.where(
        sequelize.fn('JSON_EXTRACT', sequelize.col('description'), '$.fr'),
        { [Op.like]: `%${search}%` }
      )
    ];
  }

  // Filtres de prix
  if (prixMin || prixMax) {
    where.prix = {};
    if (prixMin) where.prix[Op.gte] = parseFloat(prixMin);
    if (prixMax) where.prix[Op.lte] = parseFloat(prixMax);
  }

  // Filtres de calories
  if (caloriesMin || caloriesMax) {
    where.calories = {};
    if (caloriesMin) where.calories[Op.gte] = parseInt(caloriesMin);
    if (caloriesMax) where.calories[Op.lte] = parseInt(caloriesMax);
  }

  // Note minimum
  if (noteMin) {
    where.noteMoyenne = { [Op.gte]: parseFloat(noteMin) };
  }

  // Filtrer par allergènes à exclure
  if (allergenes) {
    const allergenesArray = allergenes.split(',');
    // Exclure les plats contenant ces allergènes
    where[Op.and] = allergenesArray.map(allergene => 
      sequelize.where(
        sequelize.fn('JSON_CONTAINS', sequelize.col('allergenes'), JSON.stringify(allergene)),
        0
      )
    );
  }

  // Tags
  if (tags) {
    const tagsArray = tags.split(',');
    where[Op.and] = [
      ...(where[Op.and] || []),
      ...tagsArray.map(tag =>
        sequelize.where(
          sequelize.fn('JSON_CONTAINS', sequelize.col('tags'), JSON.stringify(tag)),
          1
        )
      )
    ];
  }

  // Tri
  let order = [];
  switch (sortBy) {
    case 'prix':
      order.push(['prix', sortOrder === 'desc' ? 'DESC' : 'ASC']);
      break;
    case 'note':
      order.push(['noteMoyenne', 'DESC']);
      break;
    case 'populaire':
      order.push(['nombreCommandes', 'DESC']);
      break;
    case 'recent':
      order.push(['createdAt', 'DESC']);
      break;
    default:
      order.push(['isFeatured', 'DESC'], ['noteMoyenne', 'DESC']);
  }

  const { count, rows: plats } = await Plat.findAndCountAll({
    where,
    include: [
      {
        model: Categorie,
        as: 'categorie',
        attributes: ['id', 'nom', 'slug', 'icone']
      },
      {
        model: User,
        as: 'prestataire',
        attributes: ['id', 'nomEtablissement', 'avatar']
      }
    ],
    order,
    limit: limitNum,
    offset,
    distinct: true
  });

  res.json({
    success: true,
    ...paginationResponse(plats, count, pageNum, limitNum)
  });
});

/**
 * @desc    Obtenir les plats mis en avant
 * @route   GET /api/plats/featured
 * @access  Public
 */
const getFeaturedPlats = asyncHandler(async (req, res) => {
  const plats = await Plat.findAll({
    where: {
      isFeatured: true,
      isAvailable: true,
      isDeleted: false
    },
    include: [
      {
        model: Categorie,
        as: 'categorie',
        attributes: ['id', 'nom', 'slug']
      },
      {
        model: User,
        as: 'prestataire',
        attributes: ['id', 'nomEtablissement']
      }
    ],
    limit: 8,
    order: [['noteMoyenne', 'DESC']]
  });

  res.json({
    success: true,
    data: plats
  });
});

/**
 * @desc    Recherche avec suggestions
 * @route   GET /api/plats/search
 * @access  Public
 */
const searchPlats = asyncHandler(async (req, res) => {
  const { q, limit = 10 } = req.query;

  if (!q || q.length < 2) {
    return res.json({ success: true, data: [] });
  }

  const plats = await Plat.findAll({
    where: {
      isDeleted: false,
      isAvailable: true,
      [Op.or]: [
        sequelize.where(
          sequelize.fn('JSON_EXTRACT', sequelize.col('nom'), '$.fr'),
          { [Op.like]: `%${q}%` }
        ),
        sequelize.where(
          sequelize.fn('JSON_EXTRACT', sequelize.col('nom'), '$.en'),
          { [Op.like]: `%${q}%` }
        )
      ]
    },
    attributes: ['id', 'nom', 'image', 'prix', 'prixPromo'],
    include: [{
      model: Categorie,
      as: 'categorie',
      attributes: ['id', 'nom', 'slug']
    }],
    limit: parseInt(limit),
    order: [['nombreCommandes', 'DESC']]
  });

  res.json({
    success: true,
    data: plats
  });
});

/**
 * @desc    Obtenir un plat par ID
 * @route   GET /api/plats/:id
 * @access  Public
 */
const getPlatById = asyncHandler(async (req, res) => {
  const plat = await Plat.findOne({
    where: { id: req.params.id, isDeleted: false },
    include: [
      {
        model: Categorie,
        as: 'categorie',
        attributes: ['id', 'nom', 'slug', 'icone']
      },
      {
        model: User,
        as: 'prestataire',
        attributes: ['id', 'nomEtablissement', 'descriptionEtablissement', 'avatar', 'telephone']
      },
      {
        model: Avis,
        as: 'avis',
        where: { isVisible: true },
        required: false,
        limit: 5,
        order: [['createdAt', 'DESC']],
        include: [{
          model: User,
          as: 'client',
          attributes: ['id', 'prenom', 'avatar']
        }]
      }
    ]
  });

  if (!plat) {
    res.status(404);
    throw new Error('Plat non trouvé');
  }

  // Vérifier si l'utilisateur a ce plat en favori
  let isFavorite = false;
  if (req.user) {
    const favori = await Favori.findOne({
      where: { userId: req.user.id, platId: plat.id }
    });
    isFavorite = !!favori;
  }

  res.json({
    success: true,
    data: { ...plat.toJSON(), isFavorite }
  });
});

/**
 * @desc    Obtenir les avis d'un plat
 * @route   GET /api/plats/:id/avis
 * @access  Public
 */
const getPlatAvis = asyncHandler(async (req, res) => {
  const { page, limit, sortBy } = req.query;
  const { limit: limitNum, offset, page: pageNum } = paginate(page, limit);

  const order = sortBy === 'note' 
    ? [['note', 'DESC']] 
    : [['createdAt', 'DESC']];

  const { count, rows: avis } = await Avis.findAndCountAll({
    where: { platId: req.params.id, isVisible: true },
    include: [{
      model: User,
      as: 'client',
      attributes: ['id', 'prenom', 'nom', 'avatar']
    }],
    order,
    limit: limitNum,
    offset
  });

  res.json({
    success: true,
    ...paginationResponse(avis, count, pageNum, limitNum)
  });
});

// ═══════════════════════════════════════════════════════════════
// ROUTES PRESTATAIRE
// ═══════════════════════════════════════════════════════════════

/**
 * @desc    Créer un plat (Prestataire)
 * @route   POST /api/plats
 * @access  Private/Prestataire
 */
const createPlat = asyncHandler(async (req, res) => {
  const {
    categorieId, nom, description, prix, prixPromo,
    ingredients, calories, proteines, glucides, lipides, fibres,
    allergenes, tempPreparation, stock, tags, options
  } = req.body;

  // Vérifier que la catégorie existe
  const categorie = await Categorie.findByPk(categorieId);
  if (!categorie) {
    res.status(404);
    throw new Error('Catégorie non trouvée');
  }

  const plat = await Plat.create({
    prestataireId: req.user.id,
    categorieId,
    nom,
    description,
    prix,
    prixPromo,
    image: req.file ? getFileUrl(req.file.filename, 'plats') : null,
    ingredients: ingredients || [],
    calories,
    proteines,
    glucides,
    lipides,
    fibres,
    allergenes: allergenes || [],
    tempPreparation: tempPreparation || 30,
    stock: stock !== undefined ? stock : -1,
    tags: tags || [],
    options: options || []
  });

  // Mettre à jour le compteur de la catégorie
  await categorie.increment('nombrePlats');

  res.status(201).json({
    success: true,
    message: 'Plat créé avec succès',
    data: plat
  });
});

/**
 * @desc    Modifier un plat (Prestataire)
 * @route   PUT /api/plats/:id
 * @access  Private/Prestataire
 */
const updatePlat = asyncHandler(async (req, res) => {
  const plat = await Plat.findOne({
    where: { id: req.params.id, prestataireId: req.user.id, isDeleted: false }
  });

  if (!plat) {
    res.status(404);
    throw new Error('Plat non trouvé');
  }

  const updateData = { ...req.body };

  // Gérer l'upload d'image
  if (req.file) {
    // Supprimer l'ancienne image
    if (plat.image) {
      deleteFile(plat.image);
    }
    updateData.image = getFileUrl(req.file.filename, 'plats');
  }

  // Si la catégorie change, mettre à jour les compteurs
  if (updateData.categorieId && updateData.categorieId !== plat.categorieId) {
    await Categorie.decrement('nombrePlats', { where: { id: plat.categorieId } });
    await Categorie.increment('nombrePlats', { where: { id: updateData.categorieId } });
  }

  await plat.update(updateData);

  res.json({
    success: true,
    message: 'Plat mis à jour',
    data: plat
  });
});

/**
 * @desc    Supprimer un plat (Prestataire)
 * @route   DELETE /api/plats/:id
 * @access  Private/Prestataire
 */
const deletePlat = asyncHandler(async (req, res) => {
  const plat = await Plat.findOne({
    where: { id: req.params.id, prestataireId: req.user.id, isDeleted: false }
  });

  if (!plat) {
    res.status(404);
    throw new Error('Plat non trouvé');
  }

  // Soft delete
  await plat.update({ isDeleted: true, isAvailable: false });

  // Mettre à jour le compteur
  await Categorie.decrement('nombrePlats', { where: { id: plat.categorieId } });

  res.json({
    success: true,
    message: 'Plat supprimé'
  });
});

/**
 * @desc    Toggle disponibilité (Prestataire)
 * @route   PUT /api/plats/:id/disponibilite
 * @access  Private/Prestataire
 */
const toggleDisponibilite = asyncHandler(async (req, res) => {
  const plat = await Plat.findOne({
    where: { id: req.params.id, prestataireId: req.user.id, isDeleted: false }
  });

  if (!plat) {
    res.status(404);
    throw new Error('Plat non trouvé');
  }

  await plat.update({ isAvailable: !plat.isAvailable });

  // Émettre un événement Socket.io si nécessaire
  // emitToAll('plat:disponibilite', { platId: plat.id, isAvailable: plat.isAvailable });

  res.json({
    success: true,
    message: plat.isAvailable ? 'Plat disponible' : 'Plat indisponible',
    data: { isAvailable: plat.isAvailable }
  });
});

/**
 * @desc    Modifier le prix en temps réel (Prestataire)
 * @route   PUT /api/plats/:id/prix
 * @access  Private/Prestataire
 */
const updatePrix = asyncHandler(async (req, res) => {
  const { prix, prixPromo } = req.body;

  const plat = await Plat.findOne({
    where: { id: req.params.id, prestataireId: req.user.id, isDeleted: false }
  });

  if (!plat) {
    res.status(404);
    throw new Error('Plat non trouvé');
  }

  const ancienPrix = plat.prix;
  await plat.update({ 
    prix: prix || plat.prix,
    prixPromo: prixPromo !== undefined ? prixPromo : plat.prixPromo
  });

  // Émettre un événement Socket.io si le prix change
  // emitToAll('prix:update', { platId: plat.id, ancienPrix, nouveauPrix: plat.prix });

  res.json({
    success: true,
    message: 'Prix mis à jour',
    data: { prix: plat.prix, prixPromo: plat.prixPromo }
  });
});

module.exports = {
  getPlats,
  getFeaturedPlats,
  searchPlats,
  getPlatById,
  getPlatAvis,
  createPlat,
  updatePlat,
  deletePlat,
  toggleDisponibilite,
  updatePrix
};
