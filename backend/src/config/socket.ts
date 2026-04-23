// src/config/socket.ts

import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verify } from 'jsonwebtoken';
import { redisClient, subscribe, publish } from './redis';
import { query } from './database';
import { logger } from '../utils/logger';

// Types
interface SocketUser {
  userId: string;
  socketId: string;
  location?: {
    lat: number;
    lng: number;
    timestamp: number;
  };
  deviceInfo?: {
    platform: string;
    appVersion: string;
  };
  lastHeartbeat: number;
  isActive: boolean;
}

interface LocationUpdate {
  userId: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  timestamp: number;
  isBackground?: boolean;
}

interface SafetyAlert {
  userId: string;
  type: 'danger_zone' | 'suspicious_activity' | 'weather_warning' | 'crime_alert' | 'route_deviation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  location?: {
    lat: number;
    lng: number;
  };
  timestamp: number;
}

class SocketManager {
  private io: SocketServer;
  private users: Map<string, SocketUser> = new Map();
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly HEARTBEAT_TIMEOUT = 60000; // 60 seconds
  private heartbeatInterval: NodeJS.Timeout;

  constructor(httpServer: HttpServer) {
    this.io = new SocketServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || '*',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      path: '/socket.io',
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling'],
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    this.startHeartbeatCheck();
    this.setupRedisSubscriptions();
  }

