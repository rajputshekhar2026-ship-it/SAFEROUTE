// src/routes/sosRoutes.ts

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validation';
import SOSController from '../controllers/sosController';
import { rateLimit } from 'express-rate-limit';

const router = Router();

// Strict rate limiter for SOS endpoints
const sosLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 SOS triggers per minute
  message: 'Too many SOS requests, please wait before sending another alert',
});

/**
 * @route   POST /api/sos/trigger
 * @desc    Trigger SOS alert
 * @access  Private
 */
router.post(
  '/trigger',
  authenticate,
  sosLimiter,
  validate([
    body('location.lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    body('location.lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    body('message').optional().isLength({ max: 500 }),
  ]),
  SOSController.triggerSOS
);

/**
 * @route   POST /api/sos/:sosId/cancel
 * @desc    Cancel active SOS
 * @access  Private
 */
router.post(
  '/:sosId/cancel',
  authenticate,
  validate([
    param('sosId').isUUID().withMessage('Valid SOS ID is required'),
  ]),
  SOSController.cancelSOS
);

/**
 * @route   GET /api/sos/:sosId/status
 * @desc    Get SOS status
 * @access  Private
 */
router.get(
  '/:sosId/status',
  authenticate,
  validate([
    param('sosId').isUUID().withMessage('Valid SOS ID is required'),
  ]),
  SOSController.getSOSStatus
);

/**
 * @route   GET /api/sos/history
 * @desc    Get SOS history for user
 * @access  Private
 */
router.get('/history', authenticate, SOSController.getSOSHistory);

/**
 * @route   GET /api/sos/active
 * @desc    Get active SOS events (for emergency responders)
 * @access  Private (Admin/Responder)
 */
router.get(
  '/active',
  authenticate,
  authorize('admin', 'responder'),
  SOSController.getActiveSOSEvents
);

/**
 * @route   POST /api/sos/:sosId/respond
 * @desc    Respond to SOS (for emergency responders)
 * @access  Private (Admin/Responder)
 */
router.post(
  '/:sosId/respond',
  authenticate,
  authorize('admin', 'responder'),
  validate([
    param('sosId').isUUID().withMessage('Valid SOS ID is required'),
    body('eta').optional().isInt({ min: 1, max: 60 }).withMessage('ETA must be between 1-60 minutes'),
  ]),
  SOSController.respondToSOS
);

/**
 * @route   POST /api/sos/:sosId/resolve
 * @desc    Mark SOS as resolved
 * @access  Private
 */
router.post(
  '/:sosId/resolve',
  authenticate,
  validate([
    param('sosId').isUUID().withMessage('Valid SOS ID is required'),
  ]),
  SOSController.resolveSOS
);

/**
 * @route   GET /api/sos/fake-call
 * @desc    Get fake call details
 * @access  Private
 */
router.get('/fake-call', authenticate, SOSController.getFakeCall);

export default router;
