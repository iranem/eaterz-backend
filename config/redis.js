/**
 * Redis Configuration
 * 
 * Provides Redis client for caching and session management.
 * Falls back gracefully if Redis is not available.
 */

const Redis = require('ioredis');
const logger = require('./logger');

// Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB) || 0,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
};

// Create Redis client
let redis = null;
let isConnected = false;

/**
 * Initialize Redis connection
 */
const initRedis = async () => {
  if (redis) return redis;

  try {
    redis = new Redis(redisConfig);

    redis.on('connect', () => {
      logger.info('Redis client connected');
      isConnected = true;
    });

    redis.on('ready', () => {
      logger.info('Redis client ready');
    });

    redis.on('error', (err) => {
      logger.error('Redis client error', { error: err.message });
      isConnected = false;
    });

    redis.on('close', () => {
      logger.warn('Redis connection closed');
      isConnected = false;
    });

    redis.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });

    // Try to connect
    await redis.connect();
    
    return redis;
  } catch (error) {
    logger.warn('Redis connection failed, caching disabled', { error: error.message });
    redis = null;
    return null;
  }
};

/**
 * Get Redis client (with lazy initialization)
 */
const getRedis = () => {
  return redis;
};

/**
 * Check if Redis is connected
 */
const isRedisConnected = () => {
  return isConnected && redis !== null;
};

/**
 * Safely get value from Redis
 * Returns null if Redis is not available
 */
const safeGet = async (key) => {
  if (!isRedisConnected()) return null;
  try {
    return await redis.get(key);
  } catch (error) {
    logger.error('Redis GET error', { key, error: error.message });
    return null;
  }
};

/**
 * Safely set value in Redis
 * Returns false if Redis is not available
 */
const safeSet = async (key, value, ttl = null) => {
  if (!isRedisConnected()) return false;
  try {
    if (ttl) {
      await redis.setex(key, ttl, value);
    } else {
      await redis.set(key, value);
    }
    return true;
  } catch (error) {
    logger.error('Redis SET error', { key, error: error.message });
    return false;
  }
};

/**
 * Safely delete value from Redis
 */
const safeDel = async (key) => {
  if (!isRedisConnected()) return false;
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    logger.error('Redis DEL error', { key, error: error.message });
    return false;
  }
};

/**
 * Delete all keys matching a pattern
 */
const deleteByPattern = async (pattern) => {
  if (!isRedisConnected()) return false;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return true;
  } catch (error) {
    logger.error('Redis pattern delete error', { pattern, error: error.message });
    return false;
  }
};

/**
 * Close Redis connection
 */
const closeRedis = async () => {
  if (redis) {
    await redis.quit();
    redis = null;
    isConnected = false;
    logger.info('Redis connection closed');
  }
};

/**
 * Get Redis status for health check
 */
const getRedisStatus = async () => {
  if (!isRedisConnected()) {
    return { connected: false, status: 'disconnected' };
  }
  
  try {
    const pong = await redis.ping();
    return {
      connected: true,
      status: 'healthy',
      ping: pong
    };
  } catch (error) {
    return {
      connected: false,
      status: 'error',
      error: error.message
    };
  }
};

module.exports = {
  initRedis,
  getRedis,
  isRedisConnected,
  safeGet,
  safeSet,
  safeDel,
  deleteByPattern,
  closeRedis,
  getRedisStatus
};
