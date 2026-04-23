// src/services/routingService.ts

import axios from 'axios';
import { query } from '../config/database';
import { redisClient } from '../config/redis';
import { crimePredictionService } from './crimePredictionService';
import { geocodingService } from './geocodingService';
import { logger } from '../utils/logger';
import { LocationData } from '../types';

// Types
export interface RouteRequest {
  start: LocationData;
  end: LocationData;
  waypoints?: LocationData[];
  preferences?: ('safe' | 'fast' | 'lit')[];
  avoidHighCrime?: boolean;
  prioritizeLighting?: boolean;
  includeRefuges?: boolean;
  maxAlternatives?: number;
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  startLocation: LocationData;
  endLocation: LocationData;
  maneuver: 'straight' | 'turn-left' | 'turn-right' | 'slight-left' | 'slight-right' | 'sharp-left' | 'sharp-right' | 'u-turn';
  safetyWarning?: string;
  crimeRisk?: number;
  lightingScore?: number;
}

export interface Route {
  id: string;
  type: 'fastest' | 'safest' | 'lit';
  coordinates: [number, number][];
  distance: number; // meters
  duration: number; // seconds
  safetyScore: number; // 0-100
  lightingScore: number; // 0-100
  crimeRiskScore: number; // 0-100
  steps: RouteStep[];
  polyline: string;
  summary: string;
  waypoints?: LocationData[];
}

export interface RouteAlternative {
  route: Route;
  reason: string;
  tradeoffs: {
    time: number;
    safety: number;
    distance: number;
  };
}

export interface TrafficData {
  congestionLevel: 'low' | 'medium' | 'high';
  delaySeconds: number;
  incidents: Array<{
    type: string;
    location: LocationData;
    severity: string;
  }>;
}

export interface WeatherImpact {
  condition: string;
  impact: 'none' | 'light' | 'moderate' | 'severe';
  reducedVisibility: boolean;
  slipperyRoads: boolean;
  recommendation: string;
}

class RoutingService {
  private mapboxToken: string;
  private googleMapsKey: string;
  private cacheTTL: number = 300; // 5 minutes

  constructor() {
    this.mapboxToken = process.env.MAPBOX_ACCESS_TOKEN || '';
    this.googleMapsKey = process.env.GOOGLE_MAPS_API_KEY || '';
  }

  /**
   * Get shortest/fastest route
   */
  async getShortestRoute(request: RouteRequest): Promise<Route> {
    const cacheKey = this.generateCacheKey('shortest', request);
    const cached = await redisClient.get(cacheKey);
    
    if (cached) {
      logger.debug('Returning cached shortest route');
      return JSON.parse(cached);
    }

    // Get base route from Mapbox
    const route = await this.getMapboxRoute(request.start, request.end, request.waypoints);
    
    // Enhance with safety scoring
    const safetyScore = await this.calculateRouteSafety(route.coordinates);
    const crimeRiskScore = 100 - safetyScore;
    
    // Get traffic data
    const traffic = await this.getTrafficData(route.coordinates);
    
    // Adjust duration for traffic
    const adjustedDuration = route.duration + traffic.delaySeconds;
    
    const result: Route = {
      ...route,
      type: 'fastest',
      safetyScore,
      crimeRiskScore,
      lightingScore: 70, // Default moderate lighting
      duration: adjustedDuration,
      steps: await this.generateRouteSteps(route.coordinates, route.distance, 'fastest'),
      summary: this.generateRouteSummary(route.distance, adjustedDuration, safetyScore),
    };
    
    // Cache the result
    await redisClient.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
    
    return result;
  }

  /**
   * Get safest route based on crime data
   */
  async getSafestRoute(request: RouteRequest): Promise<Route> {
    const cacheKey = this.generateCacheKey('safest', request);
    const cached = await redisClient.get(cacheKey);
    
    if (cached) {
      logger.debug('Returning cached safest route');
      return JSON.parse(cached);
    }

    // Get multiple route alternatives
    const alternatives = await this.getRouteAlternatives(request.start, request.end, request.waypoints);
    
    // Calculate safety score for each alternative
    const routesWithSafety = await Promise.all(
      alternatives.map(async (route) => ({
        route,
        safetyScore: await this.calculateRouteSafety(route.coordinates),
        crimeRisk: await this.calculateCrimeRisk(route.coordinates),
      }))
    );
    
    // Select safest route
    const safest = routesWithSafety.reduce((prev, current) => 
      prev.safetyScore > current.safetyScore ? prev : current
    );
    
    // Get lighting score for the route
    const lightingScore = await this.calculateRouteLighting(safest.route.coordinates);
    
    // Generate detailed steps with safety warnings
    const steps = await this.generateSafeRouteSteps(
      safest.route.coordinates,
      safest.route.distance,
      safest.crimeRisk
    );
    
    const result: Route = {
      id: safest.route.id,
      type: 'safest',
      coordinates: safest.route.coordinates,
      distance: safest.route.distance,
      duration: safest.route.duration,
      safetyScore: safest.safetyScore,
      crimeRiskScore: safest.crimeRisk,
      lightingScore,
      steps,
      polyline: safest.route.polyline,
      summary: this.generateRouteSummary(safest.route.distance, safest.route.duration, safest.safetyScore),
      waypoints: request.waypoints,
    };
    
    // Cache the result
    await redisClient.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
    
    return result;
  }

