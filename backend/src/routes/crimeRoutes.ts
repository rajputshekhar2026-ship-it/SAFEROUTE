// src/routes/crimeRoutes.ts

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { crimePredictionService } from '../services/crimePredictionService';
import { CrimeHistory } from '../models/CrimeHistory';
import { logger } from '../utils/logger';
import { rateLimit } from 'express-rate-limit';

const router = Router();

// Rate limiter for crime prediction (expensive operation)
const predictionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 predictions per minute
  message: 'Too many prediction requests, please slow down',
});

/**
 * @route   GET /api/crime/risk/:lat/:lng
 * @desc    Predict crime risk for a location
 * @access  Private
 */
router.get(
  '/risk/:lat/:lng',
  authenticate,
  predictionLimiter,
  validate([
    param('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    param('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
  ]),
  async (req, res) => {
    try {
      const { lat, lng } = req.params;
      
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      
      const prediction = await crimePredictionService.predictRisk(latNum, lngNum);
      
      res.json(prediction);
    } catch (error) {
      logger.error('Crime risk prediction error:', error);
      res.status(500).json({ error: 'Failed to predict crime risk' });
    }
  }
);

/**
 * @route   GET /api/crime/heatmap
 * @desc    Get crime heatmap data for map visualization
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
    query('zoom').optional().isInt({ min: 3, max: 19 }).withMessage('Zoom must be between 3-19'),
  ]),
  async (req, res) => {
    try {
      const { north, south, east, west, zoom } = req.query;
      
      const heatmapData = await crimePredictionService.getHeatmapData(
        {
          north: parseFloat(north as string),
          south: parseFloat(south as string),
          east: parseFloat(east as string),
          west: parseFloat(west as string),
        },
        zoom ? parseInt(zoom as string) : 12
      );
      
      res.json(heatmapData);
    } catch (error) {
      logger.error('Get crime heatmap error:', error);
      res.status(500).json({ error: 'Failed to get heatmap data' });
    }
  }
);

/**
 * @route   GET /api/crime/statistics
 * @desc    Get crime statistics for an area
 * @access  Private
 */
router.get(
  '/statistics',
  authenticate,
  validate([
    query('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    query('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    query('radius').optional().isInt({ min: 100, max: 10000 }).withMessage('Radius must be between 100-10000 meters'),
  ]),
  async (req, res) => {
    try {
      const { lat, lng, radius } = req.query;
      
      const stats = await crimePredictionService.getCrimeStatistics(
        parseFloat(lat as string),
        parseFloat(lng as string),
        radius ? parseInt(radius as string) : 5000
      );
      
      res.json(stats);
    } catch (error) {
      logger.error('Get crime statistics error:', error);
      res.status(500).json({ error: 'Failed to get crime statistics' });
    }
  }
);

/**
 * @route   GET /api/crime/trends
 * @desc    Get crime trends over time
 * @access  Private
 */
router.get(
  '/trends',
  authenticate,
  validate([
    query('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    query('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    query('radius').optional().isInt({ min: 100, max: 10000 }),
    query('months').optional().isInt({ min: 1, max: 24 }).withMessage('Months must be between 1-24'),
  ]),
  async (req, res) => {
    try {
      const { lat, lng, radius, months } = req.query;
      
      const trends = await CrimeHistory.getTrends(
        parseFloat(lat as string),
        parseFloat(lng as string),
        radius ? parseInt(radius as string) : 5000,
        months ? parseInt(months as string) : 12
      );
      
      res.json(trends);
    } catch (error) {
      logger.error('Get crime trends error:', error);
      res.status(500).json({ error: 'Failed to get crime trends' });
    }
  }
);

/**
 * @route   GET /api/crime/breakdown
 * @desc    Get crime by type breakdown for an area
 * @access  Private
 */
router.get(
  '/breakdown',
  authenticate,
  validate([
    query('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    query('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    query('radius').optional().isInt({ min: 100, max: 10000 }),
  ]),
  async (req, res) => {
    try {
      const { lat, lng, radius } = req.query;
      
      const breakdown = await CrimeHistory.getCrimeTypeBreakdown(
        parseFloat(lat as string),
        parseFloat(lng as string),
        radius ? parseInt(radius as string) : 5000
      );
      
      res.json(breakdown);
    } catch (error) {
      logger.error('Get crime breakdown error:', error);
      res.status(500).json({ error: 'Failed to get crime breakdown' });
    }
  }
);

/**
 * @route   POST /api/crime/report
 * @desc    Submit new crime report (admin/moderator only)
 * @access  Private (Admin/Moderator)
 */
router.post(
  '/report',
  authenticate,
  authorize('admin', 'moderator'),
  validate([
    body('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    body('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    body('crimeType').notEmpty().withMessage('Crime type is required'),
    body('severity').isInt({ min: 1, max: 5 }).withMessage('Severity must be between 1-5'),
    body('description').optional().isString(),
  ]),
  async (req, res) => {
    try {
      const { lat, lng, crimeType, severity, description } = req.body;
      
      await crimePredictionService.submitCrimeReport({
        lat,
        lng,
        crimeType,
        severity,
        description,
      });
      
      res.status(201).json({ message: 'Crime report submitted successfully' });
    } catch (error) {
      logger.error('Submit crime report error:', error);
      res.status(500).json({ error: 'Failed to submit crime report' });
    }
  }
);

/**
 * @route   GET /api/crime/history
 * @desc    Get crime history for an area
 * @access  Private
 */
router.get(
  '/history',
  authenticate,
  validate([
    query('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    query('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    query('radius').optional().isInt({ min: 100, max: 5000 }),
    query('days').optional().isInt({ min: 1, max: 365 }).withMessage('Days must be between 1-365'),
    query('limit').optional().isInt({ min: 1, max: 500 }),
    query('offset').optional().isInt({ min: 0 }),
  ]),
  async (req, res) => {
    try {
      const { lat, lng, radius, days, limit, offset } = req.query;
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - (days ? parseInt(days as string) : 90));
      
      const crimes = await CrimeHistory.findNearby(
        parseFloat(lat as string),
        parseFloat(lng as string),
        radius ? parseInt(radius as string) : 1000,
        {
          startDate,
          limit: limit ? parseInt(limit as string) : 100,
          offset: offset ? parseInt(offset as string) : 0,
        }
      );
      
      res.json({
        crimes,
        count: crimes.length,
        location: { lat: parseFloat(lat as string), lng: parseFloat(lng as string) },
      });
    } catch (error) {
      logger.error('Get crime history error:', error);
      res.status(500).json({ error: 'Failed to get crime history' });
    }
  }
);

/**
 * @route   GET /api/crime/hotspots
 * @desc    Get crime hotspots in an area
 * @access  Private
 */
router.get(
  '/hotspots',
  authenticate,
  validate([
    query('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    query('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    query('radius').optional().isInt({ min: 100, max: 5000 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ]),
  async (req, res) => {
    try {
      const { lat, lng, radius, limit } = req.query;
      
      const hotspots = await CrimeHistory.getHotspots(
        parseFloat(lat as string),
        parseFloat(lng as string),
        radius ? parseInt(radius as string) : 5000,
        limit ? parseInt(limit as string) : 20
      );
      
      res.json({
        hotspots,
        count: hotspots.length,
        location: { lat: parseFloat(lat as string), lng: parseFloat(lng as string) },
      });
    } catch (error) {
      logger.error('Get crime hotspots error:', error);
      res.status(500).json({ error: 'Failed to get crime hotspots' });
    }
  }
);

/**
 * @route   GET /api/crime/compare
 * @desc    Compare crime statistics between two locations
 * @access  Private
 */
router.get(
  '/compare',
  authenticate,
  validate([
    query('lat1').isFloat({ min: -90, max: 90 }).withMessage('Valid first latitude is required'),
    query('lng1').isFloat({ min: -180, max: 180 }).withMessage('Valid first longitude is required'),
    query('lat2').isFloat({ min: -90, max: 90 }).withMessage('Valid second latitude is required'),
    query('lng2').isFloat({ min: -180, max: 180 }).withMessage('Valid second longitude is required'),
    query('radius').optional().isInt({ min: 100, max: 5000 }),
  ]),
  async (req, res) => {
    try {
      const { lat1, lng1, lat2, lng2, radius } = req.query;
      
      const [stats1, stats2] = await Promise.all([
        crimePredictionService.getCrimeStatistics(
          parseFloat(lat1 as string),
          parseFloat(lng1 as string),
          radius ? parseInt(radius as string) : 1000
        ),
        crimePredictionService.getCrimeStatistics(
          parseFloat(lat2 as string),
          parseFloat(lng2 as string),
          radius ? parseInt(radius as string) : 1000
        ),
      ]);
      
      const comparison = {
        location1: { lat: parseFloat(lat1 as string), lng: parseFloat(lng1 as string), stats: stats1 },
        location2: { lat: parseFloat(lat2 as string), lng: parseFloat(lng2 as string), stats: stats2 },
        difference: {
          totalIncidents: stats1.total - stats2.total,
          avgSeverity: stats1.avgSeverity - stats2.avgSeverity,
          saferLocation: stats1.total < stats2.total ? 'location1' : 'location2',
        },
      };
      
      res.json(comparison);
    } catch (error) {
      logger.error('Compare crime statistics error:', error);
      res.status(500).json({ error: 'Failed to compare crime statistics' });
    }
  }
);

/**
 * @route   GET /api/crime/predictions/batch
 * @desc    Batch crime risk predictions for multiple locations
 * @access  Private
 */
router.post(
  '/predictions/batch',
  authenticate,
  predictionLimiter,
  validate([
    body('locations').isArray().withMessage('Locations array is required'),
    body('locations.*.lat').isFloat({ min: -90, max: 90 }),
    body('locations.*.lng').isFloat({ min: -180, max: 180 }),
  ]),
  async (req, res) => {
    try {
      const { locations } = req.body;
      
      const predictions = await Promise.all(
        locations.map(async (loc: { lat: number; lng: number }) => {
          const prediction = await crimePredictionService.predictRisk(loc.lat, loc.lng);
          return {
            location: loc,
            prediction,
          };
        })
      );
      
      res.json({
        predictions,
        count: predictions.length,
      });
    } catch (error) {
      logger.error('Batch crime predictions error:', error);
      res.status(500).json({ error: 'Failed to get batch predictions' });
    }
  }
);

export default router;
