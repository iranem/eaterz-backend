const crypto = require('crypto');

/**
 * Génère un numéro de commande unique
 * Format: EAT-YYYYMMDD-XXXX
 */
const generateOrderNumber = () => {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const randomStr = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `EAT-${dateStr}-${randomStr}`;
};

/**
 * Génère un code de vérification email
 */
const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Génère un code de réinitialisation de mot de passe
 */
const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Génère un code promo aléatoire
 */
const generatePromoCode = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/**
 * Calcule la distance entre deux points GPS (formule Haversine)
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Rayon de la Terre en km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (deg) => deg * (Math.PI / 180);

/**
 * Formate un prix en DZD
 */
const formatPrice = (price) => {
  return new Intl.NumberFormat('fr-DZ', {
    style: 'currency',
    currency: 'DZD',
    minimumFractionDigits: 0
  }).format(price);
};

/**
 * Valide un numéro de téléphone algérien
 */
const isValidAlgerianPhone = (phone) => {
  const regex = /^(0)(5|6|7)[0-9]{8}$/;
  return regex.test(phone.replace(/\s/g, ''));
};

/**
 * Valide un numéro de carte CIB (19 chiffres commençant par 6)
 */
const isValidCIBCard = (cardNumber) => {
  const cleaned = cardNumber.replace(/\s/g, '');
  return /^6[0-9]{18}$/.test(cleaned);
};

/**
 * Valide un numéro de carte EDAHABIA (16 chiffres)
 */
const isValidEdahabiaCard = (cardNumber) => {
  const cleaned = cardNumber.replace(/\s/g, '');
  return /^[0-9]{16}$/.test(cleaned);
};

/**
 * Nettoie et formate une chaîne pour la recherche
 */
const sanitizeSearchQuery = (query) => {
  return query
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\u0600-\u06FF\s]/g, ''); // Garde lettres, chiffres et arabe
};

/**
 * Pagine les résultats
 */
const paginate = (page = 1, limit = 12) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;
  return { limit: limitNum, offset, page: pageNum };
};

/**
 * Formate la réponse de pagination
 */
const paginationResponse = (data, count, page, limit) => {
  const totalPages = Math.ceil(count / limit);
  return {
    data,
    pagination: {
      total: count,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
};

/**
 * Masque partiellement un email
 */
const maskEmail = (email) => {
  const [name, domain] = email.split('@');
  const maskedName = name.charAt(0) + '*'.repeat(name.length - 2) + name.charAt(name.length - 1);
  return `${maskedName}@${domain}`;
};

/**
 * Génère un slug à partir d'un texte
 */
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

module.exports = {
  generateOrderNumber,
  generateVerificationToken,
  generateResetToken,
  generatePromoCode,
  calculateDistance,
  formatPrice,
  isValidAlgerianPhone,
  isValidCIBCard,
  isValidEdahabiaCard,
  sanitizeSearchQuery,
  paginate,
  paginationResponse,
  maskEmail,
  slugify
};
