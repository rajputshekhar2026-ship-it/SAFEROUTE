import { useState, useEffect, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import ApiClient from '../api/client';
import { WatchService } from '../services/WatchService';

interface WatchDevice {
  id: string;
  deviceType: 'apple_watch' | 'wear_os';
  deviceId: string;
  watchName?: string;
  osVersion?: string;
  appVersion?: string;
  isActive: boolean;
  lastSync?: string;
}

interface WatchSettings {
  hapticAlerts: boolean;
  routePreview: boolean;
  sosFromWatch: boolean;
  healthSync: boolean;
}

interface UseWatchConnectionReturn {
  isConnected: boolean;
  isConnecting: boolean;
  watchDevice: WatchDevice | null;
  settings: WatchSettings;
  connectWatch: () => Promise<void>;
  disconnectWatch: () => Promise<void>;
  sendTestAlert: () => Promise<void>;
  syncRouteToWatch: (routeData: any) => Promise<boolean>;
  updateSettings: (newSettings: Partial<WatchSettings>) => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export const useWatchConnection = (): UseWatchConnectionReturn => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [watchDevice, setWatchDevice] = useState<WatchDevice | null>(null);
  const [settings, setSettings] = useState<WatchSettings>({
    hapticAlerts: true,
    routePreview: true,
    sosFromWatch: true,
    healthSync: true,
  });

  useEffect(() => {
    refreshStatus();
    setupWatchListeners();
    return () => {
      // Cleanup listeners
    };
  }, []);

  const setupWatchListeners = () => {
    // Listen for watch connection events
    WatchService.on('connected', () => {
      setIsConnected(true);
      refreshStatus();
    });

    WatchService.on('disconnected', () => {
      setIsConnected(false);
      setWatchDevice(null);
    });

    WatchService.on('sos_from_watch', (sosData) => {
      handleSOSFromWatch(sosData);
    });

    WatchService.on('health_data', (healthData) => {
      console.log('Health data received from watch:', healthData);
    });
  };

  const handleSOSFromWatch = (sosData: any) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Alert.alert(
      '🚨 SOS from Watch',
      'Emergency alert triggered from your smart watch. Immediate assistance requested.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'View', onPress: () => console.log('View SOS') },
      ]
    );
  };

  const refreshStatus = async () => {
    try {
      const status = await ApiClient.getWatchStatus();
      setIsConnected(status.connected);
      if (status.device) {
        setWatchDevice(status.device);
      }
    } catch (error) {
      console.error('Failed to get watch status:', error);
    }
  };

  const connectWatch = async () => {
    setIsConnecting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const deviceId = `watch_${Date.now()}`;
      const deviceType = Platform.OS === 'ios' ? 'apple_watch' : 'wear_os';
      
      const response = await ApiClient.syncWatch({
        deviceId,
        deviceType,
        watchName: Platform.OS === 'ios' ? 'Apple Watch' : 'Wear OS Device',
        appVersion: '1.0.0',
      });

      setIsConnected(true);
      setWatchDevice({
        id: response.deviceId,
        deviceType,
        deviceId,
        watchName: Platform.OS === 'ios' ? 'Apple Watch' : 'Wear OS Device',
        isActive: true,
        lastSync: response.lastSync,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Watch connected successfully');
    } catch (error) {
      console.error('Failed to connect watch:', error);
      Alert.alert('Error', 'Failed to connect watch. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWatch = async () => {
    if (!watchDevice) return;

    Alert.alert(
      'Disconnect Watch',
      'Are you sure you want to disconnect your watch?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await ApiClient.disconnectWatch(watchDevice.deviceId);
              setIsConnected(false);
              setWatchDevice(null);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error) {
              Alert.alert('Error', 'Failed to disconnect watch');
            }
          },
        },
      ]
    );
  };

  const sendTestAlert = async () => {
    if (!isConnected) {
      Alert.alert('Not Connected', 'Please connect your watch first');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    try {
      await ApiClient.sendHapticAlertToWatch('info', 'Test alert from SafeRoute', 'low');
      Alert.alert('Success', 'Test alert sent to watch');
    } catch (error) {
      Alert.alert('Error', 'Failed to send test alert');
    }
  };

  const syncRouteToWatch = async (routeData: any): Promise<boolean> => {
    if (!isConnected) return false;

    try {
      await ApiClient.sendRouteToWatch(routeData);
      return true;
    } catch (error) {
      console.error('Failed to sync route to watch:', error);
      return false;
    }
  };

  const updateSettings = async (newSettings: Partial<WatchSettings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
    
    // In production, save to backend
    // await ApiClient.updateWatchSettings(updatedSettings);
  };

  return {
    isConnected,
    isConnecting,
    watchDevice,
    settings,
    connectWatch,
    disconnectWatch,
    sendTestAlert,
    syncRouteToWatch,
    updateSettings,
    refreshStatus,
  };
};

export default useWatchConnection;
