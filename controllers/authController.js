const { User } = require('../models');
const { generateTokens, verifyRefreshToken, generateAccessToken } = require('../utils/generateToken');
const { generateVerificationToken, generateResetToken } = require('../utils/helpers');
const { setAuthCookies, clearAuthCookies, setAccessTokenCookie } = require('../utils/cookieConfig');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');
const { ROLES } = require('../utils/constants');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { Op } = require('sequelize');

/**
 * @desc    Inscription d'un nouvel utilisateur
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = asyncHandler(async (req, res) => {
  const { email, password, nom, prenom, telephone, role, nomEtablissement, prestataireType } = req.body;

  // Vérifier si l'email existe déjà
  const existingUser = await User.findByEmail(email);
  if (existingUser) {
    res.status(400);
    throw new Error('Cet email est déjà utilisé');
  }

  // Valider le rôle (seul client ou prestataire peut s'inscrire)
  const allowedRoles = [ROLES.CLIENT, ROLES.PRESTATAIRE];
  const userRole = allowedRoles.includes(role) ? role : ROLES.CLIENT;

  // Générer le token de vérification
  const verificationToken = generateVerificationToken();
  const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  // Créer l'utilisateur
  const user = await User.create({
    email: email.toLowerCase(),
    password,
    nom,
    prenom,
    telephone,
    role: userRole,
    nomEtablissement: userRole === ROLES.PRESTATAIRE ? nomEtablissement : null,
    prestataireType: userRole === ROLES.PRESTATAIRE ? prestataireType : null,
    verificationToken,
    verificationTokenExpires,
    isVerified: false
  });

  // Envoyer l'email de vérification
  try {
    await sendVerificationEmail(user, verificationToken);
  } catch (error) {
    console.error('Erreur envoi email vérification:', error);
    // Ne pas bloquer l'inscription si l'email échoue
  }

  // Générer les tokens
  const tokens = generateTokens(user);

  // Set secure HttpOnly cookies
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

  res.status(201).json({
    success: true,
    message: 'Inscription réussie. Veuillez vérifier votre email.',
    data: {
      user: user.toJSON()
    }
  });
});

/**
 * @desc    Connexion utilisateur
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Trouver l'utilisateur
  const user = await User.findOne({
    where: { email: email.toLowerCase() }
  });

  if (!user) {
    res.status(401);
    throw new Error('Email ou mot de passe incorrect');
  }

  // Vérifier le mot de passe
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    res.status(401);
    throw new Error('Email ou mot de passe incorrect');
  }

  // Vérifier si le compte est actif
  if (!user.isActive) {
    res.status(403);
    throw new Error('Votre compte a été désactivé. Contactez l\'administrateur.');
  }

  // Mettre à jour la dernière connexion
  await user.update({ lastLogin: new Date() });

  // Générer les tokens
  const tokens = generateTokens(user);

  // Set secure HttpOnly cookies
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

  res.json({
    success: true,
    message: 'Connexion réussie',
    data: {
      user: user.toJSON()
    }
  });
});

/**
 * @desc    Déconnexion utilisateur
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logout = asyncHandler(async (req, res) => {
  // Incrémenter la version du token pour invalider tous les refresh tokens
  await req.user.update({
    tokenVersion: req.user.tokenVersion + 1
  });

  // Clear HttpOnly cookies
  clearAuthCookies(res);

  res.json({
    success: true,
    message: 'Déconnexion réussie'
  });
});

/**
 * @desc    Rafraîchir le token d'accès
 * @route   POST /api/auth/refresh-token
 * @access  Public
 */
