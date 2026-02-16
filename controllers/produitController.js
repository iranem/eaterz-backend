const { Plat, Categorie, User, Avis, Favori, sequelize } = require('../models');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { paginate, paginationResponse } = require('../utils/helpers');
const { deleteFile, getFileUrl } = require('../middleware/uploadMiddleware');
const { Op } = require('sequelize');

/**
 * @desc    Liste les produits avec filtres avancés (items de type 'produit')
 * @route   GET /api/produits
 * @access  Public
 */
const getProduits = asyncHandler(async (req, res) => {
    const {
        categorieId,
        prestataireId,
        search,
        prixMin,
        prixMax,
        origine,
        unites,
        poidsMin,
        poidsMax,
        noteMin,
        isAvailable,
        inStock,
        tags,
        sortBy,
        sortOrder,
        page,
        limit
    } = req.query;

    const { limit: limitNum, offset, page: pageNum } = paginate(page, limit);

    // Construction des filtres - UNIQUEMENT les produits
    const where = {
        isDeleted: false,
        type: 'produit'
    };

    if (categorieId) where.categorieId = categorieId;
    if (prestataireId) where.prestataireId = prestataireId;
    if (isAvailable !== undefined) where.isAvailable = isAvailable === 'true';

    // Filtre stock
    if (inStock === 'true') {
        where.stock = { [Op.gt]: 0 };
    }

    // Recherche textuelle
    if (search) {
        where[Op.or] = [
            sequelize.where(
                sequelize.fn('JSON_EXTRACT', sequelize.col('nom'), '$.fr'),
                { [Op.like]: `%${search}%` }
            ),
            sequelize.where(
                sequelize.fn('JSON_EXTRACT', sequelize.col('description'), '$.fr'),
                { [Op.like]: `%${search}%` }
            ),
            { origine: { [Op.like]: `%${search}%` } }
        ];
    }

    // Filtres de prix
    if (prixMin || prixMax) {
        where.prix = {};
        if (prixMin) where.prix[Op.gte] = parseFloat(prixMin);
        if (prixMax) where.prix[Op.lte] = parseFloat(prixMax);
    }

    // Filtre par origine
    if (origine) {
        where.origine = { [Op.like]: `%${origine}%` };
    }

    // Filtre par unités
    if (unites) {
        const unitesArray = unites.split(',');
        where.unite = { [Op.in]: unitesArray };
    }

    // Filtre par poids/volume
    if (poidsMin || poidsMax) {
        where.poids_volume = {};
        if (poidsMin) where.poids_volume[Op.gte] = parseFloat(poidsMin);
        if (poidsMax) where.poids_volume[Op.lte] = parseFloat(poidsMax);
    }

    // Note minimum
    if (noteMin) {
        where.noteMoyenne = { [Op.gte]: parseFloat(noteMin) };
    }

    // Tags
    if (tags) {
        const tagsArray = tags.split(',');
        where[Op.and] = [
            ...(where[Op.and] || []),
            ...tagsArray.map(tag =>
                sequelize.where(
                    sequelize.fn('JSON_CONTAINS', sequelize.col('tags'), JSON.stringify(tag)),
                    1
                )
            )
        ];
    }

    // Tri
    let order = [];
    switch (sortBy) {
        case 'prix':
            order.push(['prix', sortOrder === 'desc' ? 'DESC' : 'ASC']);
            break;
        case 'note':
            order.push(['noteMoyenne', 'DESC']);
            break;
        case 'populaire':
            order.push(['nombreCommandes', 'DESC']);
            break;
        case 'recent':
            order.push(['createdAt', 'DESC']);
            break;
        case 'stock':
            order.push(['stock', 'ASC']);
            break;
        default:
            order.push(['isFeatured', 'DESC'], ['noteMoyenne', 'DESC']);
    }

    const { count, rows: produits } = await Plat.findAndCountAll({
        where,
        include: [
            {
                model: Categorie,
                as: 'categorie',
                attributes: ['id', 'nom', 'slug', 'icone']
            },
            {
                model: User,
                as: 'prestataire',
                attributes: ['id', 'nomEtablissement', 'avatar', 'ville']
            }
        ],
        order,
        limit: limitNum,
        offset,
        distinct: true
    });

    res.json({
        success: true,
        ...paginationResponse(produits, count, pageNum, limitNum)
    });
});

