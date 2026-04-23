// src/routes/checkinRoutes.ts

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { query } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Create a check-in
 * POST /api/checkin
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { location, status, note } = req.body;
    
    if (!location || !location.lat || !location.lng) {
      res.status(400).json({ error: 'Location is required' });
      return;
    }
    
    const result = await query(
      `INSERT INTO checkins (user_id, location, status, note, created_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, $5, NOW())
       RETURNING id`,
      [userId, location.lng, location.lat, status || 'safe', note]
    );
    
    // Update user's last active
    await query(
      `UPDATE users SET last_active = NOW(), last_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       WHERE id = $3`,
      [location.lng, location.lat, userId]
    );
    
    res.status(201).json({
      message: 'Check-in recorded successfully',
      checkinId: result.rows[0].id,
    });
  } catch (error) {
    logger.error('Create check-in error:', error);
    res.status(500).json({ error: 'Failed to create check-in' });
  }
});

/**
 * Get check-in history
 * GET /api/checkin/history?limit=50&offset=0
 */
router.get('/history', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await query(
      `SELECT id, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat,
              status, note, created_at
       FROM checkins
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    const countResult = await query(
      'SELECT COUNT(*) as total FROM checkins WHERE user_id = $1',
      [userId]
    );
    
    res.json({
      checkins: result.rows,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        total: parseInt(countResult.rows[0].total),
      },
    });
  } catch (error) {
    logger.error('Get check-in history error:', error);
    res.status(500).json({ error: 'Failed to get check-in history' });
  }
});

/**
 * Get check-in timeline (last 7 days)
 * GET /api/checkin/timeline
 */
router.get('/timeline', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const result = await query(
      `SELECT DATE(created_at) as date, COUNT(*) as count,
              json_agg(json_build_object(
                'time', created_at,
                'location', json_build_object('lng', ST_X(location::geometry), 'lat', ST_Y(location::geometry)),
                'status', status
              ) ORDER BY created_at DESC) as checkins
       FROM checkins
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [userId]
    );
    
    res.json({ timeline: result.rows });
  } catch (error) {
    logger.error('Get check-in timeline error:', error);
    res.status(500).json({ error: 'Failed to get check-in timeline' });
  }
});

/**
 * Get latest check-in
 * GET /api/checkin/latest
 */
router.get('/latest', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const result = await query(
      `SELECT id, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat,
              status, note, created_at
       FROM checkins
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      res.json({ checkin: null });
      return;
    }
    
    res.json({ checkin: result.rows[0] });
  } catch (error) {
    logger.error('Get latest check-in error:', error);
    res.status(500).json({ error: 'Failed to get latest check-in' });
  }
});

/**
 * Get check-in statistics
 * GET /api/checkin/statistics
 */
router.get('/statistics', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { days = 30 } = req.query;
    
    const result = await query(
      `SELECT 
         COUNT(*) as total_checkins,
         COUNT(DISTINCT DATE(created_at)) as active_days,
         AVG(EXTRACT(EPOCH FROM (NOW() - created_at))) as avg_time_since_last,
         COUNT(CASE WHEN status = 'safe' THEN 1 END) as safe_count,
         COUNT(CASE WHEN status = 'unsure' THEN 1 END) as unsure_count,
         COUNT(CASE WHEN status = 'danger' THEN 1 END) as danger_count
       FROM checkins
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${days} days'`,
      [userId]
    );
    
    res.json({
      statistics: result.rows[0],
      period: `${days} days`,
    });
  } catch (error) {
    logger.error('Get check-in statistics error:', error);
    res.status(500).json({ error: 'Failed to get check-in statistics' });
  }
});

export default router;