  /**
   * Get well-lit route (optimal for night time)
   */
  async getLitStreetRoute(request: RouteRequest): Promise<Route> {
    const cacheKey = this.generateCacheKey('lit', request);
    const cached = await redisClient.get(cacheKey);
    
    if (cached) {
      logger.debug('Returning cached lit route');
      return JSON.parse(cached);
    }

    // Get base route
    const baseRoute = await this.getMapboxRoute(request.start, request.end, request.waypoints);
    
    // Adjust for lighting preference
    const lightingScore = await this.calculateRouteLighting(baseRoute.coordinates);
    
    // Re-route if lighting score is too low
    let finalRoute = baseRoute;
    if (lightingScore < 50) {
      const litAlternatives = await this.getLitAlternatives(request.start, request.end);
      if (litAlternatives.length > 0) {
        finalRoute = litAlternatives[0];
      }
    }
    
    const safetyScore = await this.calculateRouteSafety(finalRoute.coordinates);
    const weatherImpact = await this.getWeatherImpact(finalRoute.coordinates);
    
    // Adjust duration for weather
    let duration = finalRoute.duration;
    if (weatherImpact.impact === 'moderate') duration *= 1.1;
    if (weatherImpact.impact === 'severe') duration *= 1.2;
    
    const result: Route = {
      id: finalRoute.id,
      type: 'lit',
      coordinates: finalRoute.coordinates,
      distance: finalRoute.distance,
      duration,
      safetyScore,
      crimeRiskScore: 100 - safetyScore,
      lightingScore: await this.calculateRouteLighting(finalRoute.coordinates),
      steps: await this.generateRouteSteps(finalRoute.coordinates, finalRoute.distance, 'lit'),
      polyline: finalRoute.polyline,
      summary: this.generateRouteSummary(finalRoute.distance, duration, safetyScore),
      waypoints: request.waypoints,
    };
    
    // Cache the result
    await redisClient.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
    
    return result;
  }

  /**
   * Re-route from current location
   */
  async reroute(
    currentLocation: LocationData,
    destination: LocationData,
    originalRoute: Route
  ): Promise<Route> {
    logger.info(`Rerouting from ${currentLocation.lat},${currentLocation.lng} to destination`);
    
    // Calculate new route from current location
    const newRoute = await this.getSafestRoute({
      start: currentLocation,
      end: destination,
      preferences: ['safe'],
    });
    
    // Store reroute event
    await this.storeRerouteEvent(currentLocation, destination, originalRoute.id, newRoute.id);
    
    return newRoute;
  }

  /**
   * Get safe refuges along a route
   */
  async getRefugesAlongRoute(
    route: Route,
    maxDetour: number = 200 // meters
  ): Promise<Array<{
    refuge: any;
    distanceFromRoute: number;
    detourDistance: number;
    estimatedTime: number;
  }>> {
    const result = await query(
      `SELECT 
        r.*,
        ST_Distance(r.location::geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance,
        ST_LineLocatePoint($3::geometry, r.location::geometry) as location_ratio
       FROM refuges r
       WHERE ST_DWithin(
         r.location::geometry,
         $3::geometry,
         $4
       )
       ORDER BY distance
       LIMIT 20`,
      [route.coordinates[0][0], route.coordinates[0][1], route.polyline, maxDetour * 2]
    );
    
    return result.rows.map(row => ({
      refuge: row,
      distanceFromRoute: row.distance,
      detourDistance: row.distance * 2, // Approximate round trip
      estimatedTime: Math.ceil(row.distance / 1.4), // Walking speed 1.4 m/s
    }));
  }

