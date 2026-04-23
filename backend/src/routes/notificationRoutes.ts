// src/routes/notificationRoutes.ts

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { notificationService } from '../services/notificationService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Get user notifications
 * GET /api/notifications?page=1&limit=20&unreadOnly=false
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { page, limit, unreadOnly } = req.query;
    
    const result = await notificationService.getUserNotifications(
      userId,
      page ? parseInt(page as string) : 1,
      limit ? parseInt(limit as string) : 20,
      unreadOnly === 'true'
    );
    
    res.json(result);
  } catch (error) {
    logger.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

/**
 * Mark notification as read
 * PUT /api/notifications/:id/read
 */
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    
    await notificationService.markNotificationAsRead(userId, id);
    
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    logger.error('Mark notification as read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * Mark all notifications as read
 * PUT /api/notifications/read-all
 */
router.put('/read-all', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    await notificationService.markAllNotificationsAsRead(userId);
    
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    logger.error('Mark all notifications as read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

/**
 * Delete notification
 * DELETE /api/notifications/:id
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    
    await notificationService.deleteNotification(userId, id);
    
    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    logger.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

/**
 * Get unread notification count
 * GET /api/notifications/unread-count
 */
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const count = await notificationService.getUnreadCount(userId);
    
    res.json({ count });
  } catch (error) {
    logger.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

/**
 * Get notification preferences
 * GET /api/notifications/preferences
 */
router.get('/preferences', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const preferences = await notificationService.getNotificationPreferences(userId);
    
    res.json(preferences);
  } catch (error) {
    logger.error('Get notification preferences error:', error);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

/**
 * Update notification preferences
 * PUT /api/notifications/preferences
 */
router.put('/preferences', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const preferences = req.body;
    
    await notificationService.updateNotificationPreferences(userId, preferences);
    
    res.json({ message: 'Preferences updated successfully' });
  } catch (error) {
    logger.error('Update notification preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * Register push notification token
 * POST /api/notifications/register-token
 */
router.post('/register-token', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { token, platform } = req.body;
    
    if (!token || !platform) {
      res.status(400).json({ error: 'Token and platform are required' });
      return;
    }
    
    await notificationService.registerDeviceToken(userId, token, platform);
    
    res.json({ message: 'Push token registered successfully' });
  } catch (error) {
    logger.error('Register push token error:', error);
    res.status(500).json({ error: 'Failed to register push token' });
  }
});

/**
 * Test push notification (debug only)
 * POST /api/notifications/test
 */
router.post('/test', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({ error: 'Test endpoint disabled in production' });
      return;
    }
    
    await notificationService.sendPushNotification(userId, {
      title: 'Test Notification',
      body: 'This is a test notification from SafeRoute',
      data: { type: 'test', timestamp: Date.now() },
      priority: 'normal',
    });
    
    res.json({ message: 'Test notification sent' });
  } catch (error) {
    logger.error('Send test notification error:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

export default router;
