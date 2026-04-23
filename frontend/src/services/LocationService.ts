// frontend/src/services/LocationService.ts

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { EventEmitter } from 'events';
import ApiClient from '../api/client';
import webSocketManager from '../api/websocket';

// Constants
const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION_TASK';
const LOCATION_HISTORY_KEY = 'location_history';
const MAX_HISTORY_SIZE = 1000;

// Types
export interface LocationData {
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  timestamp: number;
  isBackground?: boolean;
}

export interface LocationError {
  code: string;
  message: string;
}

export interface GeocodingResult {
  address: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  street?: string;
  streetNumber?: string;
  formattedAddress: string;
}

export interface LocationRegion {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number;
  notifyOnEntry: boolean;
  notifyOnExit: boolean;
}

// Location Event Emitter
class LocationEventEmitter extends EventEmitter {
  private static instance: LocationEventEmitter;

  static getInstance(): LocationEventEmitter {
    if (!LocationEventEmitter.instance) {
      LocationEventEmitter.instance = new LocationEventEmitter();
    }
    return LocationEventEmitter.instance;
  }
}

export const locationEvents = LocationEventEmitter.getInstance();

// Define background location task
if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
    if (error) {
      console.error('Background location task error:', error);
      return;
    }

    if (data && data.locations) {
      const [location] = data.locations;
      const locationData: LocationData = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy,
        altitude: location.coords.altitude,
        speed: location.coords.speed,
        heading: location.coords.heading,
        timestamp: location.timestamp,
        isBackground: true,
      };

      // Store location
      await LocationServiceClass.storeLocation(locationData);
      
      // Send via WebSocket for real-time tracking
      if (webSocketManager.isConnected()) {
        webSocketManager.sendLocation(locationData);
      }
      
      // Emit event for background listeners
      locationEvents.emit('backgroundLocation', locationData);
      
      // Check for geofencing triggers
      await LocationServiceClass.checkGeofences(locationData);
    }
  });
}