  /**
   * Get route from Mapbox API
   */
  private async getMapboxRoute(
    start: LocationData,
    end: LocationData,
    waypoints?: LocationData[]
  ): Promise<any> {
    if (!this.mapboxToken) {
      throw new Error('Mapbox token not configured');
    }

    const coordinates = [
      `${start.lng},${start.lat}`,
      ...(waypoints?.map(wp => `${wp.lng},${wp.lat}`) || []),
      `${end.lng},${end.lat}`,
    ].join(';');

    const response = await axios.get(
      `https://api.mapbox.com/directions/v5/mapbox/walking/${coordinates}`,
      {
        params: {
          access_token: this.mapboxToken,
          geometries: 'geojson',
          steps: true,
          alternatives: true,
          overview: 'full',
          annotations: 'duration,distance,speed',
        },
        timeout: 10000,
      }
    );

    if (!response.data.routes || response.data.routes.length === 0) {
      throw new Error('No route found');
    }

    const route = response.data.routes[0];
    
    return {
      id: `route_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      coordinates: route.geometry.coordinates.map((coord: [number, number]) => [coord[0], coord[1]]),
      distance: route.distance,
      duration: route.duration,
      polyline: JSON.stringify(route.geometry),
      raw: route,
    };
  }

  /**
   * Get route alternatives
   */
  private async getRouteAlternatives(
    start: LocationData,
    end: LocationData,
    waypoints?: LocationData[]
  ): Promise<any[]> {
    const coordinates = [
      `${start.lng},${start.lat}`,
      ...(waypoints?.map(wp => `${wp.lng},${wp.lat}`) || []),
      `${end.lng},${end.lat}`,
    ].join(';');

    const response = await axios.get(
      `https://api.mapbox.com/directions/v5/mapbox/walking/${coordinates}`,
      {
        params: {
          access_token: this.mapboxToken,
          geometries: 'geojson',
          steps: true,
          alternatives: true,
          overview: 'full',
        },
        timeout: 10000,
      }
    );

    return response.data.routes.map((route: any, index: number) => ({
      id: `route_alt_${index}_${Date.now()}`,
      coordinates: route.geometry.coordinates.map((coord: [number, number]) => [coord[0], coord[1]]),
      distance: route.distance,
      duration: route.duration,
      polyline: JSON.stringify(route.geometry),
    }));
  }

  /**
   * Get lit route alternatives (prioritize well-lit streets)
   */
  private async getLitAlternatives(start: LocationData, end: LocationData): Promise<any[]> {
    // Use Mapbox with custom profile that prefers lit streets
    // In production, you'd have a custom routing profile
    return this.getRouteAlternatives(start, end);
  }

  /**
   * Calculate safety score for a route
   */
  private async calculateRouteSafety(coordinates: [number, number][]): Promise<number> {
    let totalRisk = 0;
    let sampledPoints = 0;
    
    // Sample points along the route (every 100 meters)
    const sampleInterval = 100; // meters
    let accumulatedDistance = 0;
    let lastPoint = coordinates[0];
    
    for (let i = 1; i < coordinates.length; i++) {
      const point = coordinates[i];
      const distance = this.calculateDistance(
        lastPoint[1], lastPoint[0],
        point[1], point[0]
      );
      
      accumulatedDistance += distance;
      
      if (accumulatedDistance >= sampleInterval) {
        // Get risk score for this point
        const prediction = await crimePredictionService.predictRisk(point[1], point[0]);
        totalRisk += prediction.riskScore;
        sampledPoints++;
        accumulatedDistance = 0;
      }
      
      lastPoint = point;
    }
    
    // Average risk score, inverted to get safety score (0-100, higher is safer)
    const avgRisk = sampledPoints > 0 ? totalRisk / sampledPoints : 50;
    const safetyScore = Math.max(0, Math.min(100, 100 - avgRisk));
    
    return Math.round(safetyScore);
  }

  /**
   * Calculate crime risk for a route
   */
  private async calculateCrimeRisk(coordinates: [number, number][]): Promise<number> {
    let totalRisk = 0;
    let sampledPoints = 0;
    
    const sampleInterval = 200; // meters
    let accumulatedDistance = 0;
    let lastPoint = coordinates[0];
    
    for (let i = 1; i < coordinates.length; i++) {
      const point = coordinates[i];
      const distance = this.calculateDistance(
        lastPoint[1], lastPoint[0],
        point[1], point[0]
      );
      
      accumulatedDistance += distance;
      
      if (accumulatedDistance >= sampleInterval) {
        const prediction = await crimePredictionService.predictRisk(point[1], point[0]);
        totalRisk += prediction.riskScore;
        sampledPoints++;
        accumulatedDistance = 0;
      }
      
      lastPoint = point;
    }
    
    const avgRisk = sampledPoints > 0 ? totalRisk / sampledPoints : 50;
    return Math.round(avgRisk);
  }

