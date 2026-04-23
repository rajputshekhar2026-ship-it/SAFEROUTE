// frontend/App.tsx

import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { NotificationService } from './src/services/NotificationService';
import { LocationService } from './src/services/LocationService';
import { HealthModeProvider } from './src/hooks/useHealthMode';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    initializeServices();
    return () => {
      cleanupServices();
    };
  }, []);

  const initializeServices = async () => {
    try {
      // Initialize notifications
      await NotificationService.initialize();
      
      // Request permissions
      await NotificationService.requestPermissions();
      
      // Register for push notifications
      await NotificationService.registerForPushNotifications();
      
      // Initialize location service
      await LocationService.requestPermissions();
    } catch (error) {
      console.error('Failed to initialize services:', error);
    }
  };

  const cleanupServices = () => {
    NotificationService.cleanup();
    LocationService.cleanup();
  };

  if (isLoading) {
    // You can show a splash screen here
    return null;
  }

  return <AppNavigator />;
};

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <AuthProvider>
            <HealthModeProvider>
              <StatusBar style="light" />
              <AppContent />
            </HealthModeProvider>
          </AuthProvider>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
