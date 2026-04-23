// src/routes/healthRoutes.ts

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { query } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Toggle health mode
 * POST /api/health-mode/toggle
 */
router.post('/toggle', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { enabled } = req.body;
    
    // Log health mode change
    await query(
      `INSERT INTO health_mode_logs (user_id, action, disguise_type, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, enabled ? 'activate' : 'deactivate', 'weather']
    );
    
    // Store in Redis for quick access
    await redisClient.setex(`health_mode:${userId}`, 86400, enabled ? 'true' : 'false');
    
    logger.info(`Health mode ${enabled ? 'activated' : 'deactivated'} for user ${userId}`);
    
    res.json({
      message: `Health mode ${enabled ? 'activated' : 'deactivated'}`,
      status: { isActive: enabled, disguiseType: 'weather' },
    });
  } catch (error) {
    logger.error('Toggle health mode error:', error);
    res.status(500).json({ error: 'Failed to toggle health mode' });
  }
});

/**
 * Get health mode status
 * GET /api/health-mode/status
 */
router.get('/status', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    // Check Redis first
    const cached = await redisClient.get(`health_mode:${userId}`);
    
    if (cached) {
      res.json({
        isActive: cached === 'true',
        disguiseType: 'weather',
        autoActivateOnShake: true,
        autoActivateOnTimeRange: {
          enabled: true,
          startTime: '22:00',
          endTime: '06:00',
        },
      });
      return;
    }
    
    // Get from database
    const result = await query(
      `SELECT action, disguise_type, created_at
       FROM health_mode_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    
    const isActive = result.rows.length > 0 && result.rows[0].action === 'activate';
    
    res.json({
      isActive,
      disguiseType: 'weather',
      autoActivateOnShake: true,
      autoActivateOnTimeRange: {
        enabled: true,
        startTime: '22:00',
        endTime: '06:00',
      },
    });
  } catch (error) {
    logger.error('Get health mode status error:', error);
    res.status(500).json({ error: 'Failed to get health mode status' });
  }
});

/**
 * Update health mode settings
 * PUT /api/health-mode/settings
 */
router.put('/settings', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const settings = req.body;
    
    // Store settings in Redis
    await redisClient.setex(`health_mode_settings:${userId}`, 86400, JSON.stringify(settings));
    
    logger.info(`Health mode settings updated for user ${userId}`);
    
    res.json({
      message: 'Health mode settings updated',
      status: settings,
    });
  } catch (error) {
    logger.error('Update health mode settings error:', error);
    res.status(500).json({ error: 'Failed to update health mode settings' });
  }
});

/**
 * Get health mode logs
 * GET /api/health-mode/logs
 */
router.get('/logs', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await query(
      `SELECT action, disguise_type, created_at
       FROM health_mode_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    res.json({
      logs: result.rows,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error) {
    logger.error('Get health mode logs error:', error);
    res.status(500).json({ error: 'Failed to get health mode logs' });
  }
});

export default router;
