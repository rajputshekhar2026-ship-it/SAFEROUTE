// src/models/User.ts

import { query } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import bcrypt from 'bcryptjs';

// Types
export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: 'user' | 'admin' | 'moderator' | 'responder';
  isVerified: boolean;
  isActive: boolean;
  lastLogin?: Date;
  lastLocation?: {
    lat: number;
    lng: number;
  };
  lastActive?: Date;
  emergencyContacts: EmergencyContact[];
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  relationship: string;
  isEmergencyContact: boolean;
  notifyViaSMS: boolean;
  notifyViaPush: boolean;
  notifyViaEmail: boolean;
  userId?: string; // If contact also uses the app
}

export interface UserPreferences {
  notificationsEnabled: boolean;
  darkMode: boolean;
  highContrast: boolean;
  voiceGuidance: boolean;
  autoSOS: boolean;
  shareLocationWithContacts: boolean;
  preferredRouteType: 'fastest' | 'safest' | 'lit';
  alertRadius: number; // in meters
  language: string;
  units: 'metric' | 'imperial';
}

export interface UserQueryOptions {
  search?: string;
  role?: string;
  isVerified?: boolean;
  isActive?: boolean;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'lastLogin' | 'name' | 'email';
  sortOrder?: 'asc' | 'desc';
}

export interface UserStatistics {
  total: number;
  activeToday: number;
  activeThisWeek: number;
  activeThisMonth: number;
  verifiedUsers: number;
  byRole: Record<string, number>;
  newUsersTrend: Array<{ date: string; count: number }>;
  averageSessionsPerUser: number;
}

class UserModel {
  private readonly TABLE_NAME = 'users';
  private readonly CACHE_TTL = 3600; // 1 hour

