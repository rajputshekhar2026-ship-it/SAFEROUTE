// src/hooks/useWebSocket.ts

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WebSocketManager from '../api/websocket';
import { LocationData } from './useLocation';
import * as Haptics from 'expo-haptics';

// Types
export interface SafetyAlert {
  id: string;
  type: 'danger_zone' | 'suspicious_activity' | 'weather_warning' | 'crime_alert' | 'route_deviation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  location?: LocationData;
  timestamp: number;
  actionRequired?: boolean;
  actionDeadline?: number;
}

export interface RouteDeviation {
  id: string;
  expectedPath: LocationData[];
  currentLocation: LocationData;
  deviationDistance: number;
  timestamp: number;
  recommendedAction: 'reroute' | 'continue' | 'sos';
}

export interface SOSReceived {
  id: string;
  fromUserId: string;
  fromUserName: string;
  location: LocationData;
  timestamp: number;
  message?: string;
  status: 'active' | 'responded' | 'resolved';
}

export interface WeatherWarning {
  id: string;
  type: 'storm' | 'flood' | 'extreme_heat' | 'extreme_cold' | 'fog';
  severity: 'low' | 'medium' | 'high';
  message: string;
  affectedArea: {
    center: LocationData;
    radius: number; // meters
  };
  timestamp: number;
  expiryTime: number;
}

export interface CrimeAlert {
  id: string;
  crimeType: string;
  location: LocationData;
  description: string;
  timestamp: number;
  reportedBy: string;
  status: 'active' | 'investigating' | 'resolved';
}

export interface WebSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  lastMessage: any;
  error: string | null;
  reconnectAttempts: number;
}

// WebSocket Event Emitter
class WebSocketEventEmitter {
  private static instance: WebSocketEventEmitter;
  private listeners: Map<string, Set<Function>> = new Map();

  static getInstance(): WebSocketEventEmitter {
    if (!WebSocketEventEmitter.instance) {
      WebSocketEventEmitter.instance = new WebSocketEventEmitter();
    }
    return WebSocketEventEmitter.instance;
  }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function) {
    this.listeners.get(event)?.delete(callback);
  }

  emit(event: string, data: any) {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }
}

export const wsEvents = WebSocketEventEmitter.getInstance();

// Hook
interface UseWebSocketOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onSafetyAlert?: (alert: SafetyAlert) => void;
  onRouteDeviation?: (deviation: RouteDeviation) => void;
  onSOSReceived?: (sos: SOSReceived) => void;
  onWeatherWarning?: (warning: WeatherWarning) => void;
  onCrimeAlert?: (alert: CrimeAlert) => void;
  onError?: (error: Error) => void;
}

interface UseWebSocketReturn {
  state: WebSocketState;
  sendLocation: (location: LocationData) => void;
  sendCheckIn: (checkInData: any) => void;
  sendSOS: (sosData: any) => void;
  sendMessage: (event: string, data: any) => void;
  reconnect: () => Promise<void>;
  disconnect: () => void;
  subscribe: (event: string, callback: Function) => () => void;
  safetyAlerts: SafetyAlert[];
  clearAlerts: () => void;
  acknowledgeAlert: (alertId: string) => void;
}

