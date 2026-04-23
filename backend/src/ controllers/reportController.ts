// src/controllers/reportController.ts

import { Request, Response } from 'express';
import { query } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';
import { crimePredictionService } from '../services/crimePredictionService';
import { uploadToCloudinary, deleteFromCloudinary } from '../services/uploadService';
import { notificationService } from '../services/notificationService';
import { v4 as uuidv4 } from 'uuid';

// Types
interface CreateReportBody {
  type: string;
  location: {
    lat: number;
    lng: number;
    address?: string;
  };
  description?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  isAnonymous?: boolean;
  mediaUrls?: string[];
}

interface UpdateReportBody {
  status?: 'pending' | 'verified' | 'resolved' | 'dismissed';
  description?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

interface ReportQuery {
  page?: number;
  limit?: number;
  type?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  lat?: number;
  lng?: number;
  radius?: number;
}

export class ReportController {
  /**
   * Create a new incident report
   */
  async createReport(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        type,
        location,
        description,
        severity = 'medium',
        isAnonymous = false,
        mediaUrls = [],
      }: CreateReportBody = req.body;

      const userId = isAnonymous ? null : req.user?.id;

      // Validate required fields
      if (!type || !location || !location.lat || !location.lng) {
        res.status(400).json({ error: 'Type and location are required' });
        return;
      }

      // Validate incident type
      const validTypes = ['harassment', 'broken_light', 'blocked_path', 'suspicious_activity', 'assault', 'unsafe_condition', 'theft', 'medical'];
      if (!validTypes.includes(type)) {
        res.status(400).json({ error: 'Invalid incident type' });
        return;
      }

      // Create report
      const result = await query(
        `INSERT INTO reports (user_id, location, type, severity, description, is_anonymous, media_urls, status, created_at)
         VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, $5, $6, $7, $8, 'pending', NOW())
         RETURNING id`,
        [userId, location.lng, location.lat, type, severity, description, isAnonymous, JSON.stringify(mediaUrls)]
      );

      const reportId = result.rows[0].id;

      // Update crime heatmap cache (invalidate)
      await this.invalidateHeatmapCache(location.lat, location.lng);

      // Check if this report indicates a high-risk area
      if (severity === 'high' || severity === 'critical') {
        await this.handleHighRiskReport(reportId, type, location, severity);
      }

      // Log report creation
      logger.info(`Report ${reportId} created by user ${userId || 'anonymous'} at ${location.lat},${location.lng}`);

