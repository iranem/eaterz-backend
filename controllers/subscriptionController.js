/**
 * Contrôleur pour les abonnements de commandes récurrentes
 */
const asyncHandler = require('express-async-handler');
const { Subscription, User, Plat } = require('../models');
const { Op } = require('sequelize');

/**
 * @desc    Créer un nouvel abonnement
 * @route   POST /api/subscriptions
 * @access  Private (client)
 */
const createSubscription = asyncHandler(async (req, res) => {
    const clientId = req.user.id;
    const {
        type = 'plat',
        platId,
        panierItems,
        prestataireId,
        frequence = 'hebdomadaire',
        joursSemaine = [1, 3, 5],
        heureLivraison = '12:30',
        adresseLivraison,
        villeLivraison,
        telephoneLivraison,
        modePaiement = 'especes',
        dateDebut,
        dateFin,
    } = req.body;

    // Validation
    if (type === 'plat' && !platId) {
        res.status(400);
        throw new Error('platId requis pour un abonnement de type plat');
    }

    if (type === 'panier' && (!panierItems || panierItems.length === 0)) {
        res.status(400);
        throw new Error('panierItems requis pour un abonnement de type panier');
    }

    if (!adresseLivraison) {
        res.status(400);
        throw new Error('Adresse de livraison requise');
    }

    // Calculer prochaine commande
    const prochaineCommande = calculateNextOrderDate(frequence, joursSemaine, heureLivraison);

    const subscription = await Subscription.create({
        clientId,
        type,
        platId: type === 'plat' ? platId : null,
        panierItems: type === 'panier' ? panierItems : null,
        prestataireId,
        frequence,
        joursSemaine,
        heureLivraison,
        adresseLivraison,
        villeLivraison,
        telephoneLivraison,
        modePaiement,
        dateDebut: dateDebut || new Date(),
        dateFin,
        prochaineCommande,
    });

    res.status(201).json({
        success: true,
        message: 'Abonnement créé avec succès',
        data: subscription,
    });
});

/**
 * @desc    Récupérer mes abonnements
 * @route   GET /api/subscriptions
 * @access  Private (client)
 */
const getMySubscriptions = asyncHandler(async (req, res) => {
    const subscriptions = await Subscription.findAll({
        where: { clientId: req.user.id },
        include: [
            {
                model: Plat,
                as: 'plat',
                attributes: ['id', 'nom', 'prix', 'image'],
            },
            {
                model: User,
                as: 'prestataire',
                attributes: ['id', 'nom'],
            },
        ],
        order: [['createdAt', 'DESC']],
    });

    res.json({
        success: true,
        data: subscriptions,
    });
});

/**
 * @desc    Récupérer un abonnement
 * @route   GET /api/subscriptions/:id
 * @access  Private (client)
 */
const getSubscription = asyncHandler(async (req, res) => {
    const subscription = await Subscription.findOne({
        where: { id: req.params.id, clientId: req.user.id },
        include: [
            { model: Plat, as: 'plat' },
            { model: User, as: 'prestataire', attributes: ['id', 'nom'] },
        ],
    });

    if (!subscription) {
        res.status(404);
        throw new Error('Abonnement non trouvé');
    }

    res.json({ success: true, data: subscription });
});

/**
 * @desc    Mettre à jour un abonnement
 * @route   PUT /api/subscriptions/:id
 * @access  Private (client)
 */
const updateSubscription = asyncHandler(async (req, res) => {
    const subscription = await Subscription.findOne({
        where: { id: req.params.id, clientId: req.user.id },
    });

    if (!subscription) {
        res.status(404);
        throw new Error('Abonnement non trouvé');
    }

    const allowedFields = [
        'frequence', 'joursSemaine', 'heureLivraison',
        'adresseLivraison', 'villeLivraison', 'telephoneLivraison',
        'modePaiement', 'dateFin',
    ];

    const updates = {};
    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
        }
    });

    // Recalculer prochaine commande si horaires changés
    if (updates.frequence || updates.joursSemaine || updates.heureLivraison) {
        updates.prochaineCommande = calculateNextOrderDate(
            updates.frequence || subscription.frequence,
            updates.joursSemaine || subscription.joursSemaine,
            updates.heureLivraison || subscription.heureLivraison
        );
    }

    await subscription.update(updates);

    res.json({
        success: true,
        message: 'Abonnement mis à jour',
        data: subscription,
    });
});

