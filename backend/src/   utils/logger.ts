// src/utils/logger.ts

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

// Create logs directory if it doesn't exist
const logDir = process.env.LOG_FILE_PATH || './logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
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
  debug: 'white',
};

// Add colors to winston
winston.addColors(colors);

// Custom format for development
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message} ${
      info.stack ? `\n${info.stack}` : ''
    } ${info.metadata ? `\nMetadata: ${JSON.stringify(info.metadata, null, 2)}` : ''}`
  )
);

// Custom format for production
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console transport configuration
const consoleTransport = new winston.transports.Console({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production' ? productionFormat : developmentFormat,
});

// File transport configuration (all logs)
const fileTransport = new DailyRotateFile({
  filename: path.join(logDir, 'application-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: process.env.LOG_MAX_SIZE || '20m',
  maxFiles: process.env.LOG_MAX_FILES || '14d',
  level: 'info',
  format: productionFormat,
});

// Error logs file transport
const errorFileTransport = new DailyRotateFile({
  filename: path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: process.env.LOG_MAX_SIZE || '20m',
  maxFiles: process.env.LOG_MAX_FILES || '30d',
  level: 'error',
  format: productionFormat,
});

// HTTP logs file transport
const httpFileTransport = new DailyRotateFile({
  filename: path.join(logDir, 'http-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: process.env.LOG_MAX_SIZE || '20m',
  maxFiles: process.env.LOG_MAX_FILES || '14d',
  level: 'http',
  format: productionFormat,
});

// Create the logger instance
const logger = winston.createLogger({
  levels,
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    consoleTransport,
    fileTransport,
    errorFileTransport,
    httpFileTransport,
  ],
  exitOnError: false,
});

// Stream for Morgan HTTP logging
export const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Helper function to format metadata
const formatMetadata = (meta: any): any => {
  if (!meta) return {};
  
  // Don't log sensitive information
  const sensitiveFields = ['password', 'token', 'refreshToken', 'authorization', 'cookie'];
  const sanitized = { ...meta };
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
};

// Custom log methods
export const logInfo = (message: string, meta?: any): void => {
  logger.info(message, { metadata: formatMetadata(meta) });
};

export const logError = (message: string, error?: Error | any, meta?: any): void => {
  const errorMeta = {
    ...formatMetadata(meta),
    errorMessage: error?.message,
    errorStack: error?.stack,
    errorName: error?.name,
  };
  logger.error(message, { metadata: errorMeta });
};

export const logWarn = (message: string, meta?: any): void => {
  logger.warn(message, { metadata: formatMetadata(meta) });
};

export const logDebug = (message: string, meta?: any): void => {
  logger.debug(message, { metadata: formatMetadata(meta) });
};

export const logHttp = (message: string, meta?: any): void => {
  logger.http(message, { metadata: formatMetadata(meta) });
};

// Request logging middleware
export const logRequest = (req: any, res: any, next: any): void => {
  const start = Date.now();
  
  // Log when request completes
  res.on('finish', () => {
    const duration = Date.now() - start;
    const message = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`;
    
    const meta = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.id,
    };
    
    if (res.statusCode >= 500) {
      logError(message, null, meta);
    } else if (res.statusCode >= 400) {
      logWarn(message, meta);
    } else {
      logHttp(message, meta);
    }
  });
  
  next();
};

// Database query logging
export const logDatabaseQuery = (query: string, params?: any[], duration?: number): void => {
  logDebug('Database Query', {
    query: query.substring(0, 500), // Truncate long queries
    params: params?.slice(0, 10), // Limit params
    duration: duration ? `${duration}ms` : undefined,
  });
};

// WebSocket event logging
export const logWebSocket = (event: string, data?: any, socketId?: string): void => {
  logInfo(`WebSocket: ${event}`, {
    event,
    socketId,
    data: formatMetadata(data),
  });
};

// API call logging (external APIs)
export const logApiCall = (service: string, method: string, url: string, duration?: number, error?: any): void => {
  const meta = {
    service,
    method,
    url,
    duration: duration ? `${duration}ms` : undefined,
  };
  
  if (error) {
    logError(`API call failed: ${service}`, error, meta);
  } else {
    logInfo(`API call: ${service}`, meta);
  }
};

// User action logging
export const logUserAction = (userId: string, action: string, details?: any): void => {
  logInfo(`User Action: ${action}`, {
    userId,
    action,
    details: formatMetadata(details),
    timestamp: new Date().toISOString(),
  });
};

// Security event logging
export const logSecurityEvent = (event: string, userId: string | null, details?: any): void => {
  logWarn(`Security Event: ${event}`, {
    event,
    userId,
    details: formatMetadata(details),
    timestamp: new Date().toISOString(),
  });
};

// Performance metric logging
export const logPerformance = (metric: string, value: number, unit: string = 'ms', tags?: Record<string, string>): void => {
  logInfo(`Performance: ${metric}`, {
    metric,
    value,
    unit,
    tags,
    timestamp: new Date().toISOString(),
  });
};

// Batch logging (for bulk operations)
export const logBatch = (operation: string, total: number, success: number, failed: number, errors?: any[]): void => {
  const meta = {
    operation,
    total,
    success,
    failed,
    successRate: `${((success / total) * 100).toFixed(2)}%`,
  };
  
  if (failed > 0) {
    logError(`Batch operation completed with errors: ${operation}`, null, {
      ...meta,
      errors: errors?.slice(0, 10), // Limit error details
    });
  } else {
    logInfo(`Batch operation completed: ${operation}`, meta);
  }
};

// Health check logging
export const logHealthCheck = (service: string, status: 'healthy' | 'unhealthy', details?: any): void => {
  if (status === 'unhealthy') {
    logError(`Health check failed: ${service}`, null, { service, status, details });
  } else {
    logInfo(`Health check: ${service}`, { service, status, details });
  }
};

// Crash logging
export const logCrash = (error: Error, context?: any): void => {
  logError('Application crash', error, {
    context: formatMetadata(context),
    nodeVersion: process.version,
    platform: process.platform,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
  });
};

// Child logger for modules
export const createLogger = (module: string): typeof logger => {
  return logger.child({ module });
};

// Export main logger
export default logger;
