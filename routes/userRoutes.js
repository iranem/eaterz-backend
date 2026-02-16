const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate, paginationRules } = require('../middleware/validationMiddleware');
const { authenticate } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/roleMiddleware');
const { uploadAvatar } = require('../middleware/uploadMiddleware');

const {
  getProfile,
  updateProfile,
  changePassword,
  uploadAvatar: uploadAvatarController,
  deleteAccount,
  getAllUsers,
  getUserById,
  updateUser,
  updateUserStatus,
  deleteUser,
  adminResetPassword,
  getPublicPrestataires
} = require('../controllers/userController');

// Validation
const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Mot de passe actuel requis'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Le nouveau mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le mot de passe doit contenir une majuscule, une minuscule et un chiffre')
];

const idValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID invalide')
];

// Routes Publiques
router.get('/prestataires/public', getPublicPrestataires);

// Routes utilisateur connecté
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.put('/profile/password', authenticate, changePasswordValidation, validate, changePassword);
router.put('/profile/avatar', authenticate, uploadAvatar, uploadAvatarController);
router.delete('/profile', authenticate, deleteAccount);

// Routes Admin
router.get('/', authenticate, isAdmin, paginationRules, validate, getAllUsers);
router.get('/:id', authenticate, isAdmin, idValidation, validate, getUserById);
router.put('/:id', authenticate, isAdmin, idValidation, validate, updateUser);
router.put('/:id/status', authenticate, isAdmin, idValidation, validate, updateUserStatus);
router.delete('/:id', authenticate, isAdmin, idValidation, validate, deleteUser);
router.post('/:id/reset-password', authenticate, isAdmin, idValidation, validate, adminResetPassword);

module.exports = router;
