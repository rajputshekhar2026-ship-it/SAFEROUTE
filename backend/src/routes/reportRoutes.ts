// src/routes/reportRoutes.ts

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validation';
import ReportController from '../controllers/reportController';
import { rateLimit } from 'express-rate-limit';

const router = Router();

// Rate limiter for report submissions
const reportLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 reports per minute
  message: 'Too many report submissions, please slow down',
});

/**
 * @route   POST /api/report
 * @desc    Create a new incident report
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  reportLimiter,
  validate([
    body('type').isIn(['harassment', 'broken_light', 'blocked_path', 'suspicious_activity', 'assault', 'unsafe_condition', 'theft', 'medical'])
      .withMessage('Valid incident type is required'),
    body('location.lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    body('location.lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    body('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
    body('description').optional().isLength({ max: 1000 }),
  ]),
  ReportController.createReport
);

/**
 * @route   GET /api/report/nearby
 * @desc    Get nearby reports
 * @access  Private
 */
router.get(
  '/nearby',
  authenticate,
  validate([
    query('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    query('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    query('radius').optional().isInt({ min: 100, max: 5000 }).withMessage('Radius must be between 100-5000 meters'),
  ]),
  ReportController.getNearbyReports
);

/**
 * @route   GET /api/report/heatmap
 * @desc    Get reports heatmap data
 * @access  Private
 */
router.get(
  '/heatmap',
  authenticate,
  validate([
    query('north').isFloat().withMessage('North bound is required'),
    query('south').isFloat().withMessage('South bound is required'),
    query('east').isFloat().withMessage('East bound is required'),
    query('west').isFloat().withMessage('West bound is required'),
  ]),
  ReportController.getHeatmapData
);

/**
 * @route   GET /api/report
 * @desc    Get reports list with filters
 * @access  Private
 */
router.get('/', authenticate, ReportController.getReports);

/**
 * @route   GET /api/report/my
 * @desc    Get user's reports
 * @access  Private
 */
router.get('/my', authenticate, ReportController.getReports);

/**
 * @route   GET /api/report/:id
 * @desc    Get report by ID
 * @access  Private
 */
router.get(
  '/:id',
  authenticate,
  validate([
    param('id').isInt().withMessage('Valid report ID is required'),
  ]),
  ReportController.getReportById
);

/**
 * @route   PUT /api/report/:id
 * @desc    Update report (admin/moderator only)
 * @access  Private (Admin/Moderator)
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'moderator'),
  validate([
    param('id').isInt().withMessage('Valid report ID is required'),
  ]),
  ReportController.updateReport
);

/**
 * @route   DELETE /api/report/:id
 * @desc    Delete report (admin only)
 * @access  Private (Admin only)
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validate([
    param('id').isInt().withMessage('Valid report ID is required'),
  ]),
  ReportController.deleteReport
);

/**
 * @route   GET /api/report/statistics/summary
 * @desc    Get report statistics
 * @access  Private (Admin only)
 */
router.get(
  '/statistics/summary',
  authenticate,
  authorize('admin'),
  ReportController.getStatistics
);

export default router;
