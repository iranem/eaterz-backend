const { User, Commande, Plat, Avis } = require('../models');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { deleteFile } = require('../middleware/uploadMiddleware');
const { paginate, paginationResponse } = require('../utils/helpers');
const { ROLES } = require('../utils/constants');
const { Op } = require('sequelize');
const { logAdminAction, AUDIT_ACTIONS } = require('../utils/auditLogger');

/**
 * @desc    Obtenir le profil de l'utilisateur connecté
 * @route   GET /api/users/profile
 * @access  Private
 */
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id, {
    attributes: { exclude: ['password'] }
  });

  res.json({
    success: true,
    data: user
  });
});

/**
 * @desc    Mettre à jour le profil
 * @route   PUT /api/users/profile
 * @access  Private
 */
const updateProfile = asyncHandler(async (req, res) => {
  const allowedFields = [
    'nom', 'prenom', 'telephone', 'adresse', 'ville', 'codePostal',
    'langue', 'theme', 'notificationsEmail', 'notificationsPush'
  ];

  // Champs supplémentaires pour les prestataires
  if (req.user.role === ROLES.PRESTATAIRE) {
    allowedFields.push(
      'nomEtablissement', 'descriptionEtablissement',
      'horairesOuverture', 'zonesLivraison', 'prestataireType'
    );
  }

  const updates = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  await req.user.update(updates);

  res.json({
    success: true,
    message: 'Profil mis à jour',
    data: req.user.toJSON()
  });
});

/**
 * @desc    Changer le mot de passe
 * @route   PUT /api/users/profile/password
 * @access  Private
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // Vérifier le mot de passe actuel
  const user = await User.findByPk(req.user.id);
  const isMatch = await user.comparePassword(currentPassword);

  if (!isMatch) {
    res.status(400);
    throw new Error('Mot de passe actuel incorrect');
  }

  // Mettre à jour le mot de passe
  await user.update({
    password: newPassword,
    tokenVersion: user.tokenVersion + 1 // Invalider les sessions
  });

  res.json({
    success: true,
    message: 'Mot de passe modifié avec succès'
  });
});

/**
 * @desc    Upload avatar
 * @route   PUT /api/users/profile/avatar
 * @access  Private
 */
const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Veuillez fournir une image');
  }

  // Supprimer l'ancien avatar si existant
  if (req.user.avatar) {
    deleteFile(req.user.avatar);
  }

  const avatarPath = `/uploads/avatars/${req.file.filename}`;
  await req.user.update({ avatar: avatarPath });

  res.json({
    success: true,
    message: 'Avatar mis à jour',
    data: { avatar: avatarPath }
  });
});

/**
 * @desc    Supprimer son compte
 * @route   DELETE /api/users/profile
 * @access  Private
 */
const deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;

  // Vérifier le mot de passe
  const user = await User.findByPk(req.user.id);
  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    res.status(400);
    throw new Error('Mot de passe incorrect');
  }

  // Soft delete - désactiver le compte
  await user.update({ isActive: false });

  res.json({
    success: true,
    message: 'Compte désactivé avec succès'
  });
});

/**
 * @desc    Obtenir la liste publique des prestataires
 * @route   GET /api/users/prestataires/public
 * @access  Public
 */
