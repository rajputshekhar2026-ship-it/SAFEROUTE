// src/hooks/useSOS.ts

import { useState, useRef, useCallback, useEffect } from 'react';
import { Alert, Vibration, Platform, AppState, AppStateStatus } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiClient from '../api/client';
import WebSocketManager from '../api/websocket';
import { AudioService } from '../services/AudioService';
import { CameraService } from '../services/CameraService';
import { LocationData } from './useLocation';

// Types
export interface SOSData {
  id?: string;
  location: LocationData;
  timestamp: number;
  audioUri?: string;
  photoUri?: string;
  message?: string;
  contacts: string[];
  includeLocationHistory: boolean;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  response?: SOSResponse;
}

export interface SOSResponse {
  acknowledged: boolean;
  responderId?: string;
  eta?: number;
  message?: string;
  timestamp: number;
}

export interface SOSContact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  isEmergencyContact: boolean;
  notifyViaSMS: boolean;
  notifyViaPush: boolean;
}

export interface SOSConfig {
  autoSend: boolean;
  autoSendDelay: number; // seconds
  includePhoto: boolean;
  includeAudio: boolean;
  includeLocationHistory: boolean;
  historyDuration: number; // seconds of history to include
  vibrationPattern: number[];
  sosMessageTemplate: string;
  retryAttempts: number;
  retryDelay: number;
}

// Default configuration
const DEFAULT_SOS_CONFIG: SOSConfig = {
  autoSend: true,
  autoSendDelay: 3,
  includePhoto: true,
  includeAudio: true,
  includeLocationHistory: true,
  historyDuration: 30,
  vibrationPattern: [0, 500, 200, 500, 200, 1000],
  sosMessageTemplate: "EMERGENCY SOS! I need help at {location}. Time: {time}. Please contact me immediately.",
  retryAttempts: 3,
  retryDelay: 2000,
};

// SOS Event Emitter
class SOSEventEmitter {
  private static instance: SOSEventEmitter;
  private listeners: Map<string, Set<Function>> = new Map();

