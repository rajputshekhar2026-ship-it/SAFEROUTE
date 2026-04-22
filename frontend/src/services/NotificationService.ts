// src/services/NotificationService.ts

import * as Notifications from 'expo-notifications';
import { Platform, Alert, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventEmitter } from 'events';

// Types
export interface NotificationData {
  id: string;
  title: string;
  body: string;
  data?: any;
  timestamp: number;
  read: boolean;
  type: 'sos' | 'alert' | 'weather' | 'crime' | 'safety' | 'system';
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface PushNotificationToken {
  token: string;
  deviceType: 'ios' | 'android';
  deviceId: string;
  timestamp: number;
}

export interface NotificationPreferences {
  enabled: boolean;
  sosAlerts: boolean;
  safetyAlerts: boolean;
  weatherWarnings: boolean;
  crimeAlerts: boolean;
  systemUpdates: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  quietHours: {
    enabled: boolean;
    start: string; // "22:00"
    end: string;   // "07:00"
  };
}

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async (notification) => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: notification.request.content.data?.priority === 'critical' 
      ? Notifications.AndroidNotificationPriority.MAX 
      : Notifications.AndroidNotificationPriority.HIGH,
  }),
});

// Notification Event Emitter
class NotificationEventEmitter extends EventEmitter {
  private static instance: NotificationEventEmitter;

  static getInstance(): NotificationEventEmitter {
    if (!NotificationEventEmitter.instance) {
      NotificationEventEmitter.instance = new NotificationEventEmitter();
    }
    return NotificationEventEmitter.instance;
  }
}

export const notificationEvents = NotificationEventEmitter.getInstance();

