const { verifyAccessToken } = require('../utils/generateToken');
const { User } = require('../models');

/**
 * Middleware d'authentification JWT
 * Vérifie le token et attache l'utilisateur à la requête
 */
const authenticate = async (req, res, next) => {
  try {
    // Récupérer le token du cookie ou du header Authorization
    let token = req.cookies?.accessToken;
    
    // Fallback to Authorization header for API clients
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Accès non autorisé. Token manquant.'
      });
    }

    // Vérifier le token
    const decoded = verifyAccessToken(token);
    
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Token invalide ou expiré.'
      });
    }

    // Récupérer l'utilisateur de la base de données
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non trouvé.'
      });
    }

    // Vérifier si le compte est actif
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Compte désactivé. Contactez l\'administrateur.'
      });
    }

    // Attacher l'utilisateur à la requête
    req.user = user;
    next();
  } catch (error) {
    console.error('Erreur authentification:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'authentification.'
    });
  }
};

/**
 * Middleware optionnel d'authentification
 * Attache l'utilisateur s'il est connecté, sinon continue
 */
const optionalAuth = async (req, res, next) => {
  try {
    // Récupérer le token du cookie ou du header Authorization
    let token = req.cookies?.accessToken;
    
    // Fallback to Authorization header
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }
    
    if (!token) {
      req.user = null;
      return next();
    }
    const decoded = verifyAccessToken(token);
    
    if (decoded) {
      const user = await User.findByPk(decoded.id, {
        attributes: { exclude: ['password'] }
      });
      req.user = user && user.isActive ? user : null;
    } else {
      req.user = null;
    }
    
    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

/** Alias pour compatibilité avec les routes qui utilisent "protect" */
const protect = authenticate;

/**
 * Middleware d'autorisation par rôle (à utiliser après protect/authenticate)
 * @param  {...string} allowedRoles - Rôles autorisés (ex: 'admin', 'prestataire')
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Non authentifié.'
      });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé. Droits insuffisants.'
      });
    }
    next();
  };
};

module.exports = { authenticate, optionalAuth, protect, authorize };
