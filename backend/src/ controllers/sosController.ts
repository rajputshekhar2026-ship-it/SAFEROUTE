// src/controllers/sosController.ts

import { Request, Response } from 'express';
import { query } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';
import { notificationService } from '../services/notificationService';
import { smsService } from '../services/smsService';
import { geocodingService } from '../services/geocodingService';
import { uploadToCloudinary } from '../services/uploadService';
import { v4 as uuidv4 } from 'uuid';

// Types
interface TriggerSOSBody {
  location: {
    lat: number;
    lng: number;
    address?: string;
  };
  message?: string;
  audioUri?: string;
  photoUri?: string;
  contacts?: string[];
  autoTriggered?: boolean;
}

interface SosResponse {
  sosId: string;
  status: 'active' | 'responded' | 'resolved' | 'cancelled';
  responderId?: string;
  eta?: number;
  message?: string;
}

class SOSController {
  private readonly SOS_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private readonly AUTO_CANCEL_DELAY = 30 * 60 * 1000; // 30 minutes

  /**
   * Trigger SOS alert
   */
  async triggerSOS(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const userName = req.user!.name;
      const userPhone = req.user!.phone;
      const {
        location,
        message,
        audioUri,
        photoUri,
        contacts: manualContacts,
        autoTriggered = false,
      }: TriggerSOSBody = req.body;

      if (!location || !location.lat || !location.lng) {
        res.status(400).json({ error: 'Location is required' });
        return;
      }

      // Get emergency contacts from database if not provided
      let contacts = manualContacts;
      if (!contacts || contacts.length === 0) {
        const userResult = await query(
          'SELECT emergency_contacts FROM users WHERE id = $1',
          [userId]
        );
        contacts = userResult.rows[0]?.emergency_contacts || [];
      }

      // Upload media if provided
      let audioUrl = null;
      let photoUrl = null;

      if (audioUri) {
        audioUrl = await uploadToCloudinary(audioUri, 'sos_audio');
      }

      if (photoUri) {
        photoUrl = await uploadToCloudinary(photoUri, 'sos_photos');
      }

      // Get location address
      let address = location.address;
      if (!address) {
        const geocodeResult = await geocodingService.reverseGeocode(location.lat, location.lng);
        address = geocodeResult?.formattedAddress;
      }

      // Create SOS event
      const sosId = uuidv4();
      await query(
        `INSERT INTO sos_events (id, user_id, location, message, audio_url, photo_urls, contacts_notified, status, created_at)
         VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5, $6, $7, $8, 'active', NOW())`,
        [sosId, userId, location.lng, location.lat, message, audioUrl, photoUrl ? [photoUrl] : [], JSON.stringify(contacts)]
      );

      // Send notifications to all emergency contacts
      const notifiedContacts = [];
      for (const contact of contacts) {
        try {
          // Send SMS
          if (contact.phone) {
            await smsService.sendEmergencyAlert(
              contact.phone,
              userName,
              { lat: location.lat, lng: location.lng, address },
              message
            );
          }

          // Send Push Notification if contact has the app
          if (contact.userId) {
            await notificationService.sendPushNotification(contact.userId, {
              title: `🚨 SOS Alert from ${userName}`,
              body: message || 'Emergency assistance required immediately!',
              data: {
                type: 'sos',
                sosId,
                userId,
                userName,
                location: { lat: location.lat, lng: location.lng, address },
                message,
                timestamp: Date.now(),
              },
              priority: 'high',
              sound: 'sos.wav',
            });
          }

          notifiedContacts.push({
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
            notified: true,
          });
        } catch (error) {
          logger.error(`Failed to notify contact ${contact.name}:`, error);
          notifiedContacts.push({
            name: contact.name,
            phone: contact.phone,
            notified: false,
            error: error.message,
          });
        }
      }

      // Update notified contacts in database
      await query(
        'UPDATE sos_events SET contacts_notified = $1 WHERE id = $2',
        [JSON.stringify(notifiedContacts), sosId]
      );

      // Notify emergency services (911/112) if configured
      if (process.env.EMERGENCY_SERVICE_ENABLED === 'true') {
        await this.notifyEmergencyServices({
          sosId,
          userId,
          userName,
          userPhone,
          location: { lat: location.lat, lng: location.lng, address },
          message,
          audioUrl,
          photoUrl,
        });
      }

      // Set auto-cancel timeout
      setTimeout(async () => {
        await this.autoCancelSOS(sosId);
      }, this.AUTO_CANCEL_DELAY);

      logger.info(`SOS triggered for user ${userId} (${sosId})`);

      // Send acknowledgment to user
      res.json({
        message: 'SOS alert triggered successfully',
        sosId,
        contactsNotified: notifiedContacts.filter(c => c.notified).length,
        totalContacts: contacts.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Trigger SOS error:', error);
      res.status(500).json({ error: 'Failed to trigger SOS alert' });
    }
  }

  /**
   * Cancel active SOS
   */
  async cancelSOS(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { sosId } = req.params;

      const result = await query(
        `UPDATE sos_events 
         SET status = 'cancelled', resolved_at = NOW()
         WHERE id = $1 AND user_id = $2 AND status = 'active'
         RETURNING id`,
        [sosId, userId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Active SOS not found' });
        return;
      }

      // Notify contacts that SOS was cancelled
      const sos = await query(
        'SELECT contacts_notified FROM sos_events WHERE id = $1',
        [sosId]
      );

      const contacts = sos.rows[0]?.contacts_notified || [];
      for (const contact of contacts) {
        if (contact.phone && contact.notified) {
          await smsService.sendSms({
            to: contact.phone,
            body: `✅ SOS cancelled by ${req.user!.name}. They are safe.`,
            priority: 'high',
          });
        }
      }

      logger.info(`SOS ${sosId} cancelled by user ${userId}`);

      res.json({
        message: 'SOS cancelled successfully',
        sosId,
      });
    } catch (error) {
      logger.error('Cancel SOS error:', error);
      res.status(500).json({ error: 'Failed to cancel SOS' });
    }
  }

  /**
   * Get SOS status
   */
  async getSOSStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { sosId } = req.params;

      const result = await query(
        `SELECT s.*, 
                ST_X(s.location::geometry) as lng,
                ST_Y(s.location::geometry) as lat,
                u.name as user_name,
                u.phone as user_phone
         FROM sos_events s
         LEFT JOIN users u ON s.user_id = u.id
         WHERE s.id = $1 AND s.user_id = $2`,
        [sosId, userId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'SOS event not found' });
        return;
      }

