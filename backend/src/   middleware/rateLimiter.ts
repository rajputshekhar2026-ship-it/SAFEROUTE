// src/middleware/rateLimiter.ts

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

// Types
interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  statusCode?: number;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

// Default configurations for different endpoints
export const rateLimitConfigs = {
  // General API rate limit
  general: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // 100 requests per minute
    message: 'Too many requests, please try again later.',
    statusCode: 429,
  },
  
  // Authentication endpoints (stricter)
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per 15 minutes
    message: 'Too many authentication attempts, please try again later.',
    statusCode: 429,
  },
  
  // SOS endpoints (very strict)
  sos: {
    windowMs: 60 * 1000, // 1 minute
    max: 3, // 3 SOS triggers per minute
    message: 'Too many SOS requests. Please wait before sending another alert.',
    statusCode: 429,
  },
  
  // Route calculation (moderate)
  route: {
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 route calculations per minute
    message: 'Too many route requests. Please slow down.',
    statusCode: 429,
  },
  
  // Reporting endpoints
  report: {
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 reports per minute
    message: 'Too many reports submitted. Please wait before submitting more.',
    statusCode: 429,
  },
  
  // Check-in endpoints
  checkin: {
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 check-ins per minute
    message: 'Too many check-in requests.',
    statusCode: 429,
  },
  
  // Admin endpoints (least restrictive)
  admin: {
    windowMs: 60 * 1000, // 1 minute
    max: 500, // 500 requests per minute for admins
    message: 'Admin rate limit exceeded.',
    statusCode: 429,
  },
  
  // WebSocket upgrade requests
  websocket: {
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 connection attempts per minute
    message: 'Too many connection attempts.',
    statusCode: 429,
  },
  
  // File uploads
  upload: {
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 uploads per minute
    message: 'Too many upload requests.',
    statusCode: 429,
  },
  
  // Crime prediction (expensive operation)
  crimePrediction: {
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 predictions per minute
    message: 'Too many prediction requests.',
    statusCode: 429,
  },
};

// Custom key generator for rate limiting
export const customKeyGenerator = (req: Request): string => {
  // Use user ID if authenticated, otherwise use IP
  const userId = (req as any).user?.id;
  if (userId) {
    return `user:${userId}`;
  }
  
  // Use IP address
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  return `ip:${ip}`;
};

// Create Redis store for rate limiting
export const createRedisStore = (prefix: string = 'rate-limit:') => {
  return new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix,
  });
};

// Create rate limiter with custom configuration
export const createRateLimiter = (config: RateLimitConfig, useRedis: boolean = true) => {
  const options: rateLimit.Options = {
    windowMs: config.windowMs,
    max: config.max,
    message: config.message || 'Too many requests, please try again later.',
    statusCode: config.statusCode || 429,
    keyGenerator: config.keyGenerator || customKeyGenerator,
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skipSuccessfulRequests: config.skipSuccessfulRequests || false,
    handler: (req: Request, res: Response) => {
      logger.warn(`Rate limit exceeded for ${customKeyGenerator(req)}`);
      res.status(config.statusCode || 429).json({
        status: 'error',
        message: config.message || 'Too many requests, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(config.windowMs / 1000),
        timestamp: new Date().toISOString(),
      });
    },
  };

  if (useRedis && redisClient) {
    options.store = createRedisStore();
  }

  return rateLimit(options);
};

// Pre-configured rate limiters
export const generalLimiter = createRateLimiter(rateLimitConfigs.general);
export const authLimiter = createRateLimiter(rateLimitConfigs.auth);
export const sosLimiter = createRateLimiter(rateLimitConfigs.sos);
export const routeLimiter = createRateLimiter(rateLimitConfigs.route);
export const reportLimiter = createRateLimiter(rateLimitConfigs.report);
export const checkinLimiter = createRateLimiter(rateLimitConfigs.checkin);
export const adminLimiter = createRateLimiter(rateLimitConfigs.admin);
export const websocketLimiter = createRateLimiter(rateLimitConfigs.websocket);
export const uploadLimiter = createRateLimiter(rateLimitConfigs.upload);
export const crimePredictionLimiter = createRateLimiter(rateLimitConfigs.crimePrediction);

// Dynamic rate limiter based on user role
export const roleBasedLimiter = (limits: { [role: string]: number }) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const role = user?.role || 'user';
    const maxRequests = limits[role] || limits.user || 100;
    
    const limiter = createRateLimiter({
      windowMs: 60000,
      max: maxRequests,
    });
    
    return limiter(req, res, next);
  };
};

// Sliding window rate limiter (more accurate)
export class SlidingWindowRateLimiter {
  private windowMs: number;
  private maxRequests: number;
  private prefix: string;

  constructor(windowMs: number, maxRequests: number, prefix: string = 'sliding:') {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.prefix = prefix;
  }

  async isAllowed(key: string): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const redisKey = `${this.prefix}${key}`;
    
    // Remove old entries
    await redisClient.zremrangebyscore(redisKey, 0, windowStart);
    
    // Count requests in current window
    const count = await redisClient.zcard(redisKey);
    const remaining = Math.max(0, this.maxRequests - count);
    