  static getInstance(): SOSEventEmitter {
    if (!SOSEventEmitter.instance) {
      SOSEventEmitter.instance = new SOSEventEmitter();
    }
    return SOSEventEmitter.instance;
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

export const sosEvents = SOSEventEmitter.getInstance();

// Hook
interface UseSOSOptions {
  config?: Partial<SOSConfig>;
  onSOSStarted?: () => void;
  onSOSSent?: (data: SOSData) => void;
  onSOSFailed?: (error: Error) => void;
  onSOSAcknowledged?: (response: SOSResponse) => void;
}

interface UseSOSReturn {
  isSOSActive: boolean;
  sosData: SOSData | null;
  countdown: number;
  config: SOSConfig;
  triggerSOS: (options?: Partial<SOSData>) => Promise<void>;
  cancelSOS: () => Promise<void>;
  updateConfig: (newConfig: Partial<SOSConfig>) => Promise<void>;
  addContact: (contact: SOSContact) => Promise<void>;
  removeContact: (contactId: string) => Promise<void>;
  getContacts: () => Promise<SOSContact[]>;
  sendTestSOS: () => Promise<void>;
  getSOSHistory: () => Promise<SOSData[]>;
  clearSOSHistory: () => Promise<void>;
}

export const useSOS = (options: UseSOSOptions = {}): UseSOSReturn => {
  const {
    config: userConfig,
    onSOSStarted,
    onSOSSent,
    onSOSFailed,
    onSOSAcknowledged,
  } = options;

  const [isSOSActive, setIsSOSActive] = useState(false);
  const [sosData, setSOSData] = useState<SOSData | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [config, setConfig] = useState<SOSConfig>({ ...DEFAULT_SOS_CONFIG, ...userConfig });
  const [contacts, setContacts] = useState<SOSContact[]>([]);
  
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const locationHistoryRef = useRef<LocationData[]>([]);
  const appStateRef = useRef(AppState.currentState);

  // Load saved config and contacts on mount
  useEffect(() => {
    loadConfig();
    loadContacts();
    loadSOSHistory();
    setupAppStateListener();
    setupWebSocketListeners();

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current);
      }
      cleanupWebSocketListeners();
    };
  }, []);

  const setupAppStateListener = () => {
    AppState.addEventListener('change', handleAppStateChange);
  };

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground, check if SOS is still active
      if (isSOSActive && sosData?.status === 'pending') {
        showSOSActiveAlert();
      }
    }
    appStateRef.current = nextAppState;
  };

  const setupWebSocketListeners = () => {
    WebSocketManager.on('sos_received', handleSOSResponse);
  };

  const cleanupWebSocketListeners = () => {
    WebSocketManager.off('sos_received', handleSOSResponse);
  };

  const handleSOSResponse = (response: SOSResponse) => {
    if (sosData && sosData.status === 'sent') {
      const updatedSOS = { ...sosData, response, status: 'sent' as const };
      setSOSData(updatedSOS);
      onSOSAcknowledged?.(response);
      
      // Show acknowledgment alert
      if (response.acknowledged) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'SOS Acknowledged',
          response.message || 'Emergency services have been notified. Help is on the way.',
          [{ text: 'OK' }]
        );
      }
    }
  };

  const loadConfig = async () => {
    try {
      const savedConfig = await AsyncStorage.getItem('sos_config');
      if (savedConfig) {
        setConfig({ ...DEFAULT_SOS_CONFIG, ...JSON.parse(savedConfig) });
      }
    } catch (error) {
      console.error('Failed to load SOS config:', error);
    }
  };

  const loadContacts = async () => {
    try {
      const response = await ApiClient.getTrustedContacts();
      if (response && response.contacts) {
        setContacts(response.contacts);
      }
    } catch (error) {
      console.error('Failed to load contacts:', error);
      // Load from local storage as fallback
      const localContacts = await AsyncStorage.getItem('sos_contacts');
      if (localContacts) {
        setContacts(JSON.parse(localContacts));
      }
    }
  };

  const loadSOSHistory = async () => {
    try {
      const history = await AsyncStorage.getItem('sos_history');
      if (history) {
        // Don't set to state, just cache
        JSON.parse(history);
      }
    } catch (error) {
      console.error('Failed to load SOS history:', error);
    }
  };

  const saveSOSHistory = async (sos: SOSData) => {
    try {
      const history = await AsyncStorage.getItem('sos_history');
      const historyArray = history ? JSON.parse(history) : [];
      historyArray.unshift(sos);
      // Keep last 50 entries
      const trimmedHistory = historyArray.slice(0, 50);
      await AsyncStorage.setItem('sos_history', JSON.stringify(trimmedHistory));
    } catch (error) {
      console.error('Failed to save SOS history:', error);
    }
  };

  const updateConfig = async (newConfig: Partial<SOSConfig>) => {
    const updatedConfig = { ...config, ...newConfig };
    setConfig(updatedConfig);
    await AsyncStorage.setItem('sos_config', JSON.stringify(updatedConfig));
  };

  const addContact = async (contact: SOSContact) => {
    const updatedContacts = [...contacts, contact];
    setContacts(updatedContacts);
    await AsyncStorage.setItem('sos_contacts', JSON.stringify(updatedContacts));
  };

  const removeContact = async (contactId: string) => {
    const updatedContacts = contacts.filter(c => c.id !== contactId);
    setContacts(updatedContacts);
    await AsyncStorage.setItem('sos_contacts', JSON.stringify(updatedContacts));
  };

  const getContacts = async (): Promise<SOSContact[]> => {
    return contacts;
  };

  const collectLocationHistory = async (durationSeconds: number): Promise<LocationData[]> => {
    // In production, this would query stored location history
    // For now, return current location
    return locationHistoryRef.current.slice(-Math.floor(durationSeconds / 5));
  };

  const captureAudio = async (): Promise<string | undefined> => {
    try {
      const audioUri = await AudioService.recordAudio(5000); // 5 seconds
      return audioUri;
    } catch (error) {
      console.error('Failed to capture audio:', error);
      return undefined;
    }
  };

  const capturePhoto = async (): Promise<string | undefined> => {
    try {
      const photoUri = await CameraService.takePhoto();
      return photoUri;
    } catch (error) {
      console.error('Failed to capture photo:', error);
      return undefined;
    }
  };

  const startCountdown = (delaySeconds: number) => {
    setCountdown(delaySeconds);
    
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    
    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
          }
          sendSOS();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const triggerVibration = () => {
    Vibration.vibrate(config.vibrationPattern, true);
  };

  const stopVibration = () => {
    Vibration.cancel();
  };

  const sendSOS = async () => {
    if (!sosData) return;
    
    try {
      // Update status to sending
      setSOSData(prev => prev ? { ...prev, status: 'pending' } : null);
      
      // Prepare SOS data
      let audioUri = sosData.audioUri;
      let photoUri = sosData.photoUri;
      let locationHistory: LocationData[] = [];
      
      // Capture media if not already captured
      if (config.includeAudio && !audioUri) {
        audioUri = await captureAudio();
      }
      
      if (config.includePhoto && !photoUri) {
        photoUri = await capturePhoto();
      }
      
      if (config.includeLocationHistory) {
        locationHistory = await collectLocationHistory(config.historyDuration);
      }
      
      // Send SOS via WebSocket
      const sosPayload = {
        location: sosData.location,
        timestamp: Date.now(),
        audioUri,
        photoUri,
        message: sosData.message || config.sosMessageTemplate
          .replace('{location}', `${sosData.location.lat}, ${sosData.location.lng}`)
          .replace('{time}', new Date().toLocaleString()),
        contacts: sosData.contacts,
        includeLocationHistory: config.includeLocationHistory,
        locationHistory: locationHistory,
      };
      
      // Send to backend
      const response = await ApiClient.sendSOSMessage(sosPayload);
      WebSocketManager.sendSOS(sosPayload);
      
      const updatedSOS: SOSData = {
        ...sosData,
        audioUri,
        photoUri,
        status: 'sent',
        id: response.id,
      };
      
      setSOSData(updatedSOS);
      await saveSOSHistory(updatedSOS);
      
      onSOSSent?.(updatedSOS);
      
      // Stop vibration after sending
      stopVibration();
      
      // Show confirmation
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'SOS Sent',
        'Emergency alert has been sent to your contacts and emergency services.',
        [{ text: 'OK' }]
      );
      
      // Auto-cancel after 30 seconds if no response
      setTimeout(() => {
        if (isSOSActive) {
          cancelSOS();
        }
      }, 30000);
      
    } catch (error) {
      console.error('Failed to send SOS:', error);
      
      const updatedSOS = { ...sosData, status: 'failed' as const };
      setSOSData(updatedSOS);
      
      onSOSFailed?.(error as Error);
      
      // Retry logic
      if (config.retryAttempts > 0) {
        let attempts = 0;
        retryIntervalRef.current = setInterval(async () => {
          attempts++;
          if (attempts >= config.retryAttempts) {
            if (retryIntervalRef.current) {
              clearInterval(retryIntervalRef.current);
            }
            Alert.alert(
              'SOS Failed',
              'Unable to send SOS. Please check your connection and try again.',
              [{ text: 'OK' }]
            );
          } else {
            await sendSOS();
          }
        }, config.retryDelay);
      }
    }
  };

  const triggerSOS = async (options?: Partial<SOSData>) => {
    if (isSOSActive) {
      Alert.alert('SOS Already Active', 'An SOS alert is already in progress.');
      return;
    }
    
    // Trigger haptic feedback
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    triggerVibration();
    
    // Get current location
    let currentLocation = options?.location;
    if (!currentLocation) {
      // In production, get from location hook
      currentLocation = { lat: 0, lng: 0, timestamp: Date.now() };
    }
    
    // Get contacts
    const contactList = options?.contacts || contacts.filter(c => c.isEmergencyContact).map(c => c.id);
    
    const newSOSData: SOSData = {
      location: currentLocation,
      timestamp: Date.now(),
      contacts: contactList,
      includeLocationHistory: config.includeLocationHistory,
      status: 'pending',
      ...options,
    };
    
    setSOSData(newSOSData);
    setIsSOSActive(true);
    
    onSOSStarted?.();
    
    if (config.autoSend) {
      startCountdown(config.autoSendDelay);
      
      // Show cancelable alert
      Alert.alert(
        '🚨 SOS Alert',
        `SOS will be sent in ${config.autoSendDelay} seconds. Tap Cancel if you're safe.`,
        [
          { text: 'Cancel SOS', onPress: cancelSOS, style: 'cancel' },
          { text: 'Send Now', onPress: sendSOS, style: 'destructive' },
        ],
        { cancelable: false }
      );
    } else {
      // Manual send
      Alert.alert(
        '🚨 Trigger SOS?',
        'Are you sure you want to send an emergency alert?',
        [
          { text: 'Cancel', onPress: cancelSOS, style: 'cancel' },
          { text: 'Send SOS', onPress: sendSOS, style: 'destructive' },
        ]
      );
    }
  };

  const cancelSOS = async () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    if (retryIntervalRef.current) {
      clearInterval(retryIntervalRef.current);
    }
    
    stopVibration();
    
    setIsSOSActive(false);
    setSOSData(null);
    setCountdown(0);
    
    // Notify backend that SOS was cancelled
    if (sosData?.id) {
      await ApiClient.cancelSOS(sosData.id);
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const sendTestSOS = async () => {
    const testData: Partial<SOSData> = {
      message: 'TEST SOS - This is a test message',
      contacts: contacts.slice(0, 1).map(c => c.id),
      includeLocationHistory: false,
    };
    
    await triggerSOS(testData);
    
    // Auto-cancel after 5 seconds for test
    setTimeout(() => {
      if (isSOSActive) {
        cancelSOS();
      }
    }, 5000);
  };

  const getSOSHistory = async (): Promise<SOSData[]> => {
    try {
      const history = await AsyncStorage.getItem('sos_history');
      return history ? JSON.parse(history) : [];
    } catch (error) {
      console.error('Failed to get SOS history:', error);
      return [];
    }
  };

  const clearSOSHistory = async () => {
    await AsyncStorage.removeItem('sos_history');
  };

  const showSOSActiveAlert = () => {
    Alert.alert(
      'SOS Active',
      'An SOS alert is currently active. Would you like to cancel it?',
      [
        { text: 'Keep Active', style: 'default' },
        { text: 'Cancel SOS', onPress: cancelSOS, style: 'destructive' },
      ]
    );
  };

  return {
    isSOSActive,
    sosData,
    countdown,
    config,
    triggerSOS,
    cancelSOS,
    updateConfig,
    addContact,
    removeContact,
    getContacts,
    sendTestSOS,
    getSOSHistory,
    clearSOSHistory,
  };
};

