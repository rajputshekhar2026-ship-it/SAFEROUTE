// src/utils/haptics.ts

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Haptic feedback types
export type HapticType = 
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error'
  | 'selection'
  | 'impact'
  | 'notification'
  | 'custom';

export interface HapticPattern {
  type: HapticType;
  intensity?: number;
  duration?: number;
  pattern?: number[];
}

// Custom haptic patterns
const CUSTOM_PATTERNS: Record<string, number[]> = {
  SOS: [0, 200, 100, 200, 100, 200, 100, 500, 200, 500],
  DANGER: [0, 300, 100, 300, 100, 300],
  WARNING: [0, 500, 200, 500],
  ALERT: [0, 200, 50, 200, 50, 200],
  NAVIGATION_TURN: [0, 100, 50, 100],
  NAVIGATION_STRAIGHT: [0, 50],
  SELECTION_CONFIRM: [0, 50, 30, 50],
  ERROR: [0, 200, 100, 200, 100, 400],
  SUCCESS: [0, 100, 50, 100],
  IMPACT_LIGHT: [0, 30],
  IMPACT_MEDIUM: [0, 50],
  IMPACT_HEAVY: [0, 80],
};

class HapticsManager {
  private isEnabled: boolean = true;
  private isSupported: boolean = Platform.OS !== 'web';
  private lastHapticTime: number = 0;
  private debounceDelay: number = 50; // Minimum time between haptics

  constructor() {
    this.checkSupport();
  }

  /**
   * Check if haptics are supported on the device
   */
  private checkSupport(): void {
    if (Platform.OS === 'web') {
      this.isSupported = false;
      console.log('Haptics not supported on web platform');
    }
  }

  /**
   * Enable or disable haptic feedback
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Get haptic enabled status
   */
  isHapticsEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Debounce haptic calls to prevent overwhelming the system
   */
  private shouldTriggerHaptic(): boolean {
    const now = Date.now();
    if (now - this.lastHapticTime >= this.debounceDelay) {
      this.lastHapticTime = now;
      return true;
    }
    return false;
  }

