// frontend/src/api/websocket.ts

import io, { Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import * as SecureStore from 'expo-secure-store';
import ApiClient from './client';

// Types
export interface LocationUpdate {
  userId?: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  timestamp: number;
  isBackground?: boolean;
}

export interface SafetyAlert {
  userId: string;
  type: 'danger_zone' | 'suspicious_activity' | 'weather_warning' | 'crime_alert' | 'route_deviation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  location?: {
    lat: number;
    lng: number;
  };
  timestamp: number;
}

export interface SOSBroadcast {
  sosId: string;
  userId: string;
  location: {
    lat: number;
    lng: number;
  };
  message?: string;
  timestamp: number;
}

export interface RouteDeviation {
  userId: string;
  deviationDistance: number;
  expectedPath?: LocationUpdate[];
  currentLocation: LocationUpdate;
  timestamp: number;
  recommendedAction: 'reroute' | 'continue' | 'sos';
}

export interface WeatherWarning {
  type: 'storm' | 'flood' | 'extreme_heat' | 'extreme_cold' | 'fog';
  severity: 'low' | 'medium' | 'high';
  message: string;
  area: string;
  timestamp: number;
}

export interface CrimeAlert {
  crimeType: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  location: {
    lat: number;
    lng: number;
  };
  timestamp: number;
}

export interface UserStatus {
  userId: string;
  isOnline: boolean;
  timestamp: number;
}

export interface ContactLocation {
  userId: string;
  contactName: string;
  location: {
    lat: number;
    lng: number;
  };
  timestamp: number;
}

export interface ContactCheckIn {
  userId: string;
  userName: string;
  location: {
    lat: number;
    lng: number;
  };
  status: string;
  timestamp: number;
}

export interface SOSResponse {
  sosId: string;
  responderId?: string;
  eta?: number;
  message?: string;
  timestamp: number;
}

export interface WebSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  socketId: string | null;
  error: string | null;
  reconnectAttempts: number;
}

// WebSocket Event Emitter
class WebSocketEventEmitter extends EventEmitter {
  private static instance: WebSocketEventEmitter;

  static getInstance(): WebSocketEventEmitter {
    if (!WebSocketEventEmitter.instance) {
      WebSocketEventEmitter.instance = new WebSocketEventEmitter();
    }
    return WebSocketEventEmitter.instance;
  }

  on(event: string, callback: Function): this {
    return super.on(event, callback);
  }

  off(event: string, callback: Function): this {
    return super.off(event, callback);
  }

  emit(event: string, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }
}

export const wsEvents = WebSocketEventEmitter.getInstance();

class WebSocketManager {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isManualDisconnect = false;
  private state: WebSocketState = {
    isConnected: false,
    isConnecting: false,
    socketId: null,
    error: null,
    reconnectAttempts: 0,
  };

  private stateListeners: Array<(state: WebSocketState) => void> = [];

  constructor() {
    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    // Forward all socket events to the event emitter
    const events = [
      'connect',
      'disconnect',
      'connect_error',
      'location-ack',
      'safety-alert',
      'sos-broadcast',
      'route-deviation',
      'weather-warning',
      'crime-alert',
      'user-status',
      'contact-location',
      'contact-checkin',
      'sos-response',
      'sos-acknowledged',
      'sos-error',
      'checkin-confirmed',
      'checkin-error',
      'health-mode-status',
      'route-response',
      'heartbeat-ack',
      'connection-warning',
      'danger-zone-alert',
    ];

    events.forEach((event) => {
      this.on(event, (data: any) => {
        wsEvents.emit(event, data);
      });
    });
  }

  private updateState(newState: Partial<WebSocketState>): void {
    this.state = { ...this.state, ...newState };
    this.stateListeners.forEach((listener) => listener(this.state));
  }

  onStateChange(listener: (state: WebSocketState) => void): () => void {
    this.stateListeners.push(listener);
    listener(this.state);
    return () => {
      const index = this.stateListeners.indexOf(listener);
      if (index !== -1) this.stateListeners.splice(index, 1);
    };
  }