class NotificationServiceClass {
  private expoPushToken: string | null = null;
  private notificationListener: any = null;
  private responseListener: any = null;
  private preferences: NotificationPreferences = {
    enabled: true,
    sosAlerts: true,
    safetyAlerts: true,
    weatherWarnings: true,
    crimeAlerts: true,
    systemUpdates: true,
    soundEnabled: true,
    vibrationEnabled: true,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '07:00',
    },
  };
  private notificationsHistory: NotificationData[] = [];
  private readonly MAX_HISTORY = 100;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    await this.loadPreferences();
    await this.loadNotificationHistory();
    await this.registerForPushNotifications();
    this.setupListeners();
  }

  /**
   * Request notification permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('Failed to get push token for push notification!');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to request notification permissions:', error);
      return false;
    }
  }

  /**
   * Register for push notifications
   */
  async registerForPushNotifications(): Promise<string | null> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      return null;
    }

    try {
      // Get Expo push token
      const token = await Notifications.getExpoPushTokenAsync({
        experienceId: '@your-username/safe-route-app',
      });
      
      this.expoPushToken = token.data;
      
      // Store token for later use
      await this.storePushToken(token.data);
      
      // Register with backend
      await this.registerTokenWithBackend(token.data);
      
      return token.data;
    } catch (error) {
      console.error('Failed to get push token:', error);
      return null;
    }
  }

  /**
   * Store push token locally
   */
  private async storePushToken(token: string): Promise<void> {
    try {
      const tokenData: PushNotificationToken = {
        token,
        deviceType: Platform.OS === 'ios' ? 'ios' : 'android',
        deviceId: await this.getDeviceId(),
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem('push_token', JSON.stringify(tokenData));
    } catch (error) {
      console.error('Failed to store push token:', error);
    }
  }

  /**
   * Register token with backend
   */
  private async registerTokenWithBackend(token: string): Promise<void> {
    try {
      // In production, send to your backend
      // await ApiClient.registerPushToken(token);
      console.log('Push token registered with backend:', token);
    } catch (error) {
      console.error('Failed to register token with backend:', error);
    }
  }

  /**
   * Get device ID
   */
  private async getDeviceId(): Promise<string> {
    try {
      let deviceId = await AsyncStorage.getItem('device_id');
      if (!deviceId) {
        deviceId = Math.random().toString(36).substring(7);
        await AsyncStorage.setItem('device_id', deviceId);
      }
      return deviceId;
    } catch (error) {
      return Math.random().toString(36).substring(7);
    }
  }

  /**
   * Setup notification listeners
   */
  private setupListeners() {
    // Listener for when a notification is received while app is foregrounded
    this.notificationListener = Notifications.addNotificationReceivedListener(
      this.handleNotificationReceived.bind(this)
    );

    // Listener for when a notification is tapped
    this.responseListener = Notifications.addNotificationResponseReceivedListener(
      this.handleNotificationResponse.bind(this)
    );
  }

  /**
   * Handle incoming notification
   */
  private handleNotificationReceived(notification: Notifications.Notification) {
    const { title, body, data } = notification.request.content;
    const notificationData: NotificationData = {
      id: notification.request.identifier,
      title: title || 'Notification',
      body: body || '',
      data: data,
      timestamp: Date.now(),
      read: false,
      type: data?.type || 'system',
      priority: data?.priority || 'medium',
    };

    // Store notification
    this.storeNotification(notificationData);
    
    // Emit event for in-app handling
    notificationEvents.emit('notificationReceived', notificationData);
    
    // Vibrate for high priority notifications
    if (notificationData.priority === 'high' || notificationData.priority === 'critical') {
      Vibration.vibrate([0, 500, 200, 500]);
    }
  }

  /**
   * Handle notification tap
   */
  private handleNotificationResponse(response: Notifications.NotificationResponse) {
    const { data } = response.notification.request.content;
    
    // Emit event for navigation
    notificationEvents.emit('notificationTapped', data);
  }

  /**
   * Send local notification
   */
  async sendLocalNotification(
    title: string,
    body: string,
    data?: any,
    options?: {
      priority?: 'low' | 'medium' | 'high' | 'critical';
      sound?: boolean;
      vibrate?: boolean;
    }
  ): Promise<string> {
    // Check if notifications are enabled
    if (!this.preferences.enabled) {
      return '';
    }

    // Check quiet hours
    if (this.isInQuietHours() && options?.priority !== 'critical') {
      return '';
    }

    // Check notification type preferences
    if (data?.type && !this.shouldSendNotification(data.type)) {
      return '';
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { ...data, timestamp: Date.now() },
        sound: options?.sound !== false && this.preferences.soundEnabled,
        priority: options?.priority === 'critical' 
          ? Notifications.AndroidNotificationPriority.MAX
          : Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null, // Send immediately
    });

    // Store notification
    const notificationData: NotificationData = {
      id: notificationId,
      title,
      body,
      data,
      timestamp: Date.now(),
      read: false,
      type: data?.type || 'system',
      priority: options?.priority || 'medium',
    };
    
    await this.storeNotification(notificationData);
    notificationEvents.emit('notificationSent', notificationData);
    
    return notificationId;
  }

  /**
   * Send scheduled notification
   */
  async sendScheduledNotification(
    title: string,
    body: string,
    delaySeconds: number,
    data?: any
  ): Promise<string> {
    if (!this.preferences.enabled) {
      return '';
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { ...data, timestamp: Date.now() },
        sound: this.preferences.soundEnabled,
      },
      trigger: {
        seconds: delaySeconds,
      },
    });

    return notificationId;
  }

  /**
   * Send recurring notification
   */
  async sendRecurringNotification(
    title: string,
    body: string,
    intervalSeconds: number,
    data?: any
  ): Promise<string> {
    if (!this.preferences.enabled) {
      return '';
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { ...data, timestamp: Date.now() },
        sound: this.preferences.soundEnabled,
      },
      trigger: {
        seconds: intervalSeconds,
        repeats: true,
      },
    });

    return notificationId;
  }

  /**
   * Cancel notification
   */
  async cancelNotification(notificationId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }

  /**
   * Cancel all notifications
   */
  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  /**
   * Store notification in history
   */
  private async storeNotification(notification: NotificationData): Promise<void> {
    this.notificationsHistory.unshift(notification);
    
    // Keep only MAX_HISTORY notifications
    if (this.notificationsHistory.length > this.MAX_HISTORY) {
      this.notificationsHistory.pop();
    }
    
    await AsyncStorage.setItem('notifications_history', JSON.stringify(this.notificationsHistory));
    
    // Update badge count
    await this.updateBadgeCount();
  }

  /**
   * Load notification history
   */
  private async loadNotificationHistory(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('notifications_history');
      if (stored) {
        this.notificationsHistory = JSON.parse(stored);
        await this.updateBadgeCount();
      }
    } catch (error) {
      console.error('Failed to load notification history:', error);
    }
  }

  /**
   * Get notification history
   */
  async getNotificationHistory(filter?: { type?: string; unreadOnly?: boolean }): Promise<NotificationData[]> {
    let filtered = [...this.notificationsHistory];
    
    if (filter?.type) {
      filtered = filtered.filter(n => n.type === filter.type);
    }
    
    if (filter?.unreadOnly) {
      filtered = filtered.filter(n => !n.read);
    }
    
    return filtered;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    const notification = this.notificationsHistory.find(n => n.id === notificationId);
    if (notification && !notification.read) {
      notification.read = true;
      await AsyncStorage.setItem('notifications_history', JSON.stringify(this.notificationsHistory));
      await this.updateBadgeCount();
      notificationEvents.emit('notificationRead', notification);
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<void> {
    this.notificationsHistory.forEach(n => {
      n.read = true;
    });
    await AsyncStorage.setItem('notifications_history', JSON.stringify(this.notificationsHistory));
    await this.updateBadgeCount();
    notificationEvents.emit('allNotificationsRead');
  }

  /**
   * Clear all notifications
   */
  async clearAllNotifications(): Promise<void> {
    this.notificationsHistory = [];
    await AsyncStorage.removeItem('notifications_history');
    await Notifications.setBadgeCountAsync(0);
    notificationEvents.emit('notificationsCleared');
  }

  /**
   * Update app badge count
   */
  private async updateBadgeCount(): Promise<void> {
    const unreadCount = this.notificationsHistory.filter(n => !n.read).length;
    await Notifications.setBadgeCountAsync(unreadCount);
  }

  /**
   * Load notification preferences
   */
  private async loadPreferences(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('notification_preferences');
      if (stored) {
        this.preferences = { ...this.preferences, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Failed to load notification preferences:', error);
    }
  }

  /**
   * Save notification preferences
   */
  async savePreferences(preferences: Partial<NotificationPreferences>): Promise<void> {
    this.preferences = { ...this.preferences, ...preferences };
    await AsyncStorage.setItem('notification_preferences', JSON.stringify(this.preferences));
    notificationEvents.emit('preferencesUpdated', this.preferences);
  }

  /**
   * Get notification preferences
   */
  getPreferences(): NotificationPreferences {
    return this.preferences;
  }

  /**
   * Check if should send notification based on type
   */
  private shouldSendNotification(type: string): boolean {
    switch (type) {
      case 'sos':
        return this.preferences.sosAlerts;
      case 'alert':
      case 'safety':
        return this.preferences.safetyAlerts;
      case 'weather':
        return this.preferences.weatherWarnings;
      case 'crime':
        return this.preferences.crimeAlerts;
      case 'system':
        return this.preferences.systemUpdates;
      default:
        return true;
    }
  }

  /**
   * Check if current time is in quiet hours
   */
  private isInQuietHours(): boolean {
    if (!this.preferences.quietHours.enabled) {
      return false;
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const { start, end } = this.preferences.quietHours;
    
    if (start <= end) {
      return currentTime >= start && currentTime <= end;
    } else {
      return currentTime >= start || currentTime <= end;
    }
  }

  /**
   * Send SOS notification to user
   */
  async sendSOSAlert(sosData: any): Promise<void> {
    await this.sendLocalNotification(
      '🚨 SOS ALERT 🚨',
      `Emergency SOS from ${sosData.userName || 'a user'} at ${new Date(sosData.timestamp).toLocaleTimeString()}`,
      { ...sosData, type: 'sos', priority: 'critical' },
      { priority: 'critical', sound: true, vibrate: true }
    );
  }

  /**
   * Send safety alert notification
   */
  async sendSafetyAlert(alertData: any): Promise<void> {
    const priority = alertData.severity === 'high' ? 'high' : 'medium';
    await this.sendLocalNotification(
      `⚠️ Safety Alert: ${alertData.title || 'Warning'}`,
      alertData.message,
      { ...alertData, type: 'safety', priority },
      { priority, sound: true, vibrate: true }
    );
  }

  /**
   * Send weather warning notification
   */
  async sendWeatherWarning(weatherData: any): Promise<void> {
    await this.sendLocalNotification(
      `🌤️ Weather Warning: ${weatherData.type}`,
      weatherData.message,
      { ...weatherData, type: 'weather', priority: 'medium' },
      { priority: 'medium', sound: true }
    );
  }

  /**
   * Send crime alert notification
   */
  async sendCrimeAlert(crimeData: any): Promise<void> {
    await this.sendLocalNotification(
      `🚨 Crime Alert: ${crimeData.crimeType}`,
      `${crimeData.description} - ${crimeData.distance ? `${crimeData.distance}m away` : 'Nearby'}`,
      { ...crimeData, type: 'crime', priority: 'high' },
      { priority: 'high', sound: true, vibrate: true }
    );
  }

  /**
   * Get Expo push token
   */
  getExpoPushToken(): string | null {
    return this.expoPushToken;
  }

  /**
   * Clean up listeners
   */
  cleanup(): void {
    if (this.notificationListener) {
      Notifications.removeNotificationSubscription(this.notificationListener);
    }
    if (this.responseListener) {
      Notifications.removeNotificationSubscription(this.responseListener);
    }
  }
}

// Export singleton instance
export const NotificationService = new NotificationServiceClass();
export default NotificationService;
