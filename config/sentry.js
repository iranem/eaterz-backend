/**
 * Sentry Configuration for EATERZ Server
 * Error tracking and performance monitoring
 */

const Sentry = require('@sentry/node');

const isProduction = process.env.NODE_ENV === 'production';
const sentryDsn = process.env.SENTRY_DSN;

/**
 * Initialize Sentry for error tracking and performance monitoring
 * @param {Express.Application} app - Express application instance
 */
const initSentry = (app) => {
  if (!sentryDsn) {
    console.warn('Sentry DSN not configured. Error tracking disabled.');
    return {
      initialized: false,
      captureException: (err) => console.error('Sentry not initialized:', err),
      captureMessage: (msg) => console.log('Sentry not initialized:', msg),
    };
  }

  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV || 'development',
    release: `eaterz-server@${process.env.npm_package_version || '1.0.0'}`,
    
    integrations: [
      // Enable HTTP calls tracing
      new Sentry.Integrations.Http({ tracing: true }),
      // Enable Express.js middleware tracing
      new Sentry.Integrations.Express({ app }),
    ],

    // Performance Monitoring
    tracesSampleRate: isProduction ? 0.1 : 1.0, // 10% in production, 100% in dev

    // Filter sensitive data
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request && event.request.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      
      // Remove sensitive body data
      if (event.request && event.request.data) {
        const sensitiveFields = ['password', 'mot_de_passe', 'token', 'secret'];
        sensitiveFields.forEach(field => {
          if (event.request.data[field]) {
            event.request.data[field] = '[REDACTED]';
          }
        });
      }
      
      return event;
    },

    // Ignore common non-actionable errors
    ignoreErrors: [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      /^Request aborted$/,
    ],
  });

  return {
    initialized: true,
    captureException: Sentry.captureException,
    captureMessage: Sentry.captureMessage,
    Handlers: Sentry.Handlers,
  };
};

/**
 * Sentry request handler middleware
 * Must be used as the first middleware
 */
const sentryRequestHandler = () => {
  if (!sentryDsn) {
    return (req, res, next) => next();
  }
  return Sentry.Handlers.requestHandler();
};

/**
 * Sentry tracing handler middleware
 * Must be used after request handler
 */
const sentryTracingHandler = () => {
  if (!sentryDsn) {
    return (req, res, next) => next();
  }
  return Sentry.Handlers.tracingHandler();
};

/**
 * Sentry error handler middleware
 * Must be used before other error handlers
 */
const sentryErrorHandler = () => {
  if (!sentryDsn) {
    return (err, req, res, next) => next(err);
  }
  return Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      // Only report 500+ errors
      if (error.status && error.status < 500) {
        return false;
      }
      return true;
    },
  });
};

/**
 * Capture custom exception with context
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 */
const captureError = (error, context = {}) => {
  if (!sentryDsn) {
    console.error('Error (Sentry disabled):', error, context);
    return;
  }

  Sentry.withScope((scope) => {
    if (context.user) {
      scope.setUser({
        id: context.user.id,
        email: context.user.email,
        role: context.user.role,
      });
    }

    if (context.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }

    if (context.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }

    Sentry.captureException(error);
  });
};

/**
 * Set user context for Sentry
 * @param {Object} user - User object
 */
const setUser = (user) => {
  if (!sentryDsn || !user) return;
  
  Sentry.setUser({
    id: user.id,
    email: user.email,
    role: user.role,
  });
};

/**
 * Clear user context
 */
const clearUser = () => {
  if (!sentryDsn) return;
  Sentry.setUser(null);
};

module.exports = {
  initSentry,
  sentryRequestHandler,
  sentryTracingHandler,
  sentryErrorHandler,
  captureError,
  setUser,
  clearUser,
  Sentry,
};
