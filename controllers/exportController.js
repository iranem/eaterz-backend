const PDFDocument = require('pdfkit');
const { Parser } = require('json2csv');
const { Commande, CommandeItem, Plat, User, Avis, Litige, sequelize } = require('../models');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { ORDER_STATUS } = require('../utils/constants');
const { Op } = require('sequelize');

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Formater une date pour l'affichage
 */
const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

/**
 * Mapper les statuts en labels français
 */
const getStatusLabel = (statut) => {
    const labels = {
        pending: 'En attente',
        confirmed: 'Confirmée',
        preparing: 'En préparation',
        ready: 'Prête',
        delivering: 'En livraison',
        delivered: 'Livrée',
        cancelled: 'Annulée'
    };
    return labels[statut] || statut;
};

/**
 * Générer l'en-tête PDF avec logo et titre
 */
const generatePDFHeader = (doc, title, subtitle = '') => {
    // En-tête avec style
    doc.rect(0, 0, doc.page.width, 100).fill('#FF6B35');

    doc.fillColor('#FFFFFF')
        .fontSize(28)
        .font('Helvetica-Bold')
        .text('EATERZ', 50, 30);

    doc.fontSize(14)
        .font('Helvetica')
        .text(title, 50, 65);

    if (subtitle) {
        doc.fontSize(10).text(subtitle, 50, 82);
    }

    // Date d'export
    doc.fillColor('#FFFFFF')
        .fontSize(10)
        .text(`Exporté le ${formatDate(new Date())}`, doc.page.width - 200, 40, { width: 150, align: 'right' });

    doc.y = 120;
};

/**
 * Ajouter un pied de page
 */
const addPDFFooter = (doc, pageNumber, totalPages) => {
    const bottomY = doc.page.height - 50;

    doc.save();
    doc.fillColor('#888888')
        .fontSize(9)
        .text(
            `Page ${pageNumber} sur ${totalPages} | EATERZ - Plateforme de livraison`,
            50,
            bottomY,
            { width: doc.page.width - 100, align: 'center' }
        );
    doc.restore();
};

/**
 * Créer un tableau dans le PDF
 */
const createPDFTable = (doc, headers, data, options = {}) => {
    const {
        startX = 50,
        startY = doc.y,
        columnWidths = [],
        headerBgColor = '#FF6B35',
        headerTextColor = '#FFFFFF',
        alternateBgColor = '#F5F5F5',
        rowHeight = 25,
        fontSize = 9,
        headerFontSize = 10
    } = options;

    let currentY = startY;
    const pageWidth = doc.page.width - 100;

    // Calculer les largeurs de colonne si non spécifiées
    const colWidths = columnWidths.length === headers.length
        ? columnWidths
        : headers.map(() => pageWidth / headers.length);

    // En-tête du tableau
    doc.rect(startX, currentY, pageWidth, rowHeight).fill(headerBgColor);

    let currentX = startX;
    headers.forEach((header, i) => {
        doc.fillColor(headerTextColor)
            .fontSize(headerFontSize)
            .font('Helvetica-Bold')
            .text(header, currentX + 5, currentY + 7, { width: colWidths[i] - 10, align: 'left' });
        currentX += colWidths[i];
    });

    currentY += rowHeight;

    // Lignes de données
    data.forEach((row, rowIndex) => {
        // Vérifier si on doit passer à une nouvelle page
        if (currentY + rowHeight > doc.page.height - 80) {
            doc.addPage();
            currentY = 50;

            // Réafficher l'en-tête du tableau sur la nouvelle page
            doc.rect(startX, currentY, pageWidth, rowHeight).fill(headerBgColor);
            currentX = startX;
            headers.forEach((header, i) => {
                doc.fillColor(headerTextColor)
                    .fontSize(headerFontSize)
                    .font('Helvetica-Bold')
                    .text(header, currentX + 5, currentY + 7, { width: colWidths[i] - 10, align: 'left' });
                currentX += colWidths[i];
            });
            currentY += rowHeight;
        }

        // Fond alterné
        if (rowIndex % 2 === 0) {
            doc.rect(startX, currentY, pageWidth, rowHeight).fill(alternateBgColor);
        }

        currentX = startX;
        row.forEach((cell, i) => {
            doc.fillColor('#333333')
                .fontSize(fontSize)
                .font('Helvetica')
                .text(String(cell ?? ''), currentX + 5, currentY + 7, {
                    width: colWidths[i] - 10,
                    align: 'left',
                    lineBreak: false
                });
            currentX += colWidths[i];
        });

        currentY += rowHeight;
    });

    doc.y = currentY + 20;
    return doc;
};

