const logger = require('../config/logger');

/**
 * Middleware de gestion des erreurs 404
 */
const notFound = (req, res, next) => {
  const error = new Error(`Route non trouvée - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Middleware de gestion globale des erreurs
 */
const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.logError(err, req);

  // Déterminer le code de statut
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;

  // Erreurs Sequelize
  if (err.name === 'SequelizeValidationError') {
    statusCode = 400;
    message = err.errors.map(e => e.message).join(', ');
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 400;
    const field = err.errors[0]?.path || 'champ';
    message = `Ce ${field} est déjà utilisé.`;
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 400;
    message = 'Référence invalide. La ressource liée n\'existe pas.';
  }

  if (err.name === 'SequelizeDatabaseError') {
    statusCode = 500;
    message = 'Erreur de base de données.';
  }

  // Erreurs JWT
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Token invalide.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expiré.';
  }

  // Erreur Multer (upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    message = 'Fichier trop volumineux. Taille maximale: 5MB.';
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    statusCode = 400;
    message = 'Type de fichier non autorisé.';
  }

  // Erreur de validation express-validator
  if (err.array && typeof err.array === 'function') {
    statusCode = 400;
    message = err.array().map(e => e.msg).join(', ');
  }

  // Réponse d'erreur
  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      error: err
    })
  });
};

/**
 * Wrapper pour les fonctions async (évite les try-catch répétitifs)
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { notFound, errorHandler, asyncHandler };