const refreshToken = asyncHandler(async (req, res) => {
  // Get refresh token from cookie only (secure HttpOnly cookie)
  // Body fallback removed for security - tokens in body can be logged/leaked
  const refreshTokenValue = req.cookies.refreshToken;

  if (!refreshTokenValue) {
    res.status(401);
    throw new Error('Refresh token requis. Veuillez vous reconnecter.');
  }

  // Vérifier le refresh token
  const decoded = verifyRefreshToken(refreshTokenValue);
  if (!decoded) {
    res.status(401);
    throw new Error('Refresh token invalide ou expiré');
  }

  // Trouver l'utilisateur
  const user = await User.findByPk(decoded.id);
  if (!user) {
    res.status(401);
    throw new Error('Utilisateur non trouvé');
  }

  // Vérifier la version du token
  if (decoded.tokenVersion !== user.tokenVersion) {
    res.status(401);
    throw new Error('Token révoqué. Veuillez vous reconnecter.');
  }

  // Vérifier si le compte est actif
  if (!user.isActive) {
    res.status(403);
    throw new Error('Compte désactivé');
  }

  // Générer un nouveau access token
  const accessToken = generateAccessToken(user);

  // Set new access token cookie
  setAccessTokenCookie(res, accessToken);

  res.json({
    success: true,
    data: { accessToken }
  });
});

/**
 * @desc    Demande de réinitialisation de mot de passe
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findByEmail(email);

  // Toujours retourner succès pour éviter l'énumération d'emails
  if (!user) {
    return res.json({
      success: true,
      message: 'Si cet email existe, vous recevrez un lien de réinitialisation.'
    });
  }

  // Générer le token de réinitialisation
  const resetToken = generateResetToken();
  const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 heure

  await user.update({
    resetPasswordToken: resetToken,
    resetPasswordExpires: resetTokenExpires
  });

  // Envoyer l'email
  try {
    await sendPasswordResetEmail(user, resetToken);
  } catch (error) {
    console.error('Erreur envoi email reset:', error);
    await user.update({
      resetPasswordToken: null,
      resetPasswordExpires: null
    });
    res.status(500);
    throw new Error('Erreur lors de l\'envoi de l\'email. Réessayez plus tard.');
  }

  res.json({
    success: true,
    message: 'Si cet email existe, vous recevrez un lien de réinitialisation.'
  });
});

/**
 * @desc    Réinitialiser le mot de passe
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  // Trouver l'utilisateur avec ce token valide
  const user = await User.findOne({
    where: {
      resetPasswordToken: token,
      resetPasswordExpires: { [Op.gt]: new Date() }
    }
  });

  if (!user) {
    res.status(400);
    throw new Error('Token invalide ou expiré');
  }

  // Mettre à jour le mot de passe
  await user.update({
    password,
    resetPasswordToken: null,
    resetPasswordExpires: null,
    tokenVersion: user.tokenVersion + 1 // Invalider tous les tokens existants
  });

  res.json({
    success: true,
    message: 'Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter.'
  });
});

/**
 * @desc    Vérifier l'email
 * @route   GET /api/auth/verify-email/:token
 * @access  Public
 */
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.params;

  // Trouver l'utilisateur avec ce token
  const user = await User.findOne({
    where: {
      verificationToken: token,
      verificationTokenExpires: { [Op.gt]: new Date() }
    }
  });

  if (!user) {
    res.status(400);
    throw new Error('Token de vérification invalide ou expiré');
  }

  // Marquer comme vérifié
  await user.update({
    isVerified: true,
    verificationToken: null,
    verificationTokenExpires: null
  });

  res.json({
    success: true,
    message: 'Email vérifié avec succès'
  });
});

/**
 * @desc    Renvoyer l'email de vérification
 * @route   POST /api/auth/resend-verification
 * @access  Private
 */
const resendVerification = asyncHandler(async (req, res) => {
  const user = req.user;

  if (user.isVerified) {
    res.status(400);
    throw new Error('Votre email est déjà vérifié');
  }

  // Générer un nouveau token
  const verificationToken = generateVerificationToken();
  const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await user.update({
    verificationToken,
    verificationTokenExpires
  });

  // Envoyer l'email
  try {
    await sendVerificationEmail(user, verificationToken);
  } catch (error) {
    console.error('Erreur envoi email:', error);
    res.status(500);
    throw new Error('Erreur lors de l\'envoi de l\'email');
  }

  res.json({
    success: true,
    message: 'Email de vérification envoyé'
  });
});

/**
 * @desc    Obtenir l'utilisateur connecté
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: req.user.toJSON()
  });
});

module.exports = {
  register,
  login,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  getMe
};
