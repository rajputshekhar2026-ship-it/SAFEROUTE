// src/middleware/errorHandler.ts

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { redisClient } from '../config/redis';

// Error types
export class AppError extends Error {
  public statusCode: number;
  public status: string;
  public isOperational: boolean;
  public code?: string;
  public details?: any;

  constructor(message: string, statusCode: number, code?: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.code = code;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests, please try again later') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

export class DatabaseError extends AppError {
  constructor(message: string) {
    super(message, 500, 'DATABASE_ERROR');
  }
}

// Error handler middleware
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log error
  if (err instanceof AppError && err.isOperational) {
    logger.warn(`${err.statusCode} - ${err.message}`, {
      url: req.url,
      method: req.method,
      ip: req.ip,
      code: err.code,
      details: err.details,
    });
  } else {
    logger.error('Unhandled error:', {
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      ip: req.ip,
    });
  }

  // Send error response
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      code: err.code,
      details: err.details,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
    return;
  }

  // Handle specific error types
  if (err.name === 'ValidationError') {
    res.status(400).json({
      status: 'fail',
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.message,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
    return;
  }

  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      status: 'fail',
      message: 'Invalid token',
      code: 'INVALID_TOKEN',
      timestamp: new Date().toISOString(),
      path: req.url,
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      status: 'fail',
      message: 'Token expired',
      code: 'TOKEN_EXPIRED',
      timestamp: new Date().toISOString(),
      path: req.url,
    });
    return;
  }

  if (err.name === 'MulterError') {
    if (err.message === 'File too large') {
      res.status(413).json({
        status: 'fail',
        message: 'File too large',
        code: 'FILE_TOO_LARGE',
        timestamp: new Date().toISOString(),
        path: req.url,
      });
      return;
    }
    res.status(400).json({
      status: 'fail',
      message: 'File upload error',
      code: 'UPLOAD_ERROR',
      details: err.message,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
    return;
  }

  // PostgreSQL error handling
  if (err.message && err.message.includes('PostgreSQL')) {
    const pgError = err as any;
    
    if (pgError.code === '23505') {
      res.status(409).json({
        status: 'fail',
        message: 'Duplicate entry',
        code: 'DUPLICATE_ENTRY',
        details: pgError.detail,
        timestamp: new Date().toISOString(),
        path: req.url,
      });
      return;
    }
    
    if (pgError.code === '23503') {
      res.status(400).json({
        status: 'fail',
        message: 'Foreign key violation',
        code: 'FOREIGN_KEY_ERROR',
        details: pgError.detail,
        timestamp: new Date().toISOString(),
        path: req.url,
      });
      return;
    }
    
    if (pgError.code === '42P01') {
      res.status(500).json({
        status: 'error',
        message: 'Database configuration error',
        code: 'DB_CONFIG_ERROR',
        timestamp: new Date().toISOString(),
        path: req.url,
      });
      return;
    }
  }

  // Redis error handling
  if (err.message && err.message.includes('Redis')) {
    res.status(503).json({
      status: 'error',
      message: 'Cache service unavailable',
      code: 'CACHE_UNAVAILABLE',
      timestamp: new Date().toISOString(),
      path: req.url,
    });
    return;
  }

  // Default error response
  res.status(500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    code: 'INTERNAL_SERVER_ERROR',
    timestamp: new Date().toISOString(),
    path: req.url,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

// Async wrapper to catch errors in async route handlers
export const catchAsync = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

// Not found middleware (404)
export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  const error = new NotFoundError(`Cannot ${req.method} ${req.url}`);
  next(error);
};

// Rate limit error handler
export const rateLimitHandler = (req: Request, res: Response): void => {
  res.status(429).json({
    status: 'fail',
    message: 'Too many requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: Math.ceil(parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000') / 1000),
    timestamp: new Date().toISOString(),
    path: req.url,
  });
};

// Request validation error handler
export const handleValidationErrors = (errors: any[]): ValidationError => {
  const details = errors.map(err => ({
    field: err.param,
    message: err.msg,
    value: err.value,
  }));
  
  return new ValidationError('Validation failed', details);
};

// Database error handler with retry logic
export const handleDatabaseError = async (error: any, retryCount: number = 0): Promise<void> => {
  const maxRetries = 3;
  const retryDelay = 1000;
  
  if (retryCount < maxRetries && isRetryableError(error)) {
    logger.warn(`Database error, retrying (${retryCount + 1}/${maxRetries})...`, error);
    await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, retryCount)));
    return handleDatabaseError(error, retryCount + 1);
  }
  
  throw new DatabaseError(error.message);
};

const isRetryableError = (error: any): boolean => {
  const retryableCodes = ['40001', '40P01', '08006', '57P01'];
  return retryableCodes.includes(error.code);
};

// Global uncaught exception handler
export const handleUncaughtException = (error: Error): void => {
  logger.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack,
  });
  
  // Graceful shutdown
  process.exit(1);
};

// Global unhandled rejection handler
export const handleUnhandledRejection = (reason: any, promise: Promise<any>): void => {
  logger.error('Unhandled Rejection:', {
    reason: reason?.message || reason,
    promise,
  });
};

// Error response formatter
export const formatErrorResponse = (error: any, includeStack: boolean = false): any => {
  const response: any = {
    status: 'error',
    message: error.message || 'An error occurred',
    code: error.code || 'UNKNOWN_ERROR',
    timestamp: new Date().toISOString(),
  };
  
  if (includeStack && process.env.NODE_ENV !== 'production') {
    response.stack = error.stack;
  }
  
  if (error.details) {
    response.details = error.details;
  }
  
  return response;
};

// Health check error handler
export const healthCheckErrorHandler = (error: Error, service: string): void => {
  logger.error(`Health check failed for ${service}:`, error);
};

// WebSocket error handler
export const handleWebSocketError = (error: Error, socketId: string): void => {
  logger.error(`WebSocket error for socket ${socketId}:`, error);
  
  // Emit error to client
  if (socketId) {
    // socket.emit('error', { message: error.message });
  }
};

// Export all error classes and handlers
export default {
  errorHandler,
  catchAsync,
  notFound,
  rateLimitHandler,
  handleValidationErrors,
  handleDatabaseError,
  handleUncaughtException,
  handleUnhandledRejection,
  formatErrorResponse,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
};
