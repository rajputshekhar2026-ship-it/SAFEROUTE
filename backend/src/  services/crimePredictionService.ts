// src/services/crimePredictionService.ts

import axios from 'axios';
import { query } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { LocationData } from '../types';

// Types
export interface CrimePrediction {
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  colorCode: 'green' | 'yellow' | 'orange' | 'red';
  crimeTypes: string[];
  confidence: number;
  timestamp: Date;
  factors: RiskFactor[];
}

export interface RiskFactor {
  name: string;
  impact: number; // -1 to 1 (negative to positive impact)
  weight: number;
  description: string;
}

export interface HistoricalCrimeData {
  totalIncidents: number;
  avgSeverity: number;
  crimeTypes: Record<string, number>;
  timeDistribution: {
    hour: number[];
    dayOfWeek: number[];
    month: number[];
  };
  hotspots: Array<{
    lat: number;
    lng: number;
    count: number;
  }>;
}

export interface HeatmapConfig {
  resolution: number; // meters per pixel
  radius: number; // meters
  blur: number;
  minOpacity: number;
  maxOpacity: number;
  gradient: Record<number, string>;
}

class CrimePredictionService {
  private mlModelUrl: string;
  private cacheTTL: number = 3600; // 1 hour
  private heatmapCacheTTL: number = 7200; // 2 hours

  constructor() {
    this.mlModelUrl = process.env.CRIME_MODEL_API_URL || 'http://localhost:5000/predict';
  }

  /**
   * Predict risk score for a location
   */
  async predictRisk(lat: number, lng: number): Promise<CrimePrediction> {
    try {
      // Check cache first
      const cacheKey = `crime:risk:${lat.toFixed(4)}:${lng.toFixed(4)}`;
      const cached = await redisClient.get(cacheKey);
      
      if (cached) {
        logger.debug(`Returning cached crime prediction for ${lat},${lng}`);
        return JSON.parse(cached);
      }

      // Get historical crime data for context
      const historicalData = await this.getHistoricalCrimeData(lat, lng, 1000);
      
      // Get contextual factors
      const factors = await this.getRiskFactors(lat, lng);
      
      // Call ML model for prediction
      let prediction = await this.callMLModel(lat, lng, historicalData);
      
      // Fallback to statistical calculation if ML model fails
      if (!prediction) {
        logger.warn(`ML model unavailable, using fallback calculation for ${lat},${lng}`);
        prediction = this.calculateRiskScore(historicalData, factors);
      }
      
      // Enhance with factors
      const enhancedPrediction = this.enhanceWithFactors(prediction, factors);
      
      // Cache the result
      await redisClient.setex(cacheKey, this.cacheTTL, JSON.stringify(enhancedPrediction));
      
      // Log prediction for monitoring
      logger.info(`Crime prediction for ${lat},${lng}: ${enhancedPrediction.riskScore} (${enhancedPrediction.riskLevel})`);
      
      return enhancedPrediction;
    } catch (error) {
      logger.error('Crime prediction error:', error);
      
      // Return conservative default
      return this.getDefaultPrediction();
    }
  }

  /**
   * Call ML model API for prediction
   */
  private async callMLModel(
    lat: number,
    lng: number,
    historicalData: HistoricalCrimeData
  ): Promise<any | null> {
    try {
      const requestData = {
        lat,
        lng,
        historicalData: {
          totalIncidents: historicalData.totalIncidents,
          avgSeverity: historicalData.avgSeverity,
          crimeTypes: historicalData.crimeTypes,
          timeDistribution: historicalData.timeDistribution,
        },
        context: {
          hour: new Date().getHours(),
          dayOfWeek: new Date().getDay(),
          month: new Date().getMonth() + 1,
          isWeekend: [0, 6].includes(new Date().getDay()),
          isNight: this.isNightTime(),
        },
      };
      
      const response = await axios.post(this.mlModelUrl, requestData, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.data && typeof response.data.risk_score === 'number') {
        return {
          riskScore: response.data.risk_score,
          crimeTypes: response.data.crime_types || ['unknown'],
          confidence: response.data.confidence || 0.85,
        };
      }
      
      return null;
    } catch (error) {
      logger.error('ML model API call failed:', error);
      return null;
    }
  }

