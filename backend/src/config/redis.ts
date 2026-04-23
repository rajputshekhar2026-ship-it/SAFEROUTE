// src/config/redis.ts

import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Redis configuration interface
interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean;
  retryStrategy?: (times: number) => number | null;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
}

// Parse Redis URL or use individual parameters
const parseRedisConfig = (): RedisConfig => {
  const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
  
  if (redisUrl) {
    try {
      const url = new URL(redisUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port || '6379'),
        password: url.password || undefined,
        tls: url.protocol === 'rediss:',
        retryStrategy: (times: number) => {
          if (times > 10) {
            logger.error(`Redis: Max retry attempts reached (${times})`);
            return null;
          }
          const delay = Math.min(times * 100, 3000);
          logger.warn(`Redis: Connection attempt ${times} failed, retrying in ${delay}ms`);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
      };
    } catch (error) {
      logger.error('Failed to parse Redis URL:', error);
    }
  }
  
  // Use individual environment variables
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    tls: process.env.REDIS_TLS === 'true',
    retryStrategy: (times: number) => {
      if (times > 10) {
        logger.error(`Redis: Max retry attempts reached (${times})`);
        return null;
      }
      const delay = Math.min(times * 100, 3000);
      logger.warn(`Redis: Connection attempt ${times} failed, retrying in ${delay}ms`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  };
};

// Create Redis client
const config = parseRedisConfig();

let redisClient: Redis;
let publisherClient: Redis;
let subscriberClient: Redis;

// Initialize Redis clients
const initializeClients = (): void => {
  const redisConfig: Redis.RedisOptions = {
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    retryStrategy: config.retryStrategy,
    maxRetriesPerRequest: config.maxRetriesPerRequest,
    enableReadyCheck: config.enableReadyCheck,
    lazyConnect: config.lazyConnect,
    showFriendlyErrorStack: process.env.NODE_ENV !== 'production',
  };

  if (config.tls) {
    redisConfig.tls = {};
  }

  // Main client for general operations
  redisClient = new Redis(redisConfig);
  
  // Publisher client for pub/sub
  publisherClient = new Redis(redisConfig);
  
  // Subscriber client for pub/sub
  subscriberClient = new Redis(redisConfig);

  // Set up event handlers for main client
  redisClient.on('connect', () => {
    logger.info('Redis: Connecting...');
  });

  redisClient.on('ready', () => {
    logger.info('Redis: Connected and ready');
  });

  redisClient.on('error', (err) => {
    logger.error('Redis: Connection error', err);
  });

  redisClient.on('close', () => {
    logger.warn('Redis: Connection closed');
  });

  redisClient.on('reconnecting', (delay) => {
    logger.info(`Redis: Reconnecting in ${delay}ms`);
  });

  redisClient.on('end', () => {
    logger.info('Redis: Connection ended');
  });

  // Event handlers for publisher
  publisherClient.on('ready', () => {
    logger.debug('Redis Publisher: Ready');
  });

  publisherClient.on('error', (err) => {
    logger.error('Redis Publisher: Error', err);
  });

  // Event handlers for subscriber
  subscriberClient.on('ready', () => {
    logger.debug('Redis Subscriber: Ready');
  });

  subscriberClient.on('error', (err) => {
    logger.error('Redis Subscriber: Error', err);
  });
};

// Initialize clients
initializeClients();

// Test Redis connection
export const testConnection = async (): Promise<boolean> => {
  try {
    await redisClient.ping();
    await publisherClient.ping();
    await subscriberClient.ping();
    logger.info('Redis connection successful');
    return true;
  } catch (error) {
    logger.error('Redis connection failed:', error);
    return false;
  }
};

// Health check
export const healthCheck = async (): Promise<{
  status: 'healthy' | 'unhealthy';
  latency: number;
  memory?: string;
}> => {
  const start = Date.now();
  try {
    await redisClient.ping();
    const latency = Date.now() - start;
    
    let memory: string | undefined;
    try {
      const info = await redisClient.info('memory');
      const usedMemory = info.match(/used_memory_human:(\S+)/);
      memory = usedMemory ? usedMemory[1] : undefined;
    } catch (err) {
      // Ignore memory info errors
    }
    
    return {
      status: 'healthy',
      latency,
      memory,
    };
  } catch (error) {
    const latency = Date.now() - start;
    return {
      status: 'unhealthy',
      latency,
    };
  }
};

// Get Redis stats
export const getStats = async (): Promise<Record<string, any>> => {
  try {
    const info = await redisClient.info();
    const stats: Record<string, any> = {};
    
    // Parse Redis INFO output
    const lines = info.split('\n');
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      }
    }
    
    return stats;
  } catch (error) {
    logger.error('Failed to get Redis stats:', error);
    return {};
  }
};

// Cache helper functions
export const cacheGet = async <T>(key: string): Promise<T | null> => {
  try {
    const data = await redisClient.get(key);
    if (data) {
      return JSON.parse(data) as T;
    }
    return null;
  } catch (error) {
    logger.error(`Redis cache get error for key ${key}:`, error);
    return null;
  }
};

export const cacheSet = async <T>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<boolean> => {
  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await redisClient.setex(key, ttlSeconds, serialized);
    } else {
      await redisClient.set(key, serialized);
    }
    return true;
  } catch (error) {
    logger.error(`Redis cache set error for key ${key}:`, error);
    return false;
  }
};

export const cacheDel = async (key: string): Promise<boolean> => {
  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    logger.error(`Redis cache delete error for key ${key}:`, error);
    return false;
  }
};