  /**
   * Setup socket middleware for authentication
   */
  private setupMiddleware(): void {
    this.io.use(async (socket: Socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
          logger.warn(`Socket ${socket.id}: No authentication token provided`);
          return next(new Error('Authentication required'));
        }

        // Verify JWT token
        const decoded = verify(token, process.env.JWT_SECRET!) as { userId: string };
        
        if (!decoded || !decoded.userId) {
          return next(new Error('Invalid token'));
        }

        // Check if user exists and session is active
        const sessionResult = await query(
          'SELECT id FROM sessions WHERE token = $1 AND expires_at > NOW() AND revoked_at IS NULL',
          [token]
        );

        if (sessionResult.rows.length === 0) {
          return next(new Error('Invalid or expired session'));
        }

        // Store user info in socket
        (socket as any).userId = decoded.userId;
        (socket as any).token = token;
        
        next();
      } catch (error) {
        logger.error(`Socket ${socket.id}: Authentication error`, error);
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup socket event handlers
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      const userId = (socket as any).userId;
      
      logger.info(`Socket ${socket.id} connected for user ${userId}`);
      
      // Register user
      this.registerUser(socket, userId);
      
      // Location update handler
      socket.on('location-update', (data: LocationUpdate) => {
        this.handleLocationUpdate(socket, userId, data);
      });
      
      // SOS trigger handler
      socket.on('sos-trigger', async (data: any) => {
        await this.handleSOSTrigger(socket, userId, data);
      });
      
      // Check-in handler
      socket.on('checkin', async (data: any) => {
        await this.handleCheckIn(socket, userId, data);
      });
      
      // Health mode toggle handler
      socket.on('health-mode-toggle', (data: { enabled: boolean }) => {
        this.handleHealthModeToggle(socket, userId, data);
      });
      
      // Request route handler
      socket.on('route-request', (data: any) => {
        this.handleRouteRequest(socket, userId, data);
      });
      
      // Heartbeat handler
      socket.on('heartbeat', () => {
        this.handleHeartbeat(socket, userId);
      });
      
      // Disconnect handler
      socket.on('disconnect', () => {
        this.handleDisconnect(socket, userId);
      });
      
      // Error handler
      socket.on('error', (error: Error) => {
        logger.error(`Socket ${socket.id} error for user ${userId}:`, error);
      });
    });
  }

  /**
   * Register user socket connection
   */
  private registerUser(socket: Socket, userId: string): void {
    // Update user in memory
    const existingUser = this.users.get(userId);
    if (existingUser) {
      existingUser.socketId = socket.id;
      existingUser.lastHeartbeat = Date.now();
      existingUser.isActive = true;
    } else {
      this.users.set(userId, {
        userId,
        socketId: socket.id,
        lastHeartbeat: Date.now(),
        isActive: true,
      });
    }
    
    // Track socket IDs for user
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socket.id);
    
    // Update Redis with user presence
    redisClient.setex(`user:online:${userId}`, 300, 'true');
    
    // Broadcast user online status
    this.broadcastUserStatus(userId, true);
    
    // Send current safety status to user
    this.sendSafetyStatus(userId);
  }

  /**
   * Handle location update from client
   */
  private async handleLocationUpdate(
    socket: Socket,
    userId: string,
    data: LocationUpdate
  ): Promise<void> {
    // Validate location data
    if (!data.lat || !data.lng) {
      logger.warn(`Invalid location data from user ${userId}`);
      return;
    }
    
    // Update user location in memory
    const user = this.users.get(userId);
    if (user) {
      user.location = {
        lat: data.lat,
        lng: data.lng,
        timestamp: data.timestamp,
      };
    }
    
    // Store in Redis for real-time access
    await redisClient.setex(
      `user:location:${userId}`,
      60,
      JSON.stringify({
        lat: data.lat,
        lng: data.lng,
        timestamp: data.timestamp,
        speed: data.speed,
        heading: data.heading,
      })
    );
    
    // Store in database (sampled - not every update)
    const shouldStore = Math.random() < 0.1; // 10% sampling rate
    if (shouldStore) {
      await query(
        `INSERT INTO location_history (user_id, location, speed, heading, accuracy, is_background, created_at)
         VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, $5, $6, $7, NOW())`,
        [userId, data.lng, data.lat, data.speed, data.heading, data.accuracy, data.isBackground || false]
      );
    }
    
    // Check for danger zones
    await this.checkDangerZones(userId, { lat: data.lat, lng: data.lng });
    
    // Broadcast location to trusted contacts (if enabled)
    await this.broadcastLocationToContacts(userId, { lat: data.lat, lng: data.lng });
    
    // Emit acknowledgment
    socket.emit('location-ack', { timestamp: Date.now() });
  }

  /**
   * Handle SOS trigger
   */
  private async handleSOSTrigger(
    socket: Socket,
    userId: string,
    data: any
  ): Promise<void> {
    logger.warn(`SOS triggered for user ${userId}`);
    
    // Get user location
    const user = this.users.get(userId);
    const location = user?.location || data.location;
    
    if (!location) {
      socket.emit('sos-error', { message: 'Unable to get current location' });
      return;
    }
    
    // Store SOS event in database
    const sosId = await query(
      `INSERT INTO sos_events (user_id, location, message, status, created_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, 'active', NOW())
       RETURNING id`,
      [userId, location.lng, location.lat, data.message]
    );
    
    // Notify all connected admin/responder clients
    this.io.emit('sos-broadcast', {
      sosId: sosId.rows[0].id,
      userId,
      location,
      message: data.message,
      timestamp: Date.now(),
    });
    
    // Send acknowledgment to user
    socket.emit('sos-acknowledged', {
      sosId: sosId.rows[0].id,
      message: 'Emergency alert sent. Help is on the way.',
      timestamp: Date.now(),
    });
  }

  /**
   * Handle check-in
   */
  private async handleCheckIn(
    socket: Socket,
    userId: string,
    data: any
  ): Promise<void> {
    const user = this.users.get(userId);
    const location = user?.location || data.location;
    
    if (!location) {
      socket.emit('checkin-error', { message: 'Unable to get current location' });
      return;
    }
    
    await query(
      `INSERT INTO checkins (user_id, location, status, note, created_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, $5, NOW())`,
      [userId, location.lng, location.lat, data.status || 'safe', data.note]
    );
    
    socket.emit('checkin-confirmed', {
      message: 'Check-in recorded successfully',
      timestamp: Date.now(),
    });
    
    // Notify trusted contacts
    await this.notifyContactsCheckIn(userId, location, data.status);
  }

  /**
   * Handle health mode toggle
   */
  private handleHealthModeToggle(
    socket: Socket,
    userId: string,
    data: { enabled: boolean }
  ): void {
    const user = this.users.get(userId);
    if (user) {
      user.isActive = !data.enabled; // Invert logic - health mode hides activity
    }
    
    logger.info(`Health mode ${data.enabled ? 'enabled' : 'disabled'} for user ${userId}`);
    socket.emit('health-mode-status', { enabled: data.enabled });
  }

  /**
   * Handle route request
   */
  private handleRouteRequest(
    socket: Socket,
    userId: string,
    data: any
  ): void {
    // Forward to routing service
    socket.emit('route-response', {
      requestId: data.requestId,
      status: 'processing',
      timestamp: Date.now(),
    });
  }

  /**
   * Handle heartbeat
   */
  private handleHeartbeat(socket: Socket, userId: string): void {
    const user = this.users.get(userId);
    if (user) {
      user.lastHeartbeat = Date.now();
      user.isActive = true;
    }
    
    // Update Redis presence
    redisClient.setex(`user:online:${userId}`, 300, 'true');
    
    socket.emit('heartbeat-ack', { timestamp: Date.now() });
  }

  /**
   * Handle disconnect
   */
  private handleDisconnect(socket: Socket, userId: string): void {
    // Remove socket from user's socket set
    const userSockets = this.userSockets.get(userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      
      // If no more sockets, mark user as offline
      if (userSockets.size === 0) {
        this.userSockets.delete(userId);
        this.users.delete(userId);
        redisClient.del(`user:online:${userId}`);
        this.broadcastUserStatus(userId, false);
      }
    }
    
    logger.info(`Socket ${socket.id} disconnected for user ${userId}`);
  }

  /**
   * Start heartbeat check interval
   */
  private startHeartbeatCheck(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      
      for (const [userId, user] of this.users) {
        if (now - user.lastHeartbeat > this.HEARTBEAT_TIMEOUT) {
          // User heartbeat timeout - mark as inactive
          user.isActive = false;
          logger.warn(`User ${userId} heartbeat timeout`);
          
          // Notify user if still connected
          const socket = this.io.sockets.sockets.get(user.socketId);
          if (socket) {
            socket.emit('connection-warning', {
              message: 'Location updates interrupted. Please check your connection.',
              timestamp: now,
            });
          }
        }
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Setup Redis subscriptions for cross-instance communication
   */
  private setupRedisSubscriptions(): void {
    // Subscribe to broadcast channel
    subscribe('socket:broadcast', (message) => {
      const { event, data, targetUserId } = message;
      
      if (targetUserId) {
        // Send to specific user
        this.sendToUser(targetUserId, event, data);
      } else {
        // Broadcast to all
        this.io.emit(event, data);
      }
    });
    
    // Subscribe to location sync channel
    subscribe('socket:location-sync', (message) => {
      const { userId, location } = message;
      const user = this.users.get(userId);
      
      if (user && user.socketId) {
        const socket = this.io.sockets.sockets.get(user.socketId);
        if (socket) {
          socket.emit('location-sync', location);
        }
      }
    });
  }

  /**
   * Send message to specific user
   */
  public sendToUser(userId: string, event: string, data: any): boolean {
    const userSockets = this.userSockets.get(userId);
    if (!userSockets || userSockets.size === 0) {
      return false;
    }
    
    for (const socketId of userSockets) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(event, data);
      }
    }
    
    return true;
  }

  /**
   * Broadcast to all connected clients
   */
  public broadcast(event: string, data: any): void {
    this.io.emit(event, data);
  }

  /**
   * Broadcast user online status
   */
  private broadcastUserStatus(userId: string, isOnline: boolean): void {
    this.broadcast('user-status', {
      userId,
      isOnline,
      timestamp: Date.now(),
    });
  }

  /**
   * Send safety status to user
   */
  private async sendSafetyStatus(userId: string): Promise<void> {
    // Get recent safety alerts for user
    const alerts = await this.getUserSafetyAlerts(userId);
    
    this.sendToUser(userId, 'safety-status', {
      alerts,
      timestamp: Date.now(),
    });
  }

  /**
   * Get user safety alerts
   */
  private async getUserSafetyAlerts(userId: string): Promise<any[]> {
    // In production, fetch from database
    return [];
  }

  /**
   * Check for danger zones near user
   */
  private async checkDangerZones(
    userId: string,
    location: { lat: number; lng: number }
  ): Promise<void> {
    try {
      const result = await query(
        `SELECT type, severity, description
         FROM reports
         WHERE ST_DWithin(
           location::geometry,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           200
         )
         AND status = 'verified'
         AND created_at > NOW() - INTERVAL '1 hour'
         LIMIT 5`,
        [location.lng, location.lat]
      );
      
      if (result.rows.length > 0) {
        const alert: SafetyAlert = {
          userId,
          type: 'danger_zone',
          severity: 'high',
          message: `${result.rows[0].type} reported nearby. Stay alert.`,
          location,
          timestamp: Date.now(),
        };
        
        this.sendToUser(userId, 'danger-zone-alert', alert);
      }
    } catch (error) {
      logger.error('Danger zone check error:', error);
    }
  }

  /**
   * Broadcast location to trusted contacts
   */
  private async broadcastLocationToContacts(
    userId: string,
    location: { lat: number; lng: number }
  ): Promise<void> {
    try {
      const result = await query(
        'SELECT emergency_contacts FROM users WHERE id = $1',
        [userId]
      );
      
      const contacts = result.rows[0]?.emergency_contacts || [];
      
      for (const contact of contacts) {
        if (contact.userId && this.users.has(contact.userId)) {
          this.sendToUser(contact.userId, 'contact-location', {
            userId,
            contactName: contact.name,
            location,
            timestamp: Date.now(),
          });
        }
      }
    } catch (error) {
      logger.error('Broadcast location to contacts error:', error);
    }
  }

  /**
   * Notify contacts of check-in
   */
  private async notifyContactsCheckIn(
    userId: string,
    location: { lat: number; lng: number },
    status: string
  ): Promise<void> {
    try {
      const result = await query(
        'SELECT name, emergency_contacts FROM users WHERE id = $1',
        [userId]
      );
      
      const userName = result.rows[0]?.name;
      const contacts = result.rows[0]?.emergency_contacts || [];
      
      for (const contact of contacts) {
        if (contact.userId && this.users.has(contact.userId)) {
          this.sendToUser(contact.userId, 'contact-checkin', {
            userId,
            userName,
            location,
            status,
            timestamp: Date.now(),
          });
        }
      }
    } catch (error) {
      logger.error('Notify contacts check-in error:', error);
    }
  }

  /**
   * Get all online users
   */
  public getOnlineUsers(): string[] {
    return Array.from(this.users.keys());
  }

  /**
   * Check if user is online
   */
  public isUserOnline(userId: string): boolean {
    return this.users.has(userId) && this.users.get(userId)?.isActive === true;
  }

  /**
   * Get user location
   */
  public getUserLocation(userId: string): { lat: number; lng: number; timestamp: number } | null {
    return this.users.get(userId)?.location || null;
  }

  /**
   * Shutdown socket server
   */
  public shutdown(): void {
    clearInterval(this.heartbeatInterval);
    this.io.close(() => {
      logger.info('Socket server closed');
    });
  }

  /**
   * Get socket server instance
   */
  public getIO(): SocketServer {
    return this.io;
  }
}

let socketManager: SocketManager | null = null;

/**
 * Initialize socket manager with HTTP server
 */
export const initializeSocket = (httpServer: HttpServer): SocketManager => {
  if (!socketManager) {
    socketManager = new SocketManager(httpServer);
    logger.info('Socket manager initialized');
  }
  return socketManager;
};

/**
 * Get socket manager instance
 */
export const getSocketManager = (): SocketManager | null => {
  return socketManager;
};

/**
 * Send message to specific user
 */
export const sendToUser = (userId: string, event: string, data: any): boolean => {
  if (!socketManager) return false;
  return socketManager.sendToUser(userId, event, data);
};

/**
 * Broadcast to all users
 */
export const broadcast = (event: string, data: any): void => {
  if (!socketManager) return;
  socketManager.broadcast(event, data);
};

/**
 * Cross-instance broadcast using Redis
 */
export const crossInstanceBroadcast = async (
  event: string,
  data: any,
  targetUserId?: string
): Promise<void> => {
  await publish('socket:broadcast', { event, data, targetUserId });
};

export default { initializeSocket, getSocketManager, sendToUser, broadcast, crossInstanceBroadcast };
