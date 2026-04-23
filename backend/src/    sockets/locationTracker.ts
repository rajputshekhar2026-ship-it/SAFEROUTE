// src/sockets/locationTracker.ts

import { Server, Socket } from 'socket.io';
import { redisClient } from '../config/redis';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import { notificationService } from '../services/notificationService';
import { crimePredictionService } from '../services/crimePredictionService';

// Types
interface UserLocation {
  userId: string;
  lat: number;
  lng: number;
  accuracy: number;
  speed: number;
  heading: number;
  timestamp: number;
  isBackground: boolean;
}

interface UserSession {
  userId: string;
  socketId: string;
  currentLocation: UserLocation;
  lastLocation: UserLocation;
  routeId: string | null;
  startTime: number;
  lastUpdate: number;
  isActive: boolean;
  healthMode: boolean;
}

interface DeviationAlert {
  userId: string;
  deviationDistance: number;
  expectedPath: UserLocation[];
  currentLocation: UserLocation;
  timestamp: number;
}

class LocationTracker {
  private io: Server;
  private userSessions: Map<string, UserSession> = new Map();
  private deviationThreshold: number = 50; // meters
  private stopThreshold: number = 120; // seconds
  private updateInterval: number = 5000; // milliseconds
  private intervalId: NodeJS.Timeout | null = null;

  constructor(io: Server) {
    this.io = io;
    this.startMonitoring();
  }

  /**
   * Initialize WebSocket connection handlers
   */
  public initializeConnection(socket: Socket): void {
    logger.info(`New WebSocket connection: ${socket.id}`);

    // Authenticate socket connection
    socket.on('authenticate', async (token: string) => {
      await this.handleAuthentication(socket, token);
    });

    // Location update handler
    socket.on('location-update', async (data: UserLocation) => {
      await this.handleLocationUpdate(socket, data);
    });

    // SOS trigger handler
    socket.on('sos-trigger', async (data: any) => {
      await this.handleSOS(socket, data);
    });

    // Check-in handler
    socket.on('checkin', async (data: any) => {
      await this.handleCheckIn(socket, data);
    });

    // Health mode toggle
    socket.on('health-mode-toggle', async (data: { enabled: boolean }) => {
      await this.handleHealthModeToggle(socket, data);
    });

    // Route request handler
    socket.on('route-request', async (data: any) => {
      await this.handleRouteRequest(socket, data);
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      this.handleDisconnect(socket);
    });
  }

  /**
   * Handle socket authentication
   */
  private async handleAuthentication(socket: Socket, token: string): Promise<void> {
    try {
      // Verify JWT token (implement your JWT verification)
      const userId = this.verifyToken(token);
      
      if (!userId) {
        socket.emit('auth-error', { message: 'Invalid token' });
        socket.disconnect();
        return;
      }

      // Check if user already has an active session
      const existingSession = this.userSessions.get(userId);
      if (existingSession) {
        // Notify old session about new connection
        this.io.to(existingSession.socketId).emit('session-replaced', { 
          message: 'New session started elsewhere' 
        });
        this.userSessions.delete(userId);
      }

      // Create new session
      const session: UserSession = {
        userId,
        socketId: socket.id,
        currentLocation: null as any,
        lastLocation: null as any,
        routeId: null,
        startTime: Date.now(),
        lastUpdate: Date.now(),
        isActive: true,
        healthMode: false,
      };

      this.userSessions.set(userId, session);
      
      // Store socket reference
      (socket as any).userId = userId;
      
      socket.emit('auth-success', { message: 'Authenticated successfully' });
      
      // Send initial safety status
      await this.sendSafetyStatus(userId);
      
      logger.info(`User ${userId} authenticated on socket ${socket.id}`);
    } catch (error) {
      logger.error('Authentication error:', error);
      socket.emit('auth-error', { message: 'Authentication failed' });
      socket.disconnect();
    }
  }