  /**
   * Calculate risk score based on historical data (fallback method)
   */
  private calculateRiskScore(historicalData: HistoricalCrimeData, factors: RiskFactor[]): any {
    // Base score from historical data
    let baseScore = 0;
    
    if (historicalData.totalIncidents > 0) {
      // Density factor (0-40 points)
      const densityScore = Math.min(40, (historicalData.totalIncidents / 50) * 40);
      
      // Severity factor (0-30 points)
      const severityScore = (historicalData.avgSeverity / 5) * 30;
      
      baseScore = densityScore + severityScore;
    } else {
      baseScore = 20; // Default low risk for areas with no data
    }
    
    // Apply contextual factors
    let factorAdjustment = 0;
    for (const factor of factors) {
      factorAdjustment += factor.impact * factor.weight * 10;
    }
    
    // Time-based adjustments
    const currentHour = new Date().getHours();
    if (this.isNightTime()) {
      factorAdjustment += 15; // Night time increases risk
    }
    
    if ([5, 6].includes(new Date().getDay())) { // Weekend
      factorAdjustment += 5;
    }
    
    let riskScore = baseScore + factorAdjustment;
    riskScore = Math.min(100, Math.max(0, riskScore));
    
    // Determine crime types from historical data
    const crimeTypes = Object.keys(historicalData.crimeTypes).slice(0, 3);
    
    return {
      riskScore,
      crimeTypes: crimeTypes.length ? crimeTypes : ['theft', 'vandalism'],
      confidence: 0.7,
    };
  }

  /**
   * Get risk factors for a location
   */
  private async getRiskFactors(lat: number, lng: number): Promise<RiskFactor[]> {
    const factors: RiskFactor[] = [];
    
    try {
      // Check nearby refuges
      const refugeCount = await this.getNearbyRefugeCount(lat, lng, 500);
      if (refugeCount === 0) {
        factors.push({
          name: 'No nearby safe refuges',
          impact: 0.3,
          weight: 0.8,
          description: 'No police stations, hospitals, or safe spaces within 500 meters',
        });
      } else if (refugeCount < 3) {
        factors.push({
          name: 'Limited safe refuges',
          impact: 0.1,
          weight: 0.5,
          description: 'Few safe refuges in the area',
        });
      } else {
        factors.push({
          name: 'Multiple safe refuges nearby',
          impact: -0.2,
          weight: 0.7,
          description: 'Good availability of safe spaces',
        });
      }
      
      // Check lighting
      const hasLighting = await this.checkLightingAvailability(lat, lng);
      if (!hasLighting) {
        factors.push({
          name: 'Poor street lighting',
          impact: 0.4,
          weight: 0.9,
          description: 'Area has inadequate street lighting',
        });
      }
      
      // Check population density
      const populationDensity = await this.getPopulationDensity(lat, lng);
      if (populationDensity < 1000) {
        factors.push({
          name: 'Low population density',
          impact: 0.2,
          weight: 0.6,
          description: 'Fewer people around to assist if needed',
        });
      } else if (populationDensity > 10000) {
        factors.push({
          name: 'High population density',
          impact: -0.1,
          weight: 0.4,
          description: 'More people around, better chance of assistance',
        });
      }
      
      // Check if commercial area
      const isCommercial = await this.isCommercialArea(lat, lng);
      if (isCommercial) {
        factors.push({
          name: 'Commercial area',
          impact: 0.15,
          weight: 0.5,
          description: 'Higher foot traffic but also higher crime rates',
        });
      }
      
    } catch (error) {
      logger.error('Error getting risk factors:', error);
    }
    
    return factors;
  }

  /**
   * Enhance prediction with risk factors
   */
  private enhanceWithFactors(prediction: any, factors: RiskFactor[]): CrimePrediction {
    let adjustedScore = prediction.riskScore;
    
    for (const factor of factors) {
      adjustedScore += factor.impact * factor.weight * 10;
    }
    
    adjustedScore = Math.min(100, Math.max(0, adjustedScore));
    
    let riskLevel: CrimePrediction['riskLevel'];
    let colorCode: CrimePrediction['colorCode'];
    
    if (adjustedScore >= 80) {
      riskLevel = 'critical';
      colorCode = 'red';
    } else if (adjustedScore >= 60) {
      riskLevel = 'high';
      colorCode = 'orange';
    } else if (adjustedScore >= 30) {
      riskLevel = 'medium';
      colorCode = 'yellow';
    } else {
      riskLevel = 'low';
      colorCode = 'green';
    }
    
    return {
      riskScore: Math.round(adjustedScore),
      riskLevel,
      colorCode,
      crimeTypes: prediction.crimeTypes,
      confidence: prediction.confidence,
      timestamp: new Date(),
      factors,
    };
  }

