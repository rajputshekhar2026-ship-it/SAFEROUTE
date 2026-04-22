// src/utils/voiceGuidance.ts

import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Types
export interface VoiceGuidanceOptions {
  language?: string;
  pitch?: number;
  rate?: number;
  volume?: number;
  voice?: string;
}

export interface VoiceGuidancePreferences {
  enabled: boolean;
  volume: number;
  rate: number;
  pitch: number;
  language: string;
  voice?: string;
  announceAlerts: boolean;
  announceTurns: boolean;
  announceDistance: boolean;
  announceSafety: boolean;
  announceRouteInfo: boolean;
}

export interface NavigationInstruction {
  type: 'turn' | 'straight' | 'arrive' | 'depart' | 'warning' | 'info';
  direction?: 'left' | 'right' | 'slight-left' | 'slight-right' | 'sharp-left' | 'sharp-right' | 'u-turn';
  distance?: number;
  street?: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
}

// Default preferences
const DEFAULT_PREFERENCES: VoiceGuidancePreferences = {
  enabled: true,
  volume: 1.0,
  rate: 1.0,
  pitch: 1.0,
  language: 'en-US',
  announceAlerts: true,
  announceTurns: true,
  announceDistance: true,
  announceSafety: true,
  announceRouteInfo: true,
};

class VoiceGuidanceManager {
  private isSpeaking: boolean = false;
  private speechQueue: string[] = [];
  private preferences: VoiceGuidancePreferences = DEFAULT_PREFERENCES;
  private currentUtterance: Speech.SpeechEvent | null = null;
  private isInitialized: boolean = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize voice guidance
   */
  private async initialize() {
    try {
      await this.loadPreferences();
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize voice guidance:', error);
    }
  }