  /**
   * Create a new user
   */
  async create(data: Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'role' | 'isVerified' | 'isActive'>): Promise<User> {
    const hashedPassword = await bcrypt.hash(data.passwordHash, 12);
    
    const result = await query(
      `INSERT INTO ${this.TABLE_NAME} 
       (id, name, email, phone, password_hash, role, is_verified, is_active, emergency_contacts, preferences, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'user', false, true, $5, $6, NOW(), NOW())
       RETURNING id, name, email, phone, role, is_verified, is_active, emergency_contacts, preferences, created_at, updated_at`,
      [
        data.name,
        data.email.toLowerCase(),
        data.phone || null,
        hashedPassword,
        JSON.stringify(data.emergencyContacts || []),
        JSON.stringify(data.preferences || this.getDefaultPreferences()),
      ]
    );

    return this.mapRowToUser(result.rows[0]);
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    const cacheKey = `user:${id}`;
    const cached = await redisClient.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const result = await query(
      `SELECT id, name, email, phone, password_hash, role, is_verified, is_active, 
              last_login, last_active, emergency_contacts, preferences, created_at, updated_at, deleted_at,
              ST_X(last_location::geometry) as lng, ST_Y(last_location::geometry) as lat
       FROM ${this.TABLE_NAME}
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (result.rows.length === 0) return null;
    
    const user = this.mapRowToUser(result.rows[0]);
    await redisClient.setex(cacheKey, this.CACHE_TTL, JSON.stringify(user));
    
    return user;
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await query(
      `SELECT id, name, email, phone, password_hash, role, is_verified, is_active, 
              last_login, last_active, emergency_contacts, preferences, created_at, updated_at, deleted_at,
              ST_X(last_location::geometry) as lng, ST_Y(last_location::geometry) as lat
       FROM ${this.TABLE_NAME}
       WHERE email = $1 AND deleted_at IS NULL`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToUser(result.rows[0]);
  }

  /**
   * Find user by phone
   */
  async findByPhone(phone: string): Promise<User | null> {
    const result = await query(
      `SELECT id, name, email, phone, password_hash, role, is_verified, is_active, 
              last_login, last_active, emergency_contacts, preferences, created_at, updated_at, deleted_at,
              ST_X(last_location::geometry) as lng, ST_Y(last_location::geometry) as lat
       FROM ${this.TABLE_NAME}
       WHERE phone = $1 AND deleted_at IS NULL`,
      [phone]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToUser(result.rows[0]);
  }

  /**
   * Get all users with filters
   */
  async findAll(options: UserQueryOptions = {}): Promise<{ users: User[]; total: number }> {
    let queryText = `
      SELECT id, name, email, phone, role, is_verified, is_active, 
             last_login, last_active, emergency_contacts, preferences, created_at, updated_at,
             ST_X(last_location::geometry) as lng, ST_Y(last_location::geometry) as lat
      FROM ${this.TABLE_NAME}
      WHERE deleted_at IS NULL
    `;
    
    const params: any[] = [];
    let paramIndex = 1;

    if (options.search) {
      queryText += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`;
      params.push(`%${options.search}%`);
      paramIndex++;
    }

    if (options.role) {
      queryText += ` AND role = $${paramIndex++}`;
      params.push(options.role);
    }

    if (options.isVerified !== undefined) {
      queryText += ` AND is_verified = $${paramIndex++}`;
      params.push(options.isVerified);
    }

    if (options.isActive !== undefined) {
      queryText += ` AND is_active = $${paramIndex++}`;
      params.push(options.isActive);
    }

    if (options.startDate) {
      queryText += ` AND created_at >= $${paramIndex++}`;
      params.push(options.startDate);
    }

    if (options.endDate) {
      queryText += ` AND created_at <= $${paramIndex++}`;
      params.push(options.endDate);
    }

    // Get total count
    const countQuery = queryText.replace(
      /SELECT .* FROM/,
      'SELECT COUNT(*) as total FROM'
    );
    const countResult = await query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Apply sorting
    const sortColumn = options.sortBy === 'name' ? 'name' :
                      options.sortBy === 'email' ? 'email' :
                      options.sortBy === 'lastLogin' ? 'last_login' : 'created_at';
    queryText += ` ORDER BY ${sortColumn} ${options.sortOrder === 'asc' ? 'ASC' : 'DESC'}`;

    // Apply pagination
    if (options.limit) {
      queryText += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }
    
    if (options.offset) {
      queryText += ` OFFSET $${paramIndex++}`;
      params.push(options.offset);
    }

    const result = await query(queryText, params);
    
    return {
      users: result.rows.map(row => this.mapRowToUser(row)),
      total,
    };
  }

