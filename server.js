require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');

const { sequelize, testConnection } = require('./config/database');
const { initSocket } = require('./config/socket');
const logger = require('./config/logger');
const { initSentry, sentryRequestHandler, sentryTracingHandler, sentryErrorHandler } = require('./config/sentry');
const { safeGet, getRedisStatus } = require('./config/redis');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { conditionalCsrfProtection } = require('./middleware/csrfMiddleware');
const { secureStaticMiddleware } = require('./middleware/secureStaticMiddleware');

// Import des routes
const routes = require('./routes');

const app = express();
const server = http.createServer(app);

// Initialize Sentry (must be first)
initSentry(app);
app.use(sentryRequestHandler());
app.use(sentryTracingHandler());

// Initialiser Socket.io
initSocket(server);

// Middlewares de sécurité
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Autoriser les requêtes sans origin (ex: Postman, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token']
}));

// Rate limiting global
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 1000 : 100, // Increased for development
  message: {
    success: false,
    message: 'Trop de requêtes. Veuillez réessayer plus tard.'
  }
});
app.use('/api', limiter);

// Rate limiting strict pour l'authentification
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 100 : 10, // Increased for development
  message: {
    success: false,
    message: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.'
  }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Logging with Winston
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev', { stream: logger.stream }));
} else {
  app.use(morgan('combined', { stream: logger.stream }));
}

// Cookie parser
app.use(cookieParser());

// Parsing du body
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir les fichiers statiques (uploads) with security for sensitive files
const uploadsDir = path.join(__dirname, 'uploads');
app.use('/uploads', secureStaticMiddleware(uploadsDir), express.static(uploadsDir));

// Health check routes
app.get('/health', async (req, res) => {
  const startTime = Date.now();

  // Check database connection
  let dbStatus = { connected: false, latency: null };
  try {
    const dbStart = Date.now();
    await sequelize.authenticate();
    dbStatus = { connected: true, latency: Date.now() - dbStart };
  } catch (error) {
    dbStatus = { connected: false, error: error.message };
  }

  // Check Redis connection
  const redisStatus = getRedisStatus();

  // Overall health status
  const isHealthy = dbStatus.connected;

  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    status: isHealthy ? 'healthy' : 'unhealthy',
    message: 'EATERZ API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    uptime: process.uptime(),
    responseTime: Date.now() - startTime,
    services: {
      database: dbStatus,
      redis: redisStatus
    },
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      unit: 'MB'
    }
  });
});

// Kubernetes-style probes
app.get('/health/live', (req, res) => {
  // Liveness probe - is the process running?
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

app.get('/health/ready', async (req, res) => {
  // Readiness probe - is the app ready to accept traffic?
  try {
    await sequelize.authenticate();
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: error.message });
  }
});

// Apply CSRF protection to API routes (except excluded paths like webhooks)
app.use('/api', conditionalCsrfProtection);

// Routes API
app.use('/api', routes);

// Sentry error handler (before other error handlers)
app.use(sentryErrorHandler());

// Gestion des erreurs
app.use(notFound);
app.use(errorHandler);

// Démarrage du serveur
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Tester la connexion à la base de données
    await testConnection();

    // Synchroniser les modèles (en développement uniquement)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync();
      logger.info('Models synchronized with database');
    }

    // Initialiser les jobs CRON
    const { initScheduledOrdersJob } = require('./jobs/scheduledOrdersJob');
    initScheduledOrdersJob();

    // Démarrer le serveur
    server.listen(PORT, () => {
      logger.info(`EATERZ API Server started`, {
        environment: process.env.NODE_ENV,
        port: PORT,
        url: `http://localhost:${PORT}`
      });
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🥗 EATERZ API Server                                    ║
║                                                           ║
║   Environment: ${process.env.NODE_ENV?.padEnd(40)}║
║   Port: ${PORT.toString().padEnd(48)}║
║   URL: http://localhost:${PORT.toString().padEnd(33)}║
║                                                           ║
║   Ready to serve healthy food! 🍽️                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error('Server startup failed', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

// Gestion de l'arrêt propre
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received. Closing server...');
  await sequelize.close();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received. Closing server...');
  await sequelize.close();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

startServer();

module.exports = { app, server };