  /**
   * Load user preferences
   */
  private async loadPreferences() {
    try {
      const stored = await AsyncStorage.getItem('voice_guidance_preferences');
      if (stored) {
        this.preferences = { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Failed to load voice guidance preferences:', error);
    }
  }

  /**
   * Save user preferences
   */
  async savePreferences(preferences: Partial<VoiceGuidancePreferences>) {
    this.preferences = { ...this.preferences, ...preferences };
    await AsyncStorage.setItem('voice_guidance_preferences', JSON.stringify(this.preferences));
  }

  /**
   * Get current preferences
   */
  getPreferences(): VoiceGuidancePreferences {
    return this.preferences;
  }

  /**
   * Check if voice guidance is available
   */
  isAvailable(): boolean {
    return Speech.isSpeakingAsync !== undefined;
  }

  /**
   * Check if currently speaking
   */
  isCurrentlySpeaking(): boolean {
    return this.isSpeaking;
  }

  /**
   * Stop current speech and clear queue
   */
  async stop(): Promise<void> {
    this.speechQueue = [];
    await Speech.stop();
    this.isSpeaking = false;
  }

  /**
   * Speak text with current preferences
   */
  async speak(text: string, options?: VoiceGuidanceOptions): Promise<void> {
    if (!this.preferences.enabled) return;
    if (!text || text.trim().length === 0) return;

    const speakOptions: Speech.SpeechOptions = {
      language: options?.language || this.preferences.language,
      pitch: options?.pitch || this.preferences.pitch,
      rate: options?.rate || this.preferences.rate,
      volume: options?.volume || this.preferences.volume,
      onStart: () => {
        this.isSpeaking = true;
      },
      onDone: () => {
        this.isSpeaking = false;
        this.processQueue();
      },
      onError: (error) => {
        console.error('Speech error:', error);
        this.isSpeaking = false;
        this.processQueue();
      },
    };

    // Add to queue if currently speaking
    if (this.isSpeaking) {
      this.speechQueue.push(text);
      return;
    }

    try {
      await Speech.speak(text, speakOptions);
    } catch (error) {
      console.error('Failed to speak:', error);
      this.isSpeaking = false;
    }
  }

  /**
   * Process queued speech
   */
  private processQueue(): void {
    if (this.speechQueue.length > 0 && !this.isSpeaking) {
      const nextText = this.speechQueue.shift();
      if (nextText) {
        this.speak(nextText);
      }
    }
  }

  /**
   * Speak navigation instruction
   */
  async speakInstruction(instruction: NavigationInstruction): Promise<void> {
    if (!this.preferences.enabled) return;

    let message = instruction.message;

    // Add distance information if needed
    if (instruction.distance && this.preferences.announceDistance) {
      const distanceText = this.formatDistance(instruction.distance);
      message = `${message} in ${distanceText}`;
    }

    // Add street name if available
    if (instruction.street) {
      message = `${message} onto ${instruction.street}`;
    }

    await this.speak(message, { rate: 0.9 });
  }

  /**
   * Format distance for voice
   */
  private formatDistance(meters: number): string {
    if (meters < 50) return 'less than 50 meters';
    if (meters < 100) return 'about 50 meters';
    if (meters < 200) return '100 meters';
    if (meters < 500) return `${Math.round(meters / 10) * 10} meters`;
    if (meters < 1000) return `${Math.round(meters / 100)} hundred meters`;
    return `${(meters / 1000).toFixed(1)} kilometers`;
  }

  /**
   * Speak turn instruction
   */
  async speakTurn(direction: string, distance?: number, street?: string): Promise<void> {
    if (!this.preferences.announceTurns) return;

    let turnMessage = '';
    switch (direction) {
      case 'left':
        turnMessage = 'Turn left';
        break;
      case 'right':
        turnMessage = 'Turn right';
        break;
      case 'slight-left':
        turnMessage = 'Bear left';
        break;
      case 'slight-right':
        turnMessage = 'Bear right';
        break;
      case 'sharp-left':
        turnMessage = 'Make a sharp left turn';
        break;
      case 'sharp-right':
        turnMessage = 'Make a sharp right turn';
        break;
      case 'u-turn':
        turnMessage = 'Make a U-turn';
        break;
      default:
        turnMessage = 'Continue straight';
    }

    const instruction: NavigationInstruction = {
      type: 'turn',
      direction: direction as any,
      distance,
      street,
      message: turnMessage,
      priority: 'high',
    };

    await this.speakInstruction(instruction);
  }

  /**
   * Speak straight instruction
   */
  async speakStraight(distance?: number, street?: string): Promise<void> {
    if (!this.preferences.announceTurns) return;

    const instruction: NavigationInstruction = {
      type: 'straight',
      distance,
      street,
      message: 'Continue straight',
      priority: 'medium',
    };

    await this.speakInstruction(instruction);
  }

  /**
   * Speak arrival message
   */
  async speakArrival(): Promise<void> {
    await this.speak('You have arrived at your destination.', { rate: 0.9 });
  }

  /**
   * Speak departure message
   */
  async speakDeparture(destination: string): Promise<void> {
    await this.speak(`Starting navigation to ${destination}. Follow the route for safety.`, { rate: 0.9 });
  }

  /**
   * Speak safety alert
   */
  async speakSafetyAlert(alert: string, severity: 'low' | 'medium' | 'high'): Promise<void> {
    if (!this.preferences.announceSafety) return;

    let prefix = '';
    switch (severity) {
      case 'high':
        prefix = 'Warning! ';
        break;
      case 'medium':
        prefix = 'Caution: ';
        break;
      case 'low':
        prefix = 'Notice: ';
        break;
    }

    await this.speak(`${prefix}${alert}`, { rate: severity === 'high' ? 0.8 : 0.9 });
  }

  /**
   * Speak route information
   */
  async speakRouteInfo(distance: number, duration: number, safetyScore?: number): Promise<void> {
    if (!this.preferences.announceRouteInfo) return;

    const distanceKm = (distance / 1000).toFixed(1);
    const minutes = Math.round(duration / 60);
    let message = `Route is ${distanceKm} kilometers, approximately ${minutes} minutes.`;

    if (safetyScore) {
      if (safetyScore >= 80) {
        message += ' This is a very safe route.';
      } else if (safetyScore >= 60) {
        message += ' This route has good safety ratings.';
      } else if (safetyScore >= 40) {
        message += ' Caution advised on this route.';
      } else {
        message += ' Warning: This route has safety concerns. Consider an alternative.';
      }
    }

    await this.speak(message);
  }

  /**
   * Speak rerouting message
   */
  async speakRerouting(): Promise<void> {
    await this.speak('Rerouting to a safer path.', { rate: 0.9 });
  }

  /**
   * Speak deviation warning
   */
  async speakDeviation(): Promise<void> {
    await this.speak('Route deviation detected. Rerouting for your safety.', { rate: 0.9 });
  }

  /**
   * Speak danger zone warning
   */
  async speakDangerZone(distance: number, crimeType?: string): Promise<void> {
    if (!this.preferences.announceSafety) return;

    const distanceText = this.formatDistance(distance);
    let message = `Warning: You are entering a high-risk area in ${distanceText}.`;
    
    if (crimeType) {
      message += ` Recent reports of ${crimeType} in this area. Stay alert.`;
    } else {
      message += ' Please stay alert and aware of your surroundings.';
    }

    await this.speak(message, { rate: 0.85 });
  }

  /**
   * Speak safe refuge nearby
   */
  async speakSafeRefuge(refugeName: string, distance: number): Promise<void> {
    if (!this.preferences.announceSafety) return;

    const distanceText = this.formatDistance(distance);
    await this.speak(`Safe refuge nearby: ${refugeName} is ${distanceText} away.`, { rate: 0.9 });
  }

  /**
   * Speak SOS confirmation
   */
  async speakSOSConfirmation(): Promise<void> {
    await this.speak('Emergency alert sent. Help is on the way. Stay calm and stay on the line.', { rate: 0.8 });
  }

  /**
   * Speak SOS cancellation
   */
  async speakSOSCancellation(): Promise<void> {
    await this.speak('Emergency alert cancelled.', { rate: 0.9 });
  }

  /**
   * Speak check-in confirmation
   */
  async speakCheckInConfirmation(): Promise<void> {
    await this.speak('Check-in successful. Your location has been recorded.', { rate: 0.9 });
  }

  /**
   * Get available voices
   */
  async getAvailableVoices(): Promise<Speech.Voice[]> {
    try {
      return await Speech.getAvailableVoicesAsync();
    } catch (error) {
      console.error('Failed to get available voices:', error);
      return [];
    }
  }

  /**
   * Set voice
   */
  async setVoice(voiceIdentifier: string): Promise<void> {
    this.preferences.voice = voiceIdentifier;
    await this.savePreferences(this.preferences);
  }

  /**
   * Test voice guidance
   */
  async test(): Promise<void> {
    await this.speak('Voice guidance test. Your safety is our priority.', { rate: 0.9 });
  }

  /**
   * Clean up
   */
  async cleanup(): Promise<void> {
    await this.stop();
  }
}

// Export singleton instance
export const voiceGuidance = new VoiceGuidanceManager();

// Hook for using voice guidance in components
import { useCallback, useEffect, useState } from 'react';

export const useVoiceGuidance = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [preferences, setPreferences] = useState<VoiceGuidancePreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    loadPreferences();
    const interval = setInterval(() => {
      setIsSpeaking(voiceGuidance.isCurrentlySpeaking());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const loadPreferences = async () => {
    const prefs = voiceGuidance.getPreferences();
    setPreferences(prefs);
  };

  const speak = useCallback((text: string, options?: VoiceGuidanceOptions) => {
    return voiceGuidance.speak(text, options);
  }, []);

  const stop = useCallback(() => {
    return voiceGuidance.stop();
  }, []);

  const speakTurn = useCallback((direction: string, distance?: number, street?: string) => {
    return voiceGuidance.speakTurn(direction, distance, street);
  }, []);

  const speakSafetyAlert = useCallback((alert: string, severity: 'low' | 'medium' | 'high') => {
    return voiceGuidance.speakSafetyAlert(alert, severity);
  }, []);

  const updatePreferences = useCallback(async (newPrefs: Partial<VoiceGuidancePreferences>) => {
    await voiceGuidance.savePreferences(newPrefs);
    const updatedPrefs = voiceGuidance.getPreferences();
    setPreferences(updatedPrefs);
  }, []);

  return {
    isSpeaking,
    preferences,
    speak,
    stop,
    speakTurn,
    speakSafetyAlert,
    speakArrival: voiceGuidance.speakArrival.bind(voiceGuidance),
    speakDeparture: voiceGuidance.speakDeparture.bind(voiceGuidance),
    speakRouteInfo: voiceGuidance.speakRouteInfo.bind(voiceGuidance),
    speakRerouting: voiceGuidance.speakRerouting.bind(voiceGuidance),
    speakDeviation: voiceGuidance.speakDeviation.bind(voiceGuidance),
    speakDangerZone: voiceGuidance.speakDangerZone.bind(voiceGuidance),
    speakSafeRefuge: voiceGuidance.speakSafeRefuge.bind(voiceGuidance),
    speakSOSConfirmation: voiceGuidance.speakSOSConfirmation.bind(voiceGuidance),
    updatePreferences,
    test: voiceGuidance.test.bind(voiceGuidance),
  };
};

export default voiceGuidance;
