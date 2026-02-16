/**
 * CSRF Protection Middleware
 * 
 * Implements the Double-Submit Cookie pattern for CSRF protection.
 * This approach works well with HttpOnly authentication cookies.
 */

const crypto = require('crypto');

const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_LENGTH = 32;

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Cookie options for CSRF token
 * Note: NOT HttpOnly - must be readable by JavaScript
 */
const csrfCookieOptions = {
  httpOnly: false, // Must be accessible by JavaScript
  secure: isProduction,
  sameSite: isProduction ? 'strict' : 'lax',
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  path: '/'
};

/**
 * Generate a cryptographically secure random token
 */
const generateToken = () => {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
};

/**
 * Middleware to generate and set CSRF token
 * Should be called on GET requests to provide the token
 */
const generateCsrfToken = (req, res, next) => {
  // Generate new token if not exists or expired
  if (!req.cookies[CSRF_COOKIE_NAME]) {
    const token = generateToken();
    res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions);
    req.csrfToken = token;
  } else {
    req.csrfToken = req.cookies[CSRF_COOKIE_NAME];
  }
  next();
};

/**
 * Middleware to validate CSRF token
 * Should be applied to state-changing routes (POST, PUT, DELETE, PATCH)
 */
const validateCsrfToken = (req, res, next) => {
  // Skip CSRF check for safe methods
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Get token from cookie and header
  const cookieToken = req.cookies[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME] || req.body?._csrf;

  // Validate tokens exist and match
  if (!cookieToken || !headerToken) {
    return res.status(403).json({
      success: false,
      message: 'CSRF token missing. Please refresh the page and try again.',
      code: 'CSRF_TOKEN_MISSING'
    });
  }

  if (cookieToken !== headerToken) {
    return res.status(403).json({
      success: false,
      message: 'CSRF token mismatch. Please refresh the page and try again.',
      code: 'CSRF_TOKEN_INVALID'
    });
  }

  next();
};

/**
 * Combined middleware that generates token for GET and validates for others
 */
const csrfProtection = (req, res, next) => {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  
  if (safeMethods.includes(req.method)) {
    // Generate token for safe methods
    return generateCsrfToken(req, res, next);
  } else {
    // Validate token for state-changing methods
    return validateCsrfToken(req, res, next);
  }
};

/**
 * Route handler to get CSRF token
 * Frontend should call this to get the token for subsequent requests
 */
const getCsrfTokenHandler = (req, res) => {
  let token = req.cookies[CSRF_COOKIE_NAME];
  
  if (!token) {
    token = generateToken();
    res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions);
  }
  
  res.json({
    success: true,
    data: { csrfToken: token }
  });
};

/**
 * Routes that should be excluded from CSRF protection
 * (e.g., webhooks from external services)
 */
const excludedPaths = [
  '/api/webhooks',
  '/api/health',
  '/api/paiements/webhook'
];

/**
 * Middleware that conditionally applies CSRF protection
 * Skips protection for excluded paths
 */
const conditionalCsrfProtection = (req, res, next) => {
  // Skip for excluded paths
  const isExcluded = excludedPaths.some(path => req.path.startsWith(path));
  if (isExcluded) {
    return next();
  }
  
  return csrfProtection(req, res, next);
};

module.exports = {
  generateCsrfToken,
  validateCsrfToken,
  csrfProtection,
  conditionalCsrfProtection,
  getCsrfTokenHandler,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME
};
