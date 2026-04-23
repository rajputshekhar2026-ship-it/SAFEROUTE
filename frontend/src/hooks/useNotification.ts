import { useState, useEffect, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import ApiClient from '../api/client';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: 'sos' | 'alert' | 'weather' | 'crime' | 'safety' | 'system';
  priority: 'low' | 'medium' | 'high' | 'critical';
  data?: any;
  isRead: boolean;
  createdAt: string;
}

interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  sosAlerts: boolean;
  safetyAlerts: boolean;
  weatherWarnings: boolean;
  crimeAlerts: boolean;
  systemUpdates: boolean;
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
}

interface UseNotificationReturn {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  preferences: NotificationPreferences;
  requestPermissions: () => Promise<boolean>;
  registerPushToken: () => Promise<void>;
  fetchNotifications: (page?: number, limit?: number) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;
  sendTestNotification: () => Promise<void>;
}

export const useNotification = (): UseNotificationReturn => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    pushEnabled: true,
    emailEnabled: true,
    smsEnabled: true,
    sosAlerts: true,
    safetyAlerts: true,
    weatherWarnings: true,
    crimeAlerts: true,
    systemUpdates: false,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '07:00',
    },
  });

  useEffect(() => {
    setupNotificationListeners();
    fetchPreferences();
    fetchNotifications();
  }, []);

  const setupNotificationListeners = () => {
    // Handle notifications received while app is foregrounded
    const subscription = Notifications.addNotificationReceivedListener(handleNotification);
    
    // Handle notification responses (user taps on notification)
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    
    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  };

  const handleNotification = (notification: Notifications.Notification) => {
    const { title, body, data } = notification.request.content;
    const newNotification: Notification = {
      id: notification.request.identifier,
      title: title || 'Notification',
      body: body || '',
      type: data?.type || 'system',
      priority: data?.priority || 'medium',
      data,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    
    setNotifications(prev => [newNotification, ...prev]);
    setUnreadCount(prev => prev + 1);
  };

  const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
    const { data } = response.notification.request.content;
    
    // Navigate based on notification type
    if (data?.type === 'sos') {
      // Navigate to SOS screen
      console.log('Navigate to SOS:', data);
    } else if (data?.type === 'alert') {
      // Navigate to alerts screen
      console.log('Navigate to alerts:', data);
    }
  };

  const requestPermissions = async (): Promise<boolean> => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Failed to request notification permissions:', error);
      return false;
    }
  };

  const registerPushToken = async () => {
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;
      
      const token = await Notifications.getExpoPushTokenAsync({
        experienceId: '@your-username/safe-route-app',
      });
      
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      await ApiClient.registerPushToken(token.data, platform);
      
      console.log('Push token registered:', token.data);
    } catch (error) {
      console.error('Failed to register push token:', error);
    }
  };

  const fetchNotifications = async (page: number = 1, limit: number = 20) => {
    setIsLoading(true);
    try {
      const response = await ApiClient.getNotifications(page, limit);
      setNotifications(response.notifications);
      setUnreadCount(response.notifications.filter(n => !n.isRead).length);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPreferences = async () => {
    try {
      const prefs = await ApiClient.getNotificationPreferences();
      setPreferences(prefs);
    } catch (error) {
      console.error('Failed to fetch preferences:', error);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await ApiClient.markNotificationAsRead(notificationId);
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, isRead: true } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await ApiClient.markAllNotificationsAsRead();
      setNotifications(prev =>
        prev.map(n => ({ ...n, isRead: true }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      await ApiClient.deleteNotification(notificationId);
      const wasRead = notifications.find(n => n.id === notificationId)?.isRead;
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      if (!wasRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const updatePreferences = async (prefs: Partial<NotificationPreferences>) => {
    try {
      await ApiClient.updateNotificationPreferences(prefs);
      setPreferences(prev => ({ ...prev, ...prefs }));
    } catch (error) {
      console.error('Failed to update preferences:', error);
    }
  };

  const sendTestNotification = async () => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Test Notification',
          body: 'This is a test notification from SafeRoute',
          data: { type: 'test' },
        },
        trigger: null,
      });
    } catch (error) {
      console.error('Failed to send test notification:', error);
    }
  };

  return {
    notifications,
    unreadCount,
    isLoading,
    preferences,
    requestPermissions,
    registerPushToken,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    updatePreferences,
    sendTestNotification,
  };
};

export default useNotification;