  /**
   * Calculate lighting score for a route
   */
  private async calculateRouteLighting(coordinates: [number, number][]): Promise<number> {
    // In production, query street lighting database
    // For now, return score based on area type
    let totalLighting = 0;
    
    for (const coord of coordinates) {
      // Simulate lighting score based on location
      // City centers have better lighting
      const distanceToCenter = this.calculateDistance(
        coord[1], coord[0],
        40.7128, -74.0060 // NYC center
      );
      
      let lighting = 100;
      if (distanceToCenter > 5000) lighting = 60;
      if (distanceToCenter > 10000) lighting = 40;
      if (distanceToCenter > 20000) lighting = 20;
      
      totalLighting += lighting;
    }
    
    const avgLighting = coordinates.length > 0 ? totalLighting / coordinates.length : 50;
    return Math.round(avgLighting);
  }

  /**
   * Get traffic data for route
   */
  private async getTrafficData(coordinates: [number, number][]): Promise<TrafficData> {
    // In production, use Google Maps Traffic API or similar
    // For now, return mock data
    return {
      congestionLevel: 'low',
      delaySeconds: 0,
      incidents: [],
    };
  }

  /**
   * Get weather impact for route
   */
  private async getWeatherImpact(coordinates: [number, number][]): Promise<WeatherImpact> {
    // In production, use weather API
    // For now, return default
    return {
      condition: 'clear',
      impact: 'none',
      reducedVisibility: false,
      slipperyRoads: false,
      recommendation: 'No weather concerns',
    };
  }

  /**
   * Generate route steps
   */
  private async generateRouteSteps(
    coordinates: [number, number][],
    totalDistance: number,
    routeType: string
  ): Promise<RouteStep[]> {
    const steps: RouteStep[] = [];
    let accumulatedDistance = 0;
    let stepCount = 0;
    
    // Generate turns at key points
    const turnThreshold = 50; // meters
    
    for (let i = 1; i < coordinates.length; i++) {
      const prev = coordinates[i - 1];
      const curr = coordinates[i];
      const distance = this.calculateDistance(prev[1], prev[0], curr[1], curr[0]);
      accumulatedDistance += distance;
      
      // Determine if this is a turn
      if (i < coordinates.length - 1) {
        const next = coordinates[i + 1];
        const bearing1 = this.calculateBearing(prev[1], prev[0], curr[1], curr[0]);
        const bearing2 = this.calculateBearing(curr[1], curr[0], next[1], next[0]);
        const angle = Math.abs(bearing2 - bearing1);
        
        if (angle > 20 && accumulatedDistance >= turnThreshold) {
          let maneuver: RouteStep['maneuver'] = 'straight';
          if (angle > 20 && angle < 60) maneuver = 'slight-left';
          else if (angle >= 60 && angle < 120) maneuver = 'turn-left';
          else if (angle >= 120) maneuver = 'sharp-left';
          
          if (bearing2 > bearing1) {
            maneuver = maneuver.replace('left', 'right') as any;
          }
          
          steps.push({
            instruction: this.getTurnInstruction(maneuver),
            distance: accumulatedDistance,
            duration: Math.ceil(accumulatedDistance / 1.4),
            startLocation: { lat: prev[1], lng: prev[0], timestamp: Date.now() },
            endLocation: { lat: curr[1], lng: curr[0], timestamp: Date.now() },
            maneuver,
            ...(routeType === 'safest' && {
              safetyWarning: await this.getStepSafetyWarning(curr[1], curr[0]),
            }),
          });
          
          accumulatedDistance = 0;
          stepCount++;
        }
      }
    }
    
    // Add final arrival step
    const lastCoord = coordinates[coordinates.length - 1];
    steps.push({
      instruction: 'You have arrived at your destination',
      distance: accumulatedDistance,
      duration: Math.ceil(accumulatedDistance / 1.4),
      startLocation: { lat: coordinates[coordinates.length - 2][1], lng: coordinates[coordinates.length - 2][0], timestamp: Date.now() },
      endLocation: { lat: lastCoord[1], lng: lastCoord[0], timestamp: Date.now() },
      maneuver: 'straight',
    });
    
    return steps;
  }

  /**
   * Generate safe route steps with warnings
   */
  private async generateSafeRouteSteps(
    coordinates: [number, number][],
    totalDistance: number,
    crimeRisk: number
  ): Promise<RouteStep[]> {
    const steps = await this.generateRouteSteps(coordinates, totalDistance, 'safest');
    
    // Add safety warnings to steps in high-risk areas
    for (let i = 0; i < steps.length; i++) {
      const risk = await crimePredictionService.predictRisk(
        steps[i].endLocation.lat,
        steps[i].endLocation.lng
      );
      
      if (risk.riskScore > 60) {
        steps[i].safetyWarning = `⚠️ High risk area ahead. Stay alert. ${risk.crimeTypes[0]} reported nearby.`;
        steps[i].crimeRisk = risk.riskScore;
      }
    }
    
    return steps;
  }

