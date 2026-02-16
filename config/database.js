const { Sequelize } = require('sequelize');
require('dotenv').config();
const logger = require('./logger');

const sequelize = new Sequelize(
  process.env.DB_NAME || 'eaterz',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: false,
      freezeTableName: true
    },
    timezone: '+01:00' // Algérie timezone
  }
);

// Tester la connexion
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    logger.info('MySQL connection established successfully');
  } catch (error) {
    logger.error('Unable to connect to MySQL', { error: error.message });
    process.exit(1);
  }
};

module.exports = { sequelize, testConnection };
