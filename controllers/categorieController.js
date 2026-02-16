const { Categorie, Plat } = require('../models');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { paginate, paginationResponse, slugify } = require('../utils/helpers');
const { Op } = require('sequelize');

/**
 * @desc    Liste toutes les catégories actives
 * @route   GET /api/categories
 * @access  Public
 */
const getCategories = asyncHandler(async (req, res) => {
  const { includeInactive } = req.query;

  const where = {};
  if (!includeInactive || includeInactive !== 'true') {
    where.isActive = true;
  }

  const categories = await Categorie.findAll({
    where,
    order: [['ordre', 'ASC']],
    attributes: ['id', 'nom', 'description', 'image', 'icone', 'slug', 'ordre', 'isActive', 'nombrePlats', 'type']
  });

  res.json({
    success: true,
    data: categories
  });
});

/**
 * @desc    Obtenir une catégorie par ID ou slug
 * @route   GET /api/categories/:idOrSlug
 * @access  Public
 */
const getCategorie = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;

  const where = isNaN(idOrSlug)
    ? { slug: idOrSlug }
    : { id: idOrSlug };

  const categorie = await Categorie.findOne({
    where,
    include: [{
      model: Plat,
      as: 'plats',
      where: { isAvailable: true, isDeleted: false },
      required: false,
      limit: 6,
      order: [['noteMoyenne', 'DESC']]
    }]
  });

  if (!categorie) {
    res.status(404);
    throw new Error('Catégorie non trouvée');
  }

  res.json({
    success: true,
    data: categorie
  });
});

/**
 * @desc    Créer une catégorie (Admin)
 * @route   POST /api/categories
 * @access  Private/Admin
 */
const createCategorie = asyncHandler(async (req, res) => {
  const { nom, description, image, icone, ordre, type } = req.body;

  // Générer le slug
  const slug = slugify(nom.fr || nom);

  // Vérifier si le slug existe
  const existing = await Categorie.findOne({ where: { slug } });
  if (existing) {
    res.status(400);
    throw new Error('Une catégorie avec ce nom existe déjà');
  }

  const categorie = await Categorie.create({
    nom,
    description,
    image,
    icone: icone || 'utensils',
    slug,
    ordre: ordre || 0,
    type: type || 'plat'
  });

  res.status(201).json({
    success: true,
    message: 'Catégorie créée',
    data: categorie
  });
});

/**
 * @desc    Modifier une catégorie (Admin)
 * @route   PUT /api/categories/:id
 * @access  Private/Admin
 */
const updateCategorie = asyncHandler(async (req, res) => {
  const categorie = await Categorie.findByPk(req.params.id);

  if (!categorie) {
    res.status(404);
    throw new Error('Catégorie non trouvée');
  }

  const { nom, description, image, icone, ordre, isActive, type } = req.body;

  // Si le nom change, mettre à jour le slug
  let slug = categorie.slug;
  if (nom && nom.fr !== categorie.nom?.fr) {
    slug = slugify(nom.fr);
    const existing = await Categorie.findOne({
      where: { slug, id: { [Op.ne]: categorie.id } }
    });
    if (existing) {
      res.status(400);
      throw new Error('Une catégorie avec ce nom existe déjà');
    }
  }

  await categorie.update({
    nom: nom || categorie.nom,
    description: description !== undefined ? description : categorie.description,
    image: image !== undefined ? image : categorie.image,
    icone: icone || categorie.icone,
    slug,
    ordre: ordre !== undefined ? ordre : categorie.ordre,
    isActive: isActive !== undefined ? isActive : categorie.isActive,
    type: type || categorie.type
  });

  res.json({
    success: true,
    message: 'Catégorie mise à jour',
    data: categorie
  });
});

/**
 * @desc    Supprimer une catégorie (Admin)
 * @route   DELETE /api/categories/:id
 * @access  Private/Admin
 */
const deleteCategorie = asyncHandler(async (req, res) => {
  const categorie = await Categorie.findByPk(req.params.id);

  if (!categorie) {
    res.status(404);
    throw new Error('Catégorie non trouvée');
  }

  // Vérifier si des plats utilisent cette catégorie
  const platsCount = await Plat.count({ where: { categorieId: categorie.id, isDeleted: false } });
  if (platsCount > 0) {
    res.status(400);
    throw new Error(`Impossible de supprimer: ${platsCount} plat(s) utilisent cette catégorie`);
  }

  await categorie.destroy();

  res.json({
    success: true,
    message: 'Catégorie supprimée'
  });
});

/**
 * @desc    Réordonner les catégories (Admin)
 * @route   PUT /api/categories/reorder
 * @access  Private/Admin
 */
const reorderCategories = asyncHandler(async (req, res) => {
  const { ordres } = req.body; // [{ id: 1, ordre: 0 }, { id: 2, ordre: 1 }, ...]

  if (!Array.isArray(ordres)) {
    res.status(400);
    throw new Error('Format invalide');
  }

  for (const item of ordres) {
    await Categorie.update(
      { ordre: item.ordre },
      { where: { id: item.id } }
    );
  }

  res.json({
    success: true,
    message: 'Ordre mis à jour'
  });
});

module.exports = {
  getCategories,
  getCategorie,
  createCategorie,
  updateCategorie,
  deleteCategorie,
  reorderCategories
};