const getPublicPrestataires = asyncHandler(async (req, res) => {
  const { type, search } = req.query;

  const where = {
    role: ROLES.PRESTATAIRE,
    isActive: true,
    isVerified: true
  };

  if (type && type !== 'all') {
    where.prestataireType = type;
  }

  if (search) {
    where[Op.or] = [
      { nomEtablissement: { [Op.like]: `%${search}%` } },
      { descriptionEtablissement: { [Op.like]: `%${search}%` } },
      { ville: { [Op.like]: `%${search}%` } }
    ];
  }

  const limit = 50;

  const prestataires = await User.findAll({
    where,
    limit,
    attributes: [
      'id', 'nomEtablissement', 'descriptionEtablissement', 'avatar',
      'adresse', 'ville', 'horairesOuverture', 'prestataireType',
      'positionActuelle', 'createdAt'
    ]
  });

  // Mapper les données pour le frontend
  const formattedPrestataires = prestataires.map(p => {
    // Générer des coordonnées aléatoires si manquantes (pour la démo)
    let lat = 36.7538;
    let lng = 3.0588;

    if (p.positionActuelle && p.positionActuelle.lat) {
      lat = p.positionActuelle.lat;
      lng = p.positionActuelle.lng;
    } else {
      // Disperser autour d'Alger
      lat += (Math.random() - 0.5) * 0.1;
      lng += (Math.random() - 0.5) * 0.1;
    }

    return {
      id: p.id,
      name: p.nomEtablissement || 'Prestataire',
      description: p.descriptionEtablissement || '',
      image: p.avatar || 'https://via.placeholder.com/300',
      rating: (4 + Math.random()).toFixed(1), // Mock rating pour l'instant
      reviewCount: Math.floor(Math.random() * 200), // Mock count
      category: p.prestataireType === 'restaurant' ? 'Cuisine' : 'Produits',
      deliveryTime: '30-45',
      deliveryFee: 150,
      isOpen: true, // À implémenter avec horairesOuverture
      isNew: new Date() - new Date(p.createdAt) < 30 * 24 * 60 * 60 * 1000,
      isFeatured: Math.random() > 0.8,
      address: `${p.adresse || ''}, ${p.ville || ''}`,
      type: p.prestataireType || 'restaurant',
      coordinates: { lat, lng }
    };
  });

  res.json({
    success: true,
    count: formattedPrestataires.length,
    data: formattedPrestataires
  });
});

// ═══════════════════════════════════════════════════════════════
// ROUTES ADMIN
// ═══════════════════════════════════════════════════════════════

/**
 * @desc    Liste tous les utilisateurs (Admin)
 * @route   GET /api/users
 * @access  Private/Admin
 */
const getAllUsers = asyncHandler(async (req, res) => {
  const { page, limit } = paginate(req.query.page, req.query.limit);
  const { role, isActive, isVerified, search, sortBy, sortOrder } = req.query;

  // Construire les filtres
  const where = {};

  if (role) where.role = role;
  if (isActive !== undefined) where.isActive = isActive === 'true';
  if (isVerified !== undefined) where.isVerified = isVerified === 'true';

  if (search) {
    where[Op.or] = [
      { nom: { [Op.like]: `%${search}%` } },
      { prenom: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
      { nomEtablissement: { [Op.like]: `%${search}%` } }
    ];
  }

  // Tri
  const order = [];
  if (sortBy) {
    order.push([sortBy, sortOrder === 'desc' ? 'DESC' : 'ASC']);
  } else {
    order.push(['createdAt', 'DESC']);
  }

  const { count, rows: users } = await User.findAndCountAll({
    where,
    attributes: { exclude: ['password'] },
    order,
    limit,
    offset: (page - 1) * limit
  });

  res.json({
    success: true,
    ...paginationResponse(users, count, page, limit)
  });
});

/**
 * @desc    Obtenir un utilisateur par ID (Admin)
 * @route   GET /api/users/:id
 * @access  Private/Admin
 */
const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id, {
    attributes: { exclude: ['password'] }
  });

  if (!user) {
    res.status(404);
    throw new Error('Utilisateur non trouvé');
  }

  // Ajouter des statistiques si prestataire
  let stats = null;
  if (user.role === ROLES.PRESTATAIRE) {
    const [platsCount, commandesCount, avisCount] = await Promise.all([
      Plat.count({ where: { prestataireId: user.id, isDeleted: false } }),
      Commande.count({ where: { prestataireId: user.id } }),
      Avis.count({
        include: [{
          model: Plat,
          as: 'plat',
          where: { prestataireId: user.id }
        }]
      })
    ]);
    stats = { platsCount, commandesCount, avisCount };
  }

  res.json({
    success: true,
    data: { user, stats }
  });
});

