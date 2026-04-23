// src/controllers/watchController.ts

import { Request, Response } from 'express';
import { query } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';
import { notificationService } from '../services/notificationService';
import { routingService } from '../services/routingService';
import { crimePredictionService } from '../services/crimePredictionService';
import { v4 as uuidv4 } from 'uuid';

// Types
interface WatchSyncData {
  deviceType: 'apple_watch' | 'wear_os';
  deviceId: string;
  watchName?: string;
  osVersion?: string;
  appVersion?: string;
}

interface WatchRoutePreview {
  routeId: string;
  startPoint: {
    lat: number;
    lng: number;
    name?: string;
  };
  endPoint: {
    lat: number;
    lng: number;
    name?: string;
  };
  waypoints?: Array<{ lat: number; lng: number; name?: string }>;
  duration: number;
  distance: number;
  safetyScore: number;
  steps: Array<{
    instruction: string;
    distance: number;
    duration: number;
    maneuver: string;
  }>;
}

interface WatchAlert {
  type: 'danger' | 'warning' | 'info' | 'sos';
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  location?: {
    lat: number;
    lng: number;
  };
}

class WatchController {
  private readonly WATCH_SESSION_TTL = 24 * 60 * 60; // 24 hours

  /**
   * Sync watch device with backend
   */
  async syncWatch(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { deviceType, deviceId, watchName, osVersion, appVersion }: WatchSyncData = req.body;

      if (!deviceType || !deviceId) {
        res.status(400).json({ error: 'Device type and ID are required' });
        return;
      }

      // Register or update watch device
      await query(
        `INSERT INTO watch_devices (user_id, device_id, device_type, watch_name, os_version, app_version, last_sync, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), true)
         ON CONFLICT (device_id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           device_type = EXCLUDED.device_type,
           watch_name = EXCLUDED.watch_name,
           os_version = EXCLUDED.os_version,
           app_version = EXCLUDED.app_version,
           last_sync = NOW(),
           is_active = true`,
        [userId, deviceId, deviceType, watchName, osVersion, appVersion]
      );

      // Store session in Redis
      const sessionKey = `watch:session:${userId}:${deviceId}`;
      await redisClient.setex(sessionKey, this.WATCH_SESSION_TTL, JSON.stringify({
        userId,
        deviceId,
        deviceType,
        connected: true,
        lastSync: Date.now(),
      }));

      // Get pending alerts for watch
      const pendingAlerts = await this.getPendingAlerts(userId);

      logger.info(`Watch synced for user ${userId} - Device: ${deviceType} (${deviceId})`);

      res.json({
        message: 'Watch synced successfully',
        deviceId,
        deviceType,
        lastSync: new Date().toISOString(),
        pendingAlerts,
      });
    } catch (error) {
      logger.error('Sync watch error:', error);
      res.status(500).json({ error: 'Failed to sync watch' });
    }
  }

  /**
   * Get route preview for watch
   */
  async getRoutePreview(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { routeId } = req.params;

      // Get route from database or cache
      let route: any;
      
      // Try cache first
      const cachedRoute = await redisClient.get(`route:${routeId}`);
      if (cachedRoute) {
        route = JSON.parse(cachedRoute);
      } else {
        // Get from database
        const result = await query(
          `SELECT r.*, 
                  ST_X(r.start_point::geometry) as start_lng,
                  ST_Y(r.start_point::geometry) as start_lat,
                  ST_X(r.end_point::geometry) as end_lng,
                  ST_Y(r.end_point::geometry) as end_lat
           FROM routes r
           WHERE r.id = $1 AND r.user_id = $2`,
          [routeId, userId]
        );
        
        if (result.rows.length === 0) {
          res.status(404).json({ error: 'Route not found' });
          return;
        }
        route = result.rows[0];
      }

      // Format route for watch display
      const watchRoute: WatchRoutePreview = {
        routeId: route.id,
        startPoint: {
          lat: route.start_lat,
          lng: route.start_lng,
          name: route.start_name || 'Start',
        },
        endPoint: {
          lat: route.end_lat,
          lng: route.end_lng,
          name: route.end_name || 'Destination',
        },
        duration: route.duration_seconds,
        distance: route.distance_meters,
        safetyScore: route.risk_score || 70,
        steps: await this.formatStepsForWatch(route.id, route.path),
      };

      // Cache for watch
      await redisClient.setex(`watch:route:${userId}`, 3600, JSON.stringify(watchRoute));

      res.json({
        route: watchRoute,
        summary: {
          duration: this.formatDuration(route.duration_seconds),
          distance: this.formatDistance(route.distance_meters),
          safetyLevel: this.getSafetyLevel(route.risk_score),
        },
      });
    } catch (error) {
      logger.error('Get route preview error:', error);
      res.status(500).json({ error: 'Failed to get route preview' });
    }
  }

  /**
   * Send haptic alert to watch
   */
  async sendHapticAlert(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { alertType, message, severity, location } = req.body;

      if (!alertType || !message) {
        res.status(400).json({ error: 'Alert type and message are required' });
        return;
      }

      const alert: WatchAlert = {
        type: alertType,
        title: this.getAlertTitle(alertType),
        message,
        severity: severity || 'medium',
        location,
      };

      // Store alert for watch to fetch
      await this.storeAlert(userId, alert);

      // Send push notification to watch
      await notificationService.sendPushNotification(userId, {
        title: alert.title,
        body: message,
        data: {
          type: 'watch_alert',
          alertType: alert.type,
          severity: alert.severity,
          location: location ? JSON.stringify(location) : null,
        },
        priority: alert.severity === 'high' || alert.severity === 'critical' ? 'high' : 'normal',
        sound: alert.type === 'danger' ? 'alert.wav' : 'default',
      });

      // Store in watch sync logs
      await query(
        `INSERT INTO watch_sync_logs (user_id, device_type, action, data, synced_at)
         VALUES ($1, $2, 'haptic_alert', $3, NOW())`,
        [userId, 'apple_watch', JSON.stringify(alert)]
      );

      logger.info(`Haptic alert sent to watch for user ${userId}: ${alertType}`);

      res.json({
        message: 'Alert sent to watch',
        alertId: uuidv4(),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Send haptic alert error:', error);
      res.status(500).json({ error: 'Failed to send alert to watch' });
    }
  }

  /**
   * Get watch connection status
   */
  async getWatchStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      const result = await query(
        `SELECT device_id, device_type, watch_name, os_version, app_version, last_sync, is_active
         FROM watch_devices
         WHERE user_id = $1 AND is_active = true
         ORDER BY last_sync DESC
         LIMIT 1`,
        [userId]
      );

      if (result.rows.length === 0) {
        res.json({
          connected: false,
          message: 'No watch device connected',
        });
        return;
      }

      const device = result.rows[0];
      const lastSyncAge = Date.now() - new Date(device.last_sync).getTime();
      const isConnected = lastSyncAge < 3600000; // Within last hour

      res.json({
        connected: isConnected,
        device: {
          id: device.device_id,
          type: device.device_type,
          name: device.watch_name,
          osVersion: device.os_version,
          appVersion: device.app_version,
        },
        lastSync: device.last_sync,
        lastSyncAge: Math.floor(lastSyncAge / 1000), // seconds
      });
    } catch (error) {
      logger.error('Get watch status error:', error);
      res.status(500).json({ error: 'Failed to get watch status' });
    }
  }

  /**
   * Disconnect watch device
   */
  async disconnectWatch(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { deviceId } = req.params;

      await query(
        `UPDATE watch_devices 
         SET is_active = false, last_sync = NOW()
         WHERE device_id = $1 AND user_id = $2`,
        [deviceId, userId]
      );

      // Remove session from Redis
      const sessionKey = `watch:session:${userId}:${deviceId}`;
      await redisClient.del(sessionKey);

      logger.info(`Watch ${deviceId} disconnected for user ${userId}`);

      res.json({
        message: 'Watch disconnected successfully',
      });
    } catch (error) {
      logger.error('Disconnect watch error:', error);
      res.status(500).json({ error: 'Failed to disconnect watch' });
    }
  }

  /**
   * Send real-time location to watch
   */
  async sendLocationToWatch(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { location } = req.body;

      if (!location || !location.lat || !location.lng) {
        res.status(400).json({ error: 'Location data required' });
        return;
      }

      // Store current location for watch to fetch
      await redisClient.setex(
        `watch:location:${userId}`,
        60, // 1 minute TTL
        JSON.stringify({
          lat: location.lat,
          lng: location.lng,
          timestamp: Date.now(),
          accuracy: location.accuracy,
        })
      );

      // Send push notification to update watch location
      await notificationService.sendPushNotification(userId, {
        title: 'Location Updated',
        body: 'Your current location has been synced to your watch',
        data: {
          type: 'location_update',
          location: JSON.stringify(location),
        },
        priority: 'normal',
      });

      res.json({
        message: 'Location sent to watch',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Send location to watch error:', error);
      res.status(500).json({ error: 'Failed to send location to watch' });
    }
  }

  /**
   * Send route progress to watch
   */
  async sendRouteProgress(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { routeId, currentStep, progressPercentage, remainingDistance, remainingDuration } = req.body;

      const progress = {
        routeId,
        currentStep,
        progressPercentage,
        remainingDistance,
        remainingDuration,
        timestamp: Date.now(),
      };

      // Store progress for watch
      await redisClient.setex(
        `watch:progress:${userId}`,
        300, // 5 minutes TTL
        JSON.stringify(progress)
      );

      // Send update to watch
      await notificationService.sendPushNotification(userId, {
        title: 'Route Progress',
        body: `${Math.round(progressPercentage)}% complete. ${this.formatDistance(remainingDistance)} remaining.`,
        data: {
          type: 'route_progress',
          progress: JSON.stringify(progress),
        },
        priority: 'normal',
      });

      res.json({
        message: 'Route progress sent to watch',
        progress,
      });
    } catch (error) {
      logger.error('Send route progress error:', error);
      res.status(500).json({ error: 'Failed to send route progress' });
    }
  }

  /**
   * Health data sync from watch
   */
  async syncHealthData(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { deviceId, heartRate, steps, distance, calories, timestamp } = req.body;

      await query(
        `INSERT INTO watch_health_data (user_id, device_id, heart_rate, steps, distance, calories, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, deviceId, heartRate, steps, distance, calories, timestamp || new Date()]
      );

      // Check for abnormal heart rate
      if (heartRate && (heartRate > 120 || heartRate < 50)) {
        await this.handleAbnormalHeartRate(userId, heartRate);
      }

      logger.info(`Health data synced for user ${userId} from watch ${deviceId}`);

      res.json({
        message: 'Health data synced successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Sync health data error:', error);
      res.status(500).json({ error: 'Failed to sync health data' });
    }
  }

  /**
   * Get watch notifications
   */
  async getWatchNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      const alerts = await this.getPendingAlerts(userId);
      
      // Mark as delivered
      await this.markAlertsAsDelivered(userId);

      res.json({
        notifications: alerts,
        count: alerts.length,
      });
    } catch (error) {
      logger.error('Get watch notifications error:', error);
      res.status(500).json({ error: 'Failed to get notifications' });
    }
  }

  /**
   * Format route steps for watch display
   */
  private async formatStepsForWatch(routeId: string, path: any): Promise<any[]> {
    // Extract simplified steps for watch display
    // In production, parse the route path and generate simplified instructions
    return [
      {
        instruction: "Start walking towards destination",
        distance: 500,
        duration: 360,
        maneuver: "straight",
      },
      {
        instruction: "Turn left on Main Street",
        distance: 200,
        duration: 144,
        maneuver: "turn-left",
      },
      {
        instruction: "Continue straight for 300 meters",
        distance: 300,
        duration: 216,
        maneuver: "straight",
      },
      {
        instruction: "You have arrived at your destination",
        distance: 0,
        duration: 0,
        maneuver: "arrive",
      },
    ];
  }

  /**
   * Store alert for watch to fetch
   */
  private async storeAlert(userId: string, alert: WatchAlert): Promise<void> {
    const key = `watch:alerts:${userId}`;
    const existing = await redisClient.get(key);
    let alerts = existing ? JSON.parse(existing) : [];
    
    alerts.push({
      ...alert,
      id: uuidv4(),
      timestamp: Date.now(),
      delivered: false,
    });
    
    // Keep only last 50 alerts
    if (alerts.length > 50) {
      alerts = alerts.slice(-50);
    }
    
    await redisClient.setex(key, 86400, JSON.stringify(alerts));
  }

  /**
   * Get pending alerts for watch
   */
  private async getPendingAlerts(userId: string): Promise<any[]> {
    const key = `watch:alerts:${userId}`;
    const existing = await redisClient.get(key);
    
    if (!existing) return [];
    
    const alerts = JSON.parse(existing);
    return alerts.filter((a: any) => !a.delivered);
  }

  /**
   * Mark alerts as delivered
   */
  private async markAlertsAsDelivered(userId: string): Promise<void> {
    const key = `watch:alerts:${userId}`;
    const existing = await redisClient.get(key);
    
    if (!existing) return;
    
    const alerts = JSON.parse(existing);
    alerts.forEach((a: any) => { a.delivered = true; });
    
    await redisClient.setex(key, 86400, JSON.stringify(alerts));
  }

  /**
   * Handle abnormal heart rate detection
   */
  private async handleAbnormalHeartRate(userId: string, heartRate: number): Promise<void> {
    const alert: WatchAlert = {
      type: 'warning',
      title: 'Abnormal Heart Rate Detected',
      message: `Your heart rate is ${heartRate} BPM. Please take a moment to rest if needed.`,
      severity: heartRate > 140 ? 'high' : 'medium',
    };
    
    await this.storeAlert(userId, alert);
    
    // Notify emergency contacts if critical
    if (heartRate > 150) {
      logger.warn(`Critical heart rate (${heartRate}) detected for user ${userId}`);
      // Could trigger SOS or notify emergency contacts
    }
  }

  /**
   * Format duration for display
   */
  private formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  /**
   * Format distance for display
   */
  private formatDistance(meters: number): string {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  }

  /**
   * Get safety level from score
   */
  private getSafetyLevel(score: number): string {
    if (score >= 80) return 'Very Safe';
    if (score >= 60) return 'Safe';
    if (score >= 40) return 'Moderate';
    return 'High Risk';
  }

  /**
   * Get alert title based on type
   */
  private getAlertTitle(type: string): string {
    switch (type) {
      case 'danger': return '⚠️ Danger Ahead';
      case 'warning': return '⚠️ Warning';
      case 'sos': return '🚨 SOS Alert';
      default: return 'ℹ️ Information';
    }
  }
}

export default new WatchController();
