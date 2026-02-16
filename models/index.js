const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

// Import des modèles
const User = require('./User');
const Categorie = require('./Categorie');
const Plat = require('./Plat');
const Commande = require('./Commande');
const CommandeItem = require('./CommandeItem');
const CommandeHistorique = require('./CommandeHistorique');
const Livraison = require('./Livraison');
const Promotion = require('./Promotion');
const PromotionUsage = require('./PromotionUsage');
const Avis = require('./Avis');
const Notification = require('./Notification');
const Litige = require('./Litige');
const Favori = require('./Favori');
const Conversation = require('./Conversation');
const Message = require('./Message');
const LoyaltyTransaction = require('./LoyaltyTransaction');
const PushSubscription = require('./PushSubscription');
const Referral = require('./Referral')(sequelize, DataTypes);
const Badge = require('./Badge')(sequelize, DataTypes);
const UserBadge = require('./UserBadge')(sequelize, DataTypes);
const Subscription = require('./Subscription');
const GiftCard = require('./GiftCard');

// ═══════════════════════════════════════════════════════════════
// ASSOCIATIONS
// ═══════════════════════════════════════════════════════════════

// User - PushSubscription
User.hasMany(PushSubscription, {
  foreignKey: 'userId',
  as: 'pushSubscriptions'
});
PushSubscription.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// User - LoyaltyTransaction
User.hasMany(LoyaltyTransaction, {
  foreignKey: 'clientId',
  as: 'loyaltyTransactions'
});
LoyaltyTransaction.belongsTo(User, {
  foreignKey: 'clientId',
  as: 'client'
});

// User - Plat (Prestataire crée des plats)
User.hasMany(Plat, {
  foreignKey: 'prestataireId',
  as: 'plats'
});
Plat.belongsTo(User, {
  foreignKey: 'prestataireId',
  as: 'prestataire'
});

// Categorie - Plat
Categorie.hasMany(Plat, {
  foreignKey: 'categorieId',
  as: 'plats'
});
Plat.belongsTo(Categorie, {
  foreignKey: 'categorieId',
  as: 'categorie'
});

// User - Commande (Client passe des commandes)
User.hasMany(Commande, {
  foreignKey: 'clientId',
  as: 'commandesClient'
});
Commande.belongsTo(User, {
  foreignKey: 'clientId',
  as: 'client'
});

// User - Commande (Prestataire reçoit des commandes)
User.hasMany(Commande, {
  foreignKey: 'prestataireId',
  as: 'commandesPrestataire'
});
Commande.belongsTo(User, {
  foreignKey: 'prestataireId',
  as: 'prestataire'
});

// Commande - CommandeItem
Commande.hasMany(CommandeItem, {
  foreignKey: 'commandeId',
  as: 'items',
  onDelete: 'CASCADE'
});
CommandeItem.belongsTo(Commande, {
  foreignKey: 'commandeId',
  as: 'commande'
});

// Plat - CommandeItem
Plat.hasMany(CommandeItem, {
  foreignKey: 'platId',
  as: 'commandeItems'
});
CommandeItem.belongsTo(Plat, {
  foreignKey: 'platId',
  as: 'plat'
});

// User - Promotion (Prestataire crée des promotions)
User.hasMany(Promotion, {
  foreignKey: 'prestataireId',
  as: 'promotions'
});
Promotion.belongsTo(User, {
  foreignKey: 'prestataireId',
  as: 'prestataire'
});

// Commande - Promotion
Promotion.hasMany(Commande, {
  foreignKey: 'promotionId',
  as: 'commandes'
});
Commande.belongsTo(Promotion, {
  foreignKey: 'promotionId',
  as: 'promotion'
});

// PromotionUsage associations
Promotion.hasMany(PromotionUsage, {
  foreignKey: 'promotionId',
  as: 'usages'
});
PromotionUsage.belongsTo(Promotion, {
  foreignKey: 'promotionId',
  as: 'promotion'
});

User.hasMany(PromotionUsage, {
  foreignKey: 'userId',
  as: 'promotionUsages'
});
PromotionUsage.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

