/**
 * Job CRON pour le traitement des commandes récurrentes (abonnements)
 * Exécute les abonnements actifs et génère automatiquement les commandes
 */
const cron = require('node-cron');
const { Op } = require('sequelize');
const { Subscription, Commande, CommandeItem, Plat, User, Notification } = require('../models');
const { sendPushToUser } = require('./pushService');
const { getIO } = require('../config/socket');
const { generateOrderNumber } = require('../utils/helpers');
const logger = require('../config/logger');

/**
 * Traiter les abonnements dont l'heure de commande est arrivée
 */
const processSubscriptions = async () => {
    try {
        const now = new Date();

        // Reprendre les abonnements pausés dont la pause est terminée
        await Subscription.update(
            { statut: 'active', pausedUntil: null },
            {
                where: {
                    statut: 'paused',
                    pausedUntil: { [Op.lte]: now },
                },
            }
        );

        // Trouver les abonnements à traiter
        const subscriptionsToProcess = await Subscription.findAll({
            where: {
                statut: 'active',
                prochaineCommande: { [Op.lte]: now },
                [Op.or]: [
                    { dateFin: null },
                    { dateFin: { [Op.gt]: now } },
                ],
            },
            include: [
                { model: User, as: 'client', attributes: ['id', 'prenom', 'nom', 'email'] },
                { model: Plat, as: 'plat' },
                { model: User, as: 'prestataire', attributes: ['id', 'nom'] },
            ],
        });

        if (subscriptionsToProcess.length === 0) return;

        logger.info(`[SubscriptionJob] Traitement de ${subscriptionsToProcess.length} abonnements`);
        const io = getIO();

        for (const sub of subscriptionsToProcess) {
            try {
                // Préparer les items de commande
                let items = [];
                let prestataireId = sub.prestataireId;
                let sousTotal = 0;

                if (sub.type === 'plat' && sub.plat) {
                    items = [{
                        platId: sub.plat.id,
                        quantite: 1,
                        prixUnitaire: sub.plat.prixPromo || sub.plat.prix,
                    }];
                    prestataireId = sub.plat.prestataireId;
                    sousTotal = sub.plat.prixPromo || sub.plat.prix;
                } else if (sub.type === 'panier' && sub.panierItems) {
                    for (const item of sub.panierItems) {
                        const plat = await Plat.findByPk(item.platId);
                        if (plat && plat.disponible) {
                            const prix = plat.prixPromo || plat.prix;
                            items.push({
                                platId: plat.id,
                                quantite: item.quantite || 1,
                                prixUnitaire: prix,
                            });
                            sousTotal += prix * (item.quantite || 1);
                            if (!prestataireId) prestataireId = plat.prestataireId;
                        }
                    }
                }

                if (items.length === 0) {
                    logger.warn(`[SubscriptionJob] Aucun item pour abonnement #${sub.id}`);
                    continue;
                }

                // Créer la commande
                const fraisLivraison = 200;
                const total = sousTotal + fraisLivraison;

                const commande = await Commande.create({
                    numero: generateOrderNumber(),
                    clientId: sub.clientId,
                    prestataireId,
                    sousTotal,
                    fraisLivraison,
                    total,
                    adresseLivraison: sub.adresseLivraison,
                    villeLivraison: sub.villeLivraison,
                    telephoneLivraison: sub.telephoneLivraison,
                    modePaiement: sub.modePaiement,
                    typeCommande: 'plats',
                    modeLivraison: 'immediat',
                    isScheduled: false,
                    notesClient: `Commande automatique - Abonnement #${sub.id}`,
                });

                // Créer les items de commande
                for (const item of items) {
                    await CommandeItem.create({
                        commandeId: commande.id,
                        platId: item.platId,
                        quantite: item.quantite,
                        prixUnitaire: item.prixUnitaire,
                    });
                }

                // Calculer prochaine commande
                const { calculateNextOrderDate } = require('../controllers/subscriptionController');
                const prochaineCommande = calculateNextOrderDate(
                    sub.frequence,
                    sub.joursSemaine,
                    sub.heureLivraison
                );

                // Mettre à jour l'abonnement
                await sub.update({
                    nombreCommandes: sub.nombreCommandes + 1,
                    derniereCommande: now,
                    prochaineCommande,
                });

                // Notifications
                await Notification.create({
                    userId: sub.clientId,
                    type: 'commande',
                    titre: '🔄 Commande automatique créée',
                    message: `Votre commande récurrente #${commande.numero} a été passée.`,
                    data: { commandeId: commande.id, subscriptionId: sub.id },
                });

                await sendPushToUser(sub.clientId, {
                    title: '🔄 Commande automatique',
                    body: `Commande #${commande.numero} passée !`,
                    icon: '/icons/icon-192x192.png',
                    data: { url: `/client/orders/${commande.id}` },
                });

                // Notifier le prestataire
                if (io) {
                    io.to(`user_${prestataireId}`).emit('commande:nouvelle', {
                        commandeId: commande.id,
                        numero: commande.numero,
                    });
                }

                logger.info(`[SubscriptionJob] Commande #${commande.numero} créée pour abonnement #${sub.id}`);

            } catch (err) {
                logger.error(`[SubscriptionJob] Erreur abonnement #${sub.id}:`, err);
            }
        }
    } catch (error) {
        logger.error('[SubscriptionJob] Erreur globale:', error);
    }
};

/**
 * Initialiser le job CRON des abonnements
 */
const initSubscriptionJob = () => {
    // Toutes les 15 minutes - Vérifier les abonnements à traiter
    cron.schedule('*/15 * * * *', async () => {
        logger.debug('[SubscriptionJob] Exécution du job');
        await processSubscriptions();
    });

    logger.info('[SubscriptionJob] Job CRON initialisé - Intervalle: 15 minutes');
};

module.exports = {
    initSubscriptionJob,
    processSubscriptions,
};