  /**
   * Update user
   */
  async update(id: string, data: Partial<User>): Promise<User | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }

    if (data.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      params.push(data.email.toLowerCase());
    }

    if (data.phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      params.push(data.phone || null);
    }

    if (data.passwordHash !== undefined) {
      const hashedPassword = await bcrypt.hash(data.passwordHash, 12);
      updates.push(`password_hash = $${paramIndex++}`);
      params.push(hashedPassword);
    }

    if (data.role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      params.push(data.role);
    }

    if (data.isVerified !== undefined) {
      updates.push(`is_verified = $${paramIndex++}`);
      params.push(data.isVerified);
    }

    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(data.isActive);
    }

    if (data.lastLocation !== undefined) {
      updates.push(`last_location = ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326)::geography`);
      params.push(data.lastLocation.lng, data.lastLocation.lat);
      paramIndex += 2;
    }

    if (data.lastActive !== undefined) {
      updates.push(`last_active = $${paramIndex++}`);
      params.push(data.lastActive);
    }

    if (data.emergencyContacts !== undefined) {
      updates.push(`emergency_contacts = $${paramIndex++}`);
      params.push(JSON.stringify(data.emergencyContacts));
    }

    if (data.preferences !== undefined) {
      updates.push(`preferences = preferences || $${paramIndex++}`);
      params.push(JSON.stringify(data.preferences));
    }

    if (updates.length === 0) return null;

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const result = await query(
      `UPDATE ${this.TABLE_NAME}
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING id, name, email, phone, role, is_verified, is_active, 
                 last_login, last_active, emergency_contacts, preferences, created_at, updated_at,
                 ST_X(last_location::geometry) as lng, ST_Y(last_location::geometry) as lat`,
      params
    );

    if (result.rows.length === 0) return null;
    
    // Invalidate cache
    await redisClient.del(`user:${id}`);
    
    return this.mapRowToUser(result.rows[0]);
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id: string): Promise<void> {
    await query(
      `UPDATE ${this.TABLE_NAME}
       SET last_login = NOW()
       WHERE id = $1`,
      [id]
    );
    
    await redisClient.del(`user:${id}`);
  }

  /**
   * Update last active timestamp and location
   */
  async updateLastActive(id: string, location?: { lat: number; lng: number }): Promise<void> {
    let queryText = `UPDATE ${this.TABLE_NAME} SET last_active = NOW()`;
    const params: any[] = [];
    
    if (location) {
      queryText += `, last_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography`;
      params.push(location.lng, location.lat);
      params.push(id);
    } else {
      params.push(id);
    }
    
    queryText += ` WHERE id = $${params.length}`;
    
    await query(queryText, params);
    await redisClient.del(`user:${id}`);
  }

  /**
   * Soft delete user
   */
  async softDelete(id: string): Promise<boolean> {
    const result = await query(
      `UPDATE ${this.TABLE_NAME}
       SET deleted_at = NOW(), is_active = false
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id]
    );
    
    if (result.rowCount && result.rowCount > 0) {
      await redisClient.del(`user:${id}`);
      return true;
    }
    
    return false;
  }

  /**
   * Permanently delete user
   */
  async hardDelete(id: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM ${this.TABLE_NAME}
       WHERE id = $1
       RETURNING id`,
      [id]
    );
    
    if (result.rowCount && result.rowCount > 0) {
      await redisClient.del(`user:${id}`);
      return true;
    }
    
    return false;
  }

  /**
   * Verify user email
   */
  async verifyEmail(id: string): Promise<boolean> {
    const result = await query(
      `UPDATE ${this.TABLE_NAME}
       SET is_verified = true
       WHERE id = $1
       RETURNING id`,
      [id]
    );
    
    if (result.rowCount && result.rowCount > 0) {
      await redisClient.del(`user:${id}`);
      return true;
    }
    
    return false;
  }

  /**
   * Add emergency contact
   */
  async addEmergencyContact(id: string, contact: EmergencyContact): Promise<User | null> {
    const user = await this.findById(id);
    if (!user) return null;
    
    const contacts = [...user.emergencyContacts, { ...contact, id: Date.now().toString() }];
    return this.update(id, { emergencyContacts: contacts });
  }

  /**
   * Remove emergency contact
   */
  async removeEmergencyContact(id: string, contactId: string): Promise<User | null> {
    const user = await this.findById(id);
    if (!user) return null;
    
    const contacts = user.emergencyContacts.filter(c => c.id !== contactId);
    return this.update(id, { emergencyContacts: contacts });
  }

  /**
   * Update emergency contact
   */
  async updateEmergencyContact(id: string, contactId: string, contact: Partial<EmergencyContact>): Promise<User | null> {
    const user = await this.findById(id);
    if (!user) return null;
    
    const contacts = user.emergencyContacts.map(c => 
      c.id === contactId ? { ...c, ...contact } : c
    );
    return this.update(id, { emergencyContacts: contacts });
  }

  /**
   * Update user preferences
   */
  async updatePreferences(id: string, preferences: Partial<UserPreferences>): Promise<User | null> {
    const user = await this.findById(id);
    if (!user) return null;
    
    const updatedPreferences = { ...user.preferences, ...preferences };
    return this.update(id, { preferences: updatedPreferences });
  }

  /**
   * Get user statistics
   */
  async getStatistics(days: number = 30): Promise<UserStatistics> {
    const cacheKey = `users:stats:${days}`;
    const cached = await redisClient.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Overall stats
    const statsResult = await query(
      `SELECT 
         COUNT(*) as total,
         COUNT(CASE WHEN is_verified THEN 1 END) as verified,
         COUNT(CASE WHEN last_active > NOW() - INTERVAL '1 day' THEN 1 END) as active_today,
         COUNT(CASE WHEN last_active > NOW() - INTERVAL '7 days' THEN 1 END) as active_week,
         COUNT(CASE WHEN last_active > NOW() - INTERVAL '30 days' THEN 1 END) as active_month,
         role,
         COUNT(*) as role_count
       FROM ${this.TABLE_NAME}
       WHERE deleted_at IS NULL
       GROUP BY role`,
      []
    );

    // Daily new users trend
    const trendResult = await query(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM ${this.TABLE_NAME}
       WHERE created_at > NOW() - INTERVAL '${days} days'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      []
    );

    // Average sessions per user (from sessions table)
    const sessionsResult = await query(
      `SELECT COUNT(*) / COUNT(DISTINCT user_id) as avg_sessions
       FROM sessions
       WHERE created_at > NOW() - INTERVAL '30 days'`,
      []
    );

    const byRole: Record<string, number> = {};
    let total = 0;
    let verifiedUsers = 0;

    for (const row of statsResult.rows) {
      byRole[row.role] = parseInt(row.role_count);
      total += parseInt(row.role_count);
      verifiedUsers += row.verified ? parseInt(row.role_count) : 0;
    }

    const stats: UserStatistics = {
      total,
      activeToday: parseInt(statsResult.rows[0]?.active_today || 0),
      activeThisWeek: parseInt(statsResult.rows[0]?.active_week || 0),
      activeThisMonth: parseInt(statsResult.rows[0]?.active_month || 0),
      verifiedUsers,
      byRole,
      newUsersTrend: trendResult.rows.map(row => ({
        date: row.date.toISOString().split('T')[0],
        count: parseInt(row.count),
      })),
      averageSessionsPerUser: parseFloat(sessionsResult.rows[0]?.avg_sessions || 0),
    };

    await redisClient.setex(cacheKey, this.CACHE_TTL, JSON.stringify(stats));

    return stats;
  }

  /**
   * Get online users count
   */
  async getOnlineUsersCount(): Promise<number> {
    const keys = await redisClient.keys('user:online:*');
    return keys.length;
  }

  /**
   * Get users by role
   */
  async findByRole(role: string, limit?: number): Promise<User[]> {
    const result = await query(
      `SELECT id, name, email, phone, role, is_verified, is_active, 
              last_login, last_active, created_at
       FROM ${this.TABLE_NAME}
       WHERE role = $1 AND deleted_at IS NULL
       ORDER BY name ASC
       LIMIT $2`,
      [role, limit || 50]
    );
    
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      isVerified: row.is_verified,
      isActive: row.is_active,
      lastLogin: row.last_login,
      lastActive: row.last_active,
      createdAt: row.created_at,
    } as User));
  }

  /**
   * Get default user preferences
   */
  private getDefaultPreferences(): UserPreferences {
    return {
      notificationsEnabled: true,
      darkMode: true,
      highContrast: false,
      voiceGuidance: true,
      autoSOS: true,
      shareLocationWithContacts: true,
      preferredRouteType: 'safest',
      alertRadius: 500,
      language: 'en',
      units: 'metric',
    };
  }

  /**
   * Map database row to User object
   */
  private mapRowToUser(row: any): User {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      passwordHash: row.password_hash,
      role: row.role,
      isVerified: row.is_verified,
      isActive: row.is_active,
      lastLogin: row.last_login,
      lastLocation: row.lat && row.lng ? { lat: parseFloat(row.lat), lng: parseFloat(row.lng) } : undefined,
      lastActive: row.last_active,
      emergencyContacts: row.emergency_contacts || [],
      preferences: row.preferences || this.getDefaultPreferences(),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }
}

// Export singleton instance
export const UserModelInstance = new UserModel();
export default UserModelInstance;