  /**
   * Trigger light impact haptic
   */
  async light(): Promise<void> {
    if (!this.isEnabled || !this.isSupported) return;
    if (!this.shouldTriggerHaptic()) return;
    
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.warn('Haptic feedback failed:', error);
    }
  }

  /**
   * Trigger medium impact haptic
   */
  async medium(): Promise<void> {
    if (!this.isEnabled || !this.isSupported) return;
    if (!this.shouldTriggerHaptic()) return;
    
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.warn('Haptic feedback failed:', error);
    }
  }

  /**
   * Trigger heavy impact haptic
   */
  async heavy(): Promise<void> {
    if (!this.isEnabled || !this.isSupported) return;
    if (!this.shouldTriggerHaptic()) return;
    
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (error) {
      console.warn('Haptic feedback failed:', error);
    }
  }

  /**
   * Trigger success notification haptic
   */
  async success(): Promise<void> {
    if (!this.isEnabled || !this.isSupported) return;
    if (!this.shouldTriggerHaptic()) return;
    
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.warn('Haptic feedback failed:', error);
    }
  }

  /**
   * Trigger warning notification haptic
   */
  async warning(): Promise<void> {
    if (!this.isEnabled || !this.isSupported) return;
    if (!this.shouldTriggerHaptic()) return;
    
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (error) {
      console.warn('Haptic feedback failed:', error);
    }
  }

  /**
   * Trigger error notification haptic
   */
  async error(): Promise<void> {
    if (!this.isEnabled || !this.isSupported) return;
    if (!this.shouldTriggerHaptic()) return;
    
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch (error) {
      console.warn('Haptic feedback failed:', error);
    }
  }

  /**
   * Trigger selection haptic
   */
  async selection(): Promise<void> {
    if (!this.isEnabled || !this.isSupported) return;
    if (!this.shouldTriggerHaptic()) return;
    
    try {
      await Haptics.selectionAsync();
    } catch (error) {
      console.warn('Haptic feedback failed:', error);
    }
  }

  /**
   * Trigger custom pattern haptic (iOS only)
   */
  async custom(pattern: number[]): Promise<void> {
    if (!this.isEnabled || !this.isSupported) return;
    if (Platform.OS !== 'ios') {
      // Fallback to heavy impact for Android
      await this.heavy();
      return;
    }
    
    if (!this.shouldTriggerHaptic()) return;
    
    try {
      // For iOS, we can use impact with different intensities
      // This is a simplified implementation
      for (let i = 0; i < pattern.length; i += 2) {
        const delay = pattern[i];
        const duration = pattern[i + 1];
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        if (duration > 0) {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await new Promise(resolve => setTimeout(resolve, duration));
        }
      }
    } catch (error) {
      console.warn('Custom haptic pattern failed:', error);
    }
  }

  /**
   * Trigger SOS emergency haptic pattern
   */
  async sos(): Promise<void> {
    if (!this.isEnabled || !this.isSupported) return;
    await this.custom(CUSTOM_PATTERNS.SOS);
  }

  /**
   * Trigger danger alert haptic
   */
  async danger(): Promise<void> {
    if (!this.isEnabled || !this.isSupported) return;
    await this.custom(CUSTOM_PATTERNS.DANGER);
  }

  /**
   * Trigger warning alert haptic
   */
  async alert(): Promise<void> {
    if (!this.isEnabled || !this.isSupported) return;
    await this.custom(CUSTOM_PATTERNS.ALERT);
  }

  /**
   * Trigger navigation turn haptic
   */
  async navigationTurn(): Promise<void> {
    if (!this.isEnabled || !this.isSupported) return;
    await this.custom(CUSTOM_PATTERNS.NAVIGATION_TURN);
  }

  /**
   * Trigger navigation straight haptic
   */
  async navigationStraight(): Promise<void> {
    if (!this.isEnabled || !this.isSupported) return;
    await this.custom(CUSTOM_PATTERNS.NAVIGATION_STRAIGHT);
  }

  /**
   * Trigger selection confirmation haptic
   */
  async confirm(): Promise<void> {
    if (!this.isEnabled || !this.isSupported) return;
    await this.custom(CUSTOM_PATTERNS.SELECTION_CONFIRM);
  }

  /**
   * Trigger error haptic pattern
   */
  async hapticError(): Promise<void> {
    if (!this.isEnabled || !this.isSupported) return;
    await this.custom(CUSTOM_PATTERNS.ERROR);
  }

  /**
   * Trigger success haptic pattern
   */
  async hapticSuccess(): Promise<void> {
    if (!this.isEnabled || !this.isSupported) return;
    await this.custom(CUSTOM_PATTERNS.SUCCESS);
  }

  /**
   * Generic haptic trigger based on type
   */
  async trigger(type: HapticType, intensity?: 'light' | 'medium' | 'heavy'): Promise<void> {
    switch (type) {
      case 'light':
        await this.light();
        break;
      case 'medium':
        await this.medium();
        break;
      case 'heavy':
        await this.heavy();
        break;
      case 'success':
        await this.success();
        break;
      case 'warning':
        await this.warning();
        break;
      case 'error':
        await this.error();
        break;
      case 'selection':
        await this.selection();
        break;
      case 'impact':
        if (intensity === 'light') await this.light();
        else if (intensity === 'medium') await this.medium();
        else if (intensity === 'heavy') await this.heavy();
        else await this.medium();
        break;
      case 'notification':
        await this.success();
        break;
      case 'custom':
        await this.custom(CUSTOM_PATTERNS.ALERT);
        break;
      default:
        await this.light();
    }
  }

  /**
   * Trigger haptic for specific app actions
   */
  async forAction(action: string): Promise<void> {
    const actionMap: Record<string, HapticType> = {
      'button_press': 'light',
      'emergency': 'error',
      'sos': 'error',
      'checkin': 'success',
      'reroute': 'medium',
      'navigation_start': 'success',
      'navigation_end': 'success',
      'turn': 'medium',
      'arrival': 'success',
      'warning': 'warning',
      'danger_zone': 'error',
      'route_calculated': 'success',
      'offline_mode': 'warning',
      'sync_complete': 'success',
      'error': 'error',
      'select': 'selection',
      'confirm': 'success',
      'cancel': 'light',
      'delete': 'warning',
    };

    const hapticType = actionMap[action] || 'light';
    await this.trigger(hapticType);
  }
}

// Export singleton instance
export const haptics = new HapticsManager();

// Convenience exports
export const triggerHaptic = (type: HapticType) => haptics.trigger(type);
export const lightHaptic = () => haptics.light();
export const mediumHaptic = () => haptics.medium();
export const heavyHaptic = () => haptics.heavy();
export const successHaptic = () => haptics.success();
export const warningHaptic = () => haptics.warning();
export const errorHaptic = () => haptics.error();
export const selectionHaptic = () => haptics.selection();
export const sosHaptic = () => haptics.sos();
export const dangerHaptic = () => haptics.danger();
export const alertHaptic = () => haptics.alert();

// Hook for using haptics in components
import { useCallback } from 'react';

export const useHaptics = () => {
  const light = useCallback(() => haptics.light(), []);
  const medium = useCallback(() => haptics.medium(), []);
  const heavy = useCallback(() => haptics.heavy(), []);
  const success = useCallback(() => haptics.success(), []);
  const warning = useCallback(() => haptics.warning(), []);
  const error = useCallback(() => haptics.error(), []);
  const selection = useCallback(() => haptics.selection(), []);
  const sos = useCallback(() => haptics.sos(), []);
  const danger = useCallback(() => haptics.danger(), []);
  const alert = useCallback(() => haptics.alert(), []);
  const forAction = useCallback((action: string) => haptics.forAction(action), []);
  const trigger = useCallback((type: HapticType, intensity?: 'light' | 'medium' | 'heavy') => 
    haptics.trigger(type, intensity), []);

  return {
    light,
    medium,
    heavy,
    success,
    warning,
    error,
    selection,
    sos,
    danger,
    alert,
    forAction,
    trigger,
    setEnabled: haptics.setEnabled.bind(haptics),
    isEnabled: haptics.isHapticsEnabled(),
  };
};

export default haptics;
