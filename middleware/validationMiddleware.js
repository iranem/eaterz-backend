const { validationResult } = require('express-validator');

/**
 * Middleware de validation des requêtes
 * À utiliser après les règles de validation express-validator
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Erreurs de validation',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  
  next();
};

/**
 * Règles de validation communes
 */
const { body, param, query } = require('express-validator');

// Validation email
const emailRules = body('email')
  .trim()
  .isEmail()
  .withMessage('Email invalide')
  .normalizeEmail();

// Validation mot de passe
const passwordRules = body('password')
  .isLength({ min: 8 })
  .withMessage('Le mot de passe doit contenir au moins 8 caractères')
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  .withMessage('Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre');

// Validation téléphone algérien
const phoneRules = body('telephone')
  .optional()
  .matches(/^(0)(5|6|7)[0-9]{8}$/)
  .withMessage('Numéro de téléphone algérien invalide');

// Validation ID MongoDB/Sequelize
const idParamRules = param('id')
  .isInt({ min: 1 })
  .withMessage('ID invalide');

// Validation pagination
const paginationRules = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Numéro de page invalide'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limite invalide (1-50)')
];

// Validation prix
const priceRules = body('prix')
  .isFloat({ min: 0 })
  .withMessage('Le prix doit être un nombre positif');

// Validation note (1-5)
const ratingRules = body('note')
  .isInt({ min: 1, max: 5 })
  .withMessage('La note doit être entre 1 et 5');

// Validation langue
const langRules = query('lang')
  .optional()
  .isIn(['fr', 'en', 'ar'])
  .withMessage('Langue invalide (fr, en, ar)');

module.exports = {
  validate,
  emailRules,
  passwordRules,
  phoneRules,
  idParamRules,
  paginationRules,
  priceRules,
  ratingRules,
  langRules
};
