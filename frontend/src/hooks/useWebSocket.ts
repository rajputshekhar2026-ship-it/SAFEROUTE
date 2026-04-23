// frontend/src/hooks/useWebSocket.ts

import { useState, useEffect, useCallback, useRef } from 'react';
import webSocketManager, { WebSocketState, wsEvents } from '../api/websocket';
import { SafetyAlert, SOSBroadcast, RouteDeviation, WeatherWarning, CrimeAlert, UserStatus, ContactLocation, SOSResponse } from '../api/websocket';

interface UseWebSocketOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onSafetyAlert?: (alert: SafetyAlert) => void;
  onSOSBroadcast?: (sos: SOSBroadcast) => void;
  onRouteDeviation?: (deviation: RouteDeviation) => void;
  onWeatherWarning?: (warning: WeatherWarning) => void;
  onCrimeAlert?: (alert: CrimeAlert) => void;
  onUserStatus?: (status: UserStatus) => void;
  onContactLocation?: (location: ContactLocation) => void;
  onSOSResponse?: (response: SOSResponse) => void;
  onError?: (error: Error) => void;
}

interface UseWebSocketReturn {
  state: WebSocketState;
  isConnected: boolean;
  sendLocation: (location: any) => void;
  sendSOS: (data: any) => void;
  sendCheckIn: (data: any) => void;
  toggleHealthMode: (enabled: boolean) => void;
  requestRoute: (data: any) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  reconnect: () => Promise<void>;
  safetyAlerts: SafetyAlert[];
  clearAlerts: () => void;
}

export const useWebSocket = (options: UseWebSocketOptions = {}): UseWebSocketReturn => {
  const {
    autoConnect = true,
    onConnect,
    onDisconnect,
    onSafetyAlert,
    onSOSBroadcast,
    onRouteDeviation,
    onWeatherWarning,
    onCrimeAlert,
    onUserStatus,
    onContactLocation,
    onSOSResponse,
    onError,
  } = options;

  const [state, setState] = useState<WebSocketState>(webSocketManager.getState());
  const [safetyAlerts, setSafetyAlerts] = useState<SafetyAlert[]>([]);

  useEffect(() => {
    // Subscribe to state changes
    const unsubscribe = webSocketManager.onStateChange((newState) => {
      setState(newState);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (autoConnect && !state.isConnected && !state.isConnecting) {
      webSocketManager.connect().catch(console.error);
    }
  }, [autoConnect]);

  useEffect(() => {
    // Setup event listeners
    const handleConnect = () => {
      onConnect?.();
    };

    const handleDisconnect = (reason: string) => {
      onDisconnect?.(reason);
    };

    const handleSafetyAlert = (alert: SafetyAlert) => {
      setSafetyAlerts((prev) => [alert, ...prev].slice(0, 50));
      onSafetyAlert?.(alert);
    };

    const handleSOSBroadcast = (sos: SOSBroadcast) => {
      onSOSBroadcast?.(sos);
    };

    const handleRouteDeviation = (deviation: RouteDeviation) => {
      onRouteDeviation?.(deviation);
    };

    const handleWeatherWarning = (warning: WeatherWarning) => {
      onWeatherWarning?.(warning);
    };

    const handleCrimeAlert = (alert: CrimeAlert) => {
      onCrimeAlert?.(alert);
    };

    const handleUserStatus = (status: UserStatus) => {
      onUserStatus?.(status);
    };

    const handleContactLocation = (location: ContactLocation) => {
      onContactLocation?.(location);
    };

    const handleSOSResponse = (response: SOSResponse) => {
      onSOSResponse?.(response);
    };

    const handleError = (error: Error) => {
      onError?.(error);
    };

    wsEvents.on('connect', handleConnect);
    wsEvents.on('disconnect', handleDisconnect);
    wsEvents.on('safety-alert', handleSafetyAlert);
    wsEvents.on('sos-broadcast', handleSOSBroadcast);
    wsEvents.on('route-deviation', handleRouteDeviation);
    wsEvents.on('weather-warning', handleWeatherWarning);
    wsEvents.on('crime-alert', handleCrimeAlert);
    wsEvents.on('user-status', handleUserStatus);
    wsEvents.on('contact-location', handleContactLocation);
    wsEvents.on('sos-response', handleSOSResponse);
    wsEvents.on('connect_error', handleError);
    wsEvents.on('sos-error', handleError);
    wsEvents.on('checkin-error', handleError);

    return () => {
      wsEvents.off('connect', handleConnect);
      wsEvents.off('disconnect', handleDisconnect);
      wsEvents.off('safety-alert', handleSafetyAlert);
      wsEvents.off('sos-broadcast', handleSOSBroadcast);
      wsEvents.off('route-deviation', handleRouteDeviation);
      wsEvents.off('weather-warning', handleWeatherWarning);
      wsEvents.off('crime-alert', handleCrimeAlert);
      wsEvents.off('user-status', handleUserStatus);
      wsEvents.off('contact-location', handleContactLocation);
      wsEvents.off('sos-response', handleSOSResponse);
      wsEvents.off('connect_error', handleError);
      wsEvents.off('sos-error', handleError);
      wsEvents.off('checkin-error', handleError);
    };
  }, [onConnect, onDisconnect, onSafetyAlert, onSOSBroadcast, onRouteDeviation, onWeatherWarning, onCrimeAlert, onUserStatus, onContactLocation, onSOSResponse, onError]);

  const sendLocation = useCallback((location: any) => {
    webSocketManager.sendLocation(location);
  }, []);

  const sendSOS = useCallback((data: any) => {
    webSocketManager.sendSOS(data);
  }, []);

  const sendCheckIn = useCallback((data: any) => {
    webSocketManager.sendCheckIn(data);
  }, []);

  const toggleHealthMode = useCallback((enabled: boolean) => {
    webSocketManager.toggleHealthMode(enabled);
  }, []);

  const requestRoute = useCallback((data: any) => {
    webSocketManager.requestRoute(data);
  }, []);

  const connect = useCallback(async () => {
    await webSocketManager.connect();
  }, []);

  const disconnect = useCallback(() => {
    webSocketManager.disconnect();
  }, []);

  const reconnect = useCallback(async () => {
    await webSocketManager.reconnect();
  }, []);

  const clearAlerts = useCallback(() => {
    setSafetyAlerts([]);
  }, []);

  return {
    state,
    isConnected: state.isConnected,
    sendLocation,
    sendSOS,
    sendCheckIn,
    toggleHealthMode,
    requestRoute,
    connect,
    disconnect,
    reconnect,
    safetyAlerts,
    clearAlerts,
  };
};

export default useWebSocket;
