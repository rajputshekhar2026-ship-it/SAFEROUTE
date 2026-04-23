// src/routes/watchRoutes.ts

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import WatchController from '../controllers/watchController';
import { rateLimit } from 'express-rate-limit';

const router = Router();

// Rate limiter for watch sync
const watchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 sync requests per minute
  message: 'Too many watch sync requests',
});

/**
 * @route   POST /api/watch/sync
 * @desc    Sync watch device with backend
 * @access  Private
 */
router.post(
  '/sync',
  authenticate,
  watchLimiter,
  validate([
    body('deviceType').isIn(['apple_watch', 'wear_os']).withMessage('Valid device type is required'),
    body('deviceId').notEmpty().withMessage('Device ID is required'),
    body('watchName').optional().isString(),
    body('osVersion').optional().isString(),
    body('appVersion').optional().isString(),
  ]),
  WatchController.syncWatch
);

/**
 * @route   GET /api/watch/status
 * @desc    Get watch connection status
 * @access  Private
 */
router.get('/status', authenticate, WatchController.getWatchStatus);

/**
 * @route   DELETE /api/watch/:deviceId
 * @desc    Disconnect watch device
 * @access  Private
 */
router.delete(
  '/:deviceId',
  authenticate,
  validate([
    param('deviceId').notEmpty().withMessage('Device ID is required'),
  ]),
  WatchController.disconnectWatch
);

/**
 * @route   GET /api/watch/route/:routeId/preview
 * @desc    Get route preview for watch
 * @access  Private
 */
router.get(
  '/route/:routeId/preview',
  authenticate,
  validate([
    param('routeId').notEmpty().withMessage('Route ID is required'),
  ]),
  WatchController.getRoutePreview
);

/**
 * @route   POST /api/watch/haptic
 * @desc    Send haptic alert to watch
 * @access  Private
 */
router.post(
  '/haptic',
  authenticate,
  validate([
    body('alertType').isIn(['danger', 'warning', 'info', 'sos']).withMessage('Valid alert type is required'),
    body('message').notEmpty().withMessage('Alert message is required'),
    body('severity').isIn(['low', 'medium', 'high', 'critical']).withMessage('Valid severity is required'),
  ]),
  WatchController.sendHapticAlert
);

/**
 * @route   POST /api/watch/location
 * @desc    Send real-time location to watch
 * @access  Private
 */
router.post(
  '/location',
  authenticate,
  validate([
    body('location.lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    body('location.lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
  ]),
  WatchController.sendLocationToWatch
);

/**
 * @route   POST /api/watch/route-progress
 * @desc    Send route progress to watch
 * @access  Private
 */
router.post(
  '/route-progress',
  authenticate,
  validate([
    body('routeId').notEmpty().withMessage('Route ID is required'),
    body('progressPercentage').isFloat({ min: 0, max: 100 }).withMessage('Valid progress percentage is required'),
    body('remainingDistance').isInt({ min: 0 }).withMessage('Valid remaining distance is required'),
    body('remainingDuration').isInt({ min: 0 }).withMessage('Valid remaining duration is required'),
  ]),
  WatchController.sendRouteProgress
);

/**
 * @route   POST /api/watch/health
 * @desc    Sync health data from watch
 * @access  Private
 */
router.post(
  '/health',
  authenticate,
  validate([
    body('deviceId').notEmpty().withMessage('Device ID is required'),
    body('heartRate').optional().isInt({ min: 30, max: 220 }).withMessage('Valid heart rate is required'),
    body('steps').optional().isInt({ min: 0 }),
    body('distance').optional().isInt({ min: 0 }),
    body('calories').optional().isInt({ min: 0 }),
  ]),
  WatchController.syncHealthData
);

/**
 * @route   GET /api/watch/notifications
 * @desc    Get watch notifications
 * @access  Private
 */
router.get('/notifications', authenticate, WatchController.getWatchNotifications);

export default router;