  /**
   * Get historical crime data for an area
   */
  private async getHistoricalCrimeData(
    lat: number,
    lng: number,
    radiusMeters: number
  ): Promise<HistoricalCrimeData> {
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
       FROM crime_history
       WHERE ST_DWithin(
         location::geometry,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )
       AND timestamp > NOW() - INTERVAL '90 days'
       GROUP BY crime_type, hour, day_of_week, month, crime_lng, crime_lat`,
      [lng, lat, radiusMeters]
    );
    
    const rows = result.rows;
    
    // Calculate crime type distribution
    const crimeTypes: Record<string, number> = {};
    let totalIncidents = 0;
    let totalSeverity = 0;
    
    for (const row of rows) {
      crimeTypes[row.crime_type] = (crimeTypes[row.crime_type] || 0) + 1;
      totalIncidents++;
      totalSeverity += row.avg_severity || 3;
    }
    
    // Calculate time distribution
    const hourDistribution = new Array(24).fill(0);
    const dayDistribution = new Array(7).fill(0);
    const monthDistribution = new Array(12).fill(0);
    
    for (const row of rows) {
      if (row.hour !== null) hourDistribution[row.hour]++;
      if (row.day_of_week !== null) dayDistribution[row.day_of_week]++;
      if (row.month !== null) monthDistribution[row.month - 1]++;
    }
    
    // Get hotspots
    const hotspots = await this.getHotspots(lat, lng, radiusMeters);
    
    return {
      totalIncidents,
      avgSeverity: totalIncidents > 0 ? totalSeverity / totalIncidents : 0,
      crimeTypes,
      timeDistribution: {
        hour: hourDistribution,
        dayOfWeek: dayDistribution,
        month: monthDistribution,
      },
      hotspots,
    };
  }

  /**
   * Get crime hotspots within area
   */
  private async getHotspots(
    lat: number,
    lng: number,
    radiusMeters: number
  ): Promise<Array<{ lat: number; lng: number; count: number }>> {
    const result = await query(
      `SELECT 
        ST_X(location::geometry) as lng,
        ST_Y(location::geometry) as lat,
        COUNT(*) as count
       FROM crime_history
       WHERE ST_DWithin(
         location::geometry,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )
       AND timestamp > NOW() - INTERVAL '30 days'
       GROUP BY location
       ORDER BY count DESC
       LIMIT 20`,
      [lng, lat, radiusMeters]
    );
    
    return result.rows.map(row => ({
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      count: parseInt(row.count),
    }));
  }

  /**
   * Get heatmap data for map visualization
   */
  async getHeatmapData(
    bounds: { north: number; south: number; east: number; west: number },
    zoom: number
  ): Promise<any> {
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
       FROM crime_history
       WHERE ST_Within(
         location::geometry,
         ST_MakeEnvelope($1, $2, $3, $4, 4326)
       )
       AND timestamp > NOW() - INTERVAL '30 days'
       GROUP BY location
       ORDER BY intensity DESC
       LIMIT 10000`,
      [bounds.west, bounds.south, bounds.east, bounds.north]
    );
    
    const heatmapData = {
      points: result.rows.map(row => ({
        lat: parseFloat(row.lat),
        lng: parseFloat(row.lng),
        intensity: parseInt(row.intensity),
        severity: parseFloat(row.avg_severity),
      })),
      config: this.getHeatmapConfig(zoom),
    };
    
    await redisClient.setex(cacheKey, this.heatmapCacheTTL, JSON.stringify(heatmapData));
    
