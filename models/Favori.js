const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Favori = sequelize.define('Favori', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  platId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'plats',
      key: 'id'
    }
  }
}, {
  tableName: 'favoris',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['platId'] },
    { fields: ['userId', 'platId'], unique: true }
  ]
});

module.exports = Favori;
