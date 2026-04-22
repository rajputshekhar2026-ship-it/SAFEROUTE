// src/hooks/useLocation.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, AppState, AppStateStatus, PermissionsAndroid } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventEmitter } from 'events';

// Constants
const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION_TASK';
const LOCATION_UPDATE_INTERVAL = 5000; // 5 seconds
const BACKGROUND_UPDATE_INTERVAL = 10000; // 10 seconds in background

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

export interface LocationSubscription {
  id: string;
  callback: (location: LocationData) => void;
}

// Location event emitter
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

// Define background task
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
      
      // Store location for offline sync
      await storeLocationOffline(locationData);
      
      // Emit event for background listeners
      locationEvents.emit('backgroundLocation', locationData);
    }
  });
}

// Helper function to store location offline
const storeLocationOffline = async (location: LocationData) => {
  try {
    const storedLocations = await AsyncStorage.getItem('offline_locations');
    const locations = storedLocations ? JSON.parse(storedLocations) : [];
    locations.push(location);
    
    // Keep only last 100 locations
    if (locations.length > 100) {
      locations.shift();
    }
    
    await AsyncStorage.setItem('offline_locations', JSON.stringify(locations));
  } catch (error) {
    console.error('Failed to store location offline:', error);
  }
};

// Hook
interface UseLocationOptions {
  enabled?: boolean;
  highAccuracy?: boolean;
  backgroundTracking?: boolean;
  onLocationChange?: (location: LocationData) => void;
  onError?: (error: LocationError) => void;
  distanceInterval?: number;
  timeInterval?: number;
}

interface UseLocationReturn {
  location: LocationData | null;
  error: LocationError | null;
  loading: boolean;
  permissionGranted: boolean | null;
  backgroundTrackingActive: boolean;
  startTracking: () => Promise<void>;
  stopTracking: () => Promise<void>;
  startBackgroundTracking: () => Promise<void>;
  stopBackgroundTracking: () => Promise<void>;
  getLastKnownLocation: () => Promise<LocationData | null>;
  subscribe: (callback: (location: LocationData) => void) => () => void;
  requestPermissions: () => Promise<boolean>;
  calculateDistance: (to: LocationData) => number;
  calculateBearing: (to: LocationData) => number;
}

