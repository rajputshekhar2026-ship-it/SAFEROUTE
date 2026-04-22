import io, { Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import * as SecureStore from 'expo-secure-store';

const WS_URL = 'ws://your-server-ip:3000';

class WebSocketManager extends EventEmitter {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  async connect() {
    const token = await SecureStore.getItemAsync('jwt_token');
    
    this.socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
    });

    this.setupListeners();
  }

  private setupListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.emit('connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.emit('disconnected', reason);
    });

    this.socket.on('safety_alert', (data) => {
      this.emit('safety_alert', data);
    });

    this.socket.on('route_deviation', (data) => {
      this.emit('route_deviation', data);
    });

    this.socket.on('danger_zone_alert', (data) => {
      this.emit('danger_zone', data);
    });

    this.socket.on('sos_received', (data) => {
      this.emit('sos_received', data);
    });

    this.socket.on('weather_warning', (data) => {
      this.emit('weather_warning', data);
    });
  }

  sendLocation(location: any) {
    if (this.socket?.connected) {
      this.socket.emit('location_update', {
        ...location,
        timestamp: Date.now(),
      });
    }
  }

  sendSOS(sosData: any) {
    if (this.socket?.connected) {
      this.socket.emit('emergency_sos', sosData);
    }
  }

  sendCheckIn(checkInData: any) {
    if (this.socket?.connected) {
      this.socket.emit('user_checkin', checkInData);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export default new WebSocketManager();
