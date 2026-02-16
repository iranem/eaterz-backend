// Rôles utilisateurs
const ROLES = {
  CLIENT: 'client',
  PRESTATAIRE: 'prestataire',
  LIVREUR: 'livreur',
  ADMIN: 'admin'
};

// Types de Prestataire
const PRESTATAIRE_TYPES = {
  RESTAURANT: 'restaurant',
  BOUTIQUE: 'boutique',
  MIXTE: 'mixte'
};

// Statuts de commande
const ORDER_STATUS = {
  PENDING: 'en_attente',
  CONFIRMED: 'confirmee',
  PREPARING: 'en_preparation',
  READY: 'prete',
  DELIVERING: 'en_livraison',
  DELIVERED: 'livree',
  CANCELLED: 'annulee'
};

// Statuts de paiement
const PAYMENT_STATUS = {
  PENDING: 'en_attente',
  PROCESSING: 'en_cours',
  SUCCESS: 'reussi',
  FAILED: 'echoue',
  REFUNDED: 'rembourse'
};

// Modes de paiement
const PAYMENT_MODES = {
  CIB: 'cib',
  EDAHABIA: 'edahabia',
  CASH: 'especes'
};

// Statuts de litige
const DISPUTE_STATUS = {
  OPEN: 'ouvert',
  IN_PROGRESS: 'en_cours',
  RESOLVED: 'resolu',
  CLOSED: 'ferme'
};

// Motifs de refus de commande
const ORDER_REJECTION_REASONS = {
  OUT_OF_STOCK: 'rupture_stock',
  TOO_BUSY: 'trop_occupe',
  OUTSIDE_HOURS: 'hors_horaires',
  DELIVERY_ZONE: 'zone_non_desservie',
  OTHER: 'autre'
};

// Statuts du livreur
const LIVREUR_STATUS = {
  AVAILABLE: 'disponible',
  BUSY: 'occupe',
  OFFLINE: 'hors_ligne'
};

// Statuts de livraison
const DELIVERY_STATUS = {
  PENDING: 'en_attente',       // Commande prête, pas encore assignée
  ASSIGNED: 'assignee',        // Assignée à un livreur
  PICKED_UP: 'recuperee',      // Livreur a récupéré chez prestataire
  IN_TRANSIT: 'en_cours',      // En route vers client
  DELIVERED: 'livree',         // Livrée au client
  FAILED: 'echouee'            // Échec de livraison
};

// Commission livreur (5%)
const LIVREUR_COMMISSION_RATE = 0.05;

// Types de promotion
const PROMO_TYPES = {
  PERCENTAGE: 'pourcentage',
  FIXED: 'montant_fixe',
  FREE_DELIVERY: 'livraison_gratuite'
};

// Types de notification
const NOTIFICATION_TYPES = {
  ORDER_NEW: 'nouvelle_commande',
  ORDER_STATUS: 'statut_commande',
  PROMO: 'promotion',
  REVIEW: 'avis',
  DISPUTE: 'litige',
  SYSTEM: 'systeme',
  DELIVERY: 'livraison',
  PAYMENT: 'paiement',
  MESSAGE: 'message',
  WELCOME: 'bienvenue'
};

// Allergènes courants
const ALLERGENS = [
  'gluten',
  'crustaces',
  'oeufs',
  'poisson',
  'arachides',
  'soja',
  'lait',
  'fruits_a_coque',
  'celeri',
  'moutarde',
  'sesame',
  'sulfites',
  'lupin',
  'mollusques'
];

// Langues supportées
const LANGUAGES = ['fr', 'en', 'ar'];

// Pagination par défaut
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

module.exports = {
  ROLES,
  PRESTATAIRE_TYPES,
  ORDER_STATUS,
  PAYMENT_STATUS,
  PAYMENT_MODES,
  DISPUTE_STATUS,
  ORDER_REJECTION_REASONS,
  LIVREUR_STATUS,
  DELIVERY_STATUS,
  LIVREUR_COMMISSION_RATE,
  PROMO_TYPES,
  NOTIFICATION_TYPES,
  ALLERGENS,
  LANGUAGES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE
};