  getState(): WebSocketState {
    return { ...this.state };
  }

  async connect(): Promise<void> {
    if (this.state.isConnected || this.state.isConnecting) {
      console.log('WebSocket already connected or connecting');
      return;
    }

    this.isManualDisconnect = false;
    this.updateState({ isConnecting: true, error: null });

    try {
      const token = await SecureStore.getItemAsync('jwt_token');
      const baseURL = ApiClient.getWebSocketURL();
      
      if (!token) {
        throw new Error('No authentication token found');
      }

      this.socket = io(baseURL, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: { token },
        reconnection: false, // We'll handle reconnection manually
        timeout: 10000,
      });

      this.setupSocketListeners();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      this.updateState({
        isConnecting: false,
        error: errorMessage,
      });
      throw error;
    }
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected', this.socket?.id);
      this.reconnectAttempts = 0;
      this.updateState({
        isConnected: true,
        isConnecting: false,
        socketId: this.socket?.id || null,
        error: null,
        reconnectAttempts: 0,
      });
      this.startHeartbeat();
      this.emit('connect');
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log('WebSocket disconnected:', reason);
      this.updateState({
        isConnected: false,
        isConnecting: false,
        error: `Disconnected: ${reason}`,
      });
      this.stopHeartbeat();
      this.emit('disconnect', reason);