// ═══════════════════════════════════════════════════════════════
// EXPORTS CLIENT
// ═══════════════════════════════════════════════════════════════

/**
 * @desc    Export des commandes client (PDF ou CSV)
 * @route   GET /api/export/client/commandes
 * @access  Private/Client
 */
const exportClientCommandes = asyncHandler(async (req, res) => {
    const { format = 'pdf', dateDebut, dateFin, statut } = req.query;
    const clientId = req.user.id;

    // Construire les filtres
    const where = { clientId };
    if (statut) where.statut = statut;
    if (dateDebut || dateFin) {
        where.createdAt = {};
        if (dateDebut) where.createdAt[Op.gte] = new Date(dateDebut);
        if (dateFin) where.createdAt[Op.lte] = new Date(dateFin);
    }

    // Récupérer les commandes
    const commandes = await Commande.findAll({
        where,
        include: [
            { model: User, as: 'prestataire', attributes: ['id', 'nomEtablissement'] },
            { model: CommandeItem, as: 'items', include: [{ model: Plat, as: 'plat', attributes: ['nom'] }] }
        ],
        order: [['createdAt', 'DESC']]
    });

    if (format === 'csv') {
        // Export CSV
        const csvData = commandes.map(cmd => ({
            'Numéro': cmd.numero,
            'Date': formatDate(cmd.createdAt),
            'Restaurant': cmd.prestataire?.nomEtablissement || 'N/A',
            'Statut': getStatusLabel(cmd.statut),
            'Sous-total (DZD)': cmd.sousTotal,
            'Frais livraison (DZD)': cmd.fraisLivraison,
            'Réduction (DZD)': cmd.reduction || 0,
            'Total (DZD)': cmd.total,
            'Mode paiement': cmd.modePaiement,
            'Adresse': cmd.adresseLivraison,
            'Articles': cmd.items?.map(i => `${i.quantite}x ${i.plat?.nom?.fr || i.plat?.nom || 'Article'}`).join(', ') || ''
        }));

        const parser = new Parser({ fields: Object.keys(csvData[0] || {}) });
        const csv = parser.parse(csvData);

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=mes-commandes-${Date.now()}.csv`);
        return res.send('\uFEFF' + csv); // BOM pour Excel
    }

    // Export PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=mes-commandes-${Date.now()}.pdf`);

    doc.pipe(res);

    // En-tête
    generatePDFHeader(doc, 'Historique de mes commandes', `${commandes.length} commande(s) trouvée(s)`);

    // Statistiques résumées
    const totalDepense = commandes.reduce((sum, c) => sum + parseFloat(c.total), 0);
    const commandesLivrees = commandes.filter(c => c.statut === ORDER_STATUS.DELIVERED).length;

    doc.fillColor('#333333').fontSize(12).font('Helvetica-Bold').text('Résumé', 50);
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica')
        .text(`Total dépensé: ${totalDepense.toLocaleString('fr-FR')} DZD`)
        .text(`Commandes livrées: ${commandesLivrees}`)
        .text(`Commandes annulées: ${commandes.filter(c => c.statut === ORDER_STATUS.CANCELLED).length}`);

    doc.moveDown();

    // Tableau des commandes
    const headers = ['N°', 'Date', 'Restaurant', 'Statut', 'Total (DZD)'];
    const data = commandes.map(cmd => [
        cmd.numero,
        formatDate(cmd.createdAt),
        cmd.prestataire?.nomEtablissement || 'N/A',
        getStatusLabel(cmd.statut),
        `${parseFloat(cmd.total).toLocaleString('fr-FR')}`
    ]);

    createPDFTable(doc, headers, data, {
        columnWidths: [80, 100, 150, 80, 85]
    });

    doc.end();
});