export const useWebSocket = (options: UseWebSocketOptions = {}): UseWebSocketReturn => {
  const {
    autoConnect = true,
    onConnect,
    onDisconnect,
    onSafetyAlert,
    onRouteDeviation,
    onSOSReceived,
    onWeatherWarning,
    onCrimeAlert,
    onError,
  } = options;

  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isConnecting: false,
    lastMessage: null,
    error: null,
    reconnectAttempts: 0,
  });
  
  const [safetyAlerts, setSafetyAlerts] = useState<SafetyAlert[]>([]);
  const appStateRef = useRef(AppState.currentState);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const heartbeatIntervalRef = useRef<NodeJS.Timeout>();
  const pendingAcksRef = useRef<Map<string, boolean>>(new Map());

  // Initialize WebSocket listeners
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    setupAppStateListener();
    setupWebSocketEventListeners();

    return () => {
      cleanup();
    };
  }, []);

  const setupAppStateListener = () => {
    AppState.addEventListener('change', handleAppStateChange);
  };

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground, reconnect if disconnected
      if (!state.isConnected && !state.isConnecting) {
        connect();
      }
    } else if (nextAppState === 'background') {
      // App went to background, reduce heartbeat frequency
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        setupHeartbeat(30000); // 30 seconds in background
      }
    }
    appStateRef.current = nextAppState;
  };

  const setupWebSocketEventListeners = () => {
    WebSocketManager.on('connected', handleConnected);
    WebSocketManager.on('disconnected', handleDisconnected);
    WebSocketManager.on('safety_alert', handleSafetyAlert);
    WebSocketManager.on('route_deviation', handleRouteDeviation);
    WebSocketManager.on('sos_received', handleSOSReceived);
    WebSocketManager.on('weather_warning', handleWeatherWarning);
    WebSocketManager.on('danger_zone', handleCrimeAlert);
    WebSocketManager.on('error', handleError);
  };

  const cleanupWebSocketEventListeners = () => {
    WebSocketManager.off('connected', handleConnected);
    WebSocketManager.off('disconnected', handleDisconnected);
    WebSocketManager.off('safety_alert', handleSafetyAlert);
    WebSocketManager.off('route_deviation', handleRouteDeviation);
    WebSocketManager.off('sos_received', handleSOSReceived);
    WebSocketManager.off('weather_warning', handleWeatherWarning);
    WebSocketManager.off('danger_zone', handleCrimeAlert);
    WebSocketManager.off('error', handleError);
  };

  const handleConnected = () => {
    setState(prev => ({
      ...prev,
      isConnected: true,
      isConnecting: false,
      error: null,
      reconnectAttempts: 0,
    }));
    
    setupHeartbeat(15000); // 15 seconds in foreground
    onConnect?.();
    
    // Sync pending messages
    syncPendingMessages();
  };

  const handleDisconnected = (reason: string) => {
    setState(prev => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      error: `Disconnected: ${reason}`,
    }));
    
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    
    onDisconnect?.(reason);
    
    // Attempt to reconnect if not intentional
    if (reason !== 'user_disconnect') {
      attemptReconnect();
    }
  };

  const handleError = (error: Error) => {
    setState(prev => ({
      ...prev,
      error: error.message,
    }));
    onError?.(error);
  };

  const handleSafetyAlert = (alert: SafetyAlert) => {
    // Haptic feedback for safety alerts
    if (alert.severity === 'critical' || alert.severity === 'high') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else if (alert.severity === 'medium') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    // Add to alerts list
    setSafetyAlerts(prev => [alert, ...prev].slice(0, 50)); // Keep last 50 alerts
    
    // Store alert for offline access
    storeAlertOffline(alert);
    
    onSafetyAlert?.(alert);
    wsEvents.emit('safety_alert', alert);
  };

  const handleRouteDeviation = (deviation: RouteDeviation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onRouteDeviation?.(deviation);
    wsEvents.emit('route_deviation', deviation);
  };

  const handleSOSReceived = (sos: SOSReceived) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    onSOSReceived?.(sos);
    wsEvents.emit('sos_received', sos);
    
    // Show persistent notification for SOS
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      // In production, show a local notification
      console.log(`SOS received from ${sos.fromUserName}`);
    }
  };

  const handleWeatherWarning = (warning: WeatherWarning) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onWeatherWarning?.(warning);
    wsEvents.emit('weather_warning', warning);
  };

  const handleCrimeAlert = (alert: CrimeAlert) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onCrimeAlert?.(alert);
    wsEvents.emit('crime_alert', alert);
  };

  const setupHeartbeat = (intervalMs: number) => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    
    heartbeatIntervalRef.current = setInterval(() => {
      if (state.isConnected) {
        sendMessage('heartbeat', { timestamp: Date.now() });
      }
    }, intervalMs);
  };

  const attemptReconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    const maxAttempts = 5;
    const baseDelay = 1000;
    const delay = Math.min(baseDelay * Math.pow(2, state.reconnectAttempts), 30000);
    
    if (state.reconnectAttempts < maxAttempts) {
      reconnectTimeoutRef.current = setTimeout(() => {
        setState(prev => ({
          ...prev,
          isConnecting: true,
          reconnectAttempts: prev.reconnectAttempts + 1,
        }));
        connect();
      }, delay);
    } else {
      setState(prev => ({
        ...prev,
        error: 'Max reconnection attempts reached. Please check your connection.',
      }));
    }
  };

  const connect = async () => {
    if (state.isConnected || state.isConnecting) return;
    
    setState(prev => ({ ...prev, isConnecting: true, error: null }));
    
    try {
      await WebSocketManager.connect();
    } catch (error) {
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      }));
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    
    WebSocketManager.disconnect();
    setState(prev => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
    }));
  };

  const reconnect = async () => {
    disconnect();
    setState(prev => ({ ...prev, reconnectAttempts: 0 }));
    await connect();
  };

  const sendLocation = useCallback((location: LocationData) => {
    if (!state.isConnected) {
      // Store for later sync
      storePendingMessage('location_update', location);
      return;
    }
    
    WebSocketManager.sendLocation(location);
  }, [state.isConnected]);

  const sendCheckIn = useCallback((checkInData: any) => {
    if (!state.isConnected) {
      storePendingMessage('user_checkin', checkInData);
      return;
    }
    
    WebSocketManager.sendCheckIn(checkInData);
  }, [state.isConnected]);

  const sendSOS = useCallback((sosData: any) => {
    if (!state.isConnected) {
      storePendingMessage('emergency_sos', sosData);
      return;
    }
    
    WebSocketManager.sendSOS(sosData);
  }, [state.isConnected]);

  const sendMessage = useCallback((event: string, data: any) => {
    if (!state.isConnected) {
      storePendingMessage(event, data);
      return;
    }
    
    if (WebSocketManager.socket) {
      WebSocketManager.socket.emit(event, data);
    }
  }, [state.isConnected]);

  const storePendingMessage = async (event: string, data: any) => {
    try {
      const pending = await AsyncStorage.getItem('pending_ws_messages');
      const messages = pending ? JSON.parse(pending) : [];
      messages.push({
        event,
        data,
        timestamp: Date.now(),
      });
      // Keep only last 100 messages
      const trimmed = messages.slice(-100);
      await AsyncStorage.setItem('pending_ws_messages', JSON.stringify(trimmed));
    } catch (error) {
      console.error('Failed to store pending message:', error);
    }
  };

  const syncPendingMessages = async () => {
    try {
      const pending = await AsyncStorage.getItem('pending_ws_messages');
      if (pending) {
        const messages = JSON.parse(pending);
        for (const msg of messages) {
          if (Date.now() - msg.timestamp < 3600000) { // Only sync messages from last hour
            sendMessage(msg.event, msg.data);
          }
        }
        await AsyncStorage.removeItem('pending_ws_messages');
      }
    } catch (error) {
      console.error('Failed to sync pending messages:', error);
    }
  };

  const storeAlertOffline = async (alert: SafetyAlert) => {
    try {
      const stored = await AsyncStorage.getItem('offline_alerts');
      const alerts = stored ? JSON.parse(stored) : [];
      alerts.push(alert);
      // Keep last 100 alerts
      const trimmed = alerts.slice(-100);
      await AsyncStorage.setItem('offline_alerts', JSON.stringify(trimmed));
    } catch (error) {
      console.error('Failed to store alert offline:', error);
    }
  };

  const subscribe = useCallback((event: string, callback: Function) => {
    wsEvents.on(event, callback);
    return () => wsEvents.off(event, callback);
  }, []);

  const clearAlerts = useCallback(() => {
    setSafetyAlerts([]);
  }, []);

  const acknowledgeAlert = useCallback((alertId: string) => {
    if (pendingAcksRef.current.has(alertId)) return;
    
    pendingAcksRef.current.set(alertId, true);
    sendMessage('acknowledge_alert', { alertId, timestamp: Date.now() });
    
    // Remove from alerts list
    setSafetyAlerts(prev => prev.filter(alert => alert.id !== alertId));
    
    // Clean up ack record after 5 seconds
    setTimeout(() => {
      pendingAcksRef.current.delete(alertId);
    }, 5000);
  }, [sendMessage]);

  const cleanup = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    cleanupWebSocketEventListeners();
  };

  return {
    state,
    sendLocation,
    sendCheckIn,
    sendSOS,
    sendMessage,
    reconnect,
    disconnect,
    subscribe,
    safetyAlerts,
    clearAlerts,
    acknowledgeAlert,
  };
};

// Helper hook to listen to specific alert types
export const useAlertListener = <T>(
  alertType: 'safety_alert' | 'route_deviation' | 'sos_received' | 'weather_warning' | 'crime_alert',
  callback: (data: T) => void
) => {
  useEffect(() => {
    const handler = (data: T) => callback(data);
    wsEvents.on(alertType, handler);
    return () => wsEvents.off(alertType, handler);
  }, [callback, alertType]);
};

// Helper hook to get unacknowledged alerts count
export const useUnreadAlertsCount = (): number => {
  const { safetyAlerts } = useWebSocket({ autoConnect: false });
  return safetyAlerts.filter(alert => alert.actionRequired).length;
};

export default useWebSocket;