      if (!this.isManualDisconnect && reason !== 'io client disconnect') {
        this.attemptReconnect();
      }
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error('WebSocket connection error:', error);
      this.updateState({
        error: error.message,
      });
      this.emit('connect_error', error);
    });

    // Handle specific events from server
    this.socket.on('location-ack', (data: any) => {
      this.emit('location-ack', data);
    });

    this.socket.on('safety-alert', (alert: SafetyAlert) => {
      console.log('Safety alert received:', alert);
      this.emit('safety-alert', alert);
    });

    this.socket.on('sos-broadcast', (sos: SOSBroadcast) => {
      console.log('SOS broadcast received:', sos);
      this.emit('sos-broadcast', sos);
    });

    this.socket.on('route-deviation', (deviation: RouteDeviation) => {
      console.log('Route deviation detected:', deviation);
      this.emit('route-deviation', deviation);
    });

    this.socket.on('weather-warning', (warning: WeatherWarning) => {
      console.log('Weather warning:', warning);
      this.emit('weather-warning', warning);
    });

    this.socket.on('crime-alert', (alert: CrimeAlert) => {
      console.log('Crime alert:', alert);
      this.emit('crime-alert', alert);
    });

    this.socket.on('user-status', (status: UserStatus) => {
      this.emit('user-status', status);
    });

    this.socket.on('contact-location', (location: ContactLocation) => {
      this.emit('contact-location', location);
    });

    this.socket.on('contact-checkin', (checkin: ContactCheckIn) => {
      this.emit('contact-checkin', checkin);
    });

    this.socket.on('sos-response', (response: SOSResponse) => {
      console.log('SOS response:', response);
      this.emit('sos-response', response);
    });

    this.socket.on('sos-acknowledged', (data: any) => {
      this.emit('sos-acknowledged', data);
    });

    this.socket.on('sos-error', (error: any) => {
      console.error('SOS error:', error);
      this.emit('sos-error', error);
    });

    this.socket.on('checkin-confirmed', (data: any) => {
      this.emit('checkin-confirmed', data);
    });

    this.socket.on('checkin-error', (error: any) => {
      console.error('Check-in error:', error);
      this.emit('checkin-error', error);
    });

    this.socket.on('health-mode-status', (data: any) => {
      this.emit('health-mode-status', data);
    });

    this.socket.on('route-response', (data: any) => {
      this.emit('route-response', data);
    });

    this.socket.on('heartbeat-ack', (data: any) => {
      this.emit('heartbeat-ack', data);
    });

    this.socket.on('connection-warning', (data: any) => {
      console.warn('Connection warning:', data);
      this.emit('connection-warning', data);
    });

    this.socket.on('danger-zone-alert', (alert: SafetyAlert) => {
      console.log('Danger zone alert:', alert);
      this.emit('danger-zone-alert', alert);
    });
  }

  private attemptReconnect(): void {
    if (this.isManualDisconnect) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.updateState({
        error: `Max reconnection attempts (${this.maxReconnectAttempts}) reached`,
      });
      this.emit('reconnect_failed');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts);
    this.reconnectAttempts++;
    this.updateState({ reconnectAttempts: this.reconnectAttempts });

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

    setTimeout(() => {
      if (!this.isManualDisconnect && !this.state.isConnected) {
        this.connect().catch((error) => {
          console.error('Reconnection attempt failed:', error);
          this.attemptReconnect();
        });
      }
    }, delay);
  }

  disconnect(): void {
    this.isManualDisconnect = true;
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.updateState({
      isConnected: false,
      isConnecting: false,
      socketId: null,
      reconnectAttempts: 0,
    });
    this.emit('disconnect', 'manual');
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.state.isConnected) {
        this.socket.emit('heartbeat', { timestamp: Date.now() });
      }
    }, 30000); // 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ============================================
  // SENDING METHODS
  // ============================================

  sendLocation(location: LocationUpdate): void {
    if (!this.socket || !this.state.isConnected) {
      console.warn('Cannot send location: WebSocket not connected');
      return;
    }
    this.socket.emit('location-update', {
      lat: location.lat,
      lng: location.lng,
      accuracy: location.accuracy,
      speed: location.speed,
      heading: location.heading,
      timestamp: location.timestamp,
      isBackground: location.isBackground || false,
    });
  }

  sendSOS(data: {
    location: LocationUpdate;
    message?: string;
    audioUri?: string;
    photoUri?: string;
    contacts?: string[];
    autoTriggered?: boolean;
  }): void {
    if (!this.socket || !this.state.isConnected) {
      console.warn('Cannot send SOS: WebSocket not connected');
      return;
    }
    this.socket.emit('sos-trigger', data);
  }

  sendCheckIn(data: {
    location: LocationUpdate;
    status?: 'safe' | 'unsure' | 'danger';
    note?: string;
  }): void {
    if (!this.socket || !this.state.isConnected) {
      console.warn('Cannot send check-in: WebSocket not connected');
      return;
    }
    this.socket.emit('checkin', data);
  }

  toggleHealthMode(enabled: boolean): void {
    if (!this.socket || !this.state.isConnected) {
      console.warn('Cannot toggle health mode: WebSocket not connected');
      return;
    }
    this.socket.emit('health-mode-toggle', { enabled });
  }

  requestRoute(data: any): void {
    if (!this.socket || !this.state.isConnected) {
      console.warn('Cannot request route: WebSocket not connected');
      return;
    }
    this.socket.emit('route-request', data);
  }

  sendHeartbeat(): void {
    if (!this.socket || !this.state.isConnected) {
      return;
    }
    this.socket.emit('heartbeat', { timestamp: Date.now() });
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================

  on(event: string, callback: Function): void {
    if (this.socket) {
      this.socket.on(event, callback as any);
    }
  }

  off(event: string, callback: Function): void {
    if (this.socket) {
      this.socket.off(event, callback as any);
    }
  }

  emit(event: string, ...args: any[]): void {
    if (this.socket) {
      this.socket.emit(event, ...args);
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  isConnected(): boolean {
    return this.state.isConnected;
  }

  getSocketId(): string | null {
    return this.state.socketId;
  }

  async reconnect(): Promise<void> {
    this.disconnect();
    this.reconnectAttempts = 0;
    this.isManualDisconnect = false;
    await this.connect();
  }
}

// Export singleton instance
const webSocketManager = new WebSocketManager();
export default webSocketManager;
