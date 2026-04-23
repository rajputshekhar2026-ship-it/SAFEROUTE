// src/models/CrimeHistory.ts

import { query } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

// Types
export interface CrimeRecord {
  id: number;
  location: {
    lat: number;
    lng: number;
  };
  crimeType: string;
  severity: number;
  description?: string;
  source: 'user_report' | 'police_data' | 'news_api' | 'historical_data';
  isVerified: boolean;
  timestamp: Date;
  createdAt: Date;
}

export interface CrimeStatistics {
  totalIncidents: number;
  avgSeverity: number;
  byType: Record<string, number>;
  byHour: number[];
  byDayOfWeek: number[];
  byMonth: number[];
  hotspots: Array<{
    lat: number;
    lng: number;
    count: number;
    avgSeverity: number;
  }>;
}

export interface CrimePrediction {
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  factors: Array<{
    name: string;
    impact: number;
    description: string;
  }>;
}

export interface CrimeQueryOptions {
  startDate?: Date;
  endDate?: Date;
  crimeType?: string;
  minSeverity?: number;
  maxSeverity?: number;
  lat?: number;
  lng?: number;
  radius?: number;
  limit?: number;
  offset?: number;
}

class CrimeHistoryModel {
  private readonly TABLE_NAME = 'crime_history';
  private readonly CACHE_TTL = 3600; // 1 hour

  /**
   * Create a new crime record
   */
  async create(data: Omit<CrimeRecord, 'id' | 'createdAt'>): Promise<CrimeRecord> {
    const result = await query(
      `INSERT INTO ${this.TABLE_NAME} (location, crime_type, severity, description, source, is_verified, timestamp, created_at)
       VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat`,
      [
        data.location.lng,
        data.location.lat,
        data.crimeType,
        data.severity,
        data.description,
        data.source,
        data.isVerified,
        data.timestamp,
      ]
    );

    const row = result.rows[0];
    
    // Invalidate relevant caches
    await this.invalidateCaches(data.location.lat, data.location.lng);
    
    return this.mapRowToCrimeRecord(row);
  }

  /**
   * Bulk create crime records
   */
  async bulkCreate(records: Omit<CrimeRecord, 'id' | 'createdAt'>[]): Promise<number> {
    if (records.length === 0) return 0;

    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const record of records) {
      placeholders.push(
        `(ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326)::geography, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, NOW())`
      );
      values.push(
        record.location.lng,
        record.location.lat,
        record.crimeType,
        record.severity,
        record.description,
        record.source,
        record.isVerified,
        record.timestamp
      );
      paramIndex += 8;
    }

    const result = await query(
      `INSERT INTO ${this.TABLE_NAME} (location, crime_type, severity, description, source, is_verified, timestamp, created_at)
       VALUES ${placeholders.join(', ')}
       RETURNING id`,
      values
    );

    // Invalidate caches for affected areas
    const uniqueLocations = new Set(records.map(r => `${r.location.lat.toFixed(2)},${r.location.lng.toFixed(2)}`));
    for (const location of uniqueLocations) {
      const [lat, lng] = location.split(',').map(Number);
      await this.invalidateCaches(lat, lng);
    }

