const { User, Plat, Commande, CommandeItem, Avis, Categorie, Notification, Favori, sequelize } = require('../models');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { ORDER_STATUS } = require('../utils/constants');
const { Op } = require('sequelize');

// ═══════════════════════════════════════════════════════════════
// ROUTES CLIENT
// ═══════════════════════════════════════════════════════════════

/**
 * @desc    Dashboard client - KPIs, commande active, dernières commandes, favoris
 * @route   GET /api/stats/client/dashboard
 * @access  Private/Client
 */
const getClientDashboard = asyncHandler(async (req, res) => {
  const clientId = req.user.id;
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

  // ── KPIs ───────────────────────────────────────────────────
  const [
    depenseMois,
    depenseMoisDernier,
    commandesActives,
    nombreFavoris,
    notificationsNonLues
  ] = await Promise.all([
    // Dépenses ce mois-ci
    Commande.findAll({
      where: {
        clientId,
        createdAt: { [Op.gte]: startOfMonth },
        statut: { [Op.ne]: ORDER_STATUS.CANCELLED }
      },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('total')), 'total']
      ],
      raw: true
    }),
    // Dépenses mois dernier (comparaison)
    Commande.findAll({
      where: {
        clientId,
        createdAt: { [Op.between]: [startOfLastMonth, endOfLastMonth] },
        statut: { [Op.ne]: ORDER_STATUS.CANCELLED }
      },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('total')), 'total']
      ],
      raw: true
    }),
    // Commandes actives (non terminées/annulées)
    Commande.count({
      where: {
        clientId,
        statut: {
          [Op.notIn]: [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED]
        }
      }
    }),
    // Nombre de favoris
    Favori.count({ where: { userId: clientId } }),
    // Notifications non lues
    Notification.count({ where: { userId: clientId, isRead: false } })
  ]);

  const totalMois = parseFloat(depenseMois[0].total) || 0;
  const totalMoisDernier = parseFloat(depenseMoisDernier[0].total) || 0;
  const variationDepense = totalMoisDernier > 0
    ? ((totalMois - totalMoisDernier) / totalMoisDernier * 100).toFixed(1)
    : 0;

  // ── Commande active (la plus récente non livrée) ────────────
  const commandeActive = await Commande.findOne({
    where: {
      clientId,
      statut: {
        [Op.notIn]: [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED]
      }
    },
    include: [
      {
        model: CommandeItem,
        as: 'items',
        include: [{ model: Plat, as: 'plat', attributes: ['id', 'nom', 'image', 'prix'] }]
      },
      {
        model: User,
        as: 'prestataire',
        attributes: ['id', 'nomEtablissement', 'avatar', 'telephone']
      }
    ],
    order: [['createdAt', 'DESC']]
  });

  // ── 5 dernières commandes ───────────────────────────────────
  const dernieresCommandes = await Commande.findAll({
    where: { clientId },
    include: [
      {
        model: User,
        as: 'prestataire',
        attributes: ['id', 'nomEtablissement', 'avatar']
      },
      {
        model: CommandeItem,
        as: 'items',
        attributes: ['id', 'quantite', 'prixUnitaire'],
        include: [{ model: Plat, as: 'plat', attributes: ['id', 'nom', 'image'] }]
      }
    ],
    order: [['createdAt', 'DESC']],
    limit: 5
  });

  // ── 6 plats favoris ────────────────────────────────────────
  const platsFavoris = await Favori.findAll({
    where: { userId: clientId },
    include: [{
      model: Plat,
      as: 'plat',
      attributes: ['id', 'nom', 'image', 'prix', 'prixPromo', 'noteMoyenne', 'nombreAvis', 'isAvailable', 'prestataireId'],
      include: [{
        model: User,
        as: 'prestataire',
        attributes: ['id', 'nomEtablissement']
      }]
    }],
    order: [['createdAt', 'DESC']],
    limit: 6
  });

  res.json({
    success: true,
    data: {
      kpis: {
        totalDepenseMois: totalMois,
        nombreCommandesMois: parseInt(depenseMois[0].count) || 0,
        commandesActives,
        nombreFavoris,
        variationDepense
      },
      commandeActive,
      dernieresCommandes,
      platsFavoris: platsFavoris.map(f => f.plat).filter(Boolean),
      notificationsNonLues
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// ROUTES PRESTATAIRE
// ═══════════════════════════════════════════════════════════════

/**
 * @desc    Dashboard prestataire
 * @route   GET /api/stats/prestataire/dashboard
 * @access  Private/Prestataire
 */
const getPrestataireDashboard = asyncHandler(async (req, res) => {
  const prestataireId = req.user.id;
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

  // Commandes ce mois-ci
  const commandesMois = await Commande.findAll({
    where: {
      prestataireId,
      createdAt: { [Op.gte]: startOfMonth },
      statut: { [Op.ne]: ORDER_STATUS.CANCELLED }
    },
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('SUM', sequelize.col('total')), 'total']
    ],
    raw: true
  });

  // Commandes mois dernier (pour comparaison)
  const commandesMoisDernier = await Commande.findAll({
    where: {
      prestataireId,
      createdAt: { [Op.between]: [startOfLastMonth, endOfLastMonth] },
      statut: { [Op.ne]: ORDER_STATUS.CANCELLED }
    },
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('SUM', sequelize.col('total')), 'total']
    ],
    raw: true
  });

  // Nombre de plats/produits
  const nombrePlats = await Plat.count({
    where: { prestataireId, isDeleted: false }
  });

  // Alerte stock (pour les produits de boutique)
  const stockAlertCount = await Plat.count({
    where: {
      prestataireId,
      isDeleted: false,
      type: 'produit',
      stock: { [Op.between]: [0, 5] }
    }
  });

  // Note moyenne globale
  const noteStats = await Avis.findAll({
    include: [{
      model: Plat,
      as: 'plat',
      where: { prestataireId },
      attributes: []
    }],
    where: { isVisible: true },
    attributes: [
      [sequelize.fn('AVG', sequelize.col('note')), 'moyenne'],
      [sequelize.fn('COUNT', sequelize.col('Avis.id')), 'total']
    ],
    raw: true
  });

  // Commandes en attente
  const commandesEnAttente = await Commande.count({
    where: {
      prestataireId,
      statut: { [Op.in]: [ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED] }
    }
  });

  // Top 5 plats vendus
  const topPlats = await CommandeItem.findAll({
    attributes: [
      'platId',
      [sequelize.fn('SUM', sequelize.col('quantite')), 'totalVendu'],
      [sequelize.fn('SUM', sequelize.col('sousTotal')), 'chiffreAffaires']
    ],
    include: [{
      model: Plat,
      as: 'plat',
      where: { prestataireId },
      attributes: ['id', 'nom', 'image', 'prix']
    }],
    group: ['platId'],
    order: [[sequelize.literal('totalVendu'), 'DESC']],
    limit: 5
  });

  // Calcul des variations
  const caMois = parseFloat(commandesMois[0].total) || 0;
  const caMoisDernier = parseFloat(commandesMoisDernier[0].total) || 0;
  const variationCA = caMoisDernier > 0
    ? ((caMois - caMoisDernier) / caMoisDernier * 100).toFixed(1)
    : 0;

  res.json({
    success: true,
    data: {
      kpis: {
        chiffreAffairesMois: caMois,
        commandesMois: parseInt(commandesMois[0].count) || 0,
        panierMoyen: commandesMois[0].count > 0 ? (caMois / commandesMois[0].count).toFixed(0) : 0,
        noteMoyenne: parseFloat(noteStats[0].moyenne)?.toFixed(1) || 0,
        nombreAvis: parseInt(noteStats[0].total) || 0,
        nombrePlats,
        commandesEnAttente,
        variationCA
      },
      topPlats,
      stockAlertCount
    }
  });
});