/**
 * @desc    Modifier un utilisateur (Admin)
 * @route   PUT /api/users/:id
 * @access  Private/Admin
 */
const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('Utilisateur non trouvé');
  }

  const allowedFields = [
    'nom', 'prenom', 'telephone', 'adresse', 'ville', 'codePostal',
    'role', 'isVerified', 'isActive', 'nomEtablissement',
    'descriptionEtablissement', 'horairesOuverture', 'zonesLivraison', 'prestataireType'
  ];

  const updates = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  await user.update(updates);

  res.json({
    success: true,
    message: 'Utilisateur mis à jour',
    data: user.toJSON()
  });
});

/**
 * @desc    Changer le statut d'un utilisateur (Admin)
 * @route   PUT /api/users/:id/status
 * @access  Private/Admin
 */
const updateUserStatus = asyncHandler(async (req, res) => {
  const { isActive } = req.body;

  const user = await User.findByPk(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('Utilisateur non trouvé');
  }

  // Ne pas permettre de désactiver un admin par un autre admin
  if (user.role === ROLES.ADMIN && !isActive) {
    res.status(403);
    throw new Error('Impossible de désactiver un administrateur');
  }

  const previousStatus = user.isActive;
  await user.update({ isActive });

  // Audit log
  logAdminAction({
    adminId: req.user.id,
    adminEmail: req.user.email,
    action: AUDIT_ACTIONS.USER_STATUS_CHANGE,
    targetType: 'user',
    targetId: user.id,
    details: { previousStatus, newStatus: isActive, userEmail: user.email },
    ip: req.ip
  });

  res.json({
    success: true,
    message: `Compte ${isActive ? 'activé' : 'désactivé'}`,
    data: user.toJSON()
  });
});

/**
 * @desc    Supprimer un utilisateur (Admin)
 * @route   DELETE /api/users/:id
 * @access  Private/Admin
 */
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('Utilisateur non trouvé');
  }

  // Ne pas permettre de supprimer un admin
  if (user.role === ROLES.ADMIN) {
    res.status(403);
    throw new Error('Impossible de supprimer un administrateur');
  }

  // Soft delete
  await user.update({ isActive: false });

  // Audit log
  logAdminAction({
    adminId: req.user.id,
    adminEmail: req.user.email,
    action: AUDIT_ACTIONS.USER_DELETE,
    targetType: 'user',
    targetId: user.id,
    details: { userEmail: user.email, userRole: user.role },
    ip: req.ip
  });

  res.json({
    success: true,
    message: 'Utilisateur supprimé'
  });
});

/**
 * @desc    Réinitialiser le mot de passe d'un utilisateur (Admin)
 * @route   POST /api/users/:id/reset-password
 * @access  Private/Admin
 */
const adminResetPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;

  const user = await User.findByPk(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('Utilisateur non trouvé');
  }

  await user.update({
    password: newPassword,
    tokenVersion: user.tokenVersion + 1
  });

  // Audit log - critical security action
  logAdminAction({
    adminId: req.user.id,
    adminEmail: req.user.email,
    action: AUDIT_ACTIONS.PASSWORD_RESET,
    targetType: 'user',
    targetId: user.id,
    details: { userEmail: user.email, userRole: user.role },
    ip: req.ip
  });

  res.json({
    success: true,
    message: 'Mot de passe réinitialisé'
  });
});

module.exports = {
  getPublicPrestataires,
  getProfile,
  updateProfile,
  changePassword,
  uploadAvatar,
  deleteAccount,
  getAllUsers,
  getUserById,
  updateUser,
  updateUserStatus,
  deleteUser,
  adminResetPassword
};