/**
 * @desc    Obtenir les produits mis en avant
 * @route   GET /api/produits/featured
 * @access  Public
 */
const getFeaturedProduits = asyncHandler(async (req, res) => {
    const produits = await Plat.findAll({
        where: {
            type: 'produit',
            isFeatured: true,
            isAvailable: true,
            isDeleted: false,
            stock: { [Op.gt]: 0 }
        },
        include: [
            {
                model: Categorie,
                as: 'categorie',
                attributes: ['id', 'nom', 'slug']
            },
            {
                model: User,
                as: 'prestataire',
                attributes: ['id', 'nomEtablissement', 'ville']
            }
        ],
        limit: 8,
        order: [['noteMoyenne', 'DESC']]
    });

    res.json({
        success: true,
        data: produits
    });
});

/**
 * @desc    Obtenir les origines disponibles (pour filtres)
 * @route   GET /api/produits/origines
 * @access  Public
 */
const getOrigines = asyncHandler(async (req, res) => {
    const origines = await Plat.findAll({
        where: {
            type: 'produit',
            isDeleted: false,
            origine: { [Op.ne]: null }
        },
        attributes: [
            [sequelize.fn('DISTINCT', sequelize.col('origine')), 'origine']
        ],
        raw: true
    });

    res.json({
        success: true,
        data: origines.map(o => o.origine).filter(Boolean)
    });
});

/**
 * @desc    Recherche produits avec suggestions
 * @route   GET /api/produits/search
 * @access  Public
 */
const searchProduits = asyncHandler(async (req, res) => {
    const { q, limit = 10 } = req.query;

    if (!q || q.length < 2) {
        return res.json({ success: true, data: [] });
    }

    const produits = await Plat.findAll({
        where: {
            type: 'produit',
            isDeleted: false,
            isAvailable: true,
            stock: { [Op.gt]: 0 },
            [Op.or]: [
                sequelize.where(
                    sequelize.fn('JSON_EXTRACT', sequelize.col('nom'), '$.fr'),
                    { [Op.like]: `%${q}%` }
                ),
                { origine: { [Op.like]: `%${q}%` } }
            ]
        },
        attributes: ['id', 'nom', 'image', 'prix', 'prixPromo', 'origine', 'stock', 'unite', 'poids_volume'],
        include: [{
            model: Categorie,
            as: 'categorie',
            attributes: ['id', 'nom', 'slug']
        }],
        limit: parseInt(limit),
        order: [['nombreCommandes', 'DESC']]
    });

    res.json({
        success: true,
        data: produits
    });
});

/**
 * @desc    Obtenir un produit par ID
 * @route   GET /api/produits/:id
 * @access  Public
 */
const getProduitById = asyncHandler(async (req, res) => {
    const produit = await Plat.findOne({
        where: { id: req.params.id, type: 'produit', isDeleted: false },
        include: [
            {
                model: Categorie,
                as: 'categorie',
                attributes: ['id', 'nom', 'slug', 'icone']
            },
            {
                model: User,
                as: 'prestataire',
                attributes: ['id', 'nomEtablissement', 'descriptionEtablissement', 'avatar', 'telephone', 'ville', 'adresse']
            },
            {
                model: Avis,
                as: 'avis',
                where: { isVisible: true },
                required: false,
                limit: 5,
                order: [['createdAt', 'DESC']],
                include: [{
                    model: User,
                    as: 'client',
                    attributes: ['id', 'prenom', 'avatar']
                }]
            }
        ]
    });

    if (!produit) {
        res.status(404);
        throw new Error('Produit non trouvé');
    }

    // Vérifier si l'utilisateur a ce produit en favori
    let isFavorite = false;
    if (req.user) {
        const favori = await Favori.findOne({
            where: { userId: req.user.id, platId: produit.id }
        });
        isFavorite = !!favori;
    }

    res.json({
        success: true,
        data: { ...produit.toJSON(), isFavorite }
    });
});