Commande.hasOne(PromotionUsage, {
  foreignKey: 'commandeId',
  as: 'promotionUsage'
});
PromotionUsage.belongsTo(Commande, {
  foreignKey: 'commandeId',
  as: 'commande'
});

// User - Avis (Client laisse des avis)
User.hasMany(Avis, {
  foreignKey: 'clientId',
  as: 'avis'
});
Avis.belongsTo(User, {
  foreignKey: 'clientId',
  as: 'client'
});

// Plat - Avis
Plat.hasMany(Avis, {
  foreignKey: 'platId',
  as: 'avis'
});
Avis.belongsTo(Plat, {
  foreignKey: 'platId',
  as: 'plat'
});

// Commande - Avis
Commande.hasMany(Avis, {
  foreignKey: 'commandeId',
  as: 'avis'
});
Avis.belongsTo(Commande, {
  foreignKey: 'commandeId',
  as: 'commande'
});

// User - Notification
User.hasMany(Notification, {
  foreignKey: 'userId',
  as: 'notifications'
});
Notification.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// User - Favori
User.hasMany(Favori, {
  foreignKey: 'userId',
  as: 'favoris'
});
Favori.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// Plat - Favori
Plat.hasMany(Favori, {
  foreignKey: 'platId',
  as: 'favoris'
});
Favori.belongsTo(Plat, {
  foreignKey: 'platId',
  as: 'plat'
});

// Commande - Litige
Commande.hasOne(Litige, {
  foreignKey: 'commandeId',
  as: 'litige'
});
Litige.belongsTo(Commande, {
  foreignKey: 'commandeId',
  as: 'commande'
});

// User - Litige (Client ouvre un litige)
User.hasMany(Litige, {
  foreignKey: 'clientId',
  as: 'litigesClient'
});
Litige.belongsTo(User, {
  foreignKey: 'clientId',
  as: 'client'
});

// User - Litige (Prestataire concerné)
User.hasMany(Litige, {
  foreignKey: 'prestataireId',
  as: 'litigesPrestataire'
});
Litige.belongsTo(User, {
  foreignKey: 'prestataireId',
  as: 'prestataire'
});

// User - Litige (Admin en charge)
User.hasMany(Litige, {
  foreignKey: 'adminId',
  as: 'litigesAdmin'
});
Litige.belongsTo(User, {
  foreignKey: 'adminId',
  as: 'admin'
});

// Commande - CommandeHistorique
Commande.hasMany(CommandeHistorique, {
  foreignKey: 'commandeId',
  as: 'historique',
  onDelete: 'CASCADE'
});
CommandeHistorique.belongsTo(Commande, {
  foreignKey: 'commandeId',
  as: 'commande'
});

// User - CommandeHistorique (acteur du changement)
User.hasMany(CommandeHistorique, {
  foreignKey: 'acteurId',
  as: 'actionsCommandes'
});
CommandeHistorique.belongsTo(User, {
  foreignKey: 'acteurId',
  as: 'acteur'
});

// Commande - Livraison
Commande.hasOne(Livraison, {
  foreignKey: 'commandeId',
  as: 'livraison'
});
Livraison.belongsTo(Commande, {
  foreignKey: 'commandeId',
  as: 'commande'
});

// User (Livreur) - Livraison
User.hasMany(Livraison, {
  foreignKey: 'livreurId',
  as: 'livraisons'
});
Livraison.belongsTo(User, {
  foreignKey: 'livreurId',
  as: 'livreur'
});

// ═══════════════════════════════════════════════════════════════
// CHAT ASSOCIATIONS
// ═══════════════════════════════════════════════════════════════

// User - Conversation (Participant 1)
User.hasMany(Conversation, {
  foreignKey: 'participant1Id',
  as: 'conversationsAsParticipant1'
});
Conversation.belongsTo(User, {
  foreignKey: 'participant1Id',
  as: 'participant1'
});

