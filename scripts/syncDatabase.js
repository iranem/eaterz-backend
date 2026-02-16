/**
 * Script de synchronisation de la base de données EATERZ
 * Exécuter: node scripts/syncDatabase.js
 */

require('dotenv').config();
const { sequelize } = require('../config/database');
const models = require('../models');

const syncDatabase = async () => {
    try {
        console.log('🔄 Connexion à la base de données MySQL...');
        console.log(`   Host: ${process.env.DB_HOST || 'localhost'}`);
        console.log(`   Database: ${process.env.DB_NAME || 'eaterz'}`);
        console.log(`   User: ${process.env.DB_USER || 'root'}`);

        await sequelize.authenticate();
        console.log('✅ Connexion établie avec succès!\n');

        console.log('📋 Modèles à synchroniser:');
        console.log('   - users');
        console.log('   - categories');
        console.log('   - plats');
        console.log('   - commandes');
        console.log('   - commande_items');
        console.log('   - promotions');
        console.log('   - promotion_usages');
        console.log('   - avis');
        console.log('   - notifications');
        console.log('   - litiges');
        console.log('   - favoris\n');

        // Sync avec alter: true pour ne pas perdre les données existantes
        console.log('🔄 Synchronisation des tables (ALTER mode)...');
        await sequelize.sync({ alter: true });

        console.log('\n✅ Synchronisation terminée avec succès!');
        console.log('\n📊 Vérification des tables créées...');

        // Vérifier les tables
        const [results] = await sequelize.query('SHOW TABLES');
        console.log('\nTables dans la base de données:');
        results.forEach((row, index) => {
            const tableName = Object.values(row)[0];
            console.log(`   ${index + 1}. ${tableName}`);
        });

        // Compter les enregistrements
        console.log('\n📈 Statistiques des données:');
        const counts = await Promise.all([
            models.User.count(),
            models.Categorie.count(),
            models.Plat.count(),
            models.Commande.count(),
            models.Avis.count(),
            models.Litige.count(),
            models.Notification.count(),
            models.Favori.count(),
            models.Promotion.count()
        ]);

        console.log(`   - Users: ${counts[0]}`);
        console.log(`   - Categories: ${counts[1]}`);
        console.log(`   - Plats: ${counts[2]}`);
        console.log(`   - Commandes: ${counts[3]}`);
        console.log(`   - Avis: ${counts[4]}`);
        console.log(`   - Litiges: ${counts[5]}`);
        console.log(`   - Notifications: ${counts[6]}`);
        console.log(`   - Favoris: ${counts[7]}`);
        console.log(`   - Promotions: ${counts[8]}`);


        // Optionnel : Mettre à jour les prestataires existants sans type vers 'RESTAURANT' par défaut
        const updatedCount = await models.User.update(
            { prestataireType: 'restaurant' },
            {
                where: {
                    role: 'prestataire',
                    prestataireType: null
                }
            }
        );

        if (updatedCount[0] > 0) {
            console.log(`📝 ${updatedCount[0]} prestataires existants mis à jour vers le type 'restaurant'.`);
        }

        console.log('\n🎉 Base de données EATERZ synchronisée avec succès!');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Erreur de synchronisation:', error.message);
        if (error.original) {
            console.error('   Détail MySQL:', error.original.message);
        }
        process.exit(1);
    }
};

syncDatabase();
