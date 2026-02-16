const { ROLES } = require('../utils/constants');

/**
 * Middleware de vérification des rôles
 * @param  {...string} allowedRoles - Rôles autorisés
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé. Permissions insuffisantes.'
      });
    }

    next();
  };
};

/**
 * Vérifie si l'utilisateur est un client
 */
const isClient = (req, res, next) => {
  if (!req.user || req.user.role !== ROLES.CLIENT) {
    return res.status(403).json({
      success: false,
      message: 'Accès réservé aux clients.'
    });
  }
  next();
};

/**
 * Vérifie si l'utilisateur est un prestataire
 */
const isPrestataire = (req, res, next) => {
  if (!req.user || req.user.role !== ROLES.PRESTATAIRE) {
    return res.status(403).json({
      success: false,
      message: 'Accès réservé aux prestataires.'
    });
  }
  next();
};

/**
 * Vérifie si l'utilisateur est un admin
 */
const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== ROLES.ADMIN) {
    return res.status(403).json({
      success: false,
      message: 'Accès réservé aux administrateurs.'
    });
  }
  next();
};

/**
 * Vérifie si l'utilisateur est le propriétaire de la ressource
 * @param {string} userIdField - Nom du champ contenant l'ID utilisateur dans les params
 */
const isOwner = (userIdField = 'userId') => {
  return (req, res, next) => {
    const resourceUserId = req.params[userIdField] || req.body[userIdField];

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise.'
      });
    }

    // Les admins peuvent accéder à toutes les ressources
    if (req.user.role === ROLES.ADMIN) {
      return next();
    }

    if (req.user.id !== parseInt(resourceUserId)) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé. Vous n\'êtes pas le propriétaire de cette ressource.'
      });
    }

    next();
  };
};

/**
 * Vérifie si l'utilisateur est propriétaire OU admin
 */
const isOwnerOrAdmin = (userIdField = 'userId') => {
  return (req, res, next) => {
    const resourceUserId = req.params[userIdField] || req.body[userIdField];

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise.'
      });
    }

    if (req.user.role === ROLES.ADMIN || req.user.id === parseInt(resourceUserId)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Accès refusé.'
    });
  };
};

/**
 * Vérifie si le compte est vérifié
 */
const isVerified = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentification requise.'
    });
  }

  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      message: 'Veuillez vérifier votre adresse email pour accéder à cette fonctionnalité.'
    });
  }

  next();
};

/**
 * Vérifie si l'utilisateur est un livreur
 */
const isLivreur = (req, res, next) => {
  if (!req.user || req.user.role !== ROLES.LIVREUR) {
    return res.status(403).json({
      success: false,
      message: 'Accès réservé aux livreurs.'
    });
  }
  next();
};

module.exports = {
  authorize,
  isClient,
  isPrestataire,
  isAdmin,
  isLivreur,
  isOwner,
  isOwnerOrAdmin,
  isVerified
};