export const cacheClear = async (pattern: string = '*'): Promise<number> => {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      const deleted = await redisClient.del(keys);
      logger.info(`Cleared ${deleted} Redis keys matching pattern: ${pattern}`);
      return deleted;
    }
    return 0;
  } catch (error) {
    logger.error(`Redis cache clear error for pattern ${pattern}:`, error);
    return 0;
  }
};

// Rate limiting helper
export const rateLimit = async (
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> => {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const redisKey = `rate_limit:${key}`;
  
  try {
    // Remove old entries
    await redisClient.zremrangebyscore(redisKey, 0, windowStart);
    
    // Count requests in current window
    const count = await redisClient.zcard(redisKey);
    const remaining = Math.max(0, maxRequests - count);
    
    if (count < maxRequests) {
      // Add current request
      await redisClient.zadd(redisKey, now, `${now}:${Math.random()}`);
      await redisClient.expire(redisKey, windowSeconds);
      
      return {
        allowed: true,
        remaining: remaining - 1,
        resetTime: now + windowSeconds * 1000,
      };
    }
    
    // Get oldest request timestamp to calculate reset time
    const oldest = await redisClient.zrange(redisKey, 0, 0, 'WITHSCORES');
    const resetTime = oldest[1] ? parseInt(oldest[1]) + windowSeconds * 1000 : now + windowSeconds * 1000;
    
    return {
      allowed: false,
      remaining: 0,
      resetTime,
    };
  } catch (error) {
    logger.error(`Rate limit error for key ${key}:`, error);
    return { allowed: true, remaining: maxRequests - 1, resetTime: now + windowSeconds * 1000 };
  }
};

// Distributed lock helper
export const acquireLock = async (
  lockKey: string,
  ttlSeconds: number = 10
): Promise<boolean> => {
  try {
    const result = await redisClient.set(
      `lock:${lockKey}`,
      Date.now().toString(),
      'NX',
      'EX',
      ttlSeconds
    );
    return result === 'OK';
  } catch (error) {
    logger.error(`Failed to acquire lock for key ${lockKey}:`, error);
    return false;
  }
};

export const releaseLock = async (lockKey: string): Promise<boolean> => {
  try {
    await redisClient.del(`lock:${lockKey}`);
    return true;
  } catch (error) {
    logger.error(`Failed to release lock for key ${lockKey}:`, error);
    return false;
  }
};

// Pub/Sub helpers
export const publish = async (channel: string, message: any): Promise<number> => {
  try {
    const serialized = JSON.stringify(message);
    const recipients = await publisherClient.publish(channel, serialized);
    logger.debug(`Published message to channel ${channel}, recipients: ${recipients}`);
    return recipients;
  } catch (error) {
    logger.error(`Failed to publish to channel ${channel}:`, error);
    return 0;
  }
};

export const subscribe = async (
  channel: string,
  callback: (message: any) => void
): Promise<void> => {
  try {
    await subscriberClient.subscribe(channel);
    subscriberClient.on('message', (ch, message) => {
      if (ch === channel) {
        try {
          const parsed = JSON.parse(message);
          callback(parsed);
        } catch (error) {
          logger.error(`Failed to parse message from channel ${channel}:`, error);
        }
      }
    });
    logger.info(`Subscribed to Redis channel: ${channel}`);
  } catch (error) {
    logger.error(`Failed to subscribe to channel ${channel}:`, error);
  }
};

export const unsubscribe = async (channel: string): Promise<void> => {
  try {
    await subscriberClient.unsubscribe(channel);
    logger.info(`Unsubscribed from Redis channel: ${channel}`);
  } catch (error) {
    logger.error(`Failed to unsubscribe from channel ${channel}:`, error);
  }
};

// Session management helpers
export const setSession = async (
  sessionId: string,
  data: any,
  ttlSeconds: number = 86400
): Promise<boolean> => {
  return cacheSet(`session:${sessionId}`, data, ttlSeconds);
};

export const getSession = async <T>(sessionId: string): Promise<T | null> => {
  return cacheGet<T>(`session:${sessionId}`);
};

export const deleteSession = async (sessionId: string): Promise<boolean> => {
  return cacheDel(`session:${sessionId}`);
};

// Queue helper (simple implementation)
export const enqueue = async (queueName: string, data: any): Promise<void> => {
  try {
    const serialized = JSON.stringify({ data, timestamp: Date.now() });
    await redisClient.lpush(`queue:${queueName}`, serialized);
    logger.debug(`Enqueued item to queue: ${queueName}`);
  } catch (error) {
    logger.error(`Failed to enqueue to ${queueName}:`, error);
  }
};

export const dequeue = async <T>(queueName: string): Promise<T | null> => {
  try {
    const item = await redisClient.rpop(`queue:${queueName}`);
    if (item) {
      const parsed = JSON.parse(item);
      return parsed.data as T;
    }
    return null;
  } catch (error) {
    logger.error(`Failed to dequeue from ${queueName}:`, error);
    return null;
  }
};

export const getQueueLength = async (queueName: string): Promise<number> => {
  try {
    return await redisClient.llen(`queue:${queueName}`);
  } catch (error) {
    logger.error(`Failed to get queue length for ${queueName}:`, error);
    return 0;
  }
};

// Graceful shutdown
export const closeConnections = async (): Promise<void> => {
  try {
    await redisClient.quit();
    await publisherClient.quit();
    await subscriberClient.quit();
    logger.info('Redis connections closed successfully');
  } catch (error) {
    logger.error('Error closing Redis connections:', error);
  }
};

// Export clients and helpers
export {
  redisClient,
  publisherClient,
  subscriberClient,
};

// Initialize connection
export const initializeRedis = async (): Promise<void> => {
  try {
    await testConnection();
    logger.info('Redis initialized successfully');
  } catch (error) {
    logger.error('Redis initialization failed:', error);
    throw error;
  }
};

// Default export
export default redisClient;
