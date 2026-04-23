// src/routes/refugeRoutes.ts

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { RefugeModelInstance } from '../models/Refuge';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Get nearby refuges
 * GET /api/refuges/nearby?lat=40.7128&lng=-74.0060&radius=1000&type=police
 */
router.get('/nearby', authenticate, async (req, res) => {
  try {
    const { lat, lng, radius, type, limit = 20 } = req.query;

    if (!lat || !lng) {
      res.status(400).json({ error: 'Latitude and longitude are required' });
      return;
    }

    const refuges = await RefugeModelInstance.findNearby(
      parseFloat(lat as string),
      parseFloat(lng as string),
      radius ? parseInt(radius as string) : 1000,
      {
        type: type as string,
        limit: parseInt(limit as string),
        sortBy: 'distance',
      }
    );

    res.json({
      refuges,
      count: refuges.length,
      location: { lat: parseFloat(lat as string), lng: parseFloat(lng as string) },
    });
  } catch (error) {
    logger.error('Get nearby refuges error:', error);
    res.status(500).json({ error: 'Failed to get nearby refuges' });
  }
});

/**
 * Get all refuges with filters
 * GET /api/refuges?type=police&is24Hours=true&limit=50&offset=0
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { type, is24Hours, hasSecurity, hasLighting, minRating, limit, offset } = req.query;

    const result = await RefugeModelInstance.findAll({
      type: type as string,
      is24Hours: is24Hours === 'true',
      hasSecurity: hasSecurity === 'true',
      hasLighting: hasLighting === 'true',
      minRating: minRating ? parseFloat(minRating as string) : undefined,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    });

    res.json({
      refuges: result.refuges,
      total: result.total,
      pagination: {
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      },
    });
  } catch (error) {
    logger.error('Get refuges error:', error);
    res.status(500).json({ error: 'Failed to get refuges' });
  }
});

/**
 * Get refuge by ID
 * GET /api/refuges/:id
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const refuge = await RefugeModelInstance.findById(parseInt(id));

    if (!refuge) {
      res.status(404).json({ error: 'Refuge not found' });
      return;
    }

    res.json({ refuge });
  } catch (error) {
    logger.error('Get refuge error:', error);
    res.status(500).json({ error: 'Failed to get refuge' });
  }
});

/**
 * Create new refuge (admin only)
 * POST /api/refuges
 */
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const refugeData = req.body;
    const refuge = await RefugeModelInstance.create(refugeData);

    res.status(201).json({
      message: 'Refuge created successfully',
      refuge,
    });
  } catch (error) {
    logger.error('Create refuge error:', error);
    res.status(500).json({ error: 'Failed to create refuge' });
  }
});

/**
 * Update refuge (admin only)
 * PUT /api/refuges/:id
 */
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const refuge = await RefugeModelInstance.update(parseInt(id), updateData);

    if (!refuge) {
      res.status(404).json({ error: 'Refuge not found' });
      return;
    }

    res.json({
      message: 'Refuge updated successfully',
      refuge,
    });
  } catch (error) {
    logger.error('Update refuge error:', error);
    res.status(500).json({ error: 'Failed to update refuge' });
  }
});

/**
 * Delete refuge (admin only)
 * DELETE /api/refuges/:id
 */
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await RefugeModelInstance.delete(parseInt(id));

    if (!deleted) {
      res.status(404).json({ error: 'Refuge not found' });
      return;
    }

    res.json({ message: 'Refuge deleted successfully' });
  } catch (error) {
    logger.error('Delete refuge error:', error);
    res.status(500).json({ error: 'Failed to delete refuge' });
  }
});

/**
 * Rate a refuge
 * POST /api/refuges/:id/rate
 */
router.post('/:id/rate', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'Rating must be between 1 and 5' });
      return;
    }

    const refuge = await RefugeModelInstance.addRating(parseInt(id), rating);

    if (!refuge) {
      res.status(404).json({ error: 'Refuge not found' });
      return;
    }

    res.json({
      message: 'Rating submitted successfully',
      newRating: refuge.rating,
    });
  } catch (error) {
    logger.error('Rate refuge error:', error);
    res.status(500).json({ error: 'Failed to submit rating' });
  }
});

/**
 * Get refuge statistics (admin only)
 * GET /api/refuges/statistics/summary
 */
router.get('/statistics/summary', authenticate, authorize('admin'), async (req, res) => {
  try {
    const stats = await RefugeModelInstance.getStatistics();
    res.json(stats);
  } catch (error) {
    logger.error('Get refuge statistics error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

/**
 * Get refuges by type
 * GET /api/refuges/type/:type
 */
router.get('/type/:type', authenticate, async (req, res) => {
  try {
    const { type } = req.params;
    const { limit } = req.query;

    const refuges = await RefugeModelInstance.findByType(
      type,
      limit ? parseInt(limit as string) : 50
    );

    res.json({
      refuges,
      count: refuges.length,
      type,
    });
  } catch (error) {
    logger.error('Get refuges by type error:', error);
    res.status(500).json({ error: 'Failed to get refuges by type' });
  }
});

export default router;