// User - Conversation (Participant 2)
User.hasMany(Conversation, {
  foreignKey: 'participant2Id',
  as: 'conversationsAsParticipant2'
});
Conversation.belongsTo(User, {
  foreignKey: 'participant2Id',
  as: 'participant2'
});

// Commande - Conversation
Commande.hasMany(Conversation, {
  foreignKey: 'commandeId',
  as: 'conversations'
});
Conversation.belongsTo(Commande, {
  foreignKey: 'commandeId',
  as: 'commande'
});

// Conversation - Message
Conversation.hasMany(Message, {
  foreignKey: 'conversationId',
  as: 'messages',
  onDelete: 'CASCADE'
});
Message.belongsTo(Conversation, {
  foreignKey: 'conversationId',
  as: 'conversation'
});

// User - Message (Sender)
User.hasMany(Message, {
  foreignKey: 'senderId',
  as: 'sentMessages'
});
Message.belongsTo(User, {
  foreignKey: 'senderId',
  as: 'sender'
});

// User - Message (Receiver)
User.hasMany(Message, {
  foreignKey: 'receiverId',
  as: 'receivedMessages'
});
Message.belongsTo(User, {
  foreignKey: 'receiverId',
  as: 'receiver'
});

// ═══════════════════════════════════════════════════════════════
// REFERRAL ASSOCIATIONS
// ═══════════════════════════════════════════════════════════════

// User - Referral (Parrain)
User.hasMany(Referral, {
  foreignKey: 'referrerId',
  as: 'referralsAsReferrer'
});
Referral.belongsTo(User, {
  foreignKey: 'referrerId',
  as: 'referrer'
});

// User - Referral (Filleul)
User.hasMany(Referral, {
  foreignKey: 'refereeId',
  as: 'referralsAsReferee'
});
Referral.belongsTo(User, {
  foreignKey: 'refereeId',
  as: 'referee'
});

// ═══════════════════════════════════════════════════════════════
// BADGE ASSOCIATIONS
// ═══════════════════════════════════════════════════════════════

// User - UserBadge
User.hasMany(UserBadge, {
  foreignKey: 'userId',
  as: 'userBadges'
});
UserBadge.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// Badge - UserBadge
Badge.hasMany(UserBadge, {
  foreignKey: 'badgeId',
  as: 'userBadges'
});
UserBadge.belongsTo(Badge, {
  foreignKey: 'badgeId',
  as: 'badge'
});

// User - Subscription (client)
User.hasMany(Subscription, {
  foreignKey: 'clientId',
  as: 'subscriptions'
});
Subscription.belongsTo(User, {
  foreignKey: 'clientId',
  as: 'client'
});

// User - Subscription (prestataire)
Subscription.belongsTo(User, {
  foreignKey: 'prestataireId',
  as: 'prestataire'
});

// Plat - Subscription
Plat.hasMany(Subscription, {
  foreignKey: 'platId',
  as: 'subscriptions'
});
Subscription.belongsTo(Plat, {
  foreignKey: 'platId',
  as: 'plat'
});

// User - GiftCard (acheteur)
User.hasMany(GiftCard, {
  foreignKey: 'acheteurId',
  as: 'giftCardsPurchased'
});
GiftCard.belongsTo(User, {
  foreignKey: 'acheteurId',
  as: 'acheteur'
});

// User - GiftCard (bénéficiaire)
User.hasMany(GiftCard, {
  foreignKey: 'beneficiaireId',
  as: 'giftCardsReceived'
});
GiftCard.belongsTo(User, {
  foreignKey: 'beneficiaireId',
  as: 'beneficiaire'
});

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════

module.exports = {
  sequelize,
  User,
  Categorie,
  Plat,
  Commande,
  CommandeItem,
  CommandeHistorique,
  Livraison,
  Promotion,
  PromotionUsage,
  Avis,
  Notification,
  Litige,
  Favori,
  Conversation,
  Message,
  LoyaltyTransaction,
  PushSubscription,
  Referral,
  Badge,
  UserBadge,
  Subscription,
  GiftCard
};