/**
 * @desc    Détail des ventes prestataire
 * @route   GET /api/stats/prestataire/ventes
 * @access  Private/Prestataire
 */
const getPrestataireVentes = asyncHandler(async (req, res) => {
  const { periode = '30' } = req.query; // Nombre de jours
  const prestataireId = req.user.id;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(periode));

  // Ventes par jour
  const ventesParJour = await Commande.findAll({
    where: {
      prestataireId,
      createdAt: { [Op.gte]: startDate },
      statut: { [Op.ne]: ORDER_STATUS.CANCELLED }
    },
    attributes: [
      [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'commandes'],
      [sequelize.fn('SUM', sequelize.col('total')), 'chiffreAffaires']
    ],
    group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
    order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
    raw: true
  });

  // Ventes par catégorie
  const ventesParCategorie = await CommandeItem.findAll({
    attributes: [
      [sequelize.fn('SUM', sequelize.col('sousTotal')), 'total'],
      [sequelize.fn('SUM', sequelize.col('quantite')), 'quantite']
    ],
    include: [{
      model: Plat,
      as: 'plat',
      where: { prestataireId },
      attributes: [],
      include: [{
        model: Categorie,
        as: 'categorie',
        attributes: ['id', 'nom']
      }]
    }],
    group: ['plat.categorieId'],
    raw: true
  });

  res.json({
    success: true,
    data: {
      ventesParJour,
      ventesParCategorie
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// ROUTES ADMIN
// ═══════════════════════════════════════════════════════════════

/**
 * @desc    Dashboard admin
 * @route   GET /api/stats/admin/dashboard
 * @access  Private/Admin
 */
const getAdminDashboard = asyncHandler(async (req, res) => {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  // Utilisateurs
  const [totalClients, totalPrestataires, nouveauxUtilisateursMois] = await Promise.all([
    User.count({ where: { role: 'client', isActive: true } }),
    User.count({ where: { role: 'prestataire', isActive: true } }),
    User.count({ where: { createdAt: { [Op.gte]: startOfMonth } } })
  ]);

  // Commandes
  const commandesStats = await Commande.findAll({
    where: { createdAt: { [Op.gte]: startOfMonth } },
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
      [sequelize.fn('SUM', sequelize.col('total')), 'chiffreAffaires'],
      [sequelize.fn('SUM',
        sequelize.literal(`CASE WHEN statut = '${ORDER_STATUS.CANCELLED}' THEN 1 ELSE 0 END`)
      ), 'annulees']
    ],
    raw: true
  });

  // Commission plateforme (10% par défaut)
  const commission = parseFloat(process.env.PLATFORM_COMMISSION || 10);
  const revenusCommission = (parseFloat(commandesStats[0].chiffreAffaires) || 0) * (commission / 100);

  // Commandes par statut
  const commandesParStatut = await Commande.findAll({
    attributes: [
      'statut',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['statut'],
    raw: true
  });

  // Top prestataires
  const topPrestataires = await Commande.findAll({
    where: {
      createdAt: { [Op.gte]: startOfMonth },
      statut: { [Op.ne]: ORDER_STATUS.CANCELLED }
    },
    attributes: [
      'prestataireId',
      [sequelize.fn('COUNT', sequelize.col('Commande.id')), 'commandes'],
      [sequelize.fn('SUM', sequelize.col('total')), 'chiffreAffaires']
    ],
    include: [{
      model: User,
      as: 'prestataire',
      attributes: ['id', 'nomEtablissement', 'avatar']
    }],
    group: ['prestataireId'],
    order: [[sequelize.literal('chiffreAffaires'), 'DESC']],
    limit: 5
  });

  res.json({
    success: true,
    data: {
      kpis: {
        totalClients,
        totalPrestataires,
        nouveauxUtilisateursMois,
        commandesMois: parseInt(commandesStats[0].total) || 0,
        chiffreAffairesMois: parseFloat(commandesStats[0].chiffreAffaires) || 0,
        revenusCommission: revenusCommission.toFixed(0),
        tauxAnnulation: commandesStats[0].total > 0
          ? ((commandesStats[0].annulees / commandesStats[0].total) * 100).toFixed(1)
          : 0
      },
      commandesParStatut,
      topPrestataires
    }
  });
});

/**
 * @desc    Stats utilisateurs (Admin)
 * @route   GET /api/stats/admin/utilisateurs
 * @access  Private/Admin
 */
const getAdminUsersStats = asyncHandler(async (req, res) => {
  const { periode = '30' } = req.query;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(periode));

  // Inscriptions par jour
  const inscriptionsParJour = await User.findAll({
    where: { createdAt: { [Op.gte]: startDate } },
    attributes: [
      [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
      'role',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: [sequelize.fn('DATE', sequelize.col('createdAt')), 'role'],
    order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
    raw: true
  });

  // Répartition par rôle
  const repartitionRoles = await User.findAll({
    where: { isActive: true },
    attributes: [
      'role',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['role'],
    raw: true
  });

  res.json({
    success: true,
    data: {
      inscriptionsParJour,
      repartitionRoles
    }
  });
});

/**
 * @desc    Stats commandes (Admin)
 * @route   GET /api/stats/admin/commandes
 * @access  Private/Admin
 */
const getAdminOrdersStats = asyncHandler(async (req, res) => {
  const { periode = '30' } = req.query;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(periode));

  // Commandes par jour
  const commandesParJour = await Commande.findAll({
    where: { createdAt: { [Op.gte]: startDate } },
    attributes: [
      [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'commandes'],
      [sequelize.fn('SUM', sequelize.col('total')), 'chiffreAffaires']
    ],
    group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
    order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
    raw: true
  });

  // Répartition par statut
  const repartitionStatuts = await Commande.findAll({
    where: { createdAt: { [Op.gte]: startDate } },
    attributes: [
      'statut',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['statut'],
    raw: true
  });

  // Modes de paiement
  const modesPaiement = await Commande.findAll({
    where: { createdAt: { [Op.gte]: startDate } },
    attributes: [
      'modePaiement',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('SUM', sequelize.col('total')), 'total']
    ],
    group: ['modePaiement'],
    raw: true
  });

  res.json({
    success: true,
    data: {
      commandesParJour,
      repartitionStatuts,
      modesPaiement
    }
  });
});

/**
 * @desc    Stats revenus (Admin)
 * @route   GET /api/stats/admin/revenus
 * @access  Private/Admin
 */
const getAdminRevenueStats = asyncHandler(async (req, res) => {
  const { annee = new Date().getFullYear() } = req.query;

  // Revenus par mois
  const revenusParMois = await Commande.findAll({
    where: {
      createdAt: {
        [Op.between]: [
          new Date(`${annee}-01-01`),
          new Date(`${annee}-12-31 23:59:59`)
        ]
      },
      statut: { [Op.ne]: ORDER_STATUS.CANCELLED }
    },
    attributes: [
      [sequelize.fn('MONTH', sequelize.col('createdAt')), 'mois'],
      [sequelize.fn('SUM', sequelize.col('total')), 'chiffreAffaires'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'commandes']
    ],
    group: [sequelize.fn('MONTH', sequelize.col('createdAt'))],
    order: [[sequelize.fn('MONTH', sequelize.col('createdAt')), 'ASC']],
    raw: true
  });

  // Ajouter la commission calculée
  const commission = parseFloat(process.env.PLATFORM_COMMISSION || 10);
  const revenusAvecCommission = revenusParMois.map(r => ({
    ...r,
    commission: (parseFloat(r.chiffreAffaires) * commission / 100).toFixed(0)
  }));

  res.json({
    success: true,
    data: {
      annee,
      revenusParMois: revenusAvecCommission,
      tauxCommission: commission
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW: ADMIN AVIS/REVIEWS STATS
// ═══════════════════════════════════════════════════════════════

/**
 * @desc    Stats avis (Admin) - Analytics reviews avec sentiments
 * @route   GET /api/stats/admin/avis
 * @access  Private/Admin
 */
const getAdminAvisStats = asyncHandler(async (req, res) => {
  const { periode = '30' } = req.query;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(periode));

  // Total avis et moyenne
  const globalStats = await Avis.findAll({
    where: { createdAt: { [Op.gte]: startDate } },
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
      [sequelize.fn('AVG', sequelize.col('note')), 'moyenneGlobale']
    ],
    raw: true
  });

  // Répartition par note (sentiment analysis approximation)
  const repartitionNotes = await Avis.findAll({
    where: { createdAt: { [Op.gte]: startDate } },
    attributes: [
      'note',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['note'],
    order: [['note', 'DESC']],
    raw: true
  });

  // Avis signalés (potentiellement toxiques)
  const avisSignales = await Avis.count({
    where: { isSignale: true, createdAt: { [Op.gte]: startDate } }
  });

  // Avis en attente de modération
  const avisEnAttente = await Avis.count({
    where: { isVisible: true, isSignale: true }
  });

  // Top plats les mieux notés
  const topPlatsNotes = await Avis.findAll({
    attributes: [
      'platId',
      [sequelize.fn('AVG', sequelize.col('Avis.note')), 'moyenneNote'],
      [sequelize.fn('COUNT', sequelize.col('Avis.id')), 'nombreAvis']
    ],
    include: [{
      model: Plat,
      as: 'plat',
      attributes: ['id', 'nom', 'image']
    }],
    where: { createdAt: { [Op.gte]: startDate }, isVisible: true },
    group: ['platId'],
    having: sequelize.where(sequelize.fn('COUNT', sequelize.col('Avis.id')), { [Op.gte]: 3 }),
    order: [[sequelize.literal('moyenneNote'), 'DESC']],
    limit: 5
  });

  // Évolution avis par jour
  const avisParJour = await Avis.findAll({
    where: { createdAt: { [Op.gte]: startDate } },
    attributes: [
      [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('AVG', sequelize.col('note')), 'moyenneNote']
    ],
    group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
    order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
    raw: true
  });

  // Calculer les sentiments (basé sur les notes)
  const positifs = repartitionNotes.filter(r => r.note >= 4).reduce((acc, r) => acc + parseInt(r.count), 0);
  const neutres = repartitionNotes.filter(r => r.note === 3).reduce((acc, r) => acc + parseInt(r.count), 0);
  const negatifs = repartitionNotes.filter(r => r.note <= 2).reduce((acc, r) => acc + parseInt(r.count), 0);
  const total = parseInt(globalStats[0]?.total) || 0;

  res.json({
    success: true,
    data: {
      kpis: {
        total,
        moyenneGlobale: parseFloat(globalStats[0]?.moyenneGlobale)?.toFixed(1) || 0,
        avisSignales,
        avisEnAttente,
        tauxPositif: total > 0 ? ((positifs / total) * 100).toFixed(1) : 0
      },
      sentiments: {
        positifs,
        neutres,
        negatifs,
        percentPositifs: total > 0 ? ((positifs / total) * 100).toFixed(1) : 0,
        percentNeutres: total > 0 ? ((neutres / total) * 100).toFixed(1) : 0,
        percentNegatifs: total > 0 ? ((negatifs / total) * 100).toFixed(1) : 0
      },
      repartitionNotes,
      topPlatsNotes,
      avisParJour
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW: ADMIN LITIGES/DISPUTES STATS
// ═══════════════════════════════════════════════════════════════

/**
 * @desc    Stats litiges (Admin) - Analytics disputes
 * @route   GET /api/stats/admin/litiges
 * @access  Private/Admin
 */
const getAdminLitigesStats = asyncHandler(async (req, res) => {
  const { Litige } = require('../models');
  const { periode = '30' } = req.query;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(periode));

  // KPIs globaux
  const [totalLitiges, litgesOuverts, litigesEnCours, litigesResolus] = await Promise.all([
    Litige.count({ where: { createdAt: { [Op.gte]: startDate } } }),
    Litige.count({ where: { statut: 'ouvert', createdAt: { [Op.gte]: startDate } } }),
    Litige.count({ where: { statut: 'en_cours', createdAt: { [Op.gte]: startDate } } }),
    Litige.count({ where: { statut: 'resolu', createdAt: { [Op.gte]: startDate } } })
  ]);

  // Répartition par motif
  const repartitionMotifs = await Litige.findAll({
    where: { createdAt: { [Op.gte]: startDate } },
    attributes: [
      'motif',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['motif'],
    order: [[sequelize.literal('count'), 'DESC']],
    raw: true
  });

  // Répartition par priorité
  const repartitionPriorite = await Litige.findAll({
    where: { createdAt: { [Op.gte]: startDate } },
    attributes: [
      'priorite',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['priorite'],
    raw: true
  });

  // Temps moyen de résolution (en heures)
  const tempsResolution = await Litige.findAll({
    where: {
      statut: 'resolu',
      dateResolution: { [Op.ne]: null },
      createdAt: { [Op.gte]: startDate }
    },
    attributes: [
      [sequelize.fn('AVG',
        sequelize.literal('TIMESTAMPDIFF(HOUR, createdAt, dateResolution)')
      ), 'tempsMoyen']
    ],
    raw: true
  });

  // Litiges par jour
  const litigesParJour = await Litige.findAll({
    where: { createdAt: { [Op.gte]: startDate } },
    attributes: [
      [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
    order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
    raw: true
  });

  // Top restaurants avec litiges
  const topRestaurantsLitiges = await Litige.findAll({
    where: { createdAt: { [Op.gte]: startDate } },
    attributes: [
      'prestataireId',
      [sequelize.fn('COUNT', sequelize.col('Litige.id')), 'nombreLitiges']
    ],
    include: [{
      model: User,
      as: 'prestataire',
      attributes: ['id', 'nomEtablissement', 'avatar']
    }],
    group: ['prestataireId'],
    order: [[sequelize.literal('nombreLitiges'), 'DESC']],
    limit: 5
  });

  const tauxResolution = totalLitiges > 0 ? ((litigesResolus / totalLitiges) * 100).toFixed(1) : 0;

  res.json({
    success: true,
    data: {
      kpis: {
        total: totalLitiges,
        ouverts: litgesOuverts,
        enCours: litigesEnCours,
        resolus: litigesResolus,
        tauxResolution,
        tempsMoyenResolution: parseFloat(tempsResolution[0]?.tempsMoyen)?.toFixed(1) || 0
      },
      repartitionMotifs,
      repartitionPriorite,
      litigesParJour,
      topRestaurantsLitiges
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW: CLIENT DETAILED STATS
// ═══════════════════════════════════════════════════════════════

/**
 * @desc    Historique des dépenses client (graphique ligne)
 * @route   GET /api/stats/client/depenses
 * @access  Private/Client
 */
const getClientDepenses = asyncHandler(async (req, res) => {
  const clientId = req.user.id;
  const { periode = '6' } = req.query; // Nombre de mois

  // Calculer la date de début
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - parseInt(periode));
  startDate.setDate(1);
  startDate.setHours(0, 0, 0, 0);

  // Dépenses par mois
  const depensesParMois = await Commande.findAll({
    where: {
      clientId,
      createdAt: { [Op.gte]: startDate },
      statut: { [Op.ne]: ORDER_STATUS.CANCELLED }
    },
    attributes: [
      [sequelize.fn('YEAR', sequelize.col('createdAt')), 'annee'],
      [sequelize.fn('MONTH', sequelize.col('createdAt')), 'mois'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'commandes'],
      [sequelize.fn('SUM', sequelize.col('total')), 'total']
    ],
    group: [
      sequelize.fn('YEAR', sequelize.col('createdAt')),
      sequelize.fn('MONTH', sequelize.col('createdAt'))
    ],
    order: [
      [sequelize.fn('YEAR', sequelize.col('createdAt')), 'ASC'],
      [sequelize.fn('MONTH', sequelize.col('createdAt')), 'ASC']
    ],
    raw: true
  });

  // Dépenses par semaine (dernières 8 semaines)
  const startWeek = new Date();
  startWeek.setDate(startWeek.getDate() - 56); // 8 semaines

  const depensesParSemaine = await Commande.findAll({
    where: {
      clientId,
      createdAt: { [Op.gte]: startWeek },
      statut: { [Op.ne]: ORDER_STATUS.CANCELLED }
    },
    attributes: [
      [sequelize.fn('WEEK', sequelize.col('createdAt')), 'semaine'],
      [sequelize.fn('YEAR', sequelize.col('createdAt')), 'annee'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'commandes'],
      [sequelize.fn('SUM', sequelize.col('total')), 'total']
    ],
    group: [
      sequelize.fn('YEAR', sequelize.col('createdAt')),
      sequelize.fn('WEEK', sequelize.col('createdAt'))
    ],
    order: [
      [sequelize.fn('YEAR', sequelize.col('createdAt')), 'ASC'],
      [sequelize.fn('WEEK', sequelize.col('createdAt')), 'ASC']
    ],
    raw: true
  });

  // Statistiques globales
  const statsGlobales = await Commande.findAll({
    where: {
      clientId,
      statut: { [Op.ne]: ORDER_STATUS.CANCELLED }
    },
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'totalCommandes'],
      [sequelize.fn('SUM', sequelize.col('total')), 'totalDepenses'],
      [sequelize.fn('AVG', sequelize.col('total')), 'panierMoyen'],
      [sequelize.fn('MAX', sequelize.col('total')), 'commandeMax'],
      [sequelize.fn('MIN', sequelize.col('total')), 'commandeMin']
    ],
    raw: true
  });

  res.json({
    success: true,
    data: {
      depensesParMois,
      depensesParSemaine,
      globales: {
        totalCommandes: parseInt(statsGlobales[0]?.totalCommandes) || 0,
        totalDepenses: parseFloat(statsGlobales[0]?.totalDepenses) || 0,
        panierMoyen: parseFloat(statsGlobales[0]?.panierMoyen)?.toFixed(0) || 0,
        commandeMax: parseFloat(statsGlobales[0]?.commandeMax) || 0,
        commandeMin: parseFloat(statsGlobales[0]?.commandeMin) || 0
      }
    }
  });
});

/**
 * @desc    Habitudes de commande client (heures, jours)
 * @route   GET /api/stats/client/habitudes
 * @access  Private/Client
 */
const getClientHabitudes = asyncHandler(async (req, res) => {
  const clientId = req.user.id;
  const { periode = '90' } = req.query; // Jours

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(periode));

  // Commandes par jour de la semaine
  const commandesParJour = await Commande.findAll({
    where: {
      clientId,
      createdAt: { [Op.gte]: startDate },
      statut: { [Op.ne]: ORDER_STATUS.CANCELLED }
    },
    attributes: [
      [sequelize.fn('DAYOFWEEK', sequelize.col('createdAt')), 'jour'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: [sequelize.fn('DAYOFWEEK', sequelize.col('createdAt'))],
    raw: true
  });

  // Commandes par heure
  const commandesParHeure = await Commande.findAll({
    where: {
      clientId,
      createdAt: { [Op.gte]: startDate },
      statut: { [Op.ne]: ORDER_STATUS.CANCELLED }
    },
    attributes: [
      [sequelize.fn('HOUR', sequelize.col('createdAt')), 'heure'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: [sequelize.fn('HOUR', sequelize.col('createdAt'))],
    raw: true
  });

  // Modes de paiement préférés
  const modesPaiement = await Commande.findAll({
    where: {
      clientId,
      createdAt: { [Op.gte]: startDate },
      statut: { [Op.ne]: ORDER_STATUS.CANCELLED }
    },
    attributes: [
      'modePaiement',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('SUM', sequelize.col('total')), 'total']
    ],
    group: ['modePaiement'],
    order: [[sequelize.literal('count'), 'DESC']],
    raw: true
  });

  // Types de commande (livraison, sur place, à emporter)
  const typesCommande = await Commande.findAll({
    where: {
      clientId,
      createdAt: { [Op.gte]: startDate },
      statut: { [Op.ne]: ORDER_STATUS.CANCELLED }
    },
    attributes: [
      'modeLivraison',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['modeLivraison'],
    order: [[sequelize.literal('count'), 'DESC']],
    raw: true
  });

  // Mapping jours (MySQL DAYOFWEEK: 1=Dimanche, 2=Lundi, etc.)
  const joursMapping = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const commandesParJourFormatted = commandesParJour.map(c => ({
    jour: joursMapping[parseInt(c.jour) - 1] || c.jour,
    jourNum: parseInt(c.jour),
    count: parseInt(c.count)
  }));

  res.json({
    success: true,
    data: {
      commandesParJour: commandesParJourFormatted,
      commandesParHeure: commandesParHeure.map(c => ({
        heure: parseInt(c.heure),
        count: parseInt(c.count)
      })),
      modesPaiement,
      typesCommande
    }
  });
});

/**
 * @desc    Catégories et plats préférés du client
 * @route   GET /api/stats/client/preferences
 * @access  Private/Client
 */
const getClientPreferences = asyncHandler(async (req, res) => {
  const clientId = req.user.id;

  // Top catégories commandées
  const topCategories = await CommandeItem.findAll({
    attributes: [
      [sequelize.fn('SUM', sequelize.col('quantite')), 'quantite'],
      [sequelize.fn('SUM', sequelize.col('sousTotal')), 'total'],
      [sequelize.fn('COUNT', sequelize.col('CommandeItem.id')), 'count']
    ],
    include: [
      {
        model: Commande,
        as: 'commande',
        where: { clientId, statut: { [Op.ne]: ORDER_STATUS.CANCELLED } },
        attributes: []
      },
      {
        model: Plat,
        as: 'plat',
        attributes: [],
        include: [{
          model: Categorie,
          as: 'categorie',
          attributes: ['id', 'nom', 'icon']
        }]
      }
    ],
    group: ['plat.categorieId'],
    order: [[sequelize.literal('total'), 'DESC']],
    limit: 6
  });

  // Top plats commandés
  const topPlats = await CommandeItem.findAll({
    attributes: [
      'platId',
      [sequelize.fn('SUM', sequelize.col('quantite')), 'quantite'],
      [sequelize.fn('SUM', sequelize.col('sousTotal')), 'total'],
      [sequelize.fn('COUNT', sequelize.col('CommandeItem.id')), 'count']
    ],
    include: [
      {
        model: Commande,
        as: 'commande',
        where: { clientId, statut: { [Op.ne]: ORDER_STATUS.CANCELLED } },
        attributes: []
      },
      {
        model: Plat,
        as: 'plat',
        attributes: ['id', 'nom', 'image', 'prix'],
        include: [{
          model: User,
          as: 'prestataire',
          attributes: ['id', 'nomEtablissement']
        }]
      }
    ],
    group: ['platId'],
    order: [[sequelize.literal('quantite'), 'DESC']],
    limit: 10
  });

  // Top restaurants fréquentés
  const topRestaurants = await Commande.findAll({
    where: {
      clientId,
      statut: { [Op.ne]: ORDER_STATUS.CANCELLED }
    },
    attributes: [
      'prestataireId',
      [sequelize.fn('COUNT', sequelize.col('Commande.id')), 'commandes'],
      [sequelize.fn('SUM', sequelize.col('total')), 'totalDepense']
    ],
    include: [{
      model: User,
      as: 'prestataire',
      attributes: ['id', 'nomEtablissement', 'avatar', 'telephone']
    }],
    group: ['prestataireId'],
    order: [[sequelize.literal('commandes'), 'DESC']],
    limit: 5
  });

  res.json({
    success: true,
    data: {
      topCategories: topCategories.map(tc => ({
        categorie: tc.plat?.categorie,
        quantite: parseInt(tc.get('quantite')) || 0,
        total: parseFloat(tc.get('total')) || 0,
        count: parseInt(tc.get('count')) || 0
      })).filter(tc => tc.categorie),
      topPlats: topPlats.map(tp => ({
        plat: tp.plat,
        quantite: parseInt(tp.get('quantite')) || 0,
        total: parseFloat(tp.get('total')) || 0,
        count: parseInt(tp.get('count')) || 0
      })).filter(tp => tp.plat),
      topRestaurants
    }
  });
});

module.exports = {
  getClientDashboard,
  getClientDepenses,
  getClientHabitudes,
  getClientPreferences,
  getPrestataireDashboard,
  getPrestataireVentes,
  getAdminDashboard,
  getAdminUsersStats,
  getAdminOrdersStats,
  getAdminRevenueStats,
  getAdminAvisStats,
  getAdminLitigesStats
};
