// src/hooks/useHealthMode.ts

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { EventEmitter } from 'events';

// Types
export interface HealthModeConfig {
  isActive: boolean;
  disguiseType: 'weather' | 'news' | 'calculator' | 'notes' | 'settings';
  autoActivateOnShake: boolean;
  autoActivateOnTimeRange?: {
    enabled: boolean;
    startTime: string; // "22:00"
    endTime: string;   // "06:00"
  };
  quickExitGesture: 'doubleTap' | 'longPress' | 'shake' | 'threeFingerTap';
  fakeDataRefreshInterval: number; // in milliseconds
  customDisguiseName?: string;
  biometricRequiredForExit: boolean;
}

export interface FakeWeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  forecast: Array<{
    day: string;
    high: number;
    low: number;
    condition: string;
  }>;
  alerts?: string[];
}

export interface FakeNewsData {
  headlines: Array<{
    title: string;
    source: string;
    timestamp: string;
    category: string;
  }>;
  breakingNews?: string;
  topStories: string[];
}

export interface HealthModeContextType {
  isHealthMode: boolean;
  config: HealthModeConfig;
  fakeWeatherData: FakeWeatherData;
  fakeNewsData: FakeNewsData;
  toggleHealthMode: () => Promise<void>;
  activateHealthMode: () => Promise<void>;
  deactivateHealthMode: () => Promise<void>;
  updateConfig: (newConfig: Partial<HealthModeConfig>) => Promise<void>;
  registerSecretGesture: () => void;
  isDisguised: boolean;
  currentDisguiseUI: string;
  secretGestureCount: number;
  resetSecretGesture: () => void;
}

// Default configuration
const DEFAULT_CONFIG: HealthModeConfig = {
  isActive: false,
  disguiseType: 'weather',
  autoActivateOnShake: true,
  autoActivateOnTimeRange: {
    enabled: true,
    startTime: "22:00",
    endTime: "06:00",
  },
  quickExitGesture: 'doubleTap',
  fakeDataRefreshInterval: 300000, // 5 minutes
  biometricRequiredForExit: false,
};

// Generate realistic fake weather data
const generateFakeWeatherData = (): FakeWeatherData => {
  const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Clear Sky', 'Mist', 'Foggy'];
  const randomCondition = conditions[Math.floor(Math.random() * conditions.length)];
  const baseTemp = Math.floor(Math.random() * 30) + 5; // 5-35°C
  
  return {
    temperature: baseTemp,
    condition: randomCondition,
    humidity: Math.floor(Math.random() * 60) + 30,
    windSpeed: Math.floor(Math.random() * 25),
    forecast: [
      { day: 'Today', high: baseTemp + 2, low: baseTemp - 3, condition: randomCondition },
      { day: 'Tomorrow', high: baseTemp + 1, low: baseTemp - 2, condition: conditions[Math.floor(Math.random() * conditions.length)] },
      { day: 'Wednesday', high: baseTemp + 3, low: baseTemp - 1, condition: conditions[Math.floor(Math.random() * conditions.length)] },
      { day: 'Thursday', high: baseTemp, low: baseTemp - 4, condition: conditions[Math.floor(Math.random() * conditions.length)] },
      { day: 'Friday', high: baseTemp + 2, low: baseTemp - 2, condition: conditions[Math.floor(Math.random() * conditions.length)] },
    ],
  };
};

// Generate fake news data
const generateFakeNewsData = (): FakeNewsData => {
  const headlines = [
    { title: 'Local Community Center Opens New Safe Space', source: 'City News', timestamp: '2 hours ago', category: 'Local' },
    { title: 'New Lighting Initiative Launches Downtown', source: 'Safety First', timestamp: '5 hours ago', category: 'Safety' },
    { title: 'City Council Approves Neighborhood Watch Program', source: 'Daily Times', timestamp: '1 day ago', category: 'Community' },
    { title: 'Public Transportation Expands Night Service', source: 'Metro News', timestamp: '2 days ago', category: 'Transit' },
    { title: 'Weather Alert: Clear Skies Expected All Week', source: 'Weather Network', timestamp: '3 days ago', category: 'Weather' },
  ];
  
  return {
    headlines,
    breakingNews: 'City announces new safety initiatives for downtown area',
    topStories: headlines.slice(0, 3).map(h => h.title),
  };
};

// Create context
const HealthModeContext = createContext<HealthModeContextType | undefined>(undefined);

