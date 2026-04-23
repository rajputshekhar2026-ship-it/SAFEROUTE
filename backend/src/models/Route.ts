// src/models/Report.ts

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
  userName?: string; // Joined field
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

export interface ReportStatistics {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  dailyTrend: Array<{ date: string; count: number }>;
  averageResolutionTime: number;
  verificationRate: number;
}

class ReportModel {
  private readonly TABLE_NAME = 'reports';
  private readonly CACHE_TTL = 300; // 5 minutes

  /**
   * Create a new report
   */
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
    
    // Invalidate relevant caches
    await this.invalidateCaches(data.location.lat, data.location.lng);
    
    return this.mapRowToReport(row);
  }

  /**
   * Get report by ID
   */
  async findById(id: number): Promise<Report | null> {
    const result = await query(
      `SELECT r.*, 
              u.name as user_name,
              ST_X(r.location::geometry) as lng,
              ST_Y(r.location::geometry) as lat
       FROM ${this.TABLE_NAME} r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToReport(result.rows[0]);
  }

  /**
   * Get all reports with filters
   */
  async findAll(options: ReportQueryOptions = {}): Promise<{ reports: Report[]; total: number }> {
    let queryText = `
      SELECT r.*, 
             u.name as user_name,
             ST_X(r.location::geometry) as lng,
             ST_Y(r.location::geometry) as lat
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
      queryText += ` AND ST_DWithin(
        r.location::geometry,
        ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326)::geography,
        $${paramIndex + 2}
      )`;
      params.push(options.lng, options.lat, options.radius);
      paramIndex += 3;
    }

    // Get total count
    const countQuery = queryText.replace(
      /SELECT r\..*, u\.name as user_name, ST_X\(r\.location::geometry\) as lng, ST_Y\(r\.location::geometry\) as lat/,
      'SELECT COUNT(*) as total'
    );
    const countResult = await query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Apply sorting
    const sortColumn = options.sortBy === 'type' ? 'type' : 
                      options.sortBy === 'severity' ? 'severity' : 'created_at';
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
      reports: result.rows.map(row => this.mapRowToReport(row)),
      total,
    };
  }

  /**
   * Get reports near a location
   */
  async findNearby(
    lat: number,
    lng: number,
    radiusMeters: number = 1000,
    options: Omit<ReportQueryOptions, 'lat' | 'lng' | 'radius'> = {}
  ): Promise<Report[]> {
    const cacheKey = `reports:nearby:${lat.toFixed(4)}:${lng.toFixed(4)}:${radiusMeters}:${JSON.stringify(options)}`;
    const cached = await redisClient.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    let queryText = `
      SELECT r.*, 
             u.name as user_name,
             ST_X(r.location::geometry) as lng,
             ST_Y(r.location::geometry) as lat,
             ST_Distance(
               r.location::geometry,
               ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
             ) as distance
      FROM ${this.TABLE_NAME} r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE ST_DWithin(
        r.location::geometry,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
      AND r.status = 'verified'
    `;

    const params: any[] = [lng, lat, radiusMeters];
    let paramIndex = 4;

    if (options.type) {
      queryText += ` AND r.type = $${paramIndex++}`;
      params.push(options.type);
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

    queryText += ` ORDER BY distance ASC`;

    if (options.limit) {
      queryText += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }

    const result = await query(queryText, params);
    const reports = result.rows.map(row => this.mapRowToReport(row));

    await redisClient.setex(cacheKey, this.CACHE_TTL, JSON.stringify(reports));

    return reports;
  }

  /**
   * Update report
   */
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

    if (data.mediaUrls !== undefined) {
      updates.push(`media_urls = $${paramIndex++}`);
      params.push(JSON.stringify(data.mediaUrls));
    }

    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(data.status);
    }

    if (data.verifiedBy !== undefined) {
      updates.push(`verified_by = $${paramIndex++}`);
      params.push(data.verifiedBy);
    }

    if (data.verifiedAt !== undefined) {
      updates.push(`verified_at = $${paramIndex++}`);
      params.push(data.verifiedAt);
    }

    if (updates.length === 0) return null;

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const result = await query(
      `UPDATE ${this.TABLE_NAME}
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat`,
      params
    );

    if (result.rows.length === 0) return null;
    
    // Invalidate caches
    const report = await this.findById(id);
    if (report) {
      await this.invalidateCaches(report.location.lat, report.location.lng);
    }
    
    return this.findById(id);
  }

  /**
   * Verify a report (make it official)
   */
  async verify(id: number, verifiedBy: string): Promise<Report | null> {
    const result = await query(
      `UPDATE ${this.TABLE_NAME}
       SET status = 'verified', verified_by = $1, verified_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND status = 'pending'
       RETURNING id`,
      [verifiedBy, id]
    );

    if (result.rows.length === 0) return null;

    // Also add to crime history if severity is high
    const report = await this.findById(id);
    if (report && (report.severity === 'high' || report.severity === 'critical')) {
      await query(
        `INSERT INTO crime_history (location, crime_type, severity, source, is_verified, timestamp)
         VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3, $4, 'user_report', true, NOW())`,
        [
          report.location.lng,
          report.location.lat,
          report.type,
          report.severity === 'critical' ? 5 : report.severity === 'high' ? 4 : 3,
        ]
      );
    }

    await this.invalidateCaches(report!.location.lat, report!.location.lng);

    return this.findById(id);
  }

  /**
   * Resolve a report
   */
  async resolve(id: number): Promise<Report | null> {
    const result = await query(
      `UPDATE ${this.TABLE_NAME}
       SET status = 'resolved', updated_at = NOW()
       WHERE id = $1 AND status IN ('verified', 'pending')
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) return null;

    const report = await this.findById(id);
    if (report) {
      await this.invalidateCaches(report.location.lat, report.location.lng);
    }

    return report;
  }

  /**
   * Dismiss a report (reject as false)
   */
  async dismiss(id: number, reason?: string): Promise<Report | null> {
    const result = await query(
      `UPDATE ${this.TABLE_NAME}
       SET status = 'dismissed', description = COALESCE(description || $1, $1), updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [reason || 'Dismissed by moderator', id]
    );

    if (result.rows.length === 0) return null;

    const report = await this.findById(id);
    if (report) {
      await this.invalidateCaches(report.location.lat, report.location.lng);
    }

    return report;
  }

  /**
   * Delete report (hard delete)
   */
  async delete(id: number): Promise<boolean> {
    const result = await query(
      `DELETE FROM ${this.TABLE_NAME} WHERE id = $1 RETURNING id`,
      [id]
    );
    
    if (result.rowCount && result.rowCount > 0) {
      await this.invalidateCaches(0, 0); // Invalidate all caches
      return true;
    }
    
    return false;
  }

  /**
   * Get report statistics
   */
  async getStatistics(days: number = 30): Promise<ReportStatistics> {
    const cacheKey = `reports:stats:${days}`;
    const cached = await redisClient.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Get overall stats
    const statsResult = await query(
      `SELECT 
         COUNT(*) as total,
         COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
         COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified,
         COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
         COUNT(CASE WHEN status = 'dismissed' THEN 1 END) as dismissed,
         COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical,
         COUNT(CASE WHEN severity = 'high' THEN 1 END) as high,
         COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium,
         COUNT(CASE WHEN severity = 'low' THEN 1 END) as low,
         AVG(EXTRACT(EPOCH FROM (verified_at - created_at))) as avg_verification_time
       FROM ${this.TABLE_NAME}
       WHERE created_at > NOW() - INTERVAL '${days} days'`,
      []
    );

    // Get breakdown by type
    const typeResult = await query(
      `SELECT type, COUNT(*) as count
       FROM ${this.TABLE_NAME}
       WHERE created_at > NOW() - INTERVAL '${days} days'
       GROUP BY type`,
      []
    );

    // Get daily trend
    const trendResult = await query(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM ${this.TABLE_NAME}
       WHERE created_at > NOW() - INTERVAL '${days} days'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      []
    );

    const byType: Record<string, number> = {};
    for (const row of typeResult.rows) {
      byType[row.type] = parseInt(row.count);
    }

    const byStatus: Record<string, number> = {
      pending: parseInt(statsResult.rows[0].pending || 0),
      verified: parseInt(statsResult.rows[0].verified || 0),
      resolved: parseInt(statsResult.rows[0].resolved || 0),
      dismissed: parseInt(statsResult.rows[0].dismissed || 0),
    };

    const bySeverity: Record<string, number> = {
      critical: parseInt(statsResult.rows[0].critical || 0),
      high: parseInt(statsResult.rows[0].high || 0),
      medium: parseInt(statsResult.rows[0].medium || 0),
      low: parseInt(statsResult.rows[0].low || 0),
    };

    const totalVerified = parseInt(statsResult.rows[0].verified || 0);
    const totalResolved = parseInt(statsResult.rows[0].resolved || 0);
    const verificationRate = totalVerified + totalResolved > 0 
      ? (totalVerified + totalResolved) / parseInt(statsResult.rows[0].total) 
      : 0;

    const stats: ReportStatistics = {
      total: parseInt(statsResult.rows[0].total),
      byType,
      byStatus,
      bySeverity,
      dailyTrend: trendResult.rows.map(row => ({
        date: row.date.toISOString().split('T')[0],
        count: parseInt(row.count),
      })),
      averageResolutionTime: statsResult.rows[0].avg_verification_time || 0,
      verificationRate,
    };

    await redisClient.setex(cacheKey, this.CACHE_TTL, JSON.stringify(stats));

    return stats;
  }

  /**
   * Get heatmap data
   */
  async getHeatmapData(
    bounds: { north: number; south: number; east: number; west: number },
    zoom: number,
    severity?: string
  ): Promise<Array<{ lat: number; lng: number; intensity: number; severity: number; types: string[] }>> {
    const cacheKey = `reports:heatmap:${bounds.north}:${bounds.south}:${bounds.east}:${bounds.west}:${zoom}:${severity}`;
    const cached = await redisClient.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    let severityFilter = '';
    const params: any[] = [bounds.west, bounds.south, bounds.east, bounds.north];
    let paramIndex = 5;

    if (severity) {
      severityFilter = ` AND severity = $${paramIndex++}`;
      params.push(severity);
    }

    const result = await query(
      `SELECT 
         ST_X(location::geometry) as lng,
         ST_Y(location::geometry) as lat,
         COUNT(*) as intensity,
         AVG(CASE 
           WHEN severity = 'critical' THEN 5
           WHEN severity = 'high' THEN 4
           WHEN severity = 'medium' THEN 3
           WHEN severity = 'low' THEN 2
           ELSE 1
         END) as avg_severity,
         json_agg(DISTINCT type) as types
       FROM ${this.TABLE_NAME}
       WHERE ST_Within(
         location::geometry,
         ST_MakeEnvelope($1, $2, $3, $4, 4326)
       )
       AND status = 'verified'
       AND created_at > NOW() - INTERVAL '30 days'
       ${severityFilter}
       GROUP BY ST_X(location::geometry), ST_Y(location::geometry)
       ORDER BY intensity DESC
       LIMIT 10000`,
      params
    );

    const heatmapData = result.rows.map(row => ({
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      intensity: parseInt(row.intensity),
      severity: parseFloat(row.avg_severity),
      types: row.types,
    }));

    await redisClient.setex(cacheKey, 300, JSON.stringify(heatmapData));

    return heatmapData;
  }

  /**
   * Get reports by user
   */
  async findByUser(userId: string, options: Omit<ReportQueryOptions, 'userId'> = {}): Promise<{ reports: Report[]; total: number }> {
    return this.findAll({ ...options, userId });
  }

  /**
   * Get unresolved reports count
   */
  async getUnresolvedCount(): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count
       FROM ${this.TABLE_NAME}
       WHERE status IN ('pending', 'verified')`
    );
    
    return parseInt(result.rows[0].count);
  }

  /**
   * Invalidate caches for an area
   */
  private async invalidateCaches(lat: number, lng: number): Promise<void> {
    const patterns = [
      'reports:nearby:*',
      'reports:heatmap:*',
      'reports:stats:*',
    ];
    
    for (const pattern of patterns) {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    }

    if (lat && lng) {
      const nearbyKeys = await redisClient.keys(`reports:nearby:${lat.toFixed(2)}:*`);
      if (nearbyKeys.length > 0) {
        await redisClient.del(nearbyKeys);
      }
    }
  }

  /**
   * Map database row to Report object
   */
  private mapRowToReport(row: any): Report {
    return {
      id: row.id,
      userId: row.user_id,
      location: {
        lat: parseFloat(row.lat),
        lng: parseFloat(row.lng),
      },
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

// Export singleton instance
export const ReportModelInstance = new ReportModel();
export default ReportModelInstance;