// ═══════════════════════════════════════════════════════════════
// EXPORTS PRESTATAIRE
// ═══════════════════════════════════════════════════════════════

/**
 * @desc    Export des commandes prestataire (PDF ou CSV)
 * @route   GET /api/export/prestataire/commandes
 * @access  Private/Prestataire
 */
const exportPrestataireCommandes = asyncHandler(async (req, res) => {
    const { format = 'pdf', dateDebut, dateFin, statut } = req.query;
    const prestataireId = req.user.id;

    const where = { prestataireId };
    if (statut) where.statut = statut;
    if (dateDebut || dateFin) {
        where.createdAt = {};
        if (dateDebut) where.createdAt[Op.gte] = new Date(dateDebut);
        if (dateFin) where.createdAt[Op.lte] = new Date(dateFin);
    }

    const commandes = await Commande.findAll({
        where,
        include: [
            { model: User, as: 'client', attributes: ['id', 'prenom', 'nom', 'telephone'] },
            { model: CommandeItem, as: 'items', include: [{ model: Plat, as: 'plat', attributes: ['nom'] }] }
        ],
        order: [['createdAt', 'DESC']]
    });

    if (format === 'csv') {
        const csvData = commandes.map(cmd => ({
            'Numéro': cmd.numero,
            'Date': formatDate(cmd.createdAt),
            'Client': cmd.client ? `${cmd.client.prenom} ${cmd.client.nom}` : 'N/A',
            'Téléphone': cmd.client?.telephone || '',
            'Statut': getStatusLabel(cmd.statut),
            'Sous-total (DZD)': cmd.sousTotal,
            'Frais livraison (DZD)': cmd.fraisLivraison,
            'Total (DZD)': cmd.total,
            'Mode paiement': cmd.modePaiement,
            'Adresse livraison': cmd.adresseLivraison,
            'Ville': cmd.villeLivraison || '',
            'Articles': cmd.items?.map(i => `${i.quantite}x ${i.plat?.nom?.fr || i.plat?.nom || 'Article'}`).join(', ') || ''
        }));

        const parser = new Parser({ fields: Object.keys(csvData[0] || {}) });
        const csv = parser.parse(csvData);

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=commandes-prestataire-${Date.now()}.csv`);
        return res.send('\uFEFF' + csv);
    }

    // Export PDF
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=commandes-prestataire-${Date.now()}.pdf`);

    doc.pipe(res);

    generatePDFHeader(doc, 'Rapport des commandes', `${commandes.length} commande(s) | ${req.user.nomEtablissement || 'Mon établissement'}`);

    // KPIs
    const totalCA = commandes.filter(c => c.statut === ORDER_STATUS.DELIVERED).reduce((sum, c) => sum + parseFloat(c.total), 0);
    const commandesLivrees = commandes.filter(c => c.statut === ORDER_STATUS.DELIVERED).length;
    const panierMoyen = commandesLivrees > 0 ? totalCA / commandesLivrees : 0;

    doc.fillColor('#333333').fontSize(12).font('Helvetica-Bold').text('Indicateurs clés', 40);
    doc.moveDown(0.5);

    // Afficher les KPIs en ligne
    const kpiY = doc.y;
    doc.fontSize(10).font('Helvetica');
    doc.text(`CA Total: ${totalCA.toLocaleString('fr-FR')} DZD`, 40, kpiY);
    doc.text(`Commandes livrées: ${commandesLivrees}`, 240, kpiY);
    doc.text(`Panier moyen: ${panierMoyen.toFixed(0)} DZD`, 440, kpiY);
    doc.text(`En attente: ${commandes.filter(c => c.statut === ORDER_STATUS.PENDING).length}`, 640, kpiY);

    doc.moveDown(2);

    // Tableau
    const headers = ['N°', 'Date', 'Client', 'Téléphone', 'Statut', 'Total (DZD)', 'Paiement'];
    const data = commandes.map(cmd => [
        cmd.numero,
        formatDate(cmd.createdAt),
        cmd.client ? `${cmd.client.prenom} ${cmd.client.nom}` : 'N/A',
        cmd.client?.telephone || '',
        getStatusLabel(cmd.statut),
        `${parseFloat(cmd.total).toLocaleString('fr-FR')}`,
        cmd.modePaiement
    ]);

    createPDFTable(doc, headers, data, {
        startX: 40,
        columnWidths: [80, 100, 130, 100, 95, 90, 80]
    });

    doc.end();
});