// Provider component
export const HealthModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<HealthModeConfig>(DEFAULT_CONFIG);
  const [fakeWeatherData, setFakeWeatherData] = useState<FakeWeatherData>(generateFakeWeatherData());
  const [fakeNewsData, setFakeNewsData] = useState<FakeNewsData>(generateFakeNewsData());
  const [secretGestureCount, setSecretGestureCount] = useState(0);
  const [lastGestureTime, setLastGestureTime] = useState(0);
  const [shakeCount, setShakeCount] = useState(0);
  const appStateRef = useRef(AppState.currentState);
  const gestureTimeoutRef = useRef<NodeJS.Timeout>();
  const dataRefreshIntervalRef = useRef<NodeJS.Timeout>();
  const lastShakeTimeRef = useRef(0);

  // Load saved config on mount
  useEffect(() => {
    loadConfig();
    setupShakeDetection();
    setupAppStateListener();
    startDataRefreshInterval();

    return () => {
      if (dataRefreshIntervalRef.current) {
        clearInterval(dataRefreshIntervalRef.current);
      }
      if (gestureTimeoutRef.current) {
        clearTimeout(gestureTimeoutRef.current);
      }
      removeShakeDetection();
    };
  }, []);

  // Check auto-activation based on time
  useEffect(() => {
    if (config.autoActivateOnTimeRange?.enabled) {
      checkTimeBasedActivation();
      const interval = setInterval(checkTimeBasedActivation, 60000); // Check every minute
      return () => clearInterval(interval);
    }
  }, [config.autoActivateOnTimeRange]);

  // Refresh fake data periodically
  useEffect(() => {
    if (config.isActive) {
      refreshFakeData();
    }
  }, [config.isActive]);

  const loadConfig = async () => {
    try {
      const savedConfig = await AsyncStorage.getItem('healthModeConfig');
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        setConfig({ ...DEFAULT_CONFIG, ...parsedConfig });
      }
    } catch (error) {
      console.error('Failed to load health mode config:', error);
    }
  };

  const saveConfig = async (newConfig: HealthModeConfig) => {
    try {
      await AsyncStorage.setItem('healthModeConfig', JSON.stringify(newConfig));
      setConfig(newConfig);
    } catch (error) {
      console.error('Failed to save health mode config:', error);
    }
  };

  const setupShakeDetection = () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      // For React Native, we can use the shake event
      const ShakeEvent = NativeModules.ShakeEvent || 
                         (Platform.OS === 'ios' ? NativeModules.RNCShake : null);
      
      if (ShakeEvent) {
        DeviceEventEmitter.addListener('ShakeEvent', () => {
          if (config.autoActivateOnShake && !config.isActive) {
            const now = Date.now();
            if (now - lastShakeTimeRef.current > 2000) { // Debounce
              lastShakeTimeRef.current = now;
              handleShakeGesture();
            }
          }
        });
      }
    }
  };

  const removeShakeDetection = () => {
    DeviceEventEmitter.removeAllListeners('ShakeEvent');
  };

  const setupAppStateListener = () => {
    AppState.addEventListener('change', handleAppStateChange);
  };

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground
      checkTimeBasedActivation();
    }
    appStateRef.current = nextAppState;
  };

  const checkTimeBasedActivation = () => {
    if (!config.autoActivateOnTimeRange?.enabled) return;
    
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const { startTime, endTime } = config.autoActivateOnTimeRange;
    
    let shouldActivate = false;
    
    if (startTime <= endTime) {
      // Same day range
      shouldActivate = currentTime >= startTime && currentTime <= endTime;
    } else {
      // Overnight range
      shouldActivate = currentTime >= startTime || currentTime <= endTime;
    }
    
    if (shouldActivate && !config.isActive) {
      activateHealthMode(true); // Silent activation
    } else if (!shouldActivate && config.isActive && !config.biometricRequiredForExit) {
      deactivateHealthMode(true); // Silent deactivation
    }
  };

  const handleShakeGesture = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newCount = shakeCount + 1;
    setShakeCount(newCount);
    
    if (newCount >= 3) {
      activateHealthMode();
      setShakeCount(0);
    }
    
    // Reset shake count after 2 seconds
    setTimeout(() => setShakeCount(0), 2000);
  };

  const registerSecretGesture = useCallback(() => {
    const now = Date.now();
    const timeSinceLastGesture = now - lastGestureTime;
    
    if (timeSinceLastGesture < 500) {
      // Double tap detected
      const newCount = secretGestureCount + 1;
      setSecretGestureCount(newCount);
      
      if (newCount >= 2) {
        // Secret gesture completed - toggle health mode
        toggleHealthMode();
        setSecretGestureCount(0);
        
        // Provide haptic feedback
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      
      // Clear gesture count after timeout
      if (gestureTimeoutRef.current) {
        clearTimeout(gestureTimeoutRef.current);
      }
      gestureTimeoutRef.current = setTimeout(() => {
        setSecretGestureCount(0);
      }, 1000);
    } else {
      setSecretGestureCount(1);
    }
    
    setLastGestureTime(now);
  }, [secretGestureCount, lastGestureTime]);

  const resetSecretGesture = useCallback(() => {
    setSecretGestureCount(0);
    if (gestureTimeoutRef.current) {
      clearTimeout(gestureTimeoutRef.current);
    }
  }, []);

  const refreshFakeData = () => {
    setFakeWeatherData(generateFakeWeatherData());
    setFakeNewsData(generateFakeNewsData());
  };

  const startDataRefreshInterval = () => {
    if (dataRefreshIntervalRef.current) {
      clearInterval(dataRefreshIntervalRef.current);
    }
    dataRefreshIntervalRef.current = setInterval(() => {
      if (config.isActive) {
        refreshFakeData();
      }
    }, config.fakeDataRefreshInterval);
  };

  const activateHealthMode = async (silent: boolean = false) => {
    if (config.isActive) return;
    
    if (!silent) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    
    const newConfig = { ...config, isActive: true };
    await saveConfig(newConfig);
    
    // Refresh fake data on activation
    refreshFakeData();
    
    // Emit event for UI to react
    const event = new CustomEvent('healthModeActivated', { 
      detail: { disguiseType: config.disguiseType } 
    });
    // @ts-ignore
    window.dispatchEvent(event);
    
    console.log(`Health mode activated with disguise: ${config.disguiseType}`);
  };

  const deactivateHealthMode = async (silent: boolean = false) => {
    if (!config.isActive) return;
    
    if (!silent) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    
    const newConfig = { ...config, isActive: false };
    await saveConfig(newConfig);
    
    // Emit event for UI to react
    const event = new CustomEvent('healthModeDeactivated');
    // @ts-ignore
    window.dispatchEvent(event);
    
    console.log('Health mode deactivated');
  };

  const toggleHealthMode = async () => {
    if (config.isActive) {
      // Check if biometric is required for exit
      if (config.biometricRequiredForExit) {
        // In a real implementation, you would show biometric prompt here
        const biometricSuccess = await promptBiometricAuthentication();
        if (!biometricSuccess) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return;
        }
      }
      await deactivateHealthMode();
    } else {
      await activateHealthMode();
    }
  };

  const promptBiometricAuthentication = async (): Promise<boolean> => {
    // This is a placeholder. In production, use expo-local-authentication
    // For now, return true to allow exit
    return true;
  };

  const updateConfig = async (newConfig: Partial<HealthModeConfig>) => {
    const updatedConfig = { ...config, ...newConfig };
    await saveConfig(updatedConfig);
    
    // Restart data refresh interval if needed
    if (newConfig.fakeDataRefreshInterval) {
      startDataRefreshInterval();
    }
  };

  const value: HealthModeContextType = {
    isHealthMode: config.isActive,
    config,
    fakeWeatherData,
    fakeNewsData,
    toggleHealthMode,
    activateHealthMode: () => activateHealthMode(),
    deactivateHealthMode: () => deactivateHealthMode(),
    updateConfig,
    registerSecretGesture,
    isDisguised: config.isActive,
    currentDisguiseUI: config.disguiseType,
    secretGestureCount,
    resetSecretGesture,
  };

  return (
    <HealthModeContext.Provider value={value}>
      {children}
    </HealthModeContext.Provider>
  );
};