class LocationServiceClass {
  private locationSubscription: Location.LocationSubscription | null = null;
  private isTracking = false;
  private isBackgroundTracking = false;
  private currentLocation: LocationData | null = null;
  private geofences: Map<string, LocationRegion> = new Map();
  private appState: AppStateStatus = AppState.currentState;
  private locationHistory: LocationData[] = [];
  private watchPositionInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.setupAppStateListener();
    this.loadGeofences();
  }

  private setupAppStateListener() {
    AppState.addEventListener('change', (nextAppState) => {
      this.appState = nextAppState;
      if (nextAppState === 'active') {
        this.onAppForeground();
      } else if (nextAppState === 'background') {
        this.onAppBackground();
      }
    });
  }

  private async onAppForeground() {
    if (this.isTracking && !this.locationSubscription) {
      await this.startForegroundTracking();
    }
  }

  private async onAppBackground() {
    if (this.isBackgroundTracking) {
      await this.startBackgroundTracking();
    }
  }

  /**
   * Request location permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      
      if (foregroundStatus !== 'granted') {
        return false;
      }

      if (this.isBackgroundTracking) {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        return backgroundStatus === 'granted';
      }

      return true;
    } catch (error) {
      console.error('Failed to request location permissions:', error);
      return false;
    }
  }

  /**
   * Get current location
   */
  async getCurrentLocation(options?: Location.LocationOptions): Promise<LocationData | null> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Location permission not granted');
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        ...options,
      });

      const locationData: LocationData = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy,
        altitude: location.coords.altitude,
        speed: location.coords.speed,
        heading: location.coords.heading,
        timestamp: location.timestamp,
      };

      this.currentLocation = locationData;
      await this.storeLocation(locationData);
      
      // Send via WebSocket
      if (webSocketManager.isConnected()) {
        webSocketManager.sendLocation(locationData);
      }
      
      return locationData;
    } catch (error) {
      console.error('Failed to get current location:', error);
      return null;
    }
  }

  /**
   * Get last known location
   */
  async getLastKnownLocation(): Promise<LocationData | null> {
    try {
      const location = await Location.getLastKnownPositionAsync();
      if (location) {
        return {
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          accuracy: location.coords.accuracy,
          altitude: location.coords.altitude,
          speed: location.coords.speed,
          heading: location.coords.heading,
          timestamp: location.timestamp,
        };
      }
      return this.currentLocation;
    } catch (error) {
      console.error('Failed to get last known location:', error);
      return this.currentLocation;
    }
  }

  /**
   * Start foreground location tracking
   */
  async startForegroundTracking(options?: Location.LocationOptions): Promise<void> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Location permission not granted');
    }

    if (this.locationSubscription) {
      await this.stopForegroundTracking();
    }

    this.isTracking = true;

    // Use watchPositionAsync for real-time updates
    this.locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 5,
        ...options,
      },
      async (location) => {
        const locationData: LocationData = {
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          accuracy: location.coords.accuracy,
          altitude: location.coords.altitude,
          speed: location.coords.speed,
          heading: location.coords.heading,
          timestamp: location.timestamp,
        };

        this.currentLocation = locationData;
        await this.storeLocation(locationData);
        
        // Send via WebSocket for real-time tracking
        if (webSocketManager.isConnected()) {
          webSocketManager.sendLocation(locationData);
        }
        
        locationEvents.emit('locationChange', locationData);
        
        // Update last active in database (throttled)
        this.throttledUpdateLastActive(locationData);
      }
    );
  }

  private throttledUpdateLastActive = (() => {
    let lastUpdate = 0;
    const throttleMs = 30000; // 30 seconds
    
    return async (location: LocationData) => {
      const now = Date.now();
      if (now - lastUpdate >= throttleMs) {
        lastUpdate = now;
        try {
          await ApiClient.checkIn({
            location: { lat: location.lat, lng: location.lng },
            status: 'safe',
          });
        } catch (error) {
          console.error('Failed to update last active:', error);
        }
      }
    };
  })();

  /**
   * Stop foreground location tracking
   */
  async stopForegroundTracking(): Promise<void> {
    if (this.locationSubscription) {
      await this.locationSubscription.remove();
      this.locationSubscription = null;
    }
    this.isTracking = false;
  }

  /**
   * Start background location tracking
   */
  async startBackgroundTracking(): Promise<void> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Background location permission not granted');
    }

    const isRegistered = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    
    if (!isRegistered) {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 10000,
        distanceInterval: 10,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Safe Route Navigation',
          notificationBody: 'Tracking your location for safety',
          notificationColor: '#FF0000',
        },
      });
      this.isBackgroundTracking = true;
      console.log('Background location tracking started');
    }
  }

  /**
   * Stop background location tracking
   */
  async stopBackgroundTracking(): Promise<void> {
    const isRegistered = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      this.isBackgroundTracking = false;
      console.log('Background location tracking stopped');
    }
  }

  /**
   * Store location in history
   */
  static async storeLocation(location: LocationData): Promise<void> {
    try {
      // Store in AsyncStorage for offline access
      const stored = await AsyncStorage.getItem(LOCATION_HISTORY_KEY);
      let history = stored ? JSON.parse(stored) : [];
      history.push(location);
      
      // Keep only last MAX_HISTORY_SIZE locations
      if (history.length > MAX_HISTORY_SIZE) {
        history = history.slice(-MAX_HISTORY_SIZE);
      }
      
      await AsyncStorage.setItem(LOCATION_HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('Failed to store location:', error);
    }
  }

  /**
   * Get location history
   */
  async getLocationHistory(limit?: number): Promise<LocationData[]> {
    try {
      const stored = await AsyncStorage.getItem(LOCATION_HISTORY_KEY);
      let history = stored ? JSON.parse(stored) : [];
      
      if (limit && limit > 0) {
        history = history.slice(-limit);
      }
      
      return history;
    } catch (error) {
      console.error('Failed to get location history:', error);
      return [];
    }
  }

  /**
   * Clear location history
   */
  async clearLocationHistory(): Promise<void> {
    try {
      await AsyncStorage.removeItem(LOCATION_HISTORY_KEY);
      this.locationHistory = [];
    } catch (error) {
      console.error('Failed to clear location history:', error);
    }
  }

  /**
   * Reverse geocode location to address
   */
  async reverseGeocode(location: LocationData): Promise<GeocodingResult | null> {
    try {
      const results = await Location.reverseGeocodeAsync({
        latitude: location.lat,
        longitude: location.lng,
      });

      if (results.length > 0) {
        const result = results[0];
        const addressParts = [result.street, result.streetNumber, result.city, result.region].filter(Boolean);
        
        return {
          address: addressParts.join(', '),
          city: result.city || undefined,
          state: result.region || undefined,
          country: result.country || undefined,
          postalCode: result.postalCode || undefined,
          street: result.street || undefined,
          streetNumber: result.streetNumber || undefined,
          formattedAddress: [result.name, result.street, result.city, result.region, result.country]
            .filter(Boolean)
            .join(', '),
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to reverse geocode:', error);
      return null;
    }
  }

  /**
   * Geocode address to coordinates
   */
  async geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const results = await Location.geocodeAsync(address);
      if (results.length > 0) {
        return {
          lat: results[0].latitude,
          lng: results[0].longitude,
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to geocode address:', error);
      return null;
    }
  }

  /**
   * Add a geofence
   */
  async addGeofence(region: LocationRegion): Promise<void> {
    this.geofences.set(region.identifier, region);
    await this.saveGeofences();
    
    // Start geofencing if not already started
    await this.startGeofencing();
  }

  /**
   * Remove a geofence
   */
  async removeGeofence(identifier: string): Promise<void> {
    this.geofences.delete(identifier);
    await this.saveGeofences();
    
    if (this.geofences.size === 0) {
      await this.stopGeofencing();
    } else {
      await this.startGeofencing();
    }
  }

  /**
   * Start geofencing
   */
  private async startGeofencing(): Promise<void> {
    const regions = Array.from(this.geofences.values()).map(region => ({
      identifier: region.identifier,
      latitude: region.latitude,
      longitude: region.longitude,
      radius: region.radius,
      notifyOnEntry: region.notifyOnEntry,
      notifyOnExit: region.notifyOnExit,
    }));

    await Location.startGeofencingAsync('geofencing_task', regions);
  }

  /**
   * Stop geofencing
   */
  private async stopGeofencing(): Promise<void> {
    await Location.stopGeofencingAsync('geofencing_task');
  }

  /**
   * Save geofences to storage
   */
  private async saveGeofences(): Promise<void> {
    try {
      const geofencesArray = Array.from(this.geofences.values());
      await AsyncStorage.setItem('geofences', JSON.stringify(geofencesArray));
    } catch (error) {
      console.error('Failed to save geofences:', error);
    }
  }

  /**
   * Load geofences from storage
   */
  private async loadGeofences(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('geofences');
      if (stored) {
        const geofencesArray = JSON.parse(stored);
        this.geofences.clear();
        geofencesArray.forEach((region: LocationRegion) => {
          this.geofences.set(region.identifier, region);
        });
      }
    } catch (error) {
      console.error('Failed to load geofences:', error);
    }
  }

  /**
   * Check if location entered/exited any geofences
   */
  static async checkGeofences(location: LocationData): Promise<void> {
    // This would be implemented in the actual geofencing task
    // For now, placeholder
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  calculateDistance(point1: { lat: number; lng: number }, point2: { lat: number; lng: number }): number {
    const R = 6371e3;
    const φ1 = (point1.lat * Math.PI) / 180;
    const φ2 = (point2.lat * Math.PI) / 180;
    const Δφ = ((point2.lat - point1.lat) * Math.PI) / 180;
    const Δλ = ((point2.lng - point1.lng) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Calculate speed between two locations
   */
  calculateSpeed(from: LocationData, to: LocationData): number {
    const distance = this.calculateDistance(from, to);
    const timeDiff = (to.timestamp - from.timestamp) / 1000;
    
    if (timeDiff === 0) return 0;
    return distance / timeDiff;
  }

  /**
   * Calculate bearing between two locations
   */
  calculateBearing(from: LocationData, to: LocationData): number {
    const φ1 = (from.lat * Math.PI) / 180;
    const φ2 = (to.lat * Math.PI) / 180;
    const λ1 = (from.lng * Math.PI) / 180;
    const λ2 = (to.lng * Math.PI) / 180;
    
    const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
              Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
    const θ = Math.atan2(y, x);
    const bearing = (θ * 180 / Math.PI + 360) % 360;
    
    return bearing;
  }

  /**
   * Check if user is stationary
   */
  isStationary(location1: LocationData, location2: LocationData, threshold: number = 10): boolean {
    const distance = this.calculateDistance(location1, location2);
    return distance < threshold;
  }

  /**
   * Get current tracking status
   */
  getTrackingStatus() {
    return {
      isTracking: this.isTracking,
      isBackgroundTracking: this.isBackgroundTracking,
      hasCurrentLocation: !!this.currentLocation,
    };
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await this.stopForegroundTracking();
    await this.stopBackgroundTracking();
    await this.stopGeofencing();
  }
}

// Export singleton instance
export const LocationService = new LocationServiceClass();
export default LocationService;