/**
 * @desc    Export du rapport de ventes prestataire (PDF)
 * @route   GET /api/export/prestataire/rapport-ventes
 * @access  Private/Prestataire
 */
const exportPrestataireRapportVentes = asyncHandler(async (req, res) => {
    const prestataireId = req.user.id;
    const { mois, annee } = req.query;

    const year = parseInt(annee) || new Date().getFullYear();
    const month = parseInt(mois) || new Date().getMonth() + 1;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Récupérer les données
    const commandes = await Commande.findAll({
        where: {
            prestataireId,
            createdAt: { [Op.between]: [startDate, endDate] },
            statut: { [Op.ne]: ORDER_STATUS.CANCELLED }
        },
        include: [
            { model: CommandeItem, as: 'items', include: [{ model: Plat, as: 'plat', attributes: ['nom', 'prix'] }] }
        ],
        order: [['createdAt', 'ASC']]
    });

    // Calculer les stats
    const commandesLivrees = commandes.filter(c => c.statut === ORDER_STATUS.DELIVERED);
    const totalCA = commandesLivrees.reduce((sum, c) => sum + parseFloat(c.total), 0);
    const totalFrais = commandesLivrees.reduce((sum, c) => sum + parseFloat(c.fraisLivraison), 0);
    const totalReductions = commandes.reduce((sum, c) => sum + parseFloat(c.reduction || 0), 0);

    // Ventes par jour
    const ventesParJour = {};
    commandesLivrees.forEach(cmd => {
        const jour = new Date(cmd.createdAt).toLocaleDateString('fr-FR');
        if (!ventesParJour[jour]) {
            ventesParJour[jour] = { count: 0, total: 0 };
        }
        ventesParJour[jour].count++;
        ventesParJour[jour].total += parseFloat(cmd.total);
    });

    // Top plats vendus
    const platsStat = {};
    commandes.forEach(cmd => {
        cmd.items?.forEach(item => {
            const nom = item.plat?.nom?.fr || item.plat?.nom || 'Article inconnu';
            if (!platsStat[nom]) {
                platsStat[nom] = { quantite: 0, total: 0 };
            }
            platsStat[nom].quantite += item.quantite;
            platsStat[nom].total += parseFloat(item.sousTotal);
        });
    });

    const topPlats = Object.entries(platsStat)
        .sort((a, b) => b[1].quantite - a[1].quantite)
        .slice(0, 10);

    // Générer le PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    const moisNom = new Date(year, month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=rapport-ventes-${month}-${year}.pdf`);

    doc.pipe(res);

    generatePDFHeader(doc, 'Rapport de ventes mensuel', moisNom);

    // Section KPIs
    doc.fillColor('#FF6B35').fontSize(14).font('Helvetica-Bold').text('📊 Indicateurs clés', 50);
    doc.moveDown(0.5);

    // Boîtes de KPIs
    const kpiBoxY = doc.y;
    const kpiBoxWidth = 120;
    const kpiBoxHeight = 60;

    // Chiffre d'affaires
    doc.rect(50, kpiBoxY, kpiBoxWidth, kpiBoxHeight).stroke('#FF6B35');
    doc.fillColor('#333333').fontSize(9).text('Chiffre d\'affaires', 55, kpiBoxY + 8);
    doc.fillColor('#FF6B35').fontSize(14).font('Helvetica-Bold').text(`${totalCA.toLocaleString('fr-FR')} DZD`, 55, kpiBoxY + 28);

    // Commandes
    doc.rect(180, kpiBoxY, kpiBoxWidth, kpiBoxHeight).stroke('#4CAF50');
    doc.fillColor('#333333').font('Helvetica').fontSize(9).text('Commandes livrées', 185, kpiBoxY + 8);
    doc.fillColor('#4CAF50').fontSize(14).font('Helvetica-Bold').text(`${commandesLivrees.length}`, 185, kpiBoxY + 28);

    // Panier moyen
    const panierMoyen = commandesLivrees.length > 0 ? totalCA / commandesLivrees.length : 0;
    doc.rect(310, kpiBoxY, kpiBoxWidth, kpiBoxHeight).stroke('#2196F3');
    doc.fillColor('#333333').font('Helvetica').fontSize(9).text('Panier moyen', 315, kpiBoxY + 8);
    doc.fillColor('#2196F3').fontSize(14).font('Helvetica-Bold').text(`${panierMoyen.toFixed(0)} DZD`, 315, kpiBoxY + 28);

    // Réductions
    doc.rect(440, kpiBoxY, kpiBoxWidth, kpiBoxHeight).stroke('#FF9800');
    doc.fillColor('#333333').font('Helvetica').fontSize(9).text('Réductions accordées', 445, kpiBoxY + 8);
    doc.fillColor('#FF9800').fontSize(14).font('Helvetica-Bold').text(`${totalReductions.toLocaleString('fr-FR')} DZD`, 445, kpiBoxY + 28);

    doc.y = kpiBoxY + kpiBoxHeight + 30;

    // Top 10 plats
    doc.fillColor('#FF6B35').fontSize(14).font('Helvetica-Bold').text('🍽️ Top 10 des plats vendus', 50);
    doc.moveDown(0.5);

    if (topPlats.length > 0) {
        const headers = ['Rang', 'Plat', 'Quantité', 'CA (DZD)'];
        const data = topPlats.map(([nom, stats], i) => [
            `#${i + 1}`,
            nom.length > 30 ? nom.substring(0, 27) + '...' : nom,
            stats.quantite,
            stats.total.toLocaleString('fr-FR')
        ]);

        createPDFTable(doc, headers, data, {
            columnWidths: [50, 250, 80, 115]
        });
    } else {
        doc.fillColor('#666666').fontSize(10).font('Helvetica').text('Aucune vente ce mois-ci.');
    }

    doc.moveDown();

    // Ventes par jour
    doc.fillColor('#FF6B35').fontSize(14).font('Helvetica-Bold').text('📅 Détail par jour', 50);
    doc.moveDown(0.5);

    const ventesHeaders = ['Date', 'Nb Commandes', 'Total (DZD)'];
    const ventesData = Object.entries(ventesParJour).map(([jour, stats]) => [
        jour,
        stats.count,
        stats.total.toLocaleString('fr-FR')
    ]);

    if (ventesData.length > 0) {
        createPDFTable(doc, ventesHeaders, ventesData, {
            columnWidths: [180, 150, 165]
        });
    }

    doc.end();
});

