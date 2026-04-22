import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider } from './src/context/AppContext';
import AppNavigator from './src/navigation/AppNavigator';
import { NotificationService } from './src/services/NotificationService';
import { LocationService } from './src/services/LocationService';
import { HealthModeProvider } from './src/hooks/useHealthMode';

export default function App() {
  useEffect(() => {
    initializeServices();
  }, []);

  const initializeServices = async () => {
    await NotificationService.initialize();
    await LocationService.initializeBackgroundTracking();
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <HealthModeProvider>
            <Provider>
              <AppNavigator />
            </Provider>
          </HealthModeProvider>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
