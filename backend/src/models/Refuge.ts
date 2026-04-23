// src/models/Refuge.ts

import { query } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

// Types
export interface Refuge {
  id: number;
  name: string;
  location: {
    lat: number;
    lng: number;
  };
  type: 'police' | 'hospital' | 'cafe' | 'store' | 'community_center' | 'transit';
  address?: string;
  phone?: string;
  hours?: {
    monday?: string;
    tuesday?: string;
    wednesday?: string;
    thursday?: string;
    friday?: string;
    saturday?: string;
    sunday?: string;
    twentyFourSeven?: boolean;
  };
  is24Hours: boolean;
  hasSecurity: boolean;
  hasLighting: boolean;
  rating?: number;
  amenities?: string[];
  emergencyServices?: string[];
  wheelchairAccessible: boolean;
  capacity?: number;
  lastVerified?: Date;
  distance?: number; // Computed field
  estimatedTime?: number; // Computed field in minutes
}

export interface RefugeQueryOptions {
  type?: string;
  is24Hours?: boolean;
  hasSecurity?: boolean;
  hasLighting?: boolean;
  minRating?: number;
  limit?: number;
  offset?: number;
  lat?: number;
  lng?: number;
  radius?: number;
  sortBy?: 'distance' | 'rating' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface NearbyRefuge extends Refuge {
  distance: number;
  estimatedTime: number;
}

class RefugeModel {
  private readonly TABLE_NAME = 'refuges';
  private readonly CACHE_TTL = 86400; // 24 hours

  /**
   * Create a new refuge
   */
  async create(data: Omit<Refuge, 'id'>): Promise<Refuge> {
    const result = await query(
      `INSERT INTO ${this.TABLE_NAME} 
       (name, location, type, address, phone, hours, is_24_hours, has_security, has_lighting, 
        rating, amenities, emergency_services, wheelchair_accessible, capacity, last_verified)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING id, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat`,
      [
        data.name,
        data.location.lng,
        data.location.lat,
        data.type,
        data.address,
        data.phone,
        JSON.stringify(data.hours || {}),
        data.is24Hours,
        data.hasSecurity,
        data.hasLighting,
        data.rating,
        JSON.stringify(data.amenities || []),
        JSON.stringify(data.emergencyServices || []),
        data.wheelchairAccessible,
        data.capacity,
        data.lastVerified || new Date(),
      ]
    );

    const row = result.rows[0];
    
    // Invalidate cache
    await this.invalidateCache();
    
    return this.mapRowToRefuge(row);
  }

  /**
   * Bulk create refuges
   */
  async bulkCreate(refuges: Omit<Refuge, 'id'>[]): Promise<number> {
    if (refuges.length === 0) return 0;

    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const refuge of refuges) {
      placeholders.push(
        `($${paramIndex}, ST_SetSRID(ST_MakePoint($${paramIndex + 1}, $${paramIndex + 2}), 4326)::geography, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10}, $${paramIndex + 11}, $${paramIndex + 12}, $${paramIndex + 13}, $${paramIndex + 14}, $${paramIndex + 15})`
      );
      values.push(
        refuge.name,
        refuge.location.lng,
        refuge.location.lat,
        refuge.type,
        refuge.address,
        refuge.phone,
        JSON.stringify(refuge.hours || {}),
        refuge.is24Hours,
        refuge.hasSecurity,
        refuge.hasLighting,
        refuge.rating,
        JSON.stringify(refuge.amenities || []),
        JSON.stringify(refuge.emergencyServices || []),
        refuge.wheelchairAccessible,
        refuge.capacity,
        refuge.lastVerified || new Date()
      );
      paramIndex += 16;
    }

    const result = await query(
      `INSERT INTO ${this.TABLE_NAME} 
       (name, location, type, address, phone, hours, is_24_hours, has_security, has_lighting, 
        rating, amenities, emergency_services, wheelchair_accessible, capacity, last_verified)
       VALUES ${placeholders.join(', ')}
       RETURNING id`,
      values
    );

    await this.invalidateCache();
    
    return result.rowCount || 0;
  }