    return result.rowCount || 0;
  }

  /**
   * Get crime record by ID
   */
  async findById(id: number): Promise<CrimeRecord | null> {
    const result = await query(
      `SELECT id, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat,
              crime_type, severity, description, source, is_verified, timestamp, created_at
       FROM ${this.TABLE_NAME}
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToCrimeRecord(result.rows[0]);
  }

  /**
   * Get crime records near a location
   */
  async findNearby(
    lat: number,
    lng: number,
    radiusMeters: number = 1000,
    options?: CrimeQueryOptions
  ): Promise<CrimeRecord[]> {
    let queryText = `
      SELECT id, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat,
             crime_type, severity, description, source, is_verified, timestamp, created_at,
             ST_Distance(location::geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance
      FROM ${this.TABLE_NAME}
      WHERE ST_DWithin(
        location::geometry,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
    `;

    const params: any[] = [lng, lat, radiusMeters];
    let paramIndex = 4;

    if (options?.startDate) {
      queryText += ` AND timestamp >= $${paramIndex++}`;
      params.push(options.startDate);
    }

    if (options?.endDate) {
      queryText += ` AND timestamp <= $${paramIndex++}`;
      params.push(options.endDate);
    }

    if (options?.crimeType) {
      queryText += ` AND crime_type = $${paramIndex++}`;
      params.push(options.crimeType);
    }

    if (options?.minSeverity) {
      queryText += ` AND severity >= $${paramIndex++}`;
      params.push(options.minSeverity);
    }

    if (options?.maxSeverity) {
      queryText += ` AND severity <= $${paramIndex++}`;
      params.push(options.maxSeverity);
    }

    queryText += ` ORDER BY distance LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(options?.limit || 100, options?.offset || 0);

    const result = await query(queryText, params);
    return result.rows.map(row => this.mapRowToCrimeRecord(row));
  }

  /**
   * Get crime statistics for an area
   */
  async getStatistics(
    lat: number,
    lng: number,
    radiusMeters: number = 5000,
    days: number = 90
  ): Promise<CrimeStatistics> {
    const cacheKey = `crime:stats:${lat.toFixed(2)}:${lng.toFixed(2)}:${radiusMeters}:${days}`;
    const cached = await redisClient.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const result = await query(
      `SELECT 
        COUNT(*) as total_incidents,
        AVG(severity) as avg_severity,
        crime_type,
        EXTRACT(HOUR FROM timestamp) as hour,
        EXTRACT(DOW FROM timestamp) as day_of_week,
        EXTRACT(MONTH FROM timestamp) as month,
        ST_X(location::geometry) as crime_lng,
        ST_Y(location::geometry) as crime_lat
       FROM ${this.TABLE_NAME}
       WHERE ST_DWithin(
         location::geometry,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )
       AND timestamp > NOW() - INTERVAL '${days} days'
       GROUP BY crime_type, hour, day_of_week, month, crime_lng, crime_lat`,
      [lng, lat, radiusMeters]
    );

    const stats: CrimeStatistics = {
      totalIncidents: 0,
      avgSeverity: 0,
      byType: {},
      byHour: new Array(24).fill(0),
      byDayOfWeek: new Array(7).fill(0),
      byMonth: new Array(12).fill(0),
      hotspots: [],
    };

    let totalSeverity = 0;
    const hotspotMap = new Map<string, { count: number; severity: number }>();

    for (const row of result.rows) {
      stats.totalIncidents++;
      totalSeverity += row.avg_severity;
      stats.byType[row.crime_type] = (stats.byType[row.crime_type] || 0) + 1;
      
      if (row.hour !== null) stats.byHour[row.hour]++;
      if (row.day_of_week !== null) stats.byDayOfWeek[row.day_of_week]++;
      if (row.month !== null) stats.byMonth[row.month - 1]++;
      
      const key = `${row.crime_lat},${row.crime_lng}`;
      const existing = hotspotMap.get(key);
      if (existing) {
        hotspotMap.set(key, { count: existing.count + 1, severity: existing.severity + row.avg_severity });
      } else {
        hotspotMap.set(key, { count: 1, severity: row.avg_severity });
      }
    }

    stats.avgSeverity = stats.totalIncidents > 0 ? totalSeverity / stats.totalIncidents : 0;
    
    // Get top 10 hotspots
    stats.hotspots = Array.from(hotspotMap.entries())
      .map(([key, value]) => {
        const [lat, lng] = key.split(',').map(Number);
        return {
          lat,
          lng,
          count: value.count,
          avgSeverity: value.severity / value.count,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    await redisClient.setex(cacheKey, this.CACHE_TTL, JSON.stringify(stats));

    return stats;
  }

  /**
   * Predict crime risk for a location
   */
  async predictRisk(lat: number, lng: number): Promise<CrimePrediction> {
    const cacheKey = `crime:risk:${lat.toFixed(4)}:${lng.toFixed(4)}`;
    const cached = await redisClient.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Get historical data for prediction
    const stats = await this.getStatistics(lat, lng, 1000, 90);
    
    // Calculate risk score based on multiple factors
    let riskScore = 0;
    const factors = [];

    // Factor 1: Incident density
    const densityScore = Math.min(40, (stats.totalIncidents / 100) * 40);
    riskScore += densityScore;
    factors.push({
      name: 'Incident Density',
      impact: densityScore / 40,
      description: `${stats.totalIncidents} incidents reported in the last 90 days within 1km radius`,
    });

    // Factor 2: Severity
    const severityScore = (stats.avgSeverity / 5) * 30;
    riskScore += severityScore;
    factors.push({
      name: 'Incident Severity',
      impact: severityScore / 30,
      description: `Average severity score of ${stats.avgSeverity.toFixed(1)} out of 5`,
    });

    // Factor 3: Time-based adjustment
    const currentHour = new Date().getHours();
    const hourFactor = stats.byHour[currentHour] / Math.max(1, Math.max(...stats.byHour));
    const timeScore = hourFactor * 15;
    riskScore += timeScore;
    factors.push({
      name: 'Time of Day',
      impact: hourFactor,
      description: `Historical incident frequency at ${currentHour}:00`,
    });

    // Factor 4: Day of week adjustment
    const currentDay = new Date().getDay();
    const dayFactor = stats.byDayOfWeek[currentDay] / Math.max(1, Math.max(...stats.byDayOfWeek));
    const dayScore = dayFactor * 15;
    riskScore += dayScore;
    factors.push({
      name: 'Day of Week',
      impact: dayFactor,
      description: `Historical incident frequency on ${this.getDayName(currentDay)}`,
    });

    riskScore = Math.min(100, Math.max(0, riskScore));

    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore >= 80) riskLevel = 'critical';
    else if (riskScore >= 60) riskLevel = 'high';
    else if (riskScore >= 30) riskLevel = 'medium';
    else riskLevel = 'low';

    const prediction: CrimePrediction = {
      riskScore: Math.round(riskScore),
      riskLevel,
      confidence: 0.85,
      factors,
    };

    await redisClient.setex(cacheKey, 1800, JSON.stringify(prediction)); // Cache for 30 minutes

    return prediction;
  }

  /**
   * Get crime trends over time
   */
  async getTrends(
    lat: number,
    lng: number,
    radiusMeters: number = 5000,
    months: number = 12
  ): Promise<Array<{ month: string; total: number; byType: Record<string, number> }>> {
    const result = await query(
      `SELECT 
        DATE_TRUNC('month', timestamp) as month,
        COUNT(*) as total,
        crime_type
       FROM ${this.TABLE_NAME}
       WHERE ST_DWithin(
         location::geometry,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )
       AND timestamp > NOW() - INTERVAL '${months} months'
       GROUP BY DATE_TRUNC('month', timestamp), crime_type
       ORDER BY month DESC`,
      [lng, lat, radiusMeters]
    );

    const trendsMap = new Map<string, { total: number; byType: Record<string, number> }>();
    
    for (const row of result.rows) {
      const monthKey = row.month.toISOString().slice(0, 7);
      if (!trendsMap.has(monthKey)) {
        trendsMap.set(monthKey, { total: 0, byType: {} });
      }
      const trend = trendsMap.get(monthKey)!;
      trend.total += parseInt(row.total);
      trend.byType[row.crime_type] = (trend.byType[row.crime_type] || 0) + parseInt(row.total);
    }

    return Array.from(trendsMap.entries()).map(([month, data]) => ({
      month,
      total: data.total,
      byType: data.byType,
    }));
  }

  /**
   * Get crime by type breakdown
   */
  async getCrimeTypeBreakdown(
    lat: number,
    lng: number,
    radiusMeters: number = 5000
  ): Promise<Array<{ type: string; count: number; percentage: number }>> {
    const stats = await this.getStatistics(lat, lng, radiusMeters);
    
    const breakdown = Object.entries(stats.byType).map(([type, count]) => ({
      type,
      count,
      percentage: (count / stats.totalIncidents) * 100,
    }));
    
    return breakdown.sort((a, b) => b.count - a.count);
  }

  /**
   * Update crime record verification status
   */
  async verifyCrimeRecord(id: number, verified: boolean): Promise<boolean> {
    const result = await query(
      `UPDATE ${this.TABLE_NAME}
       SET is_verified = $1
       WHERE id = $2
       RETURNING id`,
      [verified, id]
    );

    if (result.rows.length > 0) {
      // Invalidate caches
      const record = await this.findById(id);
      if (record) {
        await this.invalidateCaches(record.location.lat, record.location.lng);
      }
      return true;
    }
    
    return false;
  }

  /**
   * Delete old crime records (cleanup)
   */
  async deleteOldRecords(daysToKeep: number = 730): Promise<number> {
    const result = await query(
      `DELETE FROM ${this.TABLE_NAME}
       WHERE timestamp < NOW() - INTERVAL '${daysToKeep} days'
       AND source != 'historical_data'
       RETURNING id`
    );
    
    return result.rowCount || 0;
  }

  /**
   * Get heatmap data for visualization
   */
  async getHeatmapData(
    bounds: { north: number; south: number; east: number; west: number },
    zoom: number
  ): Promise<Array<{ lat: number; lng: number; intensity: number; severity: number }>> {
    const cacheKey = `crime:heatmap:${bounds.north}:${bounds.south}:${bounds.east}:${bounds.west}:${zoom}`;
    const cached = await redisClient.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const result = await query(
      `SELECT 
        ST_X(location::geometry) as lng,
        ST_Y(location::geometry) as lat,
        COUNT(*) as intensity,
        AVG(severity) as avg_severity
       FROM ${this.TABLE_NAME}
       WHERE ST_Within(
         location::geometry,
         ST_MakeEnvelope($1, $2, $3, $4, 4326)
       )
       AND timestamp > NOW() - INTERVAL '30 days'
       GROUP BY ST_X(location::geometry), ST_Y(location::geometry)
       ORDER BY intensity DESC
       LIMIT 10000`,
      [bounds.west, bounds.south, bounds.east, bounds.north]
    );

    const heatmapData = result.rows.map(row => ({
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      intensity: parseInt(row.intensity),
      severity: parseFloat(row.avg_severity),
    }));

    await redisClient.setex(cacheKey, 300, JSON.stringify(heatmapData)); // Cache for 5 minutes

    return heatmapData;
  }

  /**
   * Invalidate caches for an area
   */
  private async invalidateCaches(lat: number, lng: number): Promise<void> {
    const latKey = lat.toFixed(2);
    const lngKey = lng.toFixed(2);
    
    const patterns = [
      `crime:stats:${latKey}:${lngKey}:*`,
      `crime:risk:${lat.toFixed(4)}:*`,
      `crime:heatmap:*`,
    ];
    
    for (const pattern of patterns) {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    }
  }

  /**
   * Map database row to CrimeRecord object
   */
  private mapRowToCrimeRecord(row: any): CrimeRecord {
    return {
      id: row.id,
      location: {
        lat: parseFloat(row.lat),
        lng: parseFloat(row.lng),
      },
      crimeType: row.crime_type,
      severity: row.severity,
      description: row.description,
      source: row.source,
      isVerified: row.is_verified,
      timestamp: row.timestamp,
      createdAt: row.created_at,
    };
  }

  /**
   * Get day name from day number
   */
  private getDayName(day: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[day];
  }
}

// Export singleton instance
export const CrimeHistory = new CrimeHistoryModel();
export default CrimeHistory;