      const sos = result.rows[0];
      
      // Check if SOS is still active
      const isActive = sos.status === 'active';
      const timeElapsed = Date.now() - new Date(sos.created_at).getTime();
      const timeRemaining = Math.max(0, this.SOS_TIMEOUT - timeElapsed);

      res.json({
        sos: {
          id: sos.id,
          status: sos.status,
          location: { lat: sos.lat, lng: sos.lng },
          message: sos.message,
          createdAt: sos.created_at,
          resolvedAt: sos.resolved_at,
          isActive,
          timeRemaining: Math.ceil(timeRemaining / 1000), // seconds
        },
        responder: sos.responder_id ? {
          id: sos.responder_id,
          name: sos.responder_name,
          eta: sos.eta,
        } : null,
      });
    } catch (error) {
      logger.error('Get SOS status error:', error);
      res.status(500).json({ error: 'Failed to get SOS status' });
    }
  }

  /**
   * Get SOS history for user
   */
  async getSOSHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { limit = 50, offset = 0 } = req.query;

      const result = await query(
        `SELECT s.*, 
                ST_X(s.location::geometry) as lng,
                ST_Y(s.location::geometry) as lat
         FROM sos_events s
         WHERE s.user_id = $1
         ORDER BY s.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      const count = await query(
        'SELECT COUNT(*) as total FROM sos_events WHERE user_id = $1',
        [userId]
      );

      res.json({
        sosEvents: result.rows,
        pagination: {
          total: parseInt(count.rows[0].total),
          limit: Number(limit),
          offset: Number(offset),
        },
      });
    } catch (error) {
      logger.error('Get SOS history error:', error);
      res.status(500).json({ error: 'Failed to get SOS history' });
    }
  }

  /**
   * Get active SOS events (for emergency responders)
   */
  async getActiveSOSEvents(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Only allow emergency responders or admins
      if (req.user!.role !== 'admin' && req.user!.role !== 'responder') {
        res.status(403).json({ error: 'Unauthorized' });
        return;
      }

      const result = await query(
        `SELECT s.*, 
                ST_X(s.location::geometry) as lng,
                ST_Y(s.location::geometry) as lat,
                u.name as user_name,
                u.phone as user_phone,
                u.email as user_email
         FROM sos_events s
         JOIN users u ON s.user_id = u.id
         WHERE s.status = 'active'
         ORDER BY s.created_at DESC`
      );

      res.json({
        activeSOS: result.rows,
        count: result.rows.length,
      });
    } catch (error) {
      logger.error('Get active SOS events error:', error);
      res.status(500).json({ error: 'Failed to get active SOS events' });
    }
  }

  /**
   * Respond to SOS (for emergency responders)
   */
  async respondToSOS(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { sosId } = req.params;
      const { eta, message } = req.body;
      const responderId = req.user!.id;

      // Check if user is authorized
      if (req.user!.role !== 'admin' && req.user!.role !== 'responder') {
        res.status(403).json({ error: 'Unauthorized' });
        return;
      }

      const result = await query(
        `UPDATE sos_events 
         SET status = 'responded', 
             responder_id = $1, 
             eta = $2,
             message = $3,
             responded_at = NOW()
         WHERE id = $4 AND status = 'active'
         RETURNING user_id, contacts_notified`,
        [responderId, eta, message, sosId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Active SOS not found' });
        return;
      }

      const sos = result.rows[0];

      // Notify user that help is on the way
      await notificationService.sendPushNotification(sos.user_id, {
        title: '🚨 Help is on the way!',
        body: message || 'Emergency responder is en route to your location.',
        data: {
          type: 'sos_response',
          sosId,
          responderId,
          eta,
          message,
        },
        priority: 'high',
      });

      // Notify contacts
      const contacts = sos.contacts_notified || [];
      for (const contact of contacts) {
        if (contact.phone && contact.notified) {
          await smsService.sendSms({
            to: contact.phone,
            body: `🚨 Help is en route to ${req.user!.name}. ETA: ${eta || 'ASAP'}. ${message || ''}`,
            priority: 'high',
          });
        }
      }

      logger.info(`Responder ${responderId} responded to SOS ${sosId}`);

      res.json({
        message: 'SOS response recorded',
        sosId,
        status: 'responded',
      });
    } catch (error) {
      logger.error('Respond to SOS error:', error);
      res.status(500).json({ error: 'Failed to respond to SOS' });
    }
  }

  /**
   * Mark SOS as resolved
   */
  async resolveSOS(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { sosId } = req.params;
      const userId = req.user!.id;

      const result = await query(
        `UPDATE sos_events 
         SET status = 'resolved', resolved_at = NOW()
         WHERE id = $1 AND (user_id = $2 OR $2 IN (SELECT id FROM users WHERE role = 'admin'))
         RETURNING user_id, contacts_notified`,
        [sosId, userId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'SOS event not found' });
        return;
      }

      const sos = result.rows[0];

      // Notify contacts that user is safe
      const contacts = sos.contacts_notified || [];
      for (const contact of contacts) {
        if (contact.phone && contact.notified) {
          await smsService.sendSms({
            to: contact.phone,
            body: `✅ ${req.user!.name} is now safe. SOS has been resolved.`,
            priority: 'medium',
          });
        }
      }

      logger.info(`SOS ${sosId} resolved by user ${userId}`);

      res.json({
        message: 'SOS marked as resolved',
        sosId,
      });
    } catch (error) {
      logger.error('Resolve SOS error:', error);
      res.status(500).json({ error: 'Failed to resolve SOS' });
    }
  }

  /**
   * Get fake call details
   */
  async getFakeCall(req: AuthRequest, res: Response): Promise<void> {
    try {
      const fakeContacts = [
        {
          id: 'mom',
          name: 'Mom',
          relationship: 'Mother',
          phone: '+1 (555) 123-4567',
          photoUrl: '/images/mom-avatar.png',
          conversationPrompts: [
            "I'm on my way home, should be there in 10 minutes",
            "Yes, I'm walking on Main Street right now",
            "Can you stay on the phone with me until I get home?",
            "I see a well-lit area ahead, I'm heading there",
            "I'll call you back when I get home safely",
          ],
        },
        {
          id: 'brother',
          name: 'Mike',
          relationship: 'Brother',
          phone: '+1 (555) 234-5678',
          photoUrl: '/images/brother-avatar.png',
          conversationPrompts: [
            "Hey, just checking if you're okay",
            "Where are you right now?",
            "Want me to come pick you up?",
            "Stay on the main roads, they're safer",
            "I'll meet you at the corner in 5 minutes",
          ],
        },
        {
          id: 'friend',
          name: 'Sarah',
          relationship: 'Best Friend',
          phone: '+1 (555) 345-6789',
          photoUrl: '/images/friend-avatar.png',
          conversationPrompts: [
            "Are you almost here? The party is great!",
            "I'm waiting for you at the entrance",
            "Let me know when you're close, I'll come out",
            "Be careful, the streets are a bit dark",
            "Text me when you're 5 minutes away",
          ],
        },
        {
          id: 'police',
          name: 'Police Department',
          relationship: 'Emergency Services',
          phone: '911',
          photoUrl: '/images/police-avatar.png',
          conversationPrompts: [
            "This is the police department, how can we help?",
            "What is your emergency?",
            "Stay on the line, we're tracing your location",
            "Officers are on their way, ETA 5 minutes",
            "Can you describe the suspect?",
          ],
        },
      ];

      // Get random contact or specific if requested
      const { contactId } = req.query;
      let contact = fakeContacts[0];
      
      if (contactId) {
        contact = fakeContacts.find(c => c.id === contactId) || fakeContacts[0];
      }

      res.json({
        contact,
        callId: uuidv4(),
        expiresIn: 300, // 5 minutes
      });
    } catch (error) {
      logger.error('Get fake call error:', error);
      res.status(500).json({ error: 'Failed to get fake call details' });
    }
  }

  /**
   * Auto-cancel SOS after timeout
   */
  private async autoCancelSOS(sosId: string): Promise<void> {
    try {
      const result = await query(
        `UPDATE sos_events 
         SET status = 'cancelled', resolved_at = NOW()
         WHERE id = $1 AND status = 'active'
         RETURNING user_id`,
        [sosId]
      );

      if (result.rows.length > 0) {
        logger.info(`SOS ${sosId} auto-cancelled after timeout`);
      }
    } catch (error) {
      logger.error(`Auto-cancel SOS error for ${sosId}:`, error);
    }
  }

  /**
   * Notify emergency services (911/112)
   */
  private async notifyEmergencyServices(data: any): Promise<void> {
    try {
      // This would integrate with emergency services API
      // For now, log the notification
      logger.info('Emergency services notified:', data);
      
      // In production, you would call an API like RapidSOS or similar
      // await emergencyServicesAPI.notify(data);
    } catch (error) {
      logger.error('Failed to notify emergency services:', error);
    }
  }
}

export default new SOSController();