    return heatmapData;
  }

  /**
   * Get heatmap configuration based on zoom level
   */
  private getHeatmapConfig(zoom: number): HeatmapConfig {
    // Adjust radius based on zoom level
    let radius = 50;
    if (zoom < 10) radius = 200;
    else if (zoom < 13) radius = 100;
    else if (zoom < 16) radius = 70;
    else radius = 40;
    
    return {
      resolution: 2,
      radius,
      blur: 0.8,
      minOpacity: 0.2,
      maxOpacity: 0.9,
      gradient: {
        0.2: '#4CAF50', // Green - Low risk
        0.4: '#FFC107', // Yellow - Medium risk
        0.6: '#FF9800', // Orange - High risk
        0.8: '#F44336', // Red - Very high risk
        1.0: '#B71C1C', // Dark red - Critical risk
      },
    };
  }

  /**
   * Get crime statistics for a city/area
   */
  async getCrimeStatistics(
    lat: number,
    lng: number,
    radiusMeters: number = 5000
  ): Promise<any> {
    const result = await query(
      `SELECT 
        COUNT(*) as total_crimes,
        AVG(severity) as avg_severity,
        crime_type,
        DATE_TRUNC('month', timestamp) as month
       FROM crime_history
       WHERE ST_DWithin(
         location::geometry,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )
       GROUP BY crime_type, DATE_TRUNC('month', timestamp)
       ORDER BY month DESC`,
      [lng, lat, radiusMeters]
    );
    
    const stats = {
      total: 0,
      byType: {} as Record<string, number>,
      byMonth: {} as Record<string, any>,
      trends: {} as Record<string, number>,
    };
    
    for (const row of result.rows) {
      stats.total += parseInt(row.total_crimes);
      stats.byType[row.crime_type] = (stats.byType[row.crime_type] || 0) + parseInt(row.total_crimes);
      
      const monthKey = new Date(row.month).toISOString().slice(0, 7);
      if (!stats.byMonth[monthKey]) {
        stats.byMonth[monthKey] = { total: 0, byType: {} };
      }
      stats.byMonth[monthKey].total += parseInt(row.total_crimes);
      stats.byMonth[monthKey].byType[row.crime_type] = 
        (stats.byMonth[monthKey].byType[row.crime_type] || 0) + parseInt(row.total_crimes);
    }
    
    // Calculate trends (percentage change)
    const months = Object.keys(stats.byMonth).sort();
    if (months.length >= 2) {
      const current = stats.byMonth[months[months.length - 1]]?.total || 0;
      const previous = stats.byMonth[months[months.length - 2]]?.total || 0;
      stats.trends.overall = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    }
    
    return stats;
  }

  /**
   * Helper: Get nearby refuge count
   */
  private async getNearbyRefugeCount(lat: number, lng: number, radiusMeters: number): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count
       FROM refuges
       WHERE ST_DWithin(
         location::geometry,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )`,
      [lng, lat, radiusMeters]
    );
    
    return parseInt(result.rows[0]?.count || '0');
  }

  /**
   * Helper: Check lighting availability
   */
  private async checkLightingAvailability(lat: number, lng: number): Promise<boolean> {
    // In production, this would check a street lighting database
    // For now, return true for city centers, false for outskirts
    const cityCenterLat = 40.7128;
    const cityCenterLng = -74.0060;
    const distance = this.calculateDistance(lat, lng, cityCenterLat, cityCenterLng);
    
    return distance < 5000; // Within 5km of city center
  }

  /**
   * Helper: Get population density
   */
  private async getPopulationDensity(lat: number, lng: number): Promise<number> {
    // In production, this would query a population density API/database
    // Return dummy data for now
    return 5000;
  }

  /**
   * Helper: Check if commercial area
   */
  private async isCommercialArea(lat: number, lng: number): Promise<boolean> {
    // In production, this would check against commercial zones database
    // Return dummy data for now
    return false;
  }

  /**
   * Helper: Check if night time
   */
  private isNightTime(): boolean {
    const hour = new Date().getHours();
    return hour >= 22 || hour < 6;
  }

  /**
   * Helper: Calculate distance between coordinates
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

  /**
   * Get default prediction (conservative estimate)
   */
  private getDefaultPrediction(): CrimePrediction {
    return {
      riskScore: 50,
      riskLevel: 'medium',
      colorCode: 'yellow',
      crimeTypes: ['theft', 'vandalism'],
      confidence: 0.5,
      timestamp: new Date(),
      factors: [
        {
          name: 'Insufficient data',
          impact: 0,
          weight: 0,
          description: 'Limited historical crime data available for this area',
        },
      ],
    };
  }

  /**
   * Submit new crime report (updates model incrementally)
   */
  async submitCrimeReport(data: {
    lat: number;
    lng: number;
    crimeType: string;
    severity: number;
    description?: string;
  }): Promise<void> {
    try {
      await query(
        `INSERT INTO crime_history (location, crime_type, severity, description, timestamp, created_at)
         VALUES (
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           $3, $4, $5, NOW(), NOW()
         )`,
        [data.lng, data.lat, data.crimeType, data.severity, data.description]
      );
      
      // Invalidate cache for this area
      const latKey = data.lat.toFixed(2);
      const lngKey = data.lng.toFixed(2);
      const pattern = `crime:risk:${latKey}*:*`;
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
      
      logger.info(`Crime report submitted for ${data.lat},${data.lng}`);
    } catch (error) {
      logger.error('Failed to submit crime report:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const crimePredictionService = new CrimePredictionService();
export default crimePredictionService;