  /**
   * Get refuge by ID
   */
  async findById(id: number): Promise<Refuge | null> {
    const result = await query(
      `SELECT id, name, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat,
              type, address, phone, hours, is_24_hours, has_security, has_lighting,
              rating, amenities, emergency_services, wheelchair_accessible, capacity, last_verified
       FROM ${this.TABLE_NAME}
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToRefuge(result.rows[0]);
  }

  /**
   * Get all refuges with filters
   */
  async findAll(options: RefugeQueryOptions = {}): Promise<{ refuges: Refuge[]; total: number }> {
    let queryText = `
      SELECT id, name, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat,
             type, address, phone, hours, is_24_hours, has_security, has_lighting,
             rating, amenities, emergency_services, wheelchair_accessible, capacity, last_verified
      FROM ${this.TABLE_NAME}
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramIndex = 1;

    if (options.type) {
      queryText += ` AND type = $${paramIndex++}`;
      params.push(options.type);
    }

    if (options.is24Hours !== undefined) {
      queryText += ` AND is_24_hours = $${paramIndex++}`;
      params.push(options.is24Hours);
    }

    if (options.hasSecurity !== undefined) {
      queryText += ` AND has_security = $${paramIndex++}`;
      params.push(options.hasSecurity);
    }

    if (options.hasLighting !== undefined) {
      queryText += ` AND has_lighting = $${paramIndex++}`;
      params.push(options.hasLighting);
    }

    if (options.minRating !== undefined) {
      queryText += ` AND rating >= $${paramIndex++}`;
      params.push(options.minRating);
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM ${this.TABLE_NAME} WHERE 1=1` +
      (options.type ? ` AND type = $${params.indexOf(options.type) + 1}` : ''),
      params.filter(p => p !== undefined)
    );
    const total = parseInt(countResult.rows[0].total);

    // Apply sorting
    if (options.sortBy) {
      queryText += ` ORDER BY ${options.sortBy} ${options.sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
    } else {
      queryText += ` ORDER BY name ASC`;
    }

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
      refuges: result.rows.map(row => this.mapRowToRefuge(row)),
      total,
    };
  }

  /**
   * Find refuges near a location
   */
  async findNearby(
    lat: number,
    lng: number,
    radiusMeters: number = 1000,
    options: RefugeQueryOptions = {}
  ): Promise<NearbyRefuge[]> {
    const cacheKey = `refuges:nearby:${lat.toFixed(4)}:${lng.toFixed(4)}:${radiusMeters}:${JSON.stringify(options)}`;
    const cached = await redisClient.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    let queryText = `
      SELECT 
        id, name,
        ST_X(location::geometry) as lng,
        ST_Y(location::geometry) as lat,
        type, address, phone, hours, is_24_hours, has_security, has_lighting,
        rating, amenities, emergency_services, wheelchair_accessible, capacity, last_verified,
        ST_Distance(
          location::geometry,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) as distance
      FROM ${this.TABLE_NAME}
      WHERE ST_DWithin(
        location::geometry,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
    `;

    const params: any[] = [lng, lat, radiusMeters];
    let paramIndex = 4;

    if (options.type) {
      queryText += ` AND type = $${paramIndex++}`;
      params.push(options.type);
    }

    if (options.is24Hours !== undefined) {
      queryText += ` AND is_24_hours = $${paramIndex++}`;
      params.push(options.is24Hours);
    }

    if (options.hasSecurity !== undefined) {
      queryText += ` AND has_security = $${paramIndex++}`;
      params.push(options.hasSecurity);
    }

    if (options.hasLighting !== undefined) {
      queryText += ` AND has_lighting = $${paramIndex++}`;
      params.push(options.hasLighting);
    }

    if (options.minRating !== undefined) {
      queryText += ` AND rating >= $${paramIndex++}`;
      params.push(options.minRating);
    }

    if (options.sortBy === 'distance') {
      queryText += ` ORDER BY distance ${options.sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
    } else if (options.sortBy === 'rating') {
      queryText += ` ORDER BY rating ${options.sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
    } else {
      queryText += ` ORDER BY distance ASC`;
    }

    if (options.limit) {
      queryText += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }

    const result = await query(queryText, params);
    
    const refuges: NearbyRefuge[] = result.rows.map(row => {
      const refuge = this.mapRowToRefuge(row);
      const distance = parseFloat(row.distance);
      return {
        ...refuge,
        distance,
        estimatedTime: Math.ceil(distance / 83.33), // 5 km/h walking speed in m/min
      };
    });

    await redisClient.setex(cacheKey, this.CACHE_TTL, JSON.stringify(refuges));

    return refuges;
  }

  /**
   * Find refuges along a route
   */
  async findAlongRoute(
    routePoints: Array<{ lat: number; lng: number }>,
    maxDetourMeters: number = 200,
    options: RefugeQueryOptions = {}
  ): Promise<Array<NearbyRefuge & { detourDistance: number }>> {
    // Convert route points to LineString for spatial query
    const lineString = `LINESTRING(${routePoints.map(p => `${p.lng} ${p.lat}`).join(',')})`;
    
    let queryText = `
      WITH route AS (
        SELECT ST_SetSRID(ST_GeomFromText($1), 4326)::geography as path
      ),
      nearby_refuges AS (
        SELECT 
          r.id, r.name,
          ST_X(r.location::geometry) as lng,
          ST_Y(r.location::geometry) as lat,
          r.type, r.address, r.phone, r.hours, r.is_24_hours, r.has_security, r.has_lighting,
          r.rating, r.amenities, r.emergency_services, r.wheelchair_accessible, r.capacity,
          ST_Distance(r.location::geometry, route.path) as distance,
          ST_LineLocatePoint(route.path::geometry, r.location::geometry) as location_ratio
        FROM ${this.TABLE_NAME} r, route
        WHERE ST_DWithin(r.location::geometry, route.path, $2)
    `;

    const params: any[] = [lineString, maxDetourMeters];
    let paramIndex = 3;

    if (options.type) {
      queryText += ` AND r.type = $${paramIndex++}`;
      params.push(options.type);
    }

    if (options.is24Hours !== undefined) {
      queryText += ` AND r.is_24_hours = $${paramIndex++}`;
      params.push(options.is24Hours);
    }

    if (options.minRating !== undefined) {
      queryText += ` AND r.rating >= $${paramIndex++}`;
      params.push(options.minRating);
    }

    queryText += `
      )
      SELECT *,
        (distance * 2) as detour_distance
      FROM nearby_refuges
      ORDER BY distance
    `;

    if (options.limit) {
      queryText += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }

    const result = await query(queryText, params);
    
    return result.rows.map(row => {
      const refuge = this.mapRowToRefuge(row);
      const distance = parseFloat(row.distance);
      return {
        ...refuge,
        distance,
        detourDistance: parseFloat(row.detour_distance),
        estimatedTime: Math.ceil(distance / 83.33),
      };
    });
  }

  /**
   * Update refuge
   */
  async update(id: number, data: Partial<Refuge>): Promise<Refuge | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }

    if (data.location !== undefined) {
      updates.push(`location = ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326)::geography`);
      params.push(data.location.lng, data.location.lat);
      paramIndex += 2;
    }

    if (data.type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      params.push(data.type);
    }

    if (data.address !== undefined) {
      updates.push(`address = $${paramIndex++}`);
      params.push(data.address);
    }

    if (data.phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      params.push(data.phone);
    }

    if (data.hours !== undefined) {
      updates.push(`hours = $${paramIndex++}`);
      params.push(JSON.stringify(data.hours));
    }

    if (data.is24Hours !== undefined) {
      updates.push(`is_24_hours = $${paramIndex++}`);
      params.push(data.is24Hours);
    }

    if (data.hasSecurity !== undefined) {
      updates.push(`has_security = $${paramIndex++}`);
      params.push(data.hasSecurity);
    }

    if (data.hasLighting !== undefined) {
      updates.push(`has_lighting = $${paramIndex++}`);
      params.push(data.hasLighting);
    }

    if (data.rating !== undefined) {
      updates.push(`rating = $${paramIndex++}`);
      params.push(data.rating);
    }

    if (data.amenities !== undefined) {
      updates.push(`amenities = $${paramIndex++}`);
      params.push(JSON.stringify(data.amenities));
    }

    if (data.emergencyServices !== undefined) {
      updates.push(`emergency_services = $${paramIndex++}`);
      params.push(JSON.stringify(data.emergencyServices));
    }

    if (data.wheelchairAccessible !== undefined) {
      updates.push(`wheelchair_accessible = $${paramIndex++}`);
      params.push(data.wheelchairAccessible);
    }

    if (data.capacity !== undefined) {
      updates.push(`capacity = $${paramIndex++}`);
      params.push(data.capacity);
    }

    if (data.lastVerified !== undefined) {
      updates.push(`last_verified = $${paramIndex++}`);
      params.push(data.lastVerified);
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
    
    // Invalidate cache
    await this.invalidateCache();
    
    return this.findById(id);
  }

  /**
   * Delete refuge
   */
  async delete(id: number): Promise<boolean> {
    const result = await query(
      `DELETE FROM ${this.TABLE_NAME} WHERE id = $1 RETURNING id`,
      [id]
    );
    
    if (result.rowCount && result.rowCount > 0) {
      await this.invalidateCache();
      return true;
    }
    
    return false;
  }

  /**
   * Get refuge statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byType: Record<string, number>;
    averageRating: number;
    twentyFourHourCount: number;
    withSecurityCount: number;
    withLightingCount: number;
    wheelchairAccessibleCount: number;
  }> {
    const result = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN is_24_hours THEN 1 END) as twenty_four_hour_count,
        COUNT(CASE WHEN has_security THEN 1 END) as with_security_count,
        COUNT(CASE WHEN has_lighting THEN 1 END) as with_lighting_count,
        COUNT(CASE WHEN wheelchair_accessible THEN 1 END) as wheelchair_accessible_count,
        AVG(rating) as avg_rating,
        type,
        COUNT(*) as type_count
      FROM ${this.TABLE_NAME}
      GROUP BY type
    `);

    const byType: Record<string, number> = {};
    let total = 0;
    let totalRating = 0;
    let ratingCount = 0;

    for (const row of result.rows) {
      byType[row.type] = parseInt(row.type_count);
      total += parseInt(row.type_count);
      if (row.avg_rating) {
        totalRating += parseFloat(row.avg_rating) * parseInt(row.type_count);
        ratingCount += parseInt(row.type_count);
      }
    }

    return {
      total,
      byType,
      averageRating: ratingCount > 0 ? totalRating / ratingCount : 0,
      twentyFourHourCount: parseInt(result.rows[0]?.twenty_four_hour_count || 0),
      withSecurityCount: parseInt(result.rows[0]?.with_security_count || 0),
      withLightingCount: parseInt(result.rows[0]?.with_lighting_count || 0),
      wheelchairAccessibleCount: parseInt(result.rows[0]?.wheelchair_accessible_count || 0),
    };
  }

  /**
   * Rate a refuge
   */
  async addRating(id: number, rating: number): Promise<Refuge | null> {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    // Calculate new average rating
    const current = await this.findById(id);
    if (!current) return null;

    const newRating = current.rating 
      ? (current.rating + rating) / 2 
      : rating;

    return this.update(id, { rating: Math.round(newRating * 10) / 10 });
  }

  /**
   * Get refuges by type
   */
  async findByType(type: string, limit?: number): Promise<Refuge[]> {
    const result = await query(
      `SELECT id, name, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat,
              type, address, phone, hours, is_24_hours, has_security, has_lighting,
              rating, amenities, emergency_services, wheelchair_accessible, capacity, last_verified
       FROM ${this.TABLE_NAME}
       WHERE type = $1
       ORDER BY rating DESC NULLS LAST, name ASC
       LIMIT $2`,
      [type, limit || 50]
    );

    return result.rows.map(row => this.mapRowToRefuge(row));
  }

  /**
   * Invalidate cache
   */
  private async invalidateCache(): Promise<void> {
    const keys = await redisClient.keys('refuges:*');
    if (keys.length > 0) {
      await redisClient.del(keys);
      logger.debug(`Invalidated ${keys.length} refuge cache entries`);
    }
  }

  /**
   * Map database row to Refuge object
   */
  private mapRowToRefuge(row: any): Refuge {
    return {
      id: row.id,
      name: row.name,
      location: {
        lat: parseFloat(row.lat),
        lng: parseFloat(row.lng),
      },
      type: row.type,
      address: row.address,
      phone: row.phone,
      hours: row.hours,
      is24Hours: row.is_24_hours,
      hasSecurity: row.has_security,
      hasLighting: row.has_lighting,
      rating: row.rating ? parseFloat(row.rating) : undefined,
      amenities: row.amenities,
      emergencyServices: row.emergency_services,
      wheelchairAccessible: row.wheelchair_accessible,
      capacity: row.capacity,
      lastVerified: row.last_verified,
    };
  }
}

// Export singleton instance
export const RefugeModelInstance = new RefugeModel();
export default RefugeModelInstance;
