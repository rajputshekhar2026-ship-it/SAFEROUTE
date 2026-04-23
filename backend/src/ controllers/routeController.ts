// src/controllers/routeController.ts

import { Request, Response } from 'express';
import { query } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';
import { routingService } from '../services/routingService';
import { crimePredictionService } from '../services/crimePredictionService';
import { geocodingService } from '../services/geocodingService';
import { LocationData } from '../types';

// Types
interface RouteRequest {
  start: {
    lat: number;
    lng: number;
    address?: string;
  };
  end: {
    lat: number;
    lng: number;
    address?: string;
  };
  waypoints?: Array<{ lat: number; lng: number }>;
  preferences?: ('safe' | 'fast' | 'lit')[];
  avoidHighCrime?: boolean;
  prioritizeLighting?: boolean;
  includeRefuges?: boolean;
}

interface SaveRouteBody {
  routeId: string;
  name?: string;
}

export class RouteController {
  /**
   * Get shortest/fastest route
   */
  async getShortestRoute(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { start, end, waypoints, preferences }: RouteRequest = req.body;

      if (!start || !end || !start.lat || !start.lng || !end.lat || !end.lng) {
        res.status(400).json({ error: 'Start and end locations are required' });
        return;
      }

      const route = await routingService.getShortestRoute({
        start: { lat: start.lat, lng: start.lng, timestamp: Date.now() },
        end: { lat: end.lat, lng: end.lng, timestamp: Date.now() },
        waypoints: waypoints?.map(wp => ({ lat: wp.lat, lng: wp.lng, timestamp: Date.now() })),
        preferences: preferences || ['fast'],
      });

      // Get refuges along route if requested
      let refuges = [];
      if (req.query.includeRefuges === 'true') {
        refuges = await routingService.getRefugesAlongRoute(route, 200);
      }

      res.json({
        route,
        refuges: refuges.slice(0, 10),
        summary: {
          distance: route.distance,
          duration: route.duration,
          safetyScore: route.safetyScore,
          crimeRisk: route.crimeRiskScore,
        },
      });
    } catch (error) {
      logger.error('Get shortest route error:', error);
      res.status(500).json({ error: 'Failed to calculate route' });
    }
  }

  /**
   * Get safest route based on crime data
   */
  async getSafestRoute(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { start, end, waypoints, avoidHighCrime = true }: RouteRequest = req.body;

      if (!start || !end || !start.lat || !start.lng || !end.lat || !end.lng) {
        res.status(400).json({ error: 'Start and end locations are required' });
        return;
      }

      const route = await routingService.getSafestRoute({
        start: { lat: start.lat, lng: start.lng, timestamp: Date.now() },
        end: { lat: end.lat, lng: end.lng, timestamp: Date.now() },
        waypoints: waypoints?.map(wp => ({ lat: wp.lat, lng: wp.lng, timestamp: Date.now() })),
        preferences: ['safe'],
        avoidHighCrime,
      });

      // Get risk assessment for key points
      const riskAssessment = await this.getRouteRiskAssessment(route.coordinates);

      // Get safe refuges along route
      const refuges = await routingService.getRefugesAlongRoute(route, 200);

      res.json({
        route,
        riskAssessment,
        refuges: refuges.slice(0, 10),
        summary: {
          distance: route.distance,
          duration: route.duration,
          safetyScore: route.safetyScore,
          crimeRisk: route.crimeRiskScore,
          lightingScore: route.lightingScore,
        },
      });
    } catch (error) {
      logger.error('Get safest route error:', error);
      res.status(500).json({ error: 'Failed to calculate safest route' });
    }
  }

  /**
   * Get well-lit route (optimal for night time)
   */
  async getLitStreetRoute(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { start, end, waypoints, prioritizeLighting = true }: RouteRequest = req.body;

      if (!start || !end || !start.lat || !start.lng || !end.lat || !end.lng) {
        res.status(400).json({ error: 'Start and end locations are required' });
        return;
      }

      const route = await routingService.getLitStreetRoute({
        start: { lat: start.lat, lng: start.lng, timestamp: Date.now() },
        end: { lat: end.lat, lng: end.lng, timestamp: Date.now() },
        waypoints: waypoints?.map(wp => ({ lat: wp.lat, lng: wp.lng, timestamp: Date.now() })),
        preferences: ['lit'],
        prioritizeLighting,
      });

      // Get lighting assessment
      const lightingAssessment = await this.getLightingAssessment(route.coordinates);

      res.json({
        route,
        lightingAssessment,
        summary: {
          distance: route.distance,
          duration: route.duration,
          lightingScore: route.lightingScore,
          safetyScore: route.safetyScore,
        },
      });
    } catch (error) {
      logger.error('Get lit street route error:', error);
      res.status(500).json({ error: 'Failed to calculate well-lit route' });
    }
  }

  /**
   * Get route alternatives for comparison
   */
  async getRouteAlternatives(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { start, end } = req.body;

      if (!start || !end || !start.lat || !start.lng || !end.lat || !end.lng) {
        res.status(400).json({ error: 'Start and end locations are required' });
        return;
      }

      const startLoc: LocationData = { lat: start.lat, lng: start.lng, timestamp: Date.now() };
      const endLoc: LocationData = { lat: end.lat, lng: end.lng, timestamp: Date.now() };

      // Get three route options
      const [fastest, safest, lit] = await Promise.all([
        routingService.getShortestRoute({ start: startLoc, end: endLoc, preferences: ['fast'] }),
        routingService.getSafestRoute({ start: startLoc, end: endLoc, preferences: ['safe'] }),
        routingService.getLitStreetRoute({ start: startLoc, end: endLoc, preferences: ['lit'] }),
      ]);

      res.json({
        alternatives: [
          {
            type: 'fastest',
            route: fastest,
            summary: {
              distance: fastest.distance,
              duration: fastest.duration,
              safetyScore: fastest.safetyScore,
            },
            pros: ['Fastest arrival time', 'Most direct path'],
            cons: ['May pass through higher risk areas', 'Less lighting'],
          },
          {
            type: 'safest',
            route: safest,
            summary: {
              distance: safest.distance,
              duration: safest.duration,
              safetyScore: safest.safetyScore,
            },
            pros: ['Lowest crime risk', 'Passes safe refuges'],
            cons: ['Longer duration', 'May be longer distance'],
          },
          {
            type: 'lit',
            route: lit,
            summary: {
              distance: lit.distance,
              duration: lit.duration,
              lightingScore: lit.lightingScore,
            },
            pros: ['Best lighting', 'Better for night travel'],
            cons: ['May be longer', 'Limited to main streets'],
          },
        ],
        recommendation: this.getRouteRecommendation(fastest, safest, lit),
      });
    } catch (error) {
      logger.error('Get route alternatives error:', error);
      res.status(500).json({ error: 'Failed to get route alternatives' });
    }
  }

  /**
   * Re-route from current location
   */
  async reroute(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { currentLocation, destination, originalRouteId } = req.body;

      if (!currentLocation || !destination) {
        res.status(400).json({ error: 'Current location and destination are required' });
        return;
      }

      // Get original route
      const originalRoute = await query(
        'SELECT * FROM routes WHERE id = $1 AND user_id = $2',
        [originalRouteId, req.user?.id]
      );

      const newRoute = await routingService.reroute(
        { lat: currentLocation.lat, lng: currentLocation.lng, timestamp: Date.now() },
        { lat: destination.lat, lng: destination.lng, timestamp: Date.now() },
        originalRoute.rows[0]
      );

      // Calculate deviation
      const deviation = await this.calculateDeviation(
        { lat: currentLocation.lat, lng: currentLocation.lng },
        originalRoute.rows[0]?.path
      );

      res.json({
        route: newRoute,
        deviation: {
          distance: deviation,
          message: deviation > 50 
            ? 'Significant route deviation detected. New safer route calculated.'
            : 'Minor deviation. Route adjusted for safety.',
        },
      });
    } catch (error) {
      logger.error('Reroute error:', error);
      res.status(500).json({ error: 'Failed to reroute' });
    }
  }

  /**
   * Get safe refuges along route
   */
  async getRefugesAlongRoute(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { routeId } = req.params;
      const { maxDetour = 200 } = req.query;

      const route = await query(
        'SELECT * FROM routes WHERE id = $1',
        [routeId]
      );

      if (route.rows.length === 0) {
        res.status(404).json({ error: 'Route not found' });
        return;
      }

      const refuges = await routingService.getRefugesAlongRoute(route.rows[0], Number(maxDetour));

      res.json({
        refuges: refuges,
        total: refuges.length,
      });
    } catch (error) {
      logger.error('Get refuges along route error:', error);
      res.status(500).json({ error: 'Failed to get refuges' });
    }
  }

  /**
   * Save route to history
   */
  async saveRoute(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { routeId, name }: SaveRouteBody = req.body;
      const userId = req.user!.id;

      // Get route from cache or calculate
      const cachedRoute = await redisClient.get(`route:${routeId}`);
      if (!cachedRoute) {
        res.status(404).json({ error: 'Route not found' });
        return;
      }

      const route = JSON.parse(cachedRoute);
      
      await routingService.saveRoute(userId, route);

      // Save custom name if provided
      if (name) {
        await query(
          'UPDATE routes SET name = $1 WHERE user_id = $2 AND id = $3',
          [name, userId, routeId]
        );
      }

      logger.info(`Route ${routeId} saved for user ${userId}`);

      res.json({ message: 'Route saved successfully' });
    } catch (error) {
      logger.error('Save route error:', error);
      res.status(500).json({ error: 'Failed to save route' });
    }
  }

  /**
   * Get saved routes history
   */
  async getSavedRoutes(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { limit = 50, offset = 0 } = req.query;

      const routes = await query(
        `SELECT r.*, 
                ST_X(r.start_point::geometry) as start_lng,
                ST_Y(r.start_point::geometry) as start_lat,
                ST_X(r.end_point::geometry) as end_lng,
                ST_Y(r.end_point::geometry) as end_lat
         FROM routes r
         WHERE r.user_id = $1
         ORDER BY r.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      const count = await query(
        'SELECT COUNT(*) as total FROM routes WHERE user_id = $1',
        [userId]
      );

      res.json({
        routes: routes.rows,
        pagination: {
          total: parseInt(count.rows[0].total),
          limit: Number(limit),
          offset: Number(offset),
        },
      });
    } catch (error) {
      logger.error('Get saved routes error:', error);
      res.status(500).json({ error: 'Failed to get saved routes' });
    }
  }

  /**
   * Get route details by ID
   */
  async getRouteDetails(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const route = await query(
        `SELECT r.*, 
                ST_X(r.start_point::geometry) as start_lng,
                ST_Y(r.start_point::geometry) as start_lat,
                ST_X(r.end_point::geometry) as end_lng,
                ST_Y(r.end_point::geometry) as end_lat
         FROM routes r
         WHERE r.id = $1 AND r.user_id = $2`,
        [id, userId]
      );

      if (route.rows.length === 0) {
        res.status(404).json({ error: 'Route not found' });
        return;
      }

      res.json({ route: route.rows[0] });
    } catch (error) {
      logger.error('Get route details error:', error);
      res.status(500).json({ error: 'Failed to get route details' });
    }
  }

  /**
   * Delete saved route
   */
  async deleteRoute(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const result = await query(
        'DELETE FROM routes WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, userId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Route not found' });
        return;
      }

      logger.info(`Route ${id} deleted for user ${userId}`);

      res.json({ message: 'Route deleted successfully' });
    } catch (error) {
      logger.error('Delete route error:', error);
      res.status(500).json({ error: 'Failed to delete route' });
    }
  }

  /**
   * Get route risk assessment
   */
  private async getRouteRiskAssessment(coordinates: [number, number][]): Promise<any> {
    const riskPoints = [];
    const sampleInterval = Math.max(1, Math.floor(coordinates.length / 10));

    for (let i = 0; i < coordinates.length; i += sampleInterval) {
      const coord = coordinates[i];
      const risk = await crimePredictionService.predictRisk(coord[1], coord[0]);
      riskPoints.push({
        location: { lat: coord[1], lng: coord[0] },
        risk: risk,
      });
    }

    const highRiskPoints = riskPoints.filter(p => p.risk.riskScore > 70);
    const maxRisk = Math.max(...riskPoints.map(p => p.risk.riskScore));
    const avgRisk = riskPoints.reduce((sum, p) => sum + p.risk.riskScore, 0) / riskPoints.length;

    return {
      averageRisk: Math.round(avgRisk),
      maxRisk: Math.round(maxRisk),
      highRiskPoints: highRiskPoints.length,
      riskPoints: highRiskPoints.slice(0, 5), // Return top 5 high-risk points
      recommendation: maxRisk > 80 
        ? 'High risk areas detected. Consider alternative route.'
        : maxRisk > 60
        ? 'Some moderate risk areas. Stay alert.'
        : 'Generally safe route.',
    };
  }

  /**
   * Get lighting assessment for route
   */
  private async getLightingAssessment(coordinates: [number, number][]): Promise<any> {
    // In production, query lighting database
    // For now, return simulated assessment
    const avgLighting = 65;
    
    return {
      averageScore: avgLighting,
      wellLitPercentage: 60,
      poorlyLitPercentage: 20,
      recommendation: avgLighting < 50
        ? 'Poor lighting on this route. Consider alternative for night travel.'
        : 'Acceptable lighting conditions.',
    };
  }

  /**
   * Calculate deviation from planned route
   */
  private async calculateDeviation(
    currentLocation: { lat: number; lng: number },
    plannedPath: any
  ): Promise<number> {
    if (!plannedPath) return 0;

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
   * Get route recommendation based on time of day
   */
  private getRouteRecommendation(fastest: any, safest: any, lit: any): any {
    const currentHour = new Date().getHours();
    const isNight = currentHour < 6 || currentHour > 18;
    
    if (isNight) {
      return {
        recommended: 'lit',
        reason: 'Night travel - well-lit route recommended for safety',
        alternative: 'safest',
      };
    }
    
    // During day, prefer safest if not too long
    const timeDifference = safest.duration - fastest.duration;
    if (timeDifference < 300) { // Less than 5 minutes difference
      return {
        recommended: 'safest',
        reason: 'Safest route with minimal time difference',
        alternative: 'fastest',
      };
    }
    
    return {
      recommended: 'fastest',
      reason: 'Fastest route with acceptable safety rating',
      alternative: 'safest',
    };
  }
}

export default new RouteController();