export const useLocation = (options: UseLocationOptions = {}): UseLocationReturn => {
  const {
    enabled = true,
    highAccuracy = true,
    backgroundTracking = false,
    onLocationChange,
    onError,
    distanceInterval = 0,
    timeInterval = LOCATION_UPDATE_INTERVAL,
  } = options;

  const [location, setLocation] = useState<LocationData | null>(null);
  const [error, setError] = useState<LocationError | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [backgroundTrackingActive, setBackgroundTrackingActive] = useState(false);
  
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const watchPositionRef = useRef<any>(null);
  const subscribersRef = useRef<Map<string, (location: LocationData) => void>>(new Map());
  const lastLocationRef = useRef<LocationData | null>(null);

  // Request permissions
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      // Request foreground permissions
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      
      if (foregroundStatus !== 'granted') {
        setPermissionGranted(false);
        const errorObj = { code: 'PERMISSION_DENIED', message: 'Location permission denied' };
        setError(errorObj);
        onError?.(errorObj);
        return false;
      }
      
      // Request background permissions if needed
      if (backgroundTracking) {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
          console.warn('Background location permission denied');
        }
      }
      
      setPermissionGranted(true);
      setError(null);
      return true;
    } catch (err) {
      const errorObj = { code: 'PERMISSION_ERROR', message: String(err) };
      setError(errorObj);
      onError?.(errorObj);
      return false;
    }
  }, [backgroundTracking]);

  // Get last known location
  const getLastKnownLocation = useCallback(async (): Promise<LocationData | null> => {
    try {
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown) {
        return {
          lat: lastKnown.coords.latitude,
          lng: lastKnown.coords.longitude,
          accuracy: lastKnown.coords.accuracy,
          altitude: lastKnown.coords.altitude,
          speed: lastKnown.coords.speed,
          heading: lastKnown.coords.heading,
          timestamp: lastKnown.timestamp,
        };
      }
      return null;
    } catch (err) {
      console.error('Failed to get last known location:', err);
      return null;
    }
  }, []);

  // Start foreground tracking
  const startTracking = useCallback(async () => {
    if (!permissionGranted) {
      const granted = await requestPermissions();
      if (!granted) return;
    }
    
    if (locationSubscriptionRef.current) {
      await locationSubscriptionRef.current.remove();
    }
    
    setLoading(true);
    
    try {
      const locationOptions: Location.LocationOptions = {
        accuracy: highAccuracy ? Location.Accuracy.High : Location.Accuracy.Balanced,
        timeInterval: timeInterval,
        distanceInterval: distanceInterval,
      };
      
      locationSubscriptionRef.current = await Location.watchPositionAsync(
        locationOptions,
        (newLocation) => {
          const locationData: LocationData = {
            lat: newLocation.coords.latitude,
            lng: newLocation.coords.longitude,
            accuracy: newLocation.coords.accuracy,
            altitude: newLocation.coords.altitude,
            speed: newLocation.coords.speed,
            heading: newLocation.coords.heading,
            timestamp: newLocation.timestamp,
            isBackground: false,
          };
          
          setLocation(locationData);
          lastLocationRef.current = locationData;
          onLocationChange?.(locationData);
          
          // Notify all subscribers
          subscribersRef.current.forEach((callback) => {
            callback(locationData);
          });
          
          // Emit event
          locationEvents.emit('locationChange', locationData);
        }
      );
      
      setError(null);
    } catch (err) {
      const errorObj = { code: 'TRACKING_ERROR', message: String(err) };
      setError(errorObj);
      onError?.(errorObj);
    } finally {
      setLoading(false);
    }
  }, [permissionGranted, requestPermissions, highAccuracy, timeInterval, distanceInterval, onLocationChange]);

  // Stop foreground tracking
  const stopTracking = useCallback(async () => {
    if (locationSubscriptionRef.current) {
      await locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }
  }, []);

  // Start background tracking
  const startBackgroundTracking = useCallback(async () => {
    if (!permissionGranted) {
      const granted = await requestPermissions();
      if (!granted) return;
    }
    
    try {
      const isRegistered = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      
      if (!isRegistered) {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: highAccuracy ? Location.Accuracy.High : Location.Accuracy.Balanced,
          timeInterval: BACKGROUND_UPDATE_INTERVAL,
          distanceInterval: distanceInterval,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'Safe Route Navigation',
            notificationBody: 'Tracking your location for safety',
            notificationColor: '#FF0000',
          },
        });
        setBackgroundTrackingActive(true);
      }
    } catch (err) {
      console.error('Failed to start background tracking:', err);
      const errorObj = { code: 'BACKGROUND_TRACKING_ERROR', message: String(err) };
      setError(errorObj);
      onError?.(errorObj);
    }
  }, [permissionGranted, requestPermissions, highAccuracy, distanceInterval]);

  // Stop background tracking
  const stopBackgroundTracking = useCallback(async () => {
    try {
      const isRegistered = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        setBackgroundTrackingActive(false);
      }
    } catch (err) {
      console.error('Failed to stop background tracking:', err);
    }
  }, []);

  // Subscribe to location updates
  const subscribe = useCallback((callback: (location: LocationData) => void): () => void => {
    const id = Math.random().toString(36).substring(7);
    subscribersRef.current.set(id, callback);
    
    // Send current location immediately if available
    if (lastLocationRef.current) {
      callback(lastLocationRef.current);
    }
    
    return () => {
      subscribersRef.current.delete(id);
    };
  }, []);

  // Calculate distance between two points (Haversine formula)
  const calculateDistance = useCallback((to: LocationData): number => {
    if (!location) return 0;
    
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (location.lat * Math.PI) / 180;
    const φ2 = (to.lat * Math.PI) / 180;
    const Δφ = ((to.lat - location.lat) * Math.PI) / 180;
    const Δλ = ((to.lng - location.lng) * Math.PI) / 180;
    
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }, [location]);

  // Calculate bearing from current location to target
  const calculateBearing = useCallback((to: LocationData): number => {
    if (!location) return 0;
    
    const φ1 = (location.lat * Math.PI) / 180;
    const φ2 = (to.lat * Math.PI) / 180;
    const λ1 = (location.lng * Math.PI) / 180;
    const λ2 = (to.lng * Math.PI) / 180;
    
    const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
              Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
    const θ = Math.atan2(y, x);
    const bearing = (θ * 180 / Math.PI + 360) % 360;
    
    return bearing;
  }, [location]);

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' && backgroundTracking && permissionGranted) {
        startBackgroundTracking();
      } else if (nextAppState === 'active' && backgroundTracking) {
        // Optionally stop background tracking when app is in foreground
        // stopBackgroundTracking();
      }
    };
    
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription.remove();
    };
  }, [backgroundTracking, permissionGranted, startBackgroundTracking]);

  // Initialize tracking
  useEffect(() => {
    const initialize = async () => {
      const granted = await requestPermissions();
      if (granted && enabled) {
        await startTracking();
        
        // Get last known location for immediate display
        const lastKnown = await getLastKnownLocation();
        if (lastKnown) {
          setLocation(lastKnown);
          lastLocationRef.current = lastKnown;
        }
      }
    };
    
    initialize();
    
    return () => {
      stopTracking();
      stopBackgroundTracking();
    };
  }, [enabled]);

  return {
    location,
    error,
    loading,
    permissionGranted,
    backgroundTrackingActive,
    startTracking,
    stopTracking,
    startBackgroundTracking,
    stopBackgroundTracking,
    getLastKnownLocation,
    subscribe,
    requestPermissions,
    calculateDistance,
    calculateBearing,
  };
};

// Helper hook for periodic location checks
export const usePeriodicLocationCheck = (intervalMs: number = 10000) => {
  const { location, subscribe } = useLocation();
  const [lastCheckTime, setLastCheckTime] = useState(Date.now());
  const [isStationary, setIsStationary] = useState(false);
  
  useEffect(() => {
    let lastLocation = location;
    
    const unsubscribe = subscribe((newLocation) => {
      if (lastLocation) {
        const distance = calculateDistanceBetween(lastLocation, newLocation);
        const timeDiff = Date.now() - lastCheckTime;
        
        if (timeDiff >= intervalMs && distance < 5) { // Less than 5 meters movement
          setIsStationary(true);
        } else {
          setIsStationary(false);
        }
        
        setLastCheckTime(Date.now());
      }
      lastLocation = newLocation;
    });
    
    return unsubscribe;
  }, [intervalMs, subscribe]);
  
  return { isStationary, lastCheckTime };
};

const calculateDistanceBetween = (loc1: LocationData, loc2: LocationData): number => {
  const R = 6371e3;
  const φ1 = (loc1.lat * Math.PI) / 180;
  const φ2 = (loc2.lat * Math.PI) / 180;
  const Δφ = ((loc2.lat - loc1.lat) * Math.PI) / 180;
  const Δλ = ((loc2.lng - loc1.lng) * Math.PI) / 180;
  
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
};

export default useLocation;