// ═══════════════════════════════════════════════════════════════
// EXPORTS ADMIN
// ═══════════════════════════════════════════════════════════════

/**
 * @desc    Export de toutes les commandes (Admin) - PDF ou CSV
 * @route   GET /api/export/admin/commandes
 * @access  Private/Admin
 */
const exportAdminCommandes = asyncHandler(async (req, res) => {
    const { format = 'pdf', dateDebut, dateFin, statut, prestataireId } = req.query;

    const where = {};
    if (statut) where.statut = statut;
    if (prestataireId) where.prestataireId = prestataireId;
    if (dateDebut || dateFin) {
        where.createdAt = {};
        if (dateDebut) where.createdAt[Op.gte] = new Date(dateDebut);
        if (dateFin) where.createdAt[Op.lte] = new Date(dateFin);
    }

    const commandes = await Commande.findAll({
        where,
        include: [
            { model: User, as: 'client', attributes: ['id', 'prenom', 'nom', 'email'] },
            { model: User, as: 'prestataire', attributes: ['id', 'nomEtablissement'] }
        ],
        order: [['createdAt', 'DESC']],
        limit: 1000 // Limiter pour éviter les exports trop lourds
    });

    if (format === 'csv') {
        const csvData = commandes.map(cmd => ({
            'ID': cmd.id,
            'Numéro': cmd.numero,
            'Date': formatDate(cmd.createdAt),
            'Client': cmd.client ? `${cmd.client.prenom} ${cmd.client.nom}` : 'N/A',
            'Email client': cmd.client?.email || '',
            'Prestataire': cmd.prestataire?.nomEtablissement || 'N/A',
            'Statut': getStatusLabel(cmd.statut),
            'Sous-total (DZD)': cmd.sousTotal,
            'Frais livraison (DZD)': cmd.fraisLivraison,
            'Réduction (DZD)': cmd.reduction || 0,
            'Total (DZD)': cmd.total,
            'Mode paiement': cmd.modePaiement,
            'Statut paiement': cmd.statutPaiement,
            'Adresse': cmd.adresseLivraison,
            'Ville': cmd.villeLivraison || ''
        }));

        const parser = new Parser({ fields: Object.keys(csvData[0] || {}) });
        const csv = parser.parse(csvData);

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=toutes-commandes-${Date.now()}.csv`);
        return res.send('\uFEFF' + csv);
    }

    // PDF
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=rapport-commandes-admin-${Date.now()}.pdf`);

    doc.pipe(res);

    generatePDFHeader(doc, 'Rapport administrateur - Commandes', `${commandes.length} commande(s) exportée(s)`);

    // Stats rapides
    const totalCA = commandes.filter(c => c.statut === ORDER_STATUS.DELIVERED).reduce((sum, c) => sum + parseFloat(c.total), 0);
    const commandesParStatut = {};
    commandes.forEach(c => {
        commandesParStatut[c.statut] = (commandesParStatut[c.statut] || 0) + 1;
    });

    doc.fillColor('#333333').fontSize(11).font('Helvetica-Bold').text('Résumé:', 40);
    doc.fontSize(10).font('Helvetica');
    Object.entries(commandesParStatut).forEach(([s, count]) => {
        doc.text(`• ${getStatusLabel(s)}: ${count}`, 50);
    });
    doc.text(`• Chiffre d'affaires (livrées): ${totalCA.toLocaleString('fr-FR')} DZD`, 50);
    doc.moveDown();

    // Tableau
    const headers = ['N°', 'Date', 'Client', 'Prestataire', 'Statut', 'Total (DZD)'];
    const data = commandes.slice(0, 50).map(cmd => [
        cmd.numero,
        formatDate(cmd.createdAt),
        cmd.client ? `${cmd.client.prenom} ${cmd.client.nom}` : 'N/A',
        cmd.prestataire?.nomEtablissement || 'N/A',
        getStatusLabel(cmd.statut),
        parseFloat(cmd.total).toLocaleString('fr-FR')
    ]);

    createPDFTable(doc, headers, data, {
        startX: 40,
        columnWidths: [90, 110, 150, 170, 95, 90]
    });

    if (commandes.length > 50) {
        doc.moveDown();
        doc.fillColor('#888888').fontSize(9).text(`Note: Seules les 50 premières commandes sont affichées. Utilisez l'export CSV pour l'ensemble des données.`);
    }

    doc.end();
});

