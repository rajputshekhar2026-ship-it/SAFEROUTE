// src/routes/routeRoutes.ts

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import RouteController from '../controllers/routeController';
import { rateLimit } from 'express-rate-limit';

const router = Router();

// Rate limiter for route calculations
const routeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 route calculations per minute
  message: 'Too many route requests, please slow down',
});

/**
 * @route   POST /api/route/shortest
 * @desc    Get shortest/fastest route
 * @access  Private
 */
router.post(
  '/shortest',
  authenticate,
  routeLimiter,
  validate([
    body('start.lat').isFloat({ min: -90, max: 90 }).withMessage('Valid start latitude is required'),
    body('start.lng').isFloat({ min: -180, max: 180 }).withMessage('Valid start longitude is required'),
    body('end.lat').isFloat({ min: -90, max: 90 }).withMessage('Valid end latitude is required'),
    body('end.lng').isFloat({ min: -180, max: 180 }).withMessage('Valid end longitude is required'),
  ]),
  RouteController.getShortestRoute
);

/**
 * @route   POST /api/route/safest
 * @desc    Get safest route based on crime data
 * @access  Private
 */
router.post(
  '/safest',
  authenticate,
  routeLimiter,
  validate([
    body('start.lat').isFloat({ min: -90, max: 90 }).withMessage('Valid start latitude is required'),
    body('start.lng').isFloat({ min: -180, max: 180 }).withMessage('Valid start longitude is required'),
    body('end.lat').isFloat({ min: -90, max: 90 }).withMessage('Valid end latitude is required'),
    body('end.lng').isFloat({ min: -180, max: 180 }).withMessage('Valid end longitude is required'),
  ]),
  RouteController.getSafestRoute
);

/**
 * @route   POST /api/route/lit-street
 * @desc    Get well-lit route (optimal for night time)
 * @access  Private
 */
router.post(
  '/lit-street',
  authenticate,
  routeLimiter,
  validate([
    body('start.lat').isFloat({ min: -90, max: 90 }).withMessage('Valid start latitude is required'),
    body('start.lng').isFloat({ min: -180, max: 180 }).withMessage('Valid start longitude is required'),
    body('end.lat').isFloat({ min: -90, max: 90 }).withMessage('Valid end latitude is required'),
    body('end.lng').isFloat({ min: -180, max: 180 }).withMessage('Valid end longitude is required'),
  ]),
  RouteController.getLitStreetRoute
);

/**
 * @route   POST /api/route/alternatives
 * @desc    Get route alternatives for comparison
 * @access  Private
 */
router.post(
  '/alternatives',
  authenticate,
  routeLimiter,
  validate([
    body('start.lat').isFloat({ min: -90, max: 90 }).withMessage('Valid start latitude is required'),
    body('start.lng').isFloat({ min: -180, max: 180 }).withMessage('Valid start longitude is required'),
    body('end.lat').isFloat({ min: -90, max: 90 }).withMessage('Valid end latitude is required'),
    body('end.lng').isFloat({ min: -180, max: 180 }).withMessage('Valid end longitude is required'),
  ]),
  RouteController.getRouteAlternatives
);

/**
 * @route   POST /api/route/reroute
 * @desc    Re-route from current location
 * @access  Private
 */
router.post(
  '/reroute',
  authenticate,
  routeLimiter,
  validate([
    body('currentLocation.lat').isFloat({ min: -90, max: 90 }).withMessage('Valid current latitude is required'),
    body('currentLocation.lng').isFloat({ min: -180, max: 180 }).withMessage('Valid current longitude is required'),
    body('destination.lat').isFloat({ min: -90, max: 90 }).withMessage('Valid destination latitude is required'),
    body('destination.lng').isFloat({ min: -180, max: 180 }).withMessage('Valid destination longitude is required'),
  ]),
  RouteController.reroute
);

/**
 * @route   GET /api/route/:routeId/refuges
 * @desc    Get safe refuges along a route
 * @access  Private
 */
router.get(
  '/:routeId/refuges',
  authenticate,
  validate([
    param('routeId').notEmpty().withMessage('Route ID is required'),
  ]),
  RouteController.getRefugesAlongRoute
);

/**
 * @route   POST /api/route/save
 * @desc    Save route to history
 * @access  Private
 */
router.post(
  '/save',
  authenticate,
  validate([
    body('routeId').notEmpty().withMessage('Route ID is required'),
  ]),
  RouteController.saveRoute
);

/**
 * @route   GET /api/route/saved
 * @desc    Get saved routes history
 * @access  Private
 */
router.get('/saved', authenticate, RouteController.getSavedRoutes);

/**
 * @route   GET /api/route/:id
 * @desc    Get route details by ID
 * @access  Private
 */
router.get(
  '/:id',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Route ID is required'),
  ]),
  RouteController.getRouteDetails
);

/**
 * @route   DELETE /api/route/:id
 * @desc    Delete saved route
 * @access  Private
 */
router.delete(
  '/:id',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Route ID is required'),
  ]),
  RouteController.deleteRoute
);

export default router;
