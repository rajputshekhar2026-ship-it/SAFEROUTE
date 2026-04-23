import { query } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

// Types
export interface Report {
  id: number;
  userId?: string;
  location: {
    lat: number;
    lng: number;
    address?: string;
  };
  type: 'harassment' | 'broken_light' | 'blocked_path' | 'suspicious_activity' | 'assault' | 'unsafe_condition' | 'theft' | 'medical';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description?: string;
  mediaUrls?: string[];
  isAnonymous: boolean;
  status: 'pending' | 'verified' | 'resolved' | 'dismissed';
  verifiedBy?: string;
  verifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  userName?: string;
}

export interface ReportQueryOptions {
  userId?: string;
  type?: string;
  status?: string;
  severity?: string;
  startDate?: Date;
  endDate?: Date;
  lat?: number;
  lng?: number;
  radius?: number;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'severity' | 'type';
  sortOrder?: 'asc' | 'desc';
}

class ReportModel {
  private readonly TABLE_NAME = 'reports';
  private readonly CACHE_TTL = 300;

  async create(data: Omit<Report, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'verifiedBy' | 'verifiedAt'>): Promise<Report> {
    const result = await query(
      `INSERT INTO ${this.TABLE_NAME} 
       (user_id, location, type, severity, description, media_urls, is_anonymous, status, created_at, updated_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, $5, $6, $7, $8, 'pending', NOW(), NOW())
       RETURNING id, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat`,
      [
        data.userId || null,
        data.location.lng,
        data.location.lat,
        data.type,
        data.severity,
        data.description,
        JSON.stringify(data.mediaUrls || []),
        data.isAnonymous,
      ]
    );

    const row = result.rows[0];
    await this.invalidateCaches(data.location.lat, data.location.lng);
    return this.mapRowToReport(row);
  }

  async findById(id: number): Promise<Report | null> {
    const result = await query(
      `SELECT r.*, u.name as user_name,
              ST_X(r.location::geometry) as lng, ST_Y(r.location::geometry) as lat
       FROM ${this.TABLE_NAME} r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return this.mapRowToReport(result.rows[0]);
  }

  async findAll(options: ReportQueryOptions = {}): Promise<{ reports: Report[]; total: number }> {
    let queryText = `
      SELECT r.*, u.name as user_name,
             ST_X(r.location::geometry) as lng, ST_Y(r.location::geometry) as lat
      FROM ${this.TABLE_NAME} r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramIndex = 1;

    if (options.userId) {
      queryText += ` AND r.user_id = $${paramIndex++}`;
      params.push(options.userId);
    }
    if (options.type) {
      queryText += ` AND r.type = $${paramIndex++}`;
      params.push(options.type);
    }
    if (options.status) {
      queryText += ` AND r.status = $${paramIndex++}`;
      params.push(options.status);
    }
    if (options.severity) {
      queryText += ` AND r.severity = $${paramIndex++}`;
      params.push(options.severity);
    }
    if (options.startDate) {
      queryText += ` AND r.created_at >= $${paramIndex++}`;
      params.push(options.startDate);
    }
    if (options.endDate) {
      queryText += ` AND r.created_at <= $${paramIndex++}`;
      params.push(options.endDate);
    }
    if (options.lat && options.lng && options.radius) {
      queryText += ` AND ST_DWithin(r.location::geometry, ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326)::geography, $${paramIndex + 2})`;
      params.push(options.lng, options.lat, options.radius);
      paramIndex += 3;
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM ${this.TABLE_NAME} r WHERE 1=1`, []);
    const total = parseInt(countResult.rows[0].total);

    const sortColumn = options.sortBy === 'type' ? 'type' : options.sortBy === 'severity' ? 'severity' : 'created_at';
    queryText += ` ORDER BY ${sortColumn} ${options.sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
    
    if (options.limit) {
      queryText += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }
    if (options.offset) {
      queryText += ` OFFSET $${paramIndex++}`;
      params.push(options.offset);
    }

    const result = await query(queryText, params);
    return { reports: result.rows.map(row => this.mapRowToReport(row)), total };
  }

  async update(id: number, data: Partial<Report>): Promise<Report | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      params.push(data.type);
    }
    if (data.severity !== undefined) {
      updates.push(`severity = $${paramIndex++}`);
      params.push(data.severity);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(data.description);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(data.status);
    }
    if (updates.length === 0) return null;

    updates.push(`updated_at = NOW()`);
    params.push(id);

    await query(`UPDATE ${this.TABLE_NAME} SET ${updates.join(', ')} WHERE id = $${paramIndex}`, params);
    return this.findById(id);
  }

  async delete(id: number): Promise<boolean> {
    const result = await query(`DELETE FROM ${this.TABLE_NAME} WHERE id = $1 RETURNING id`, [id]);
    return result.rowCount ? result.rowCount > 0 : false;
  }

  private async invalidateCaches(lat: number, lng: number): Promise<void> {
    const keys = await redisClient.keys('reports:*');
    if (keys.length > 0) await redisClient.del(keys);
  }

  private mapRowToReport(row: any): Report {
    return {
      id: row.id,
      userId: row.user_id,
      location: { lat: parseFloat(row.lat), lng: parseFloat(row.lng) },
      type: row.type,
      severity: row.severity,
      description: row.description,
      mediaUrls: row.media_urls,
      isAnonymous: row.is_anonymous,
      status: row.status,
      verifiedBy: row.verified_by,
      verifiedAt: row.verified_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      userName: row.user_name,
    };
  }
}

export const ReportModelInstance = new ReportModel();
export default ReportModelInstance;
