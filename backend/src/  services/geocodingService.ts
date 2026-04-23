// src/services/geocodingService.ts

import axios from 'axios';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { LocationData } from '../types';

// Types
export interface GeocodingResult {
  formattedAddress: string;
  streetNumber?: string;
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  neighborhood?: string;
  lat: number;
  lng: number;
  placeId?: string;
  confidence: number;
  accuracy: 'rooftop' | 'street' | 'interpolated' | 'approximate';
}

export interface ReverseGeocodingOptions {
  language?: string;
  limit?: number;
  types?: string[];
}

export interface AutocompleteResult {
  description: string;
  placeId: string;
  lat?: number;
  lng?: number;
  types: string[];
}

export interface GeocodingConfig {
  provider: 'google' | 'mapbox' | 'openstreetmap';
  apiKey?: string;
  cacheTTL: number;
}

class GeocodingService {
  private config: GeocodingConfig;
  private cacheTTL: number = 86400; // 24 hours default

  constructor() {
    this.config = {
      provider: (process.env.GEOCODING_PROVIDER as any) || 'google',
      apiKey: process.env.GOOGLE_MAPS_API_KEY || process.env.MAPBOX_ACCESS_TOKEN,
      cacheTTL: parseInt(process.env.GEOCODING_CACHE_TTL || '86400'),
    };
  }

  /**
   * Geocode an address to coordinates
   */
  async geocode(address: string, options?: ReverseGeocodingOptions): Promise<GeocodingResult | null> {
    try {
      // Check cache first
      const cacheKey = `geocode:${address.toLowerCase().trim()}`;
      const cached = await redisClient.get(cacheKey);
      
      if (cached) {
        logger.debug(`Returning cached geocoding result for: ${address}`);
        return JSON.parse(cached);
      }

      let result: GeocodingResult | null = null;

      switch (this.config.provider) {
        case 'google':
          result = await this.geocodeWithGoogle(address, options);
          break;
        case 'mapbox':
          result = await this.geocodeWithMapbox(address, options);
          break;
        case 'openstreetmap':
          result = await this.geocodeWithOSM(address, options);
          break;
        default:
          throw new Error(`Unknown geocoding provider: ${this.config.provider}`);
      }

      // Cache the result
      if (result) {
        await redisClient.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
      }

      return result;
    } catch (error) {
      logger.error('Geocoding error:', error);
      return null;
    }
  }

  /**
   * Reverse geocode coordinates to address
   */
  async reverseGeocode(
    lat: number,
    lng: number,
    options?: ReverseGeocodingOptions
  ): Promise<GeocodingResult | null> {
    try {
      // Check cache first
      const cacheKey = `reverse:${lat.toFixed(6)}:${lng.toFixed(6)}`;
      const cached = await redisClient.get(cacheKey);
      
      if (cached) {
        logger.debug(`Returning cached reverse geocoding result for: ${lat},${lng}`);
        return JSON.parse(cached);
      }

      let result: GeocodingResult | null = null;

      switch (this.config.provider) {
        case 'google':
          result = await this.reverseGeocodeWithGoogle(lat, lng, options);
          break;
        case 'mapbox':
          result = await this.reverseGeocodeWithMapbox(lat, lng, options);
          break;
        case 'openstreetmap':
          result = await this.reverseGeocodeWithOSM(lat, lng, options);
          break;
        default:
          throw new Error(`Unknown geocoding provider: ${this.config.provider}`);
      }

      // Cache the result
      if (result) {
        await redisClient.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
      }

      return result;
    } catch (error) {
      logger.error('Reverse geocoding error:', error);
      return null;
    }
  }