// Helper hook for auto-SOS based on inactivity
export const useAutoSOS = (inactivityThreshold: number = 60000) => {
  const { triggerSOS, isSOSActive } = useSOS();
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [warningShown, setWarningShown] = useState(false);
  
  useEffect(() => {
    const interval = setInterval(() => {
      const inactiveTime = Date.now() - lastActivity;
      
      if (!isSOSActive && inactiveTime >= inactivityThreshold) {
        if (!warningShown && inactiveTime >= inactivityThreshold - 10000) {
          // Show warning 10 seconds before auto-SOS
          Alert.alert(
            'Inactivity Detected',
            'You have been inactive for a while. Tap OK if you are safe.',
            [
              { 
                text: 'I\'m Safe', 
                onPress: () => {
                  setLastActivity(Date.now());
                  setWarningShown(false);
                } 
              },
              { 
                text: 'Trigger SOS', 
                onPress: () => triggerSOS(),
                style: 'destructive' 
              },
            ]
          );
          setWarningShown(true);
        } else if (inactiveTime >= inactivityThreshold) {
          triggerSOS();
        }
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [lastActivity, isSOSActive, inactivityThreshold, triggerSOS, warningShown]);
  
  const recordActivity = () => {
    setLastActivity(Date.now());
    setWarningShown(false);
  };
  
  return { recordActivity };
};

export default useSOS;