// ═══════════════════════════════════════════════════════════════
// ROUTES PRESTATAIRE (Boutique)
// ═══════════════════════════════════════════════════════════════

/**
 * @desc    Obtenir mes produits (Prestataire Boutique)
 * @route   GET /api/produits/mes-produits
 * @access  Private/Prestataire
 */
const getMesProduits = asyncHandler(async (req, res) => {
    const { page, limit, categorieId, stockBas, search } = req.query;
    const { limit: limitNum, offset, page: pageNum } = paginate(page, limit);

    const where = {
        prestataireId: req.user.id,
        type: 'produit',
        isDeleted: false
    };

    if (categorieId) where.categorieId = parseInt(categorieId);

    // Filtre stock bas (<=5)
    if (stockBas === 'true') {
        where.stock = { [Op.lte]: 5, [Op.gte]: 0 };
    }

    if (search) {
        where[Op.or] = [
            sequelize.where(
                sequelize.fn('JSON_EXTRACT', sequelize.col('nom'), '$.fr'),
                { [Op.like]: `%${search}%` }
            )
        ];
    }

    const { count, rows: produits } = await Plat.findAndCountAll({
        where,
        include: [{
            model: Categorie,
            as: 'categorie',
            attributes: ['id', 'nom', 'slug']
        }],
        order: [['createdAt', 'DESC']],
        limit: limitNum,
        offset
    });

    res.json({
        success: true,
        ...paginationResponse(produits, count, pageNum, limitNum)
    });
});

/**
 * @desc    Créer un produit (Prestataire Boutique)
 * @route   POST /api/produits
 * @access  Private/Prestataire
 */
const createProduit = asyncHandler(async (req, res) => {
    const {
        categorieId, nom, description, prix, prixPromo,
        stock, unite, poids_volume, format, origine, tags
    } = req.body;

    // Vérifier que le prestataire est de type boutique ou mixte
    if (req.user.prestataireType === 'restaurant') {
        res.status(403);
        throw new Error('Les restaurants ne peuvent pas ajouter de produits. Changez votre type en "Boutique" ou "Mixte".');
    }

    // Vérifier que la catégorie existe
    const categorie = await Categorie.findByPk(categorieId);
    if (!categorie) {
        res.status(404);
        throw new Error('Catégorie non trouvée');
    }

    const produit = await Plat.create({
        prestataireId: req.user.id,
        categorieId,
        nom,
        description,
        prix,
        prixPromo,
        image: req.file ? getFileUrl(req.file.filename, 'plats') : null,
        type: 'produit',
        stock: stock !== undefined ? parseInt(stock) : 0,
        unite: unite || 'unite',
        poids_volume: poids_volume ? parseFloat(poids_volume) : null,
        format: format || null,
        origine: origine || null,
        tags: tags || [],
        isAvailable: stock > 0
    });

    // Mettre à jour le compteur de la catégorie
    await categorie.increment('nombrePlats');

    res.status(201).json({
        success: true,
        message: 'Produit créé avec succès',
        data: produit
    });
});

/**
 * @desc    Modifier un produit (Prestataire Boutique)
 * @route   PUT /api/produits/:id
 * @access  Private/Prestataire
 */
