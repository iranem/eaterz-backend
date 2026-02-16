/**
 * Winston Logger Configuration
 * 
 * Provides structured logging with multiple transports
 * and log rotation capabilities.
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Add colors to winston
winston.addColors(colors);

// Determine log level based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const configuredLevel = process.env.LOG_LEVEL;
  
  if (configuredLevel) {
    return configuredLevel;
  }
  
  return env === 'development' ? 'debug' : 'info';
};

// Custom format for console output (development)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaString}`;
  })
);

// Custom format for file output (production)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? fileFormat : consoleFormat,
  }),
  
  // Error log file
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
  
  // Combined log file
  new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
];

// Add HTTP log file in production
if (process.env.NODE_ENV === 'production') {
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'http.log'),
      level: 'http',
      format: fileFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: level(),
  levels,
  transports,
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Create a stream object for Morgan middleware
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

/**
 * Log request information
 * @param {Object} req - Express request object
 * @param {Object} additionalInfo - Additional information to log
 */
logger.logRequest = (req, additionalInfo = {}) => {
  logger.info('Request received', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
    ...additionalInfo,
  });
};

/**
 * Log error with request context
 * @param {Error} error - Error object
 * @param {Object} req - Express request object (optional)
 */
logger.logError = (error, req = null) => {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    name: error.name,
  };

  if (req) {
    errorInfo.method = req.method;
    errorInfo.url = req.originalUrl;
    errorInfo.ip = req.ip;
    errorInfo.userId = req.user?.id;
    errorInfo.body = req.body;
  }

  logger.error('Error occurred', errorInfo);
};

/**
 * Log database operation
 * @param {string} operation - Operation type (query, insert, update, delete)
 * @param {string} model - Model/table name
 * @param {number} duration - Duration in ms
 * @param {Object} additionalInfo - Additional information
 */
logger.logDB = (operation, model, duration, additionalInfo = {}) => {
  logger.debug('Database operation', {
    operation,
    model,
    duration: `${duration}ms`,
    ...additionalInfo,
  });
};

/**
 * Log authentication event
 * @param {string} event - Event type (login, logout, register, etc.)
 * @param {number} userId - User ID
 * @param {Object} additionalInfo - Additional information
 */
logger.logAuth = (event, userId, additionalInfo = {}) => {
  logger.info('Authentication event', {
    event,
    userId,
    ...additionalInfo,
  });
};

/**
 * Log business event
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
logger.logEvent = (event, data = {}) => {
  logger.info('Business event', {
    event,
    ...data,
  });
};

module.exports = logger;