// Custom hook to use health mode
export const useHealthMode = (): HealthModeContextType => {
  const context = useContext(HealthModeContext);
  if (!context) {
    throw new Error('useHealthMode must be used within a HealthModeProvider');
  }
  return context;
};

// HOC to wrap components that should be aware of health mode
export const withHealthMode = <P extends object>(
  Component: React.ComponentType<P>
): React.FC<P & { healthModeContext?: HealthModeContextType }> => {
  return (props) => {
    const healthModeContext = useHealthMode();
    return <Component {...props} healthModeContext={healthModeContext} />;
  };
};

// Hook for components that need to respond to health mode changes
export const useHealthModeAware = () => {
  const { isHealthMode, currentDisguiseUI } = useHealthMode();
  const [shouldHideSensitiveInfo, setShouldHideSensitiveInfo] = useState(isHealthMode);
  
  useEffect(() => {
    setShouldHideSensitiveInfo(isHealthMode);
  }, [isHealthMode]);
  
  const getDisguisedContent = (normalContent: any, disguisedContent: any) => {
    return isHealthMode ? disguisedContent : normalContent;
  };
  
  return {
    isHealthMode,
    currentDisguiseUI,
    shouldHideSensitiveInfo,
    getDisguisedContent,
  };
};

export default useHealthMode;
