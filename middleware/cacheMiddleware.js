/**
 * Cache Middleware
 * 
 * Provides Redis-based caching for API responses.
 * Gracefully falls back to no-cache if Redis is unavailable.
 */

const { safeGet, safeSet, safeDel, deleteByPattern, isRedisConnected } = require('../config/redis');
const logger = require('../config/logger');

// Default cache TTL values (in seconds)
const CACHE_TTL = {
  SHORT: 60,           // 1 minute
  MEDIUM: 300,         // 5 minutes
  LONG: 900,           // 15 minutes
  VERY_LONG: 3600,     // 1 hour
  DAY: 86400,          // 24 hours
};

/**
 * Generate cache key from request
 * @param {Object} req - Express request object
 * @param {string} prefix - Optional prefix for the key
 */
const generateCacheKey = (req, prefix = 'cache') => {
  const path = req.originalUrl || req.url;
  const userId = req.user?.id || 'anon';
  return `${prefix}:${path}:${userId}`;
};

/**
 * Cache middleware factory
 * @param {number} ttl - Time to live in seconds
 * @param {Object} options - Additional options
 */
const cacheMiddleware = (ttl = CACHE_TTL.MEDIUM, options = {}) => {
  const {
    prefix = 'api',
    keyGenerator = generateCacheKey,
    condition = () => true, // Function to determine if response should be cached
    private: isPrivate = false, // If true, includes user ID in key
  } = options;

  return async (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Check if caching condition is met
    if (!condition(req)) {
      return next();
    }

    // Generate cache key
    const cacheKey = isPrivate 
      ? keyGenerator(req, prefix)
      : `${prefix}:${req.originalUrl || req.url}`;

    try {
      // Try to get cached response
      const cached = await safeGet(cacheKey);
      
      if (cached) {
        logger.debug('Cache hit', { key: cacheKey });
        const data = JSON.parse(cached);
        res.set('X-Cache', 'HIT');
        return res.json(data);
      }

      logger.debug('Cache miss', { key: cacheKey });

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json method to cache response
      res.json = (body) => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          safeSet(cacheKey, JSON.stringify(body), ttl)
            .then(() => logger.debug('Cached response', { key: cacheKey, ttl }))
            .catch(err => logger.error('Cache set error', { error: err.message }));
        }
        
        res.set('X-Cache', 'MISS');
        return originalJson(body);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error', { error: error.message });
      next();
    }
  };
};

/**
 * Invalidate cache for specific patterns
 * @param {string|string[]} patterns - Cache key patterns to invalidate
 */
const invalidateCache = async (patterns) => {
  const patternsArray = Array.isArray(patterns) ? patterns : [patterns];
  
  for (const pattern of patternsArray) {
    await deleteByPattern(pattern);
    logger.debug('Cache invalidated', { pattern });
  }
};

/**
 * Middleware to invalidate cache after mutation
 * @param {string|string[]|Function} patterns - Patterns to invalidate or function that returns patterns
 */
const invalidateCacheMiddleware = (patterns) => {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to invalidate cache after successful response
    res.json = async (body) => {
      // Only invalidate on successful mutations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const patternsToInvalidate = typeof patterns === 'function' 
          ? patterns(req, body)
          : patterns;
        
        await invalidateCache(patternsToInvalidate);
      }
      
      return originalJson(body);
    };

    next();
  };
};

/**
 * Pre-configured cache middlewares for common use cases
 */
const cachePresets = {
  // Public endpoints - no user-specific data
  publicShort: cacheMiddleware(CACHE_TTL.SHORT, { prefix: 'public' }),
  publicMedium: cacheMiddleware(CACHE_TTL.MEDIUM, { prefix: 'public' }),
  publicLong: cacheMiddleware(CACHE_TTL.LONG, { prefix: 'public' }),

  // Private endpoints - user-specific data
  privateShort: cacheMiddleware(CACHE_TTL.SHORT, { prefix: 'private', private: true }),
  privateMedium: cacheMiddleware(CACHE_TTL.MEDIUM, { prefix: 'private', private: true }),

  // Specific use cases
  categories: cacheMiddleware(CACHE_TTL.LONG, { prefix: 'categories' }),
  featuredPlats: cacheMiddleware(CACHE_TTL.MEDIUM, { prefix: 'featured' }),
  platDetails: cacheMiddleware(CACHE_TTL.MEDIUM, { prefix: 'plat' }),
};

/**
 * Cache invalidation patterns for common operations
 */
const invalidationPatterns = {
  plat: (platId) => [`plat:*`, `public:*plats*`, `featured:*`],
  categorie: (catId) => [`categories:*`, `public:*categories*`],
  commande: (userId) => [`private:*commandes*:${userId}`],
  avis: (platId) => [`plat:*${platId}*`, `public:*plats/${platId}*`],
};

module.exports = {
  cacheMiddleware,
  invalidateCache,
  invalidateCacheMiddleware,
  cachePresets,
  invalidationPatterns,
  generateCacheKey,
  CACHE_TTL
};