    if (count < this.maxRequests) {
      // Add current request
      await redisClient.zadd(redisKey, now, `${now}:${Math.random()}`);
      await redisClient.expire(redisKey, Math.ceil(this.windowMs / 1000));
      
      return {
        allowed: true,
        remaining: remaining - 1,
        resetTime: now + this.windowMs,
      };
    }
    
    // Get oldest request timestamp to calculate reset time
    const oldest = await redisClient.zrange(redisKey, 0, 0, 'WITHSCORES');
    const resetTime = oldest[1] ? parseInt(oldest[1]) + this.windowMs : now + this.windowMs;
    
    return {
      allowed: false,
      remaining: 0,
      resetTime,
    };
  }
}

// Token bucket rate limiter (burst handling)
export class TokenBucketRateLimiter {
  private capacity: number;
  private refillRate: number; // tokens per second
  private prefix: string;

  constructor(capacity: number, refillRate: number, prefix: string = 'token:') {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.prefix = prefix;
  }

  async isAllowed(key: string): Promise<{ allowed: boolean; remaining: number }> {
    const redisKey = `${this.prefix}${key}`;
    const now = Date.now() / 1000; // seconds
    
    const bucket = await redisClient.hgetall(redisKey);
    
    if (!bucket || Object.keys(bucket).length === 0) {
      // Initialize bucket
      await redisClient.hset(redisKey, {
        tokens: this.capacity - 1,
        lastRefill: now,
      });
      await redisClient.expire(redisKey, 3600);
      return { allowed: true, remaining: this.capacity - 1 };
    }
    
    let tokens = parseFloat(bucket.tokens || '0');
    const lastRefill = parseFloat(bucket.lastRefill || '0');
    const timePassed = now - lastRefill;
    const refill = timePassed * this.refillRate;
    
    tokens = Math.min(this.capacity, tokens + refill);
    
    if (tokens >= 1) {
      tokens -= 1;
      await redisClient.hset(redisKey, {
        tokens,
        lastRefill: now,
      });
      return { allowed: true, remaining: Math.floor(tokens) };
    }
    
    await redisClient.hset(redisKey, {
      tokens,
      lastRefill: now,
    });
    
    return { allowed: false, remaining: 0 };
  }
}

// IP-based rate limiter for unauthenticated requests
export const ipBasedLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 50,
  keyGenerator: (req: Request) => {
    return `ip:${req.ip || req.connection.remoteAddress}`;
  },
});

// Geographic rate limiter (different limits for different regions)
export const geoBasedLimiter = (limits: { [countryCode: string]: number }) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Get country code from request (you'd need a geoip service)
    const countryCode = (req as any).countryCode || 'UNKNOWN';
    const max = limits[countryCode] || limits.default || 100;
    
    const limiter = createRateLimiter({
      windowMs: 60000,
      max,
    });
    
    return limiter(req, res, next);
  };
};

// Concurrency limiter (limit simultaneous requests)
export class ConcurrencyLimiter {
  private maxConcurrent: number;
  private currentConcurrent: Map<string, number> = new Map();
  
  constructor(maxConcurrent: number = 10) {
    this.maxConcurrent = maxConcurrent;
  }
  
  async acquire(key: string): Promise<boolean> {
    const current = this.currentConcurrent.get(key) || 0;
    if (current >= this.maxConcurrent) {
      return false;
    }
    this.currentConcurrent.set(key, current + 1);
    return true;
  }
  
  release(key: string): void {
    const current = this.currentConcurrent.get(key) || 0;
    if (current > 0) {
      this.currentConcurrent.set(key, current - 1);
    }
  }
  
  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const key = (req as any).user?.id || req.ip || 'anonymous';
      const acquired = await this.acquire(key);
      
      if (!acquired) {
        res.status(429).json({
          status: 'error',
          message: 'Too many concurrent requests',
          code: 'CONCURRENCY_LIMIT_EXCEEDED',
        });
        return;
      }
      
      res.on('finish', () => this.release(key));
      next();
    };
  }
}

// Export singleton instances
export const slidingWindowLimiter = new SlidingWindowRateLimiter(60000, 100);
export const tokenBucketLimiter = new TokenBucketRateLimiter(100, 10); // 100 tokens, refill 10 per second
export const concurrencyLimiter = new ConcurrencyLimiter(10);

// Cleanup function for rate limiters
export const cleanupRateLimiters = async (): Promise<void> => {
  try {
    const keys = await redisClient.keys('rate-limit:*');
    if (keys.length > 0) {
      await redisClient.del(keys);
      logger.info(`Cleaned up ${keys.length} rate limit keys`);
    }
  } catch (error) {
    logger.error('Failed to cleanup rate limiters:', error);
  }
};

// Export all rate limiters
export default {
  generalLimiter,
  authLimiter,
  sosLimiter,
  routeLimiter,
  reportLimiter,
  checkinLimiter,
  adminLimiter,
  websocketLimiter,
  uploadLimiter,
  crimePredictionLimiter,
  ipBasedLimiter,
  roleBasedLimiter,
  geoBasedLimiter,
  slidingWindowLimiter,
  tokenBucketLimiter,
  concurrencyLimiter,
  createRateLimiter,
  cleanupRateLimiters,
};
