// src/app.ts

import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import dotenv from 'dotenv';
import path from 'path';

// Import modules
import { initializeDatabase, testConnection, setupGracefulShutdown } from './config/database';
import { initializeRedis, testConnection as testRedisConnection } from './config/redis';
import { initializeSocket } from './config/socket';
import { logger, logRequest } from './utils/logger';

// Import routes
import authRoutes from './routes/authRoutes';
import routeRoutes from './routes/routeRoutes';
import reportRoutes from './routes/reportRoutes';
import sosRoutes from './routes/sosRoutes';
import watchRoutes from './routes/watchRoutes';
import checkinRoutes from './routes/checkinRoutes';
import healthRoutes from './routes/healthRoutes';
import userRoutes from './routes/userRoutes';
import refugeRoutes from './routes/refugeRoutes';
import crimeRoutes from './routes/crimeRoutes';
import notificationRoutes from './routes/notificationRoutes';
import uploadRoutes from './routes/uploadRoutes';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/errorHandler';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const httpServer = createServer(app);

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
}));

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Data sanitization against SQL injection & XSS
app.use(mongoSanitize());

// Prevent HTTP parameter pollution
app.use(hpp());

// ============================================
// STATIC FILES (for uploaded content)
// ============================================
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ============================================
// RATE LIMITING
// ============================================

// General rate limiter
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limiter for SOS endpoints
const sosLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3,
  message: 'Too many SOS requests. Please wait before sending another alert.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting
app.use('/api/', generalLimiter);
app.use('/api/auth/', authLimiter);
app.use('/api/sos/', sosLimiter);

// ============================================
// LOGGING MIDDLEWARE
// ============================================
app.use(logRequest);

// ============================================
// HEALTH CHECK ENDPOINTS
// ============================================

app.get('/health', async (req, res) => {
  const dbHealth = await testConnection();
  const redisHealth = await testRedisConnection();
  
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: dbHealth ? 'connected' : 'disconnected',
      redis: redisHealth ? 'connected' : 'disconnected',
    },
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  });
});

app.get('/health/detailed', async (req, res) => {
  const dbHealth = await testConnection();
  const redisHealth = await testRedisConnection();
  
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    services: {
      database: {
        status: dbHealth ? 'connected' : 'disconnected',
        latency: dbHealth ? '< 100ms' : 'N/A',
      },
      redis: {
        status: redisHealth ? 'connected' : 'disconnected',
        latency: redisHealth ? '< 10ms' : 'N/A',
      },
    },
  });
});

// ============================================
// API ROUTES
// ============================================

// API version prefix
const apiPrefix = '/api/v1';

// Auth routes
app.use('/api/auth', authRoutes);
app.use(`${apiPrefix}/auth`, authRoutes);

// User routes
app.use('/api/users', userRoutes);
app.use(`${apiPrefix}/users`, userRoutes);

// Route routes
app.use('/api/route', routeRoutes);
app.use(`${apiPrefix}/route`, routeRoutes);

// Report routes
app.use('/api/report', reportRoutes);
app.use(`${apiPrefix}/report`, reportRoutes);

// SOS routes
app.use('/api/sos', sosRoutes);
app.use(`${apiPrefix}/sos`, sosRoutes);

// Watch routes
app.use('/api/watch', watchRoutes);
app.use(`${apiPrefix}/watch`, watchRoutes);

// Check-in routes
app.use('/api/checkin', checkinRoutes);
app.use(`${apiPrefix}/checkin`, checkinRoutes);

// Health mode routes
app.use('/api/health-mode', healthRoutes);
app.use(`${apiPrefix}/health-mode`, healthRoutes);

// Refuge routes
app.use('/api/refuges', refugeRoutes);
app.use(`${apiPrefix}/refuges`, refugeRoutes);

// Crime prediction routes
app.use('/api/crime', crimeRoutes);
app.use(`${apiPrefix}/crime`, crimeRoutes);

// Notification routes
app.use('/api/notifications', notificationRoutes);
app.use(`${apiPrefix}/notifications`, notificationRoutes);

// Upload routes
app.use('/api/upload', uploadRoutes);
app.use(`${apiPrefix}/upload`, uploadRoutes);

// ============================================
// 404 HANDLER
// ============================================
app.use(notFound);

// ============================================
// GLOBAL ERROR HANDLER
// ============================================
app.use(errorHandler);

// ============================================
// SERVER INITIALIZATION
// ============================================

const PORT = process.env.PORT || 3000;
let server: any = null;

const startServer = async () => {
  try {
    // Initialize database connection
    await initializeDatabase();
    logger.info('Database initialized successfully');
    
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }
    logger.info('Database connection established');
    
    // Initialize Redis connection
    await initializeRedis();
    logger.info('Redis initialized successfully');
    
    // Initialize Socket.IO
    initializeSocket(httpServer);
    logger.info('Socket.IO initialized');
    
    // Start HTTP server
    server = httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 API URL: http://localhost:${PORT}/api/v1`);
      logger.info(`💚 Health check: http://localhost:${PORT}/health`);
      logger.info(`🔌 WebSocket: ws://localhost:${PORT}/socket.io`);
      logger.info(`📁 Uploads: http://localhost:${PORT}/uploads`);
    });
    
    // Setup graceful shutdown
    setupGracefulShutdown();
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown handler
const gracefulShutdown = () => {
  logger.info('Received shutdown signal, closing server...');
  
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the server
startServer();

// Export for testing
export { app, httpServer };