/**
 * @desc    Export des utilisateurs (Admin) - CSV uniquement
 * @route   GET /api/export/admin/utilisateurs
 * @access  Private/Admin
 */
const exportAdminUtilisateurs = asyncHandler(async (req, res) => {
    const { role, isActive } = req.query;

    const where = {};
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const utilisateurs = await User.findAll({
        where,
        attributes: { exclude: ['password', 'resetPasswordToken', 'resetPasswordExpires'] },
        order: [['createdAt', 'DESC']]
    });

    const csvData = utilisateurs.map(u => ({
        'ID': u.id,
        'Prénom': u.prenom,
        'Nom': u.nom,
        'Email': u.email,
        'Téléphone': u.telephone || '',
        'Rôle': u.role,
        'Établissement': u.nomEtablissement || '',
        'Adresse': u.adresse || '',
        'Ville': u.ville || '',
        'Actif': u.isActive ? 'Oui' : 'Non',
        'Email vérifié': u.emailVerified ? 'Oui' : 'Non',
        'Date inscription': formatDate(u.createdAt),
        'Dernière connexion': u.lastLogin ? formatDate(u.lastLogin) : 'Jamais'
    }));

    const parser = new Parser({ fields: Object.keys(csvData[0] || {}) });
    const csv = parser.parse(csvData);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=utilisateurs-${Date.now()}.csv`);
    res.send('\uFEFF' + csv);
});

/**
 * @desc    Export des avis (Admin) - CSV
 * @route   GET /api/export/admin/avis
 * @access  Private/Admin
 */
const exportAdminAvis = asyncHandler(async (req, res) => {
    const { dateDebut, dateFin, note } = req.query;

    const where = {};
    if (note) where.note = note;
    if (dateDebut || dateFin) {
        where.createdAt = {};
        if (dateDebut) where.createdAt[Op.gte] = new Date(dateDebut);
        if (dateFin) where.createdAt[Op.lte] = new Date(dateFin);
    }

    const avis = await Avis.findAll({
        where,
        include: [
            { model: User, as: 'client', attributes: ['id', 'prenom', 'nom'] },
            { model: Plat, as: 'plat', attributes: ['id', 'nom'] }
        ],
        order: [['createdAt', 'DESC']]
    });

    const csvData = avis.map(a => ({
        'ID': a.id,
        'Date': formatDate(a.createdAt),
        'Client': a.client ? `${a.client.prenom} ${a.client.nom}` : 'N/A',
        'Plat': a.plat?.nom?.fr || a.plat?.nom || 'N/A',
        'Note': a.note,
        'Commentaire': a.commentaire || '',
        'Signalé': a.isSignaled ? 'Oui' : 'Non',
        'Visible': a.isVisible ? 'Oui' : 'Non'
    }));

    const parser = new Parser({ fields: Object.keys(csvData[0] || {}) });
    const csv = parser.parse(csvData);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=avis-${Date.now()}.csv`);
    res.send('\uFEFF' + csv);
});

