// src/middleware/auth.ts

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

// Types
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    phone?: string;
    role: 'user' | 'admin' | 'moderator';
  };
  token?: string;
}

interface TokenPayload {
  userId: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

// Blacklisted tokens cache
const TOKEN_BLACKLIST_PREFIX = 'token:blacklist:';
const TOKEN_BLACKLIST_TTL = 86400; // 24 hours

/**
 * Main authentication middleware
 * Verifies JWT token and attaches user to request
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ 
        error: 'Authentication required',
        message: 'No token provided' 
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    
    // Check if token is blacklisted
    const isBlacklisted = await redisClient.get(`${TOKEN_BLACKLIST_PREFIX}${token}`);
    if (isBlacklisted) {
      res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Token has been revoked' 
      });
      return;
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    
    // Check token type
    if (decoded.type !== 'access') {
      res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Invalid token type' 
      });
      return;
    }

    // Check if session exists in database
    const sessionResult = await query(
      `SELECT s.*, u.id, u.email, u.name, u.phone, u.role 
       FROM sessions s 
       JOIN users u ON u.id = s.user_id 
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );

    if (sessionResult.rows.length === 0) {
      res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Session expired or invalid' 
      });
      return;
    }

    const session = sessionResult.rows[0];
    
    // Attach user to request
    req.user = {
      id: session.user_id,
      email: session.email,
      name: session.name,
      phone: session.phone,
      role: session.role || 'user',
    };
    req.token = token;

    // Update last activity
    await query(
      'UPDATE sessions SET last_activity = NOW() WHERE token = $1',
      [token]
    );

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Token expired' 
      });
    } else if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Invalid token' 
      });
    } else {
      logger.error('Auth middleware error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: 'Authentication failed' 
      });
    }
  }
};

/**
 * Optional authentication - doesn't require token but attaches user if present
 */
export const optionalAuthenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    
    // Check blacklist
    const isBlacklisted = await redisClient.get(`${TOKEN_BLACKLIST_PREFIX}${token}`);
    if (isBlacklisted) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    
    if (decoded.type === 'access') {
      const sessionResult = await query(
        `SELECT s.*, u.id, u.email, u.name, u.phone, u.role 
         FROM sessions s 
         JOIN users u ON u.id = s.user_id 
         WHERE s.token = $1 AND s.expires_at > NOW()`,
        [token]
      );

      if (sessionResult.rows.length > 0) {
        const session = sessionResult.rows[0];
        req.user = {
          id: session.user_id,
          email: session.email,
          name: session.name,
          phone: session.phone,
          role: session.role || 'user',
        };
        req.token = token;
      }
    }
    
    next();
  } catch (error) {
    // Just continue without user
    next();
  }
};

/**
 * Role-based authorization middleware
 */
export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ 
        error: 'Authorization failed',
        message: 'User not authenticated' 
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ 
        error: 'Authorization failed',
        message: 'Insufficient permissions' 
      });
      return;
    }

    next();
  };
};

/**
 * Resource ownership middleware
 * Checks if the requesting user owns the resource
 */
export const requireOwnership = (getResourceUserId: (req: Request) => Promise<string | null>) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ 
        error: 'Authorization failed',
        message: 'User not authenticated' 
      });
      return;
    }

    try {
      const resourceUserId = await getResourceUserId(req);
      
      if (!resourceUserId) {
        res.status(404).json({ 
          error: 'Resource not found',
          message: 'The requested resource does not exist' 
        });
        return;
      }

      if (req.user.id !== resourceUserId && req.user.role !== 'admin') {
        res.status(403).json({ 
          error: 'Authorization failed',
          message: 'You do not own this resource' 
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Ownership check error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: 'Failed to verify ownership' 
      });
    }
  };
};

/**
 * Generate token blacklist key
 */
export const blacklistToken = async (token: string, ttl: number = TOKEN_BLACKLIST_TTL): Promise<void> => {
  await redisClient.setex(`${TOKEN_BLACKLIST_PREFIX}${token}`, ttl, 'true');
};

/**
 * Refresh token middleware
 */
export const verifyRefreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      res.status(401).json({ 
        error: 'Authentication required',
        message: 'Refresh token required' 
      });
      return;
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as TokenPayload;
    
    if (decoded.type !== 'refresh') {
      res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Invalid token type' 
      });
      return;
    }

    // Check if refresh token exists in database
    const sessionResult = await query(
      'SELECT * FROM sessions WHERE refresh_token = $1 AND expires_at > NOW()',
      [refreshToken]
    );

    if (sessionResult.rows.length === 0) {
      res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Invalid refresh token' 
      });
      return;
    }

    (req as any).refreshToken = refreshToken;
    (req as any).userId = decoded.userId;
    
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Refresh token expired' 
      });
    } else if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Invalid refresh token' 
      });
    } else {
      logger.error('Refresh token verification error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: 'Failed to verify refresh token' 
      });
    }
  }
};

/**
 * API Key authentication for service-to-service communication
 */
export const authenticateApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      res.status(401).json({ 
        error: 'Authentication required',
        message: 'API key required' 
      });
      return;
    }

    // Check API key in Redis or database
    const serviceName = await redisClient.get(`api_key:${apiKey}`);
    
    if (!serviceName) {
      res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Invalid API key' 
      });
      return;
    }

    (req as any).service = serviceName;
    next();
  } catch (error) {
    logger.error('API key authentication error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Authentication failed' 
    });
  }
};

/**
 * Rate limit based on user role
 */
export const roleBasedRateLimit = (limits: { [role: string]: number }) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const role = req.user?.role || 'user';
    const limit = limits[role] || limits.user || 100;
    
    // Rate limiting logic using Redis would go here
    // This is a placeholder for the actual implementation
    
    next();
  };
};

/**
 * Extract user ID from request (for WebSocket auth)
 */
export const extractUserIdFromToken = (token: string): string | null => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    return decoded.userId;
  } catch {
    return null;
  }
};

/**
 * Check if user has active session
 */
export const hasActiveSession = async (userId: string): Promise<boolean> => {
  const result = await query(
    'SELECT 1 FROM sessions WHERE user_id = $1 AND expires_at > NOW() LIMIT 1',
    [userId]
  );
  return result.rows.length > 0;
};

/**
 * Invalidate all user sessions (logout from all devices)
 */
export const invalidateAllUserSessions = async (userId: string): Promise<void> => {
  const sessions = await query(
    'SELECT token FROM sessions WHERE user_id = $1',
    [userId]
  );
  
  for (const session of sessions.rows) {
    await blacklistToken(session.token);
  }
  
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
};

/**
 * WebSocket authentication middleware
 */
export const authenticateWebSocket = async (socket: any, next: Function): Promise<void> => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    
    if (decoded.type !== 'access') {
      return next(new Error('Invalid token type'));
    }
    
    const sessionResult = await query(
      'SELECT user_id FROM sessions WHERE token = $1 AND expires_at > NOW()',
      [token]
    );
    
    if (sessionResult.rows.length === 0) {
      return next(new Error('Invalid or expired session'));
    }
    
    socket.userId = decoded.userId;
    next();
  } catch (error) {
    return next(new Error('Authentication failed'));
  }
};

// Export all middleware
export default {
  authenticate,
  optionalAuthenticate,
  authorize,
  requireOwnership,
  verifyRefreshToken,
  authenticateApiKey,
  authenticateWebSocket,
  blacklistToken,
  hasActiveSession,
  invalidateAllUserSessions,
  extractUserIdFromToken,
};
