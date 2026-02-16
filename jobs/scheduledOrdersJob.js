/**
 * Job CRON pour le traitement des commandes programmées
 * Vérifie toutes les 5 minutes et active les commandes dont l'heure est arrivée
 */
const cron = require('node-cron');
const { Op } = require('sequelize');
const { Commande, User, Notification } = require('../models');
const { getIO } = require('../config/socket');
const logger = require('../config/logger');
const { ORDER_STATUS } = require('../utils/constants');

/**
 * Traiter les commandes programmées dont l'heure est arrivée
 * Les passer de 'scheduled' à 'en_attente' pour traitement normal
 */
const processScheduledOrders = async () => {
    try {
        const now = new Date();

        // Trouver les commandes programmées dont l'heure est arrivée
        const ordersToProcess = await Commande.findAll({
            where: {
                isScheduled: true,
                dateLivraisonSouhaitee: {
                    [Op.lte]: now,
                },
                statut: ORDER_STATUS.PENDING,
            },
            include: [
                { model: User, as: 'client', attributes: ['id', 'nom', 'prenom', 'email'] },
                { model: User, as: 'prestataire', attributes: ['id', 'nom', 'prenom', 'email'] },
            ],
        });

        if (ordersToProcess.length === 0) {
            return;
        }

        logger.info(`[ScheduledOrders] Traitement de ${ordersToProcess.length} commandes programmées`);
        const io = getIO();

        for (const order of ordersToProcess) {
            try {
                // Mettre à jour la commande
                await order.update({
                    statut: ORDER_STATUS.CONFIRMED,
                    dateConfirmation: now,
                });

                // Créer notification pour le prestataire
                const notification = await Notification.create({
                    userId: order.prestataireId,
                    type: 'commande',
                    titre: 'Nouvelle commande programmée',
                    message: `La commande #${order.numero} programmée par ${order.client?.prenom} ${order.client?.nom} est maintenant active !`,
                    data: { commandeId: order.id },
                });

                // Émettre via Socket.io
                if (io) {
                    io.to(`user_${order.prestataireId}`).emit('notification', {
                        id: notification.id,
                        type: 'commande',
                        title: notification.titre,
                        message: notification.message,
                        data: notification.data,
                    });

                    io.to(`user_${order.prestataireId}`).emit('commande:nouvelle', {
                        commandeId: order.id,
                        numero: order.numero,
                    });
                }

                logger.info(`[ScheduledOrders] Commande #${order.numero} activée`);
            } catch (err) {
                logger.error(`[ScheduledOrders] Erreur activation commande #${order.numero}:`, err);
            }
        }
    } catch (error) {
        logger.error('[ScheduledOrders] Erreur globale:', error);
    }
};

/**
 * Envoyer des rappels pour les commandes programmées à venir (30 min avant)
 */
const sendScheduledReminders = async () => {
    try {
        const now = new Date();
        const reminderTime = new Date(now.getTime() + 30 * 60 * 1000); // Dans 30 minutes

        const ordersToRemind = await Commande.findAll({
            where: {
                isScheduled: true,
                scheduledNotificationSent: false,
                dateLivraisonSouhaitee: {
                    [Op.gt]: now,
                    [Op.lte]: reminderTime,
                },
                statut: ORDER_STATUS.PENDING,
            },
            include: [
                { model: User, as: 'client', attributes: ['id', 'prenom'] },
                { model: User, as: 'prestataire', attributes: ['id', 'nom'] },
            ],
        });

        if (ordersToRemind.length === 0) return;

        logger.info(`[ScheduledOrders] Envoi de ${ordersToRemind.length} rappels`);
        const io = getIO();

        for (const order of ordersToRemind) {
            try {
                // Notification au prestataire
                const notification = await Notification.create({
                    userId: order.prestataireId,
                    type: 'rappel',
                    titre: 'Commande programmée dans 30 min',
                    message: `La commande #${order.numero} de ${order.client?.prenom} sera active dans 30 minutes. Préparez-vous !`,
                    data: { commandeId: order.id },
                });

                await order.update({ scheduledNotificationSent: true });

                if (io) {
                    io.to(`user_${order.prestataireId}`).emit('notification', {
                        id: notification.id,
                        type: 'rappel',
                        title: notification.titre,
                        message: notification.message,
                        data: notification.data,
                    });
                }

                logger.info(`[ScheduledOrders] Rappel envoyé pour commande #${order.numero}`);
            } catch (err) {
                logger.error(`[ScheduledOrders] Erreur rappel commande #${order.numero}:`, err);
            }
        }
    } catch (error) {
        logger.error('[ScheduledOrders] Erreur envoi rappels:', error);
    }
};

/**
 * Initialiser les jobs CRON
 */
const initScheduledOrdersJob = () => {
    // Toutes les 5 minutes - Traiter les commandes programmées
    cron.schedule('*/5 * * * *', async () => {
        logger.debug('[ScheduledOrders] Exécution du job de traitement');
        await processScheduledOrders();
        await sendScheduledReminders();
    });

    logger.info('[ScheduledOrders] Job CRON initialisé - Intervalle: 5 minutes');
};

module.exports = {
    initScheduledOrdersJob,
    processScheduledOrders,
    sendScheduledReminders,
};