/**
 * @desc    Export des litiges (Admin) - CSV
 * @route   GET /api/export/admin/litiges
 * @access  Private/Admin
 */
const exportAdminLitiges = asyncHandler(async (req, res) => {
    const { statut, priorite } = req.query;

    const where = {};
    if (statut) where.statut = statut;
    if (priorite) where.priorite = priorite;

    const litiges = await Litige.findAll({
        where,
        include: [
            { model: User, as: 'plaignant', attributes: ['id', 'prenom', 'nom', 'role'] },
            { model: Commande, as: 'commande', attributes: ['id', 'numero'] }
        ],
        order: [['createdAt', 'DESC']]
    });

    const csvData = litiges.map(l => ({
        'ID': l.id,
        'Date création': formatDate(l.createdAt),
        'N° Commande': l.commande?.numero || 'N/A',
        'Plaignant': l.plaignant ? `${l.plaignant.prenom} ${l.plaignant.nom}` : 'N/A',
        'Rôle plaignant': l.plaignant?.role || '',
        'Motif': l.motif,
        'Description': l.description || '',
        'Statut': l.statut,
        'Priorité': l.priorite,
        'Résolution': l.resolution || '',
        'Date résolution': l.dateResolution ? formatDate(l.dateResolution) : ''
    }));

    const parser = new Parser({ fields: Object.keys(csvData[0] || {}) });
    const csv = parser.parse(csvData);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=litiges-${Date.now()}.csv`);
    res.send('\uFEFF' + csv);
});

module.exports = {
    exportClientCommandes,
    exportPrestataireCommandes,
    exportPrestataireRapportVentes,
    exportAdminCommandes,
    exportAdminUtilisateurs,
    exportAdminAvis,
    exportAdminLitiges
};