/**
 * @desc    Mettre en pause un abonnement
 * @route   POST /api/subscriptions/:id/pause
 * @access  Private (client)
 */
const pauseSubscription = asyncHandler(async (req, res) => {
    const { until } = req.body; // Date de fin de pause optionnelle

    const subscription = await Subscription.findOne({
        where: { id: req.params.id, clientId: req.user.id },
    });

    if (!subscription) {
        res.status(404);
        throw new Error('Abonnement non trouvé');
    }

    await subscription.update({
        statut: 'paused',
        pausedUntil: until || null,
    });

    res.json({
        success: true,
        message: 'Abonnement mis en pause',
        data: subscription,
    });
});

/**
 * @desc    Reprendre un abonnement
 * @route   POST /api/subscriptions/:id/resume
 * @access  Private (client)
 */
const resumeSubscription = asyncHandler(async (req, res) => {
    const subscription = await Subscription.findOne({
        where: { id: req.params.id, clientId: req.user.id },
    });

    if (!subscription) {
        res.status(404);
        throw new Error('Abonnement non trouvé');
    }

    const prochaineCommande = calculateNextOrderDate(
        subscription.frequence,
        subscription.joursSemaine,
        subscription.heureLivraison
    );

    await subscription.update({
        statut: 'active',
        pausedUntil: null,
        prochaineCommande,
    });

    res.json({
        success: true,
        message: 'Abonnement repris',
        data: subscription,
    });
});

/**
 * @desc    Annuler un abonnement
 * @route   DELETE /api/subscriptions/:id
 * @access  Private (client)
 */
const cancelSubscription = asyncHandler(async (req, res) => {
    const subscription = await Subscription.findOne({
        where: { id: req.params.id, clientId: req.user.id },
    });

    if (!subscription) {
        res.status(404);
        throw new Error('Abonnement non trouvé');
    }

    await subscription.update({ statut: 'cancelled' });

    res.json({
        success: true,
        message: 'Abonnement annulé',
    });
});

/**
 * Calculer la prochaine date de commande
 */
function calculateNextOrderDate(frequence, joursSemaine, heureLivraison) {
    const now = new Date();
    const [hours, minutes] = heureLivraison.split(':').map(Number);

    if (frequence === 'quotidien') {
        const next = new Date(now);
        next.setHours(hours, minutes, 0, 0);

        // Si l'heure est passée, demain
        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }
        return next;
    }

    if (frequence === 'hebdomadaire') {
        const jours = Array.isArray(joursSemaine) ? joursSemaine.sort() : [1];
        const currentDay = now.getDay();

        // Trouver le prochain jour de la semaine
        for (const jour of jours) {
            if (jour > currentDay || (jour === currentDay && now.getHours() < hours)) {
                const next = new Date(now);
                next.setDate(now.getDate() + (jour - currentDay));
                next.setHours(hours, minutes, 0, 0);
                return next;
            }
        }

        // Sinon, prendre le premier jour de la semaine prochaine
        const next = new Date(now);
        next.setDate(now.getDate() + (7 - currentDay + jours[0]));
        next.setHours(hours, minutes, 0, 0);
        return next;
    }

    if (frequence === 'mensuel') {
        const next = new Date(now);
        next.setMonth(now.getMonth() + 1);
        next.setDate(1);
        next.setHours(hours, minutes, 0, 0);
        return next;
    }

    return null;
}

module.exports = {
    createSubscription,
    getMySubscriptions,
    getSubscription,
    updateSubscription,
    pauseSubscription,
    resumeSubscription,
    cancelSubscription,
    calculateNextOrderDate,
};