  /**
   * Geocode with Google Maps API
   */
  private async geocodeWithGoogle(
    address: string,
    options?: ReverseGeocodingOptions
  ): Promise<GeocodingResult | null> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw new Error('Google Maps API key not configured');
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address,
        key: apiKey,
        language: options?.language || 'en',
        limit: options?.limit || 1,
      },
      timeout: 5000,
    });

    if (response.data.status !== 'OK' || !response.data.results.length) {
      logger.warn(`Google geocoding failed for: ${address} - ${response.data.status}`);
      return null;
    }

    const result = response.data.results[0];
    return this.parseGoogleResult(result);
  }

  /**
   * Geocode with Mapbox API
   */
  private async geocodeWithMapbox(
    address: string,
    options?: ReverseGeocodingOptions
  ): Promise<GeocodingResult | null> {
    const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error('Mapbox access token not configured');
    }

    const encodedAddress = encodeURIComponent(address);
    const response = await axios.get(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json`,
      {
        params: {
          access_token: accessToken,
          language: options?.language || 'en',
          limit: options?.limit || 1,
          types: options?.types?.join(',') || 'address,poi',
        },
        timeout: 5000,
      }
    );

    if (!response.data.features || !response.data.features.length) {
      logger.warn(`Mapbox geocoding failed for: ${address}`);
      return null;
    }

    const result = response.data.features[0];
    return this.parseMapboxResult(result);
  }

  /**
   * Geocode with OpenStreetMap Nominatim
   */
  private async geocodeWithOSM(
    address: string,
    options?: ReverseGeocodingOptions
  ): Promise<GeocodingResult | null> {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: address,
        format: 'json',
        limit: options?.limit || 1,
        addressdetails: 1,
        'accept-language': options?.language || 'en',
      },
      headers: {
        'User-Agent': 'SafeRoute-App/1.0',
      },
      timeout: 5000,
    });

    if (!response.data || !response.data.length) {
      logger.warn(`OSM geocoding failed for: ${address}`);
      return null;
    }

    const result = response.data[0];
    return this.parseOSMResult(result);
  }

  /**
   * Reverse geocode with Google Maps API
   */
  private async reverseGeocodeWithGoogle(
    lat: number,
    lng: number,
    options?: ReverseGeocodingOptions
  ): Promise<GeocodingResult | null> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw new Error('Google Maps API key not configured');
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        latlng: `${lat},${lng}`,
        key: apiKey,
        language: options?.language || 'en',
        result_type: options?.types?.join('|'),
      },
      timeout: 5000,
    });

    if (response.data.status !== 'OK' || !response.data.results.length) {
      logger.warn(`Google reverse geocoding failed for: ${lat},${lng}`);
      return null;
    }

    const result = response.data.results[0];
    return this.parseGoogleResult(result);
  }

  /**
   * Reverse geocode with Mapbox API
   */
  private async reverseGeocodeWithMapbox(
    lat: number,
    lng: number,
    options?: ReverseGeocodingOptions
  ): Promise<GeocodingResult | null> {
    const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error('Mapbox access token not configured');
    }

    const response = await axios.get(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`,
      {
        params: {
          access_token: accessToken,
          language: options?.language || 'en',
          limit: 1,
          types: options?.types?.join(',') || 'address,poi',
        },
        timeout: 5000,
      }
    );

    if (!response.data.features || !response.data.features.length) {
      logger.warn(`Mapbox reverse geocoding failed for: ${lat},${lng}`);
      return null;
    }

    const result = response.data.features[0];
    return this.parseMapboxResult(result);
  }

  /**
   * Reverse geocode with OpenStreetMap Nominatim
   */
  private async reverseGeocodeWithOSM(
    lat: number,
    lng: number,
    options?: ReverseGeocodingOptions
  ): Promise<GeocodingResult | null> {
    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        lat,
        lon: lng,
        format: 'json',
        addressdetails: 1,
        'accept-language': options?.language || 'en',
      },
      headers: {
        'User-Agent': 'SafeRoute-App/1.0',
      },
      timeout: 5000,
    });

    if (!response.data || response.data.error) {
      logger.warn(`OSM reverse geocoding failed for: ${lat},${lng}`);
      return null;
    }

    return this.parseOSMResult(response.data);
  }

  /**
   * Parse Google Maps API result
   */
  private parseGoogleResult(data: any): GeocodingResult {
    const addressComponents: any = {};
    
    for (const component of data.address_components) {
      const types = component.types;
      if (types.includes('street_number')) addressComponents.streetNumber = component.long_name;
      if (types.includes('route')) addressComponents.street = component.long_name;
      if (types.includes('locality')) addressComponents.city = component.long_name;
      if (types.includes('administrative_area_level_1')) addressComponents.state = component.long_name;
      if (types.includes('country')) addressComponents.country = component.long_name;
      if (types.includes('postal_code')) addressComponents.postalCode = component.long_name;
      if (types.includes('neighborhood')) addressComponents.neighborhood = component.long_name;
    }

    let accuracy: GeocodingResult['accuracy'] = 'approximate';
    if (data.geometry.location_type === 'ROOFTOP') accuracy = 'rooftop';
    else if (data.geometry.location_type === 'RANGE_INTERPOLATED') accuracy = 'interpolated';
    else if (data.geometry.location_type === 'GEOMETRIC_CENTER') accuracy = 'street';

    return {
      formattedAddress: data.formatted_address,
      streetNumber: addressComponents.streetNumber,
      street: addressComponents.street,
      city: addressComponents.city,
      state: addressComponents.state,
      country: addressComponents.country,
      postalCode: addressComponents.postalCode,
      neighborhood: addressComponents.neighborhood,
      lat: data.geometry.location.lat,
      lng: data.geometry.location.lng,
      placeId: data.place_id,
      confidence: 0.9,
      accuracy,
    };
  }

  /**
   * Parse Mapbox API result
   */
  private parseMapboxResult(data: any): GeocodingResult {
    const address = data.properties?.address || '';
    const context = data.context || [];
    
    const city = context.find((c: any) => c.id.includes('place'))?.text;
    const state = context.find((c: any) => c.id.includes('region'))?.text;
    const country = context.find((c: any) => c.id.includes('country'))?.text;
    const postalCode = context.find((c: any) => c.id.includes('postcode'))?.text;

    return {
      formattedAddress: data.place_name,
      street: data.text,
      streetNumber: address,
      city,
      state,
      country,
      postalCode,
      lat: data.center[1],
      lng: data.center[0],
      placeId: data.id,
      confidence: data.relevance,
      accuracy: data.properties?.accuracy === 'rooftop' ? 'rooftop' : 'street',
    };
  }

  /**
   * Parse OpenStreetMap API result
   */
  private parseOSMResult(data: any): GeocodingResult {
    return {
      formattedAddress: data.display_name,
      streetNumber: data.address?.house_number,
      street: data.address?.road || data.address?.pedestrian,
      city: data.address?.city || data.address?.town || data.address?.village,
      state: data.address?.state,
      country: data.address?.country,
      postalCode: data.address?.postcode,
      neighborhood: data.address?.neighbourhood || data.address?.suburb,
      lat: parseFloat(data.lat),
      lng: parseFloat(data.lon),
      confidence: 0.8,
      accuracy: data.address?.house_number ? 'rooftop' : 'street',
    };
  }

  /**
   * Get address suggestions for autocomplete
   */
  async autocomplete(input: string, options?: {
    language?: string;
    limit?: number;
    types?: string[];
    location?: LocationData;
    radius?: number;
  }): Promise<AutocompleteResult[]> {
    try {
      const cacheKey = `autocomplete:${input.toLowerCase().trim()}`;
      const cached = await redisClient.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      let results: AutocompleteResult[] = [];

      switch (this.config.provider) {
        case 'google':
          results = await this.autocompleteWithGoogle(input, options);
          break;
        case 'mapbox':
          results = await this.autocompleteWithMapbox(input, options);
          break;
        case 'openstreetmap':
          results = await this.autocompleteWithOSM(input, options);
          break;
      }

      // Cache for shorter time (1 hour) as autocomplete is more dynamic
      await redisClient.setex(cacheKey, 3600, JSON.stringify(results));

      return results;
    } catch (error) {
      logger.error('Autocomplete error:', error);
      return [];
    }
  }

  /**
   * Autocomplete with Google Places API
   */
  private async autocompleteWithGoogle(
    input: string,
    options?: any
  ): Promise<AutocompleteResult[]> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return [];

    const response = await axios.get('https://maps.googleapis.com/maps/api/place/autocomplete/json', {
      params: {
        input,
        key: apiKey,
        language: options?.language || 'en',
        types: options?.types?.join('|') || 'geocode',
        location: options?.location ? `${options.location.lat},${options.location.lng}` : undefined,
        radius: options?.radius || 50000,
      },
      timeout: 5000,
    });

    if (response.data.status !== 'OK') return [];

    return response.data.predictions.map((prediction: any) => ({
      description: prediction.description,
      placeId: prediction.place_id,
      types: prediction.types,
    }));
  }

  /**
   * Autocomplete with Mapbox API
   */
  private async autocompleteWithMapbox(
    input: string,
    options?: any
  ): Promise<AutocompleteResult[]> {
    const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
    if (!accessToken) return [];

    const encodedInput = encodeURIComponent(input);
    const response = await axios.get(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedInput}.json`,
      {
        params: {
          access_token: accessToken,
          language: options?.language || 'en',
          limit: options?.limit || 5,
          types: options?.types?.join(',') || 'address,poi',
          proximity: options?.location ? `${options.location.lng},${options.location.lat}` : undefined,
        },
        timeout: 5000,
      }
    );

    if (!response.data.features) return [];

    return response.data.features.map((feature: any) => ({
      description: feature.place_name,
      placeId: feature.id,
      lat: feature.center[1],
      lng: feature.center[0],
      types: feature.types,
    }));
  }

  /**
   * Autocomplete with OpenStreetMap Nominatim
   */
  private async autocompleteWithOSM(
    input: string,
    options?: any
  ): Promise<AutocompleteResult[]> {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: input,
        format: 'json',
        limit: options?.limit || 5,
        addressdetails: 0,
        'accept-language': options?.language || 'en',
        'bounded': options?.location ? 1 : 0,
        'viewbox': options?.location ? 
          `${options.location.lng - 0.1},${options.location.lat - 0.1},${options.location.lng + 0.1},${options.location.lat + 0.1}` : 
          undefined,
      },
      headers: {
        'User-Agent': 'SafeRoute-App/1.0',
      },
      timeout: 5000,
    });

    if (!response.data) return [];

    return response.data.map((result: any) => ({
      description: result.display_name,
      placeId: result.place_id,
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      types: [result.type],
    }));
  }

  /**
   * Batch geocode multiple addresses
   */
  async batchGeocode(addresses: string[]): Promise<(GeocodingResult | null)[]> {
    const results = await Promise.all(addresses.map(addr => this.geocode(addr)));
    return results;
  }

  /**
   * Get timezone for coordinates
   */
  async getTimezone(lat: number, lng: number): Promise<string | null> {
    try {
      const cacheKey = `timezone:${lat.toFixed(4)}:${lng.toFixed(4)}`;
      const cached = await redisClient.get(cacheKey);
      
      if (cached) {
        return cached;
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return null;

      const timestamp = Math.floor(Date.now() / 1000);
      const response = await axios.get('https://maps.googleapis.com/maps/api/timezone/json', {
        params: {
          location: `${lat},${lng}`,
          timestamp,
          key: apiKey,
        },
        timeout: 5000,
      });

      if (response.data.status === 'OK') {
        const timezone = response.data.timeZoneId;
        await redisClient.setex(cacheKey, 86400, timezone);
        return timezone;
      }

      return null;
    } catch (error) {
      logger.error('Timezone lookup error:', error);
      return null;
    }
  }

  /**
   * Validate if coordinates are within service area
   */
  async isWithinServiceArea(lat: number, lng: number): Promise<boolean> {
    // Check if coordinates are within supported regions
    // Could be expanded to check against a polygon database
    return (
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180
    );
  }

  /**
   * Get distance between two addresses
   */
  async getDistanceBetweenAddresses(
    address1: string,
    address2: string
  ): Promise<{ distance: number; duration: number } | null> {
    try {
      const [loc1, loc2] = await Promise.all([
        this.geocode(address1),
        this.geocode(address2),
      ]);

      if (!loc1 || !loc2) return null;

      const distance = this.calculateDistance(loc1.lat, loc1.lng, loc2.lat, loc2.lng);
      const averageSpeed = 1.4; // m/s (walking speed)
      const duration = Math.ceil(distance / averageSpeed);

      return { distance, duration };
    } catch (error) {
      logger.error('Distance calculation error:', error);
      return null;
    }
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

  /**
   * Clear geocoding cache
   */
  async clearCache(): Promise<void> {
    const keys = await redisClient.keys('geocode:*');
    const reverseKeys = await redisClient.keys('reverse:*');
    const autocompleteKeys = await redisClient.keys('autocomplete:*');
    const allKeys = [...keys, ...reverseKeys, ...autocompleteKeys];
    
    if (allKeys.length > 0) {
      await redisClient.del(allKeys);
      logger.info(`Cleared ${allKeys.length} geocoding cache entries`);
    }
  }
}

// Export singleton instance
export const geocodingService = new GeocodingService();
export default geocodingService;