      res.status(201).json({
        message: 'Report submitted successfully',
        reportId,
      });
    } catch (error) {
      logger.error('Create report error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get report by ID
   */
  async getReportById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const result = await query(
        `SELECT r.*, 
                u.name as user_name,
                CASE WHEN r.is_anonymous THEN NULL ELSE u.email END as user_email,
                ST_X(r.location::geometry) as lng,
                ST_Y(r.location::geometry) as lat
         FROM reports r
         LEFT JOIN users u ON r.user_id = u.id
         WHERE r.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Report not found' });
        return;
      }

      res.json({ report: result.rows[0] });
    } catch (error) {
      logger.error('Get report error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get nearby reports
   */
  async getNearbyReports(req: Request, res: Response): Promise<void> {
    try {
      const { lat, lng, radius = 1000, limit = 50 } = req.query;

      if (!lat || !lng) {
        res.status(400).json({ error: 'Latitude and longitude are required' });
        return;
      }

      const result = await query(
        `SELECT r.id, r.type, r.severity, r.description, r.created_at,
                ST_X(r.location::geometry) as lng,
                ST_Y(r.location::geometry) as lat,
                ST_Distance(
                  r.location::geometry,
                  ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
                ) as distance
         FROM reports r
         WHERE ST_DWithin(
           r.location::geometry,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           $3
         )
         AND r.status != 'dismissed'
         AND r.created_at > NOW() - INTERVAL '30 days'
         ORDER BY distance
         LIMIT $4`,
        [lng, lat, radius, limit]
      );

      res.json({
        reports: result.rows,
        count: result.rows.length,
        location: { lat, lng },
        radius,
      });
    } catch (error) {
      logger.error('Get nearby reports error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get reports heatmap data
   */
  async getHeatmapData(req: Request, res: Response): Promise<void> {
    try {
      const { north, south, east, west, zoom = 12 } = req.query;

      if (!north || !south || !east || !west) {
        res.status(400).json({ error: 'Bounding box parameters are required' });
        return;
      }

      // Check cache
      const cacheKey = `heatmap:${north}:${south}:${east}:${west}:${zoom}`;
      const cached = await redisClient.get(cacheKey);
      
      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }

      const result = await query(
        `SELECT 
           ST_X(r.location::geometry) as lng,
           ST_Y(r.location::geometry) as lat,
           COUNT(*) as intensity,
           AVG(CASE 
             WHEN r.severity = 'critical' THEN 5
             WHEN r.severity = 'high' THEN 4
             WHEN r.severity = 'medium' THEN 3
             WHEN r.severity = 'low' THEN 2
             ELSE 1
           END) as avg_severity,
           json_agg(DISTINCT r.type) as types
         FROM reports r
         WHERE ST_Within(
           r.location::geometry,
           ST_MakeEnvelope($1, $2, $3, $4, 4326)
         )
         AND r.status = 'verified'
         AND r.created_at > NOW() - INTERVAL '30 days'
         GROUP BY ST_X(r.location::geometry), ST_Y(r.location::geometry)
         ORDER BY intensity DESC
         LIMIT 10000`,
        [west, south, east, north]
      );

      const heatmapData = {
        points: result.rows,
        config: {
          radius: this.getHeatmapRadius(parseInt(zoom as string)),
          blur: 0.8,
          minOpacity: 0.3,
          maxOpacity: 0.9,
          gradient: {
            0.2: '#4CAF50',
            0.4: '#FFC107',
            0.6: '#FF9800',
            0.8: '#F44336',
            1.0: '#B71C1C',
          },
        },
        timestamp: new Date().toISOString(),
      };

      // Cache for 5 minutes
      await redisClient.setex(cacheKey, 300, JSON.stringify(heatmapData));

      res.json(heatmapData);
    } catch (error) {
      logger.error('Get heatmap data error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get reports list with filters
   */
  async getReports(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 20,
        type,
        status,
        startDate,
        endDate,
        lat,
        lng,
        radius,
      }: ReportQuery = req.query;

      const offset = (Number(page) - 1) * Number(limit);
      const params: any[] = [];
      let paramCount = 1;
      let whereClause = 'WHERE 1=1';

      if (type) {
        whereClause += ` AND r.type = $${paramCount++}`;
        params.push(type);
      }

      if (status) {
        whereClause += ` AND r.status = $${paramCount++}`;
        params.push(status);
      }

      if (startDate) {
        whereClause += ` AND r.created_at >= $${paramCount++}`;
        params.push(startDate);
      }

      if (endDate) {
        whereClause += ` AND r.created_at <= $${paramCount++}`;
        params.push(endDate);
      }

      if (lat && lng && radius) {
        whereClause += ` AND ST_DWithin(
          r.location::geometry,
          ST_SetSRID(ST_MakePoint($${paramCount}, $${paramCount + 1}), 4326)::geography,
          $${paramCount + 2}
        )`;
        params.push(lng, lat, radius);
        paramCount += 3;
      }

      // Get total count
      const countResult = await query(
        `SELECT COUNT(*) as total FROM reports r ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total);

      // Get paginated results
      const result = await query(
        `SELECT r.id, r.type, r.severity, r.description, r.status, 
                r.is_anonymous, r.created_at, r.updated_at,
                ST_X(r.location::geometry) as lng,
                ST_Y(r.location::geometry) as lat,
                u.name as user_name
         FROM reports r
         LEFT JOIN users u ON r.user_id = u.id
         ${whereClause}
         ORDER BY r.created_at DESC
         LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
        [...params, limit, offset]
      );

      res.json({
        reports: result.rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      logger.error('Get reports error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Update report (admin/moderator only)
   */
  async updateReport(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status, description, severity }: UpdateReportBody = req.body;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      // Check if user is admin or moderator
      if (userRole !== 'admin' && userRole !== 'moderator') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      const updates: string[] = [];
      const params: any[] = [];
      let paramCount = 1;

      if (status) {
        const validStatuses = ['pending', 'verified', 'resolved', 'dismissed'];
        if (!validStatuses.includes(status)) {
          res.status(400).json({ error: 'Invalid status' });
          return;
        }
        updates.push(`status = $${paramCount++}`);
        params.push(status);

        if (status === 'verified') {
          updates.push(`verified_by = $${paramCount++}`);
          params.push(userId);
          updates.push(`verified_at = NOW()`);
        }
      }

      if (description) {
        updates.push(`description = $${paramCount++}`);
        params.push(description);
      }

      if (severity) {
        updates.push(`severity = $${paramCount++}`);
        params.push(severity);
      }

      if (updates.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      updates.push(`updated_at = NOW()`);
      params.push(id);

      await query(
        `UPDATE reports SET ${updates.join(', ')} WHERE id = $${paramCount}`,
        params
      );

      // If report is verified, update crime history
      if (status === 'verified') {
        const report = await query(
          `SELECT type, severity, location FROM reports WHERE id = $1`,
          [id]
        );
        
        if (report.rows.length > 0) {
          await query(
            `INSERT INTO crime_history (location, crime_type, severity, source, is_verified, timestamp)
             VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3, $4, 'user_report', true, NOW())`,
            [
              report.rows[0].location.coordinates[0],
              report.rows[0].location.coordinates[1],
              report.rows[0].type,
              report.rows[0].severity === 'critical' ? 5 :
              report.rows[0].severity === 'high' ? 4 :
              report.rows[0].severity === 'medium' ? 3 : 2,
            ]
          );
        }
      }

      logger.info(`Report ${id} updated by user ${userId}`);

      res.json({ message: 'Report updated successfully' });
    } catch (error) {
      logger.error('Update report error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Delete report (admin only)
   */
  async deleteReport(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      if (userRole !== 'admin') {
        res.status(403).json({ error: 'Admin permission required' });
        return;
      }

      // Get media URLs to delete from cloud storage
      const report = await query(
        'SELECT media_urls FROM reports WHERE id = $1',
        [id]
      );

      if (report.rows.length > 0 && report.rows[0].media_urls) {
        const mediaUrls = JSON.parse(report.rows[0].media_urls);
        for (const url of mediaUrls) {
          await deleteFromCloudinary(url);
        }
      }

      await query('DELETE FROM reports WHERE id = $1', [id]);

      logger.info(`Report ${id} deleted by admin ${userId}`);

      res.json({ message: 'Report deleted successfully' });
    } catch (error) {
      logger.error('Delete report error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get report statistics
   */
  async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const { days = 30 } = req.query;

      const result = await query(
        `SELECT 
           COUNT(*) as total_reports,
           COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
           COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified,
           COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
           COUNT(CASE WHEN status = 'dismissed' THEN 1 END) as dismissed,
           COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical,
           COUNT(CASE WHEN severity = 'high' THEN 1 END) as high,
           COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium,
           COUNT(CASE WHEN severity = 'low' THEN 1 END) as low,
           json_object_agg(type, type_count) as by_type
         FROM reports,
         LATERAL (
           SELECT type, COUNT(*) as type_count
           FROM reports r2
           WHERE r2.created_at > NOW() - INTERVAL '${days} days'
           GROUP BY type
         ) sub
         WHERE created_at > NOW() - INTERVAL '${days} days'`,
        []
      );

      // Get daily trend
      const trendResult = await query(
        `SELECT 
           DATE(created_at) as date,
           COUNT(*) as count,
           COUNT(CASE WHEN severity IN ('high', 'critical') THEN 1 END) as high_severity
         FROM reports
         WHERE created_at > NOW() - INTERVAL '${days} days'
         GROUP BY DATE(created_at)
         ORDER BY date DESC`,
        []
      );

      res.json({
        summary: result.rows[0],
        trend: trendResult.rows,
        period: `${days} days`,
      });
    } catch (error) {
      logger.error('Get statistics error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Handle high-risk report (send alerts to users in area)
   */
  private async handleHighRiskReport(
    reportId: number,
    type: string,
    location: { lat: number; lng: number },
    severity: string
  ): Promise<void> {
    try {
      // Get users within 1km radius
      const users = await query(
        `SELECT DISTINCT user_id
         FROM location_history
         WHERE ST_DWithin(
           location::geometry,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           1000
         )
         AND created_at > NOW() - INTERVAL '10 minutes'
         AND user_id IS NOT NULL`,
        [location.lng, location.lat]
      );

      // Send alerts to nearby users
      for (const user of users.rows) {
        await notificationService.sendSafetyAlert(user.user_id, {
          title: `⚠️ ${type.replace('_', ' ').toUpperCase()} Reported Nearby`,
          message: `A ${severity} severity incident has been reported ${Math.round(
            this.calculateDistance(location.lat, location.lng, 0, 0)
          )}m from your location. Stay alert.`,
          severity: severity === 'critical' ? 'high' : 'medium',
          location,
        });
      }

      logger.info(`High-risk report ${reportId} sent alerts to ${users.rows.length} users`);
    } catch (error) {
      logger.error('Handle high-risk report error:', error);
    }
  }

  /**
   * Invalidate heatmap cache for area
   */
  private async invalidateHeatmapCache(lat: number, lng: number): Promise<void> {
    try {
      const keys = await redisClient.keys('heatmap:*');
      if (keys.length > 0) {
        await redisClient.del(keys);
        logger.debug(`Invalidated ${keys.length} heatmap cache entries`);
      }
    } catch (error) {
      logger.error('Invalidate heatmap cache error:', error);
    }
  }

  /**
   * Get heatmap radius based on zoom level
   */
  private getHeatmapRadius(zoom: number): number {
    if (zoom < 10) return 50;
    if (zoom < 13) return 30;
    if (zoom < 16) return 20;
    return 10;
  }

  /**
   * Calculate distance between coordinates
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}

export default new ReportController();