  /**
   * Handle location updates from client
   */
  private async handleLocationUpdate(socket: Socket, data: UserLocation): Promise<void> {
    const userId = (socket as any).userId;
    if (!userId) return;

    const session = this.userSessions.get(userId);
    if (!session) return;

    // Update session with new location
    session.lastLocation = session.currentLocation;
    session.currentLocation = {
      ...data,
      userId,
      timestamp: Date.now(),
    };
    session.lastUpdate = Date.now();

    // Store in Redis for real-time access
    await this.storeLocationInRedis(userId, session.currentLocation);

    // Store in database for history (batch processing recommended)
    await this.storeLocationInDatabase(userId, session.currentLocation);

    // Check for route deviation
    if (session.routeId) {
      await this.checkRouteDeviation(session);
    }

    // Check for prolonged stop
    await this.checkProlongedStop(session);

    // Get real-time risk assessment
    const riskLevel = await this.getCurrentRiskLevel(session.currentLocation);
    
    // Send risk update if high
    if (riskLevel === 'high' || riskLevel === 'critical') {
      socket.emit('high-risk-area', {
        riskLevel,
        message: 'You are entering a high-risk area. Stay alert.',
        timestamp: Date.now(),
      });
    }

    // Broadcast to trusted contacts if user is in danger mode
    if (session.healthMode === false && riskLevel === 'critical') {
      await this.notifyTrustedContacts(userId, session.currentLocation);
    }

    // Update user's last known location in database
    await query(
      `UPDATE users 
       SET last_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           last_active = NOW()
       WHERE id = $3`,
      [session.currentLocation.lng, session.currentLocation.lat, userId]
    );
  }

  /**
   * Check if user deviated from planned route
   */
  private async checkRouteDeviation(session: UserSession): Promise<void> {
    if (!session.routeId || !session.currentLocation || !session.lastLocation) return;

    // Get expected route path from database
    const routeResult = await query(
      `SELECT path, risk_score 
       FROM routes 
       WHERE id = $1 AND user_id = $2`,
      [session.routeId, session.userId]
    );

    if (routeResult.rows.length === 0) return;

    const route = routeResult.rows[0];
    const deviation = await this.calculateDeviation(
      session.currentLocation,
      route.path
    );

    if (deviation > this.deviationThreshold) {
      // Send deviation alert to user
      const socket = this.io.sockets.sockets.get(session.socketId);
      if (socket) {
        socket.emit('route-deviation', {
          deviationDistance: deviation,
          threshold: this.deviationThreshold,
          message: `You have deviated ${Math.round(deviation)}m from your safe route.`,
          recommendedAction: 'reroute',
          timestamp: Date.now(),
        });

        // Log deviation
        await query(
          `INSERT INTO route_deviations (user_id, route_id, deviation, location, created_at)
           VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, NOW())`,
          [session.userId, session.routeId, deviation, 
           session.currentLocation.lng, session.currentLocation.lat]
        );
      }
    }
  }

  /**
   * Check if user has been stationary for too long
   */
  private async checkProlongedStop(session: UserSession): Promise<void> {
    if (!session.currentLocation || !session.lastLocation) return;

    const timeSinceLastMove = Date.now() - session.lastUpdate;
    const distance = this.calculateDistance(
      session.currentLocation,
      session.lastLocation
    );

    if (distance < 5 && timeSinceLastMove > this.stopThreshold * 1000) {
      const socket = this.io.sockets.sockets.get(session.socketId);
      if (socket) {
        socket.emit('safety-check', {
          type: 'prolonged-stop',
          duration: Math.floor(timeSinceLastMove / 1000),
          message: 'You have been stationary for a while. Are you safe?',
          requiresResponse: true,
          timeout: 10000, // 10 seconds to respond
          timestamp: Date.now(),
        });

        // Set timeout for auto-SOS if no response
        setTimeout(async () => {
          const updatedSession = this.userSessions.get(session.userId);
          if (updatedSession && updatedSession.lastUpdate === session.lastUpdate) {
            // No movement, trigger SOS
            await this.triggerAutoSOS(session.userId, session.currentLocation, 'prolonged-stop');
          }
        }, 10000);
      }
    }
  }