const updateProduit = asyncHandler(async (req, res) => {
    const produit = await Plat.findOne({
        where: { id: req.params.id, prestataireId: req.user.id, type: 'produit', isDeleted: false }
    });

    if (!produit) {
        res.status(404);
        throw new Error('Produit non trouvé');
    }

    const updateData = { ...req.body };

    // Gérer l'upload d'image
    if (req.file) {
        if (produit.image) {
            deleteFile(produit.image);
        }
        updateData.image = getFileUrl(req.file.filename, 'plats');
    }

    // Si la catégorie change, mettre à jour les compteurs
    if (updateData.categorieId && updateData.categorieId !== produit.categorieId) {
        await Categorie.decrement('nombrePlats', { where: { id: produit.categorieId } });
        await Categorie.increment('nombrePlats', { where: { id: updateData.categorieId } });
    }

    // Parser les valeurs numériques
    if (updateData.stock !== undefined) {
        updateData.stock = parseInt(updateData.stock);
        updateData.isAvailable = updateData.stock > 0;
    }
    if (updateData.poids_volume !== undefined) {
        updateData.poids_volume = parseFloat(updateData.poids_volume);
    }

    await produit.update(updateData);

    res.json({
        success: true,
        message: 'Produit mis à jour',
        data: produit
    });
});

/**
 * @desc    Supprimer un produit (Prestataire Boutique)
 * @route   DELETE /api/produits/:id
 * @access  Private/Prestataire
 */
const deleteProduit = asyncHandler(async (req, res) => {
    const produit = await Plat.findOne({
        where: { id: req.params.id, prestataireId: req.user.id, type: 'produit', isDeleted: false }
    });

    if (!produit) {
        res.status(404);
        throw new Error('Produit non trouvé');
    }

    // Soft delete
    await produit.update({ isDeleted: true, isAvailable: false });

    // Mettre à jour le compteur
    await Categorie.decrement('nombrePlats', { where: { id: produit.categorieId } });

    res.json({
        success: true,
        message: 'Produit supprimé'
    });
});

/**
 * @desc    Modifier le stock d'un produit
 * @route   PUT /api/produits/:id/stock
 * @access  Private/Prestataire
 */
const updateStock = asyncHandler(async (req, res) => {
    const { stock, operation } = req.body;

    const produit = await Plat.findOne({
        where: { id: req.params.id, prestataireId: req.user.id, type: 'produit', isDeleted: false }
    });

    if (!produit) {
        res.status(404);
        throw new Error('Produit non trouvé');
    }

    let newStock = produit.stock;

    if (operation === 'add') {
        newStock = produit.stock + parseInt(stock);
    } else if (operation === 'remove') {
        newStock = Math.max(0, produit.stock - parseInt(stock));
    } else {
        newStock = parseInt(stock);
    }

    await produit.update({
        stock: newStock,
        isAvailable: newStock > 0
    });

    res.json({
        success: true,
        message: 'Stock mis à jour',
        data: { stock: produit.stock, isAvailable: produit.isAvailable }
    });
});

/**
 * @desc    Statistiques boutique du prestataire
 * @route   GET /api/produits/stats
 * @access  Private/Prestataire
 */
const getBoutiqueStats = asyncHandler(async (req, res) => {
    const prestataireId = req.user.id;

    // Nombre total de produits
    const totalProduits = await Plat.count({
        where: { prestataireId, type: 'produit', isDeleted: false }
    });

    // Produits en rupture
    const enRupture = await Plat.count({
        where: { prestataireId, type: 'produit', isDeleted: false, stock: 0 }
    });

    // Produits stock bas (<=5)
    const stockBas = await Plat.count({
        where: {
            prestataireId,
            type: 'produit',
            isDeleted: false,
            stock: { [Op.gt]: 0, [Op.lte]: 5 }
        }
    });

    // Total ventes
    const ventesResult = await Plat.sum('nombreCommandes', {
        where: { prestataireId, type: 'produit', isDeleted: false }
    });

    res.json({
        success: true,
        data: {
            totalProduits,
            enRupture,
            stockBas,
            totalVentes: ventesResult || 0
        }
    });
});

module.exports = {
    getProduits,
    getFeaturedProduits,
    getOrigines,
    searchProduits,
    getProduitById,
    getMesProduits,
    createProduit,
    updateProduit,
    deleteProduit,
    updateStock,
    getBoutiqueStats
};
