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
       VALUES ($1,