  /**
   * Handle SOS trigger from client
   */
  private async handleSOS(socket: Socket, data: any): Promise<void> {
    const userId = (socket as any).userId;
    if (!userId) return;

    const session = this.userSessions.get(userId);
    if (!session) return;

    logger.warn(`SOS triggered for user ${userId}`);

    // Get emergency contacts
    const userResult = await query(
      'SELECT emergency_contacts, name, phone FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];
    const contacts = user.emergency_contacts || [];

    // Send notifications to all emergency contacts
    for (const contact of contacts) {
      await notificationService.sendEmergencyAlert(contact, {
        userName: user.name,
        location: session.currentLocation,
        message: data.message || 'Emergency SOS! Immediate assistance required.',
        audioUrl: data.audioUrl,
        photoUrl: data.photoUrl,
        timestamp: Date.now(),
      });
    }

    // Send SMS alerts
    for (const contact of contacts) {
      if (contact.phone) {
        await this.sendSMSAlert(contact.phone, user.name, session.currentLocation);
      }
    }

    // Store SOS event in database
    const sosResult = await query(
      `INSERT INTO sos_events (user_id, location, message, contacts_notified, status, created_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, $5, 'active', NOW())
       RETURNING id`,
      [userId, session.currentLocation.lng, session.currentLocation.lat, 
       data.message, JSON.stringify(contacts)]
    );

    const sosId = sosResult.rows[0].id;

    // Broadcast to all connected admin/monitoring clients
    this.io.emit('sos-broadcast', {
      sosId,
      userId,
      userName: user.name,
      location: session.currentLocation,
      timestamp: Date.now(),
    });

    // Acknowledge SOS to user
    socket.emit('sos-acknowledged', {
      sosId,
      message: 'Emergency services have been notified. Help is on the way.',
      timestamp: Date.now(),
    });
  }

  /**
   * Auto-trigger SOS when user doesn't respond to safety check
   */
  private async triggerAutoSOS(
    userId: string,
    location: UserLocation,
    reason: string
  ): Promise<void> {
    logger.warn(`Auto-SOS triggered for user ${userId}. Reason: ${reason}`);

    const socket = this.io.sockets.sockets.get(
      this.userSessions.get(userId)?.socketId || ''
    );

    if (socket) {
      await this.handleSOS(socket, {
        message: `Auto-SOS triggered: ${reason}. User unresponsive to safety check.`,
        autoTriggered: true,
      });
    }
  }

  /**
   * Handle user check-in
   */
  private async handleCheckIn(socket: Socket, data: any): Promise<void> {
    const userId = (socket as any).userId;
    if (!userId) return;

    const session = this.userSessions.get(userId);
    if (!session) return;

    await query(
      `INSERT INTO checkins (user_id, location, status, note, created_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, $5, NOW())`,
      [userId, session.currentLocation.lng, session.currentLocation.lat, 
       data.status || 'safe', data.note || '']
    );

    socket.emit('checkin-confirmed', {
      message: 'Check-in recorded successfully',
      timestamp: Date.now(),
    });
  }

  /**
   * Handle health mode toggle
   */
  private async handleHealthModeToggle(socket: Socket, data: { enabled: boolean }): Promise<void> {
    const userId = (socket as any).userId;
    if (!userId) return;

    const session = this.userSessions.get(userId);
    if (session) {
      session.healthMode = data.enabled;
      
      // Log health mode change
      await query(
        `INSERT INTO health_mode_logs (user_id, action, disguise_type, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [userId, data.enabled ? 'activate' : 'deactivate', 'weather']
      );
    }
  }

  /**
   * Handle route request from client
   */
  private async handleRouteRequest(socket: Socket, data: any): Promise<void> {
    const userId = (socket as any).userId;
    if (!userId) return;

    const session = this.userSessions.get(userId);
    if (session) {
      session.routeId = data.routeId;
    }
  }

  /**
   * Handle socket disconnect
   */
  private handleDisconnect(socket: Socket): void {
    const userId = (socket as any).userId;
    if (userId) {
      const session = this.userSessions.get(userId);
      if (session && session.socketId === socket.id) {
        this.userSessions.delete(userId);
        logger.info(`User ${userId} disconnected`);
      }
    }
  }

  /**
   * Start monitoring intervals
   */
  private startMonitoring(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(async () => {
      await this.monitorActiveSessions();
    }, this.updateInterval);

    logger.info('Location tracking monitoring started');
  }

  /**
   * Monitor all active sessions for anomalies
   */
  private async monitorActiveSessions(): Promise<void> {
    for (const [userId, session] of this.userSessions) {
      if (!session.isActive) continue;

      // Check if session is stale (no updates for > 30 seconds)
      const timeSinceLastUpdate = Date.now() - session.lastUpdate;
      if (timeSinceLastUpdate > 30000) {
        session.isActive = false;
        logger.warn(`User ${userId} session inactive for ${timeSinceLastUpdate}ms`);
        
        // Trigger safety check
        const socket = this.io.sockets.sockets.get(session.socketId);
        if (socket) {
          socket.emit('connection-warning', {
            message: 'Location updates interrupted. Please check your connection.',
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  /**
   * Send safety status to user
   */
  private async sendSafetyStatus(userId: string): Promise<void> {
    const session = this.userSessions.get(userId);
    if (!session || !session.currentLocation) return;

    const riskLevel = await this.getCurrentRiskLevel(session.currentLocation);
    const nearbyRefuges = await this.getNearbyRefuges(session.currentLocation);

    const socket = this.io.sockets.sockets.get(session.socketId);
    if (socket) {
      socket.emit('safety-status', {
        riskLevel,
        nearbyRefuges: nearbyRefuges.slice(0, 5),
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get current risk level for a location
   */
  private async getCurrentRiskLevel(location: UserLocation): Promise<string> {
    try {
      const prediction = await crimePredictionService.predictRisk(location.lat, location.lng);
      return prediction.colorCode;
    } catch (error) {
      logger.error('Risk prediction error:', error);
      return 'unknown';
    }
  }

  /**
   * Get nearby refuges
   */
  private async getNearbyRefuges(location: UserLocation, radius: number = 1000): Promise<any[]> {
    const result = await query(
      `SELECT id, name, type, 
              ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance
       FROM refuges
       WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
       ORDER BY distance
       LIMIT 10`,
      [location.lng, location.lat, radius]
    );
    return result.rows;
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  private calculateDistance(point1: UserLocation, point2: UserLocation): number {
    const R = 6371e3;
    const φ1 = (point1.lat * Math.PI) / 180;
    const φ2 = (point2.lat * Math.PI) / 180;
    const Δφ = ((point2.lat - point1.lat) * Math.PI) / 180;
    const Δλ = ((point2.lng - point1.lng) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Calculate deviation from planned route
   */
  private async calculateDeviation(
    currentLocation: UserLocation,
    plannedPath: any
  ): Promise<number> {
    // Implement route deviation calculation using PostGIS
    const result = await query(
      `SELECT ST_Distance(
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3::geography
       ) as distance`,
      [currentLocation.lng, currentLocation.lat, plannedPath]
    );
    return result.rows[0]?.distance || 0;
  }

  /**
   * Store location in Redis for real-time access
   */
  private async storeLocationInRedis(userId: string, location: UserLocation): Promise<void> {
    const key = `user:location:${userId}`;
    await redisClient.setex(key, 3600, JSON.stringify(location));
  }

  /**
   * Store location in PostgreSQL for history
   */
  private async storeLocationInDatabase(userId: string, location: UserLocation): Promise<void> {
    // Batch insert for performance (using a queue would be better)
    await query(
      `INSERT INTO location_history (user_id, location, speed, heading, created_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, $5, NOW())`,
      [userId, location.lng, location.lat, location.speed, location.heading]
    );
  }

  /**
   * Send SMS alert to emergency contact
   */
  private async sendSMSAlert(phone: string, userName: string, location: UserLocation): Promise<void> {
    const mapsUrl = `https://maps.google.com/?q=${location.lat},${location.lng}`;
    const message = `🚨 EMERGENCY ALERT! ${userName} needs immediate help. Location: ${mapsUrl} Time: ${new Date().toLocaleString()}`;
    
    // Implement SMS sending via Twilio
    // await smsService.sendSMS(phone, message);
  }

  /**
   * Notify trusted contacts about user in danger zone
   */
  private async notifyTrustedContacts(userId: string, location: UserLocation): Promise<void> {
    const result = await query(
      'SELECT emergency_contacts FROM users WHERE id = $1',
      [userId]
    );
    
    const contacts = result.rows[0]?.emergency_contacts || [];
    
    for (const contact of contacts) {
      if (contact.pushToken) {
        await notificationService.sendPushNotification(contact.pushToken, {
          title: 'Safety Alert',
          body: 'Your contact has entered a high-risk area',
          data: { userId, location },
        });
      }
    }
  }

  /**
   * Verify JWT token (implement based on your auth system)
   */
  private verifyToken(token: string): string | null {
    // Implement JWT verification
    // Return userId if valid, null otherwise
    try {
      // const decoded = jwt.verify(token, process.env.JWT_SECRET!);
      // return decoded.userId;
      return token; // Placeholder
    } catch {
      return null;
    }
  }

  /**
   * Get all active sessions
   */
  public getActiveSessions(): Map<string, UserSession> {
    return this.userSessions;
  }

  /**
   * Get user's current location
   */
  public async getUserLocation(userId: string): Promise<UserLocation | null> {
    const cached = await redisClient.get(`user:location:${userId}`);
    if (cached) {
      return JSON.parse(cached);
    }
    
    const session = this.userSessions.get(userId);
    return session?.currentLocation || null;
  }

  /**
   * Stop monitoring and cleanup
   */
  public shutdown(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.userSessions.clear();
    logger.info('Location tracker shutdown complete');
  }
}

// Export initialization function
let locationTracker: LocationTracker | null = null;

export const initializeLocationTracker = (io: Server): LocationTracker => {
  if (!locationTracker) {
    locationTracker = new LocationTracker(io);
  }
  return locationTracker;
};

export const getLocationTracker = (): LocationTracker | null => {
  return locationTracker;
};

export default LocationTracker;