  /**
   * Get safety warning for a step
   */
  private async getStepSafetyWarning(lat: number, lng: number): Promise<string | undefined> {
    const risk = await crimePredictionService.predictRisk(lat, lng);
    
    if (risk.riskScore > 70) {
      return `⚠️ ${risk.crimeTypes[0]} risk in this area. Consider alternative route.`;
    }
    if (risk.riskScore > 50) {
      return `⚠️ Caution: ${risk.crimeTypes[0]} reported nearby. Stay aware.`;
    }
    return undefined;
  }

  /**
   * Get turn instruction text
   */
  private getTurnInstruction(maneuver: RouteStep['maneuver']): string {
    const instructions: Record<RouteStep['maneuver'], string> = {
      'straight': 'Continue straight',
      'turn-left': 'Turn left',
      'turn-right': 'Turn right',
      'slight-left': 'Bear left',
      'slight-right': 'Bear right',
      'sharp-left': 'Make a sharp left turn',
      'sharp-right': 'Make a sharp right turn',
      'u-turn': 'Make a U-turn',
    };
    return instructions[maneuver];
  }

  /**
   * Generate route summary
   */
  private generateRouteSummary(distance: number, duration: number, safetyScore: number): string {
    const distanceKm = (distance / 1000).toFixed(1);
    const minutes = Math.round(duration / 60);
    
    let safetyText = '';
    if (safetyScore >= 80) safetyText = 'This is a very safe route.';
    else if (safetyScore >= 60) safetyText = 'This route has good safety ratings.';
    else if (safetyScore >= 40) safetyText = 'Caution advised on this route.';
    else safetyText = '⚠️ Warning: This route has safety concerns.';
    
    return `${distanceKm} km, ${minutes} min walk. ${safetyText}`;
  }

  /**
   * Store reroute event in database
   */
  private async storeRerouteEvent(
    currentLocation: LocationData,
    destination: LocationData,
    originalRouteId: string,
    newRouteId: string
  ): Promise<void> {
    await query(
      `INSERT INTO route_deviations (user_id, route_id, deviation_distance, location, created_at)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, NOW())`,
      ['system', originalRouteId, 0, currentLocation.lng, currentLocation.lat]
    );
    
    logger.info(`Reroute event stored: ${originalRouteId} -> ${newRouteId}`);
  }

  /**
   * Calculate distance between coordinates (Haversine formula)
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
   * Calculate bearing between coordinates
   */
  private calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const λ1 = (lng1 * Math.PI) / 180;
    const λ2 = (lng2 * Math.PI) / 180;
    
    const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
              Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
    const θ = Math.atan2(y, x);
    const bearing = (θ * 180 / Math.PI + 360) % 360;
    
    return bearing;
  }

  /**
   * Generate cache key for route
   */
  private generateCacheKey(type: string, request: RouteRequest): string {
    return `route:${type}:${request.start.lat.toFixed(4)},${request.start.lng.toFixed(4)}:${request.end.lat.toFixed(4)},${request.end.lng.toFixed(4)}:${request.preferences?.join(',') || 'default'}`;
  }

  /**
   * Save route to database
   */
  async saveRoute(userId: string, route: Route): Promise<void> {
    await query(
      `INSERT INTO routes (user_id, path, start_point, end_point, distance_meters, duration_seconds, risk_score, lighting_score, route_type, created_at)
       VALUES ($1, ST_SetSRID(ST_MakeLine(array_agg(point)), 4326)::geography, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        userId,
        `POINT(${route.coordinates[0][0]} ${route.coordinates[0][1]})`,
        `POINT(${route.coordinates[route.coordinates.length - 1][0]} ${route.coordinates[route.coordinates.length - 1][1]})`,
        route.distance,
        route.duration,
        route.crimeRiskScore,
        route.lightingScore,
        route.type,
      ]
    );
    
    logger.info(`Route saved for user ${userId}`);
  }

  /**
   * Get route history for user
   */
  async getRouteHistory(userId: string, limit: number = 10): Promise<Route[]> {
    const result = await query(
      `SELECT * FROM routes 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [userId, limit]
    );
    
    return result.rows;
  }
}

// Export singleton instance
export const routingService = new RoutingService();
export default routingService;
