// src/services/notificationService.ts

import * as admin from 'firebase-admin';
import { getMessaging } from 'firebase-admin/messaging';
import axios from 'axios';
import { redisClient } from '../config/redis';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import { sendEmail } from './emailService';
import { sendSMS } from './smsService';

// Types
export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
  sound?: string;
  priority?: 'normal' | 'high';
  ttl?: number; // Time to live in seconds
}

export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: 'sos' | 'alert' | 'weather' | 'crime' | 'safety' | 'system';
  priority: 'low' | 'medium' | 'high' | 'critical';
  data?: any;
  isRead: boolean;
  createdAt: Date;
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  sosAlerts: boolean;
  safetyAlerts: boolean;
  weatherWarnings: boolean;
  crimeAlerts: boolean;
  systemUpdates: boolean;
  quietHours: {
    enabled: boolean;
    start: string; // "22:00"
    end: string;   // "07:00"
  };
}

export interface DeviceToken {
  token: string;
  platform: 'ios' | 'android' | 'web';
  userId: string;
  createdAt: Date;
  lastUsedAt: Date;
}

class NotificationService {
  private fcmInitialized: boolean = false;

  constructor() {
    this.initializeFCM();
  }

  /**
   * Initialize Firebase Cloud Messaging
   */
  private initializeFCM(): void {
    try {
      const firebaseConfig = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      };

      if (firebaseConfig.projectId && firebaseConfig.privateKey && firebaseConfig.clientEmail) {
        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert(firebaseConfig),
            projectId: firebaseConfig.projectId,
          });
        }
        this.fcmInitialized = true;
        logger.info('Firebase Admin SDK initialized for push notifications');
      } else {
        logger.warn('Firebase credentials not configured, push notifications disabled');
      }
    } catch (error) {
      logger.error('Failed to initialize Firebase:', error);
    }
  }

  /**
   * Send push notification to a user
   */
  async sendPushNotification(
    userId: string,
    payload: PushNotificationPayload,
    saveToDatabase: boolean = true
  ): Promise<boolean> {
    if (!this.fcmInitialized) {
      logger.warn('FCM not initialized, skipping push notification');
      return false;
    }

    try {
      // Get user's device tokens
      const tokens = await this.getUserDeviceTokens(userId);
      
      if (tokens.length === 0) {
        logger.warn(`No device tokens found for user: ${userId}`);
        return false;
      }

      // Check quiet hours
      if (await this.isQuietHours(userId, payload.priority || 'normal')) {
        logger.debug(`Notification suppressed due to quiet hours for user: ${userId}`);
        return false;
      }

      // Prepare message
      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
          ...(payload.imageUrl && { imageUrl: payload.imageUrl }),
        },
        data: payload.data ? this.serializeData(payload.data) : undefined,
        apns: {
          payload: {
            aps: {
              sound: payload.sound || 'default',
              badge: 1,
              contentAvailable: true,
            },
          },
          headers: {
            'apns-priority': payload.priority === 'high' ? '10' : '5',
          },
        },
        android: {
          priority: payload.priority === 'high' ? 'high' : 'normal',
          ttl: (payload.ttl || 3600) * 1000,
          notification: {
            sound: payload.sound || 'default',
            channelId: this.getChannelId(payload.data?.type),
          },
        },
      };

      // Send notification
      const response = await getMessaging().sendEachForMulticast(message);
      
      // Handle failed tokens
      if (response.failureCount > 0) {
        const failedTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(tokens[idx]);
          }
        });
        
        if (failedTokens.length > 0) {
          await this.removeInvalidTokens(failedTokens);
          logger.warn(`Removed ${failedTokens.length} invalid device tokens for user: ${userId}`);
        }
      }

      logger.info(`Push notification sent to user ${userId}: ${response.successCount} succeeded, ${response.failureCount} failed`);

      // Save notification to database
      if (saveToDatabase) {
        await this.saveNotification({
          userId,
          title: payload.title,
          body: payload.body,
          type: payload.data?.type || 'system',
          priority: payload.priority === 'high' ? 'high' : 'medium',
          data: payload.data,
        });
      }

      return response.successCount > 0;
    } catch (error) {
      logger.error('Failed to send push notification:', error);
      return false;
    }
  }

  /**
   * Send push notification to multiple users
   */
  async sendBulkPushNotification(
    userIds: string[],
    payload: PushNotificationPayload,
    saveToDatabase: boolean = true
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    // Batch process to avoid overwhelming the system
    const batchSize = 100;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(userId => this.sendPushNotification(userId, payload, saveToDatabase))
      );
      
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          success++;
        } else {
          failed++;
        }
      });
    }

    return { success, failed };
  }

  /**
   * Send emergency alert (SOS)
   */
  async sendEmergencyAlert(
    userId: string,
    alertData: {
      userName: string;
      location: { lat: number; lng: number };
      message?: string;
      audioUrl?: string;
      photoUrl?: string;
    }
  ): Promise<void> {
    const locationUrl = `https://maps.google.com/?q=${alertData.location.lat},${alertData.location.lng}`;
    
    // Push notification
    await this.sendPushNotification(userId, {
      title: '🚨 SOS ALERT SENT 🚨',
      body: 'Emergency alert has been sent to your contacts and emergency services.',
      data: { type: 'sos', ...alertData },
      priority: 'high',
      sound: 'sos.wav',
    });

    // Get user's emergency contacts
    const contacts = await this.getEmergencyContacts(userId);
    
    for (const contact of contacts) {
      // Send SMS
      if (contact.phone && contact.smsEnabled !== false) {
        const smsMessage = `🚨 EMERGENCY SOS! ${alertData.userName} needs immediate help. Location: ${locationUrl} Time: ${new Date().toLocaleString()}. ${alertData.message ? `Message: ${alertData.message}` : ''}`;
        await sendSMS(contact.phone, smsMessage);
      }
      
      // Send Email
      if (contact.email && contact.emailEnabled !== false) {
        await sendEmail(
          contact.email,
          `🚨 Emergency SOS Alert - ${alertData.userName} Needs Help`,
          'sos_alert',
          {
            userName: alertData.userName,
            location: locationUrl,
            time: new Date().toLocaleString(),
            message: alertData.message,
            audioUrl: alertData.audioUrl,
            photoUrl: alertData.photoUrl,
          }
        );
      }
      
      // Send Push notification if they have the app
      if (contact.userId) {
        await this.sendPushNotification(contact.userId, {
          title: `🚨 SOS Alert from ${alertData.userName}`,
          body: alertData.message || 'Emergency assistance required immediately!',
          data: { type: 'sos', ...alertData },
          priority: 'high',
          sound: 'sos.wav',
        });
      }
    }

    logger.info(`Emergency alert sent for user ${userId} to ${contacts.length} contacts`);
  }

  /**
   * Send safety alert
   */
  async sendSafetyAlert(
    userId: string,
    alert: {
      title: string;
      message: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      location?: { lat: number; lng: number };
    }
  ): Promise<void> {
    const priority = alert.severity === 'critical' || alert.severity === 'high' ? 'high' : 'normal';
    const sound = alert.severity === 'critical' ? 'emergency.wav' : 'alert.wav';
    
    await this.sendPushNotification(userId, {
      title: `⚠️ ${alert.title}`,
      body: alert.message,
      data: { type: 'safety', ...alert },
      priority,
      sound,
    });
  }

  /**
   * Send weather warning
   */
  async sendWeatherWarning(
    userIds: string[],
    warning: {
      type: string;
      severity: 'low' | 'medium' | 'high';
      message: string;
      area: string;
    }
  ): Promise<void> {
    const priority = warning.severity === 'high' ? 'high' : 'normal';
    
    await this.sendBulkPushNotification(userIds, {
      title: `🌤️ Weather Warning: ${warning.type}`,
      body: `${warning.message} - Area: ${warning.area}`,
      data: { type: 'weather', ...warning },
      priority,
    });
  }

  /**
   * Send crime alert to users in area
   */
  async sendCrimeAlert(
    locations: Array<{ lat: number; lng: number; radius: number }>,
    alert: {
      crimeType: string;
      severity: 'low' | 'medium' | 'high';
      description: string;
    }
  ): Promise<void> {
    // Get users within affected area
    const users = await this.getUsersInArea(locations);
    
    if (users.length === 0) return;
    
    await this.sendBulkPushNotification(users, {
      title: `🚨 Crime Alert: ${alert.crimeType}`,
      body: `${alert.description} - Stay alert and aware of your surroundings.`,
      data: { type: 'crime', ...alert },
      priority: 'high',
      sound: 'alert.wav',
    });
    
    logger.info(`Crime alert sent to ${users.length} users in affected area`);
  }

  /**
   * Save notification to database
   */
  private async saveNotification(notification: Partial<NotificationRecord>): Promise<void> {
    try {
      await query(
        `INSERT INTO notifications (user_id, title, body, type, priority, data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          notification.userId,
          notification.title,
          notification.body,
          notification.type || 'system',
          notification.priority || 'medium',
          JSON.stringify(notification.data || {}),
        ]
      );
    } catch (error) {
      logger.error('Failed to save notification:', error);
    }
  }

  /**
   * Get user's device tokens
   */
  private async getUserDeviceTokens(userId: string): Promise<string[]> {
    const result = await query(
      `SELECT token FROM device_tokens 
       WHERE user_id = $1 AND is_active = true 
       AND last_used_at > NOW() - INTERVAL '30 days'`,
      [userId]
    );
    
    return result.rows.map(row => row.token);
  }

  /**
   * Register device token for push notifications
   */
  async registerDeviceToken(
    userId: string,
    token: string,
    platform: 'ios' | 'android' | 'web'
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO device_tokens (user_id, token, platform, last_used_at, created_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (token) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           last_used_at = NOW(),
           is_active = true`,
        [userId, token, platform]
      );
      
      logger.info(`Device token registered for user ${userId} on ${platform}`);
    } catch (error) {
      logger.error('Failed to register device token:', error);
    }
  }

  /**
   * Remove invalid device tokens
   */
  private async removeInvalidTokens(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    
    const placeholders = tokens.map((_, i) => `$${i + 1}`).join(',');
    await query(
      `UPDATE device_tokens SET is_active = false WHERE token IN (${placeholders})`,
      tokens
    );
  }

  /**
   * Get user's notification preferences
   */
  async getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    const result = await query(
      'SELECT preferences FROM users WHERE id = $1',
      [userId]
    );
    
    const preferences = result.rows[0]?.preferences || {};
    
    return {
      pushEnabled: preferences.pushEnabled !== false,
      emailEnabled: preferences.emailEnabled !== false,
      smsEnabled: preferences.smsEnabled !== false,
      sosAlerts: preferences.sosAlerts !== false,
      safetyAlerts: preferences.safetyAlerts !== false,
      weatherWarnings: preferences.weatherWarnings !== false,
      crimeAlerts: preferences.crimeAlerts !== false,
      systemUpdates: preferences.systemUpdates !== false,
      quietHours: {
        enabled: preferences.quietHours?.enabled || false,
        start: preferences.quietHours?.start || '22:00',
        end: preferences.quietHours?.end || '07:00',
      },
    };
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(
    userId: string,
    preferences: Partial<NotificationPreferences>
  ): Promise<void> {
    const current = await this.getNotificationPreferences(userId);
    const updated = { ...current, ...preferences };
    
    await query(
      `UPDATE users SET preferences = preferences || $1 WHERE id = $2`,
      [JSON.stringify(updated), userId]
    );
    
    logger.info(`Notification preferences updated for user ${userId}`);
  }

  /**
   * Check if notification should be sent during quiet hours
   */
  private async isQuietHours(userId: string, priority: string): Promise<boolean> {
    if (priority === 'high') return false;
    
    const preferences = await this.getNotificationPreferences(userId);
    if (!preferences.quietHours.enabled) return false;
    
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const { start, end } = preferences.quietHours;
    
    if (start <= end) {
      return currentTime >= start && currentTime <= end;
    } else {
      return currentTime >= start || currentTime <= end;
    }
  }

  /**
   * Get users within a geographic area
   */
  private async getUsersInArea(
    locations: Array<{ lat: number; lng: number; radius: number }>
  ): Promise<string[]> {
    const userIds = new Set<string>();
    
    for (const location of locations) {
      const result = await query(
        `SELECT DISTINCT user_id
         FROM location_history
         WHERE ST_DWithin(
           location::geometry,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           $3
         )
         AND created_at > NOW() - INTERVAL '10 minutes'
         AND user_id IS NOT NULL`,
        [location.lng, location.lat, location.radius]
      );
      
      result.rows.forEach(row => userIds.add(row.user_id));
    }
    
    return Array.from(userIds);
  }

  /**
   * Get user's emergency contacts
   */
  private async getEmergencyContacts(userId: string): Promise<any[]> {
    const result = await query(
      'SELECT emergency_contacts FROM users WHERE id = $1',
      [userId]
    );
    
    return result.rows[0]?.emergency_contacts || [];
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
    unreadOnly: boolean = false
  ): Promise<{ notifications: NotificationRecord[]; total: number }> {
    const offset = (page - 1) * limit;
    
    let queryText = `
      SELECT id, title, body, type, priority, data, is_read, created_at
      FROM notifications
      WHERE user_id = $1
    `;
    
    const params: any[] = [userId];
    
    if (unreadOnly) {
      queryText += ` AND is_read = false`;
    }
    
    queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await query(queryText, params);
    
    const countResult = await query(
      `SELECT COUNT(*) as total FROM notifications WHERE user_id = $1 ${unreadOnly ? 'AND is_read = false' : ''}`,
      [userId]
    );
    
    return {
      notifications: result.rows.map(row => ({
        id: row.id,
        userId,
        title: row.title,
        body: row.body,
        type: row.type,
        priority: row.priority,
        data: row.data,
        isRead: row.is_read,
        createdAt: row.created_at,
      })),
      total: parseInt(countResult.rows[0].total),
    };
  }

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(userId: string, notificationId: string): Promise<void> {
    await query(
      `UPDATE notifications SET is_read = true, read_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [notificationId, userId]
    );
  }

  /**
   * Mark all notifications as read
   */
  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await query(
      `UPDATE notifications SET is_read = true, read_at = NOW()
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    );
  }

  /**
   * Delete notification
   */
  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    await query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [notificationId, userId]
    );
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    const result = await query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
      [userId]
    );
    
    return parseInt(result.rows[0].count);
  }

  /**
   * Serialize data for FCM
   */
  private serializeData(data: Record<string, any>): Record<string, string> {
    const serialized: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      serialized[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return serialized;
  }

  /**
   * Get notification channel ID based on type
   */
  private getChannelId(type?: string): string {
    const channels: Record<string, string> = {
      sos: 'sos_channel',
      alert: 'alert_channel',
      weather: 'weather_channel',
      crime: 'crime_channel',
      safety: 'safety_channel',
      system: 'system_channel',
    };
    
    return channels[type || 'system'] || 'default_channel';
  }

  /**
   * Clean up old notifications
   */
  async cleanupOldNotifications(daysToKeep: number = 30): Promise<number> {
    const result = await query(
      `DELETE FROM notifications 
       WHERE created_at < NOW() - INTERVAL '${daysToKeep} days' 
       AND is_read = true
       RETURNING id`,
    );
    
    const deletedCount = result.rowCount || 0;
    logger.info(`Cleaned up ${deletedCount} old notifications`);
    
    return deletedCount;
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
export default notificationService;
