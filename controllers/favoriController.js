const { Favori, Plat, Categorie, User } = require('../models');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { paginate, paginationResponse } = require('../utils/helpers');

/**
 * @desc    Obtenir mes favoris
 * @route   GET /api/favoris
 * @access  Private
 */
const getMesFavoris = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const { limit: limitNum, offset, page: pageNum } = paginate(page, limit);

  const { count, rows: favoris } = await Favori.findAndCountAll({
    where: { userId: req.user.id },
    include: [{
      model: Plat,
      as: 'plat',
      where: { isDeleted: false },
      include: [
        { model: Categorie, as: 'categorie', attributes: ['id', 'nom', 'slug'] },
        { model: User, as: 'prestataire', attributes: ['id', 'nomEtablissement'] }
      ]
    }],
    order: [['createdAt', 'DESC']],
    limit: limitNum,
    offset
  });

  // Extraire juste les plats
  const plats = favoris.map(f => ({
    ...f.plat.toJSON(),
    favoriId: f.id,
    ajouteFavoriLe: f.createdAt
  }));

  res.json({
    success: true,
    ...paginationResponse(plats, count, pageNum, limitNum)
  });
});

/**
 * @desc    Ajouter un plat aux favoris
 * @route   POST /api/favoris/:platId
 * @access  Private
 */
const ajouterFavori = asyncHandler(async (req, res) => {
  const { platId } = req.params;

  // Vérifier que le plat existe
  const plat = await Plat.findOne({
    where: { id: platId, isDeleted: false }
  });

  if (!plat) {
    res.status(404);
    throw new Error('Plat non trouvé');
  }

  // Vérifier si déjà en favori
  const existing = await Favori.findOne({
    where: { userId: req.user.id, platId }
  });

  if (existing) {
    res.status(400);
    throw new Error('Ce plat est déjà dans vos favoris');
  }

  const favori = await Favori.create({
    userId: req.user.id,
    platId
  });

  res.status(201).json({
    success: true,
    message: 'Plat ajouté aux favoris',
    data: favori
  });
});

/**
 * @desc    Retirer un plat des favoris
 * @route   DELETE /api/favoris/:platId
 * @access  Private
 */
const retirerFavori = asyncHandler(async (req, res) => {
  const { platId } = req.params;

  const favori = await Favori.findOne({
    where: { userId: req.user.id, platId }
  });

  if (!favori) {
    res.status(404);
    throw new Error('Ce plat n\'est pas dans vos favoris');
  }

  await favori.destroy();

  res.json({
    success: true,
    message: 'Plat retiré des favoris'
  });
});

/**
 * @desc    Vérifier si un plat est en favori
 * @route   GET /api/favoris/check/:platId
 * @access  Private
 */
const checkFavori = asyncHandler(async (req, res) => {
  const { platId } = req.params;

  const favori = await Favori.findOne({
    where: { userId: req.user.id, platId }
  });

  res.json({
    success: true,
    data: { isFavorite: !!favori }
  });
});

module.exports = {
  getMesFavoris,
  ajouterFavori,
  retirerFavori,
  checkFavori
};
