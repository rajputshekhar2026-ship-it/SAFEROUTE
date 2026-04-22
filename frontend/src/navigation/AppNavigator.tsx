// src/navigation/AppNavigator.tsx

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Easing, Animated, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// Screens
import HomeMapScreen from '../screens/HomeMapScreen';
import ReportIncidentScreen from '../screens/ReportIncidentScreen';
import FakeCallScreen from '../screens/FakeCallScreen';
import SafeRefugeView from '../screens/SafeRefugeView';
import HealthModeScreen from '../screens/HealthModeScreen';

// Hooks & Context
import { useHealthMode } from '../hooks/useHealthMode';

// Types
export type RootStackParamList = {
  Main: undefined;
  ReportIncident: undefined;
  FakeCall: { contact?: any };
  SafeRefuge: { refugeId?: string };
  HealthMode: undefined;
  SOS: { sosData?: any };
  Settings: undefined;
  IncidentHistory: undefined;
  TrustedContacts: undefined;
};

export type MainTabParamList = {
  Map: undefined;
  Refuge: undefined;
  Health: undefined;
  Profile: undefined;
};

// Create navigators
const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Custom tab bar icon component
const TabBarIcon: React.FC<{
  name: string;
  focused: boolean;
  color: string;
  size: number;
}> = ({ name, focused, color, size }) => {
  const getIcon = () => {
    switch (name) {
      case 'Map':
        return focused ? '📍' : '🗺️';
      case 'Refuge':
        return focused ? '🏥' : '🏪';
      case 'Health':
        return focused ? '🌤️' : '📰';
      case 'Profile':
        return focused ? '👤' : '👥';
      default:
        return '📍';
    }
  };

  return (
    <Animated.Text
      style={{
        fontSize: size,
        color,
        transform: [{ scale: focused ? 1.1 : 1 }],
      }}
    >
      {getIcon()}
    </Animated.Text>
  );
};

// Main Tab Navigator
const MainTabNavigator: React.FC = () => {
  const { isHealthMode, currentDisguiseUI } = useHealthMode();

  // Dynamic tab configuration based on health mode
  const getTabBarStyle = () => {
    if (isHealthMode) {
      return {
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderTopColor: '#E0E0E0',
        height: Platform.OS === 'ios' ? 85 : 65,
        paddingBottom: Platform.OS === 'ios' ? 25 : 8,
      };
    }
    return {
      backgroundColor: 'rgba(0,0,0,0.95)',
      borderTopColor: '#333',
      height: Platform.OS === 'ios' ? 85 : 65,
      paddingBottom: Platform.OS === 'ios' ? 25 : 8,
    };
  };

  const getTabBarLabelStyle = () => {
    if (isHealthMode) {
      return {
        fontSize: 11,
        fontWeight: '500' as const,
        color: '#666',
      };
    }
    return {
      fontSize: 11,
      fontWeight: '500' as const,
      color: '#FFF',
    };
  };

  // Health mode disguises the tab labels
  const getTabLabel = (defaultLabel: string) => {
    if (!isHealthMode) return defaultLabel;
    
    switch (currentDisguiseUI) {
      case 'weather':
        switch (defaultLabel) {
          case 'Map': return 'Weather';
          case 'Refuge': return 'Radar';
          case 'Health': return 'Forecast';
          case 'Profile': return 'Settings';
          default: return defaultLabel;
        }
      case 'news':
        switch (defaultLabel) {
          case 'Map': return 'Headlines';
          case 'Refuge': return 'Local';
          case 'Health': return 'Trending';
          case 'Profile': return 'Menu';
          default: return defaultLabel;
        }
      default:
        return defaultLabel;
    }
  };

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: getTabBarStyle(),
        tabBarLabelStyle: getTabBarLabelStyle(),
        tabBarActiveTintColor: isHealthMode ? '#4CAF50' : '#FF0000',
        tabBarInactiveTintColor: isHealthMode ? '#999' : '#666',
        headerStyle: {
          backgroundColor: isHealthMode ? '#FFF' : '#000',
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTitleStyle: {
          color: isHealthMode ? '#000' : '#FFF',
          fontWeight: '600',
        },
        headerTintColor: isHealthMode ? '#000' : '#FFF',
      }}
    >
      <Tab.Screen
        name="Map"
        component={HomeMapScreen}
        options={{
          title: getTabLabel('Safe Route'),
          tabBarIcon: ({ focused, color, size }) => (
            <TabBarIcon name="Map" focused={focused} color={color} size={size} />
          ),
          tabBarButton: (props) => {
            return (
              <Tab.Button
                {...props}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  props.onPress?.();
                }}
              />
            );
          },
        }}
      />
      
      <Tab.Screen
        name="Refuge"
        component={SafeRefugeView}
        options={{
          title: getTabLabel('Safe Places'),
          tabBarIcon: ({ focused, color, size }) => (
            <TabBarIcon name="Refuge" focused={focused} color={color} size={size} />
          ),
        }}
      />
      
      <Tab.Screen
        name="Health"
        component={HealthModeScreen}
        options={{
          title: getTabLabel('Health Mode'),
          tabBarIcon: ({ focused, color, size }) => (
            <TabBarIcon name="Health" focused={focused} color={color} size={size} />
          ),
        }}
      />
      
      <Tab.Screen
        name="Profile"
        component={ProfilePlaceholder}
        options={{
          title: getTabLabel('Profile'),
          tabBarIcon: ({ focused, color, size }) => (
            <TabBarIcon name="Profile" focused={focused} color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

// Profile placeholder screen
const ProfilePlaceholder: React.FC = () => {
  const { isHealthMode } = useHealthMode();
  
  return (
    <View style={[styles.container, { backgroundColor: isHealthMode ? '#FFF' : '#000' }]}>
      <Text style={[styles.title, { color: isHealthMode ? '#000' : '#FFF' }]}>
        {isHealthMode ? 'Settings' : 'Profile'}
      </Text>
      <Text style={[styles.subtitle, { color: isHealthMode ? '#666' : '#999' }]}>
        {isHealthMode 
          ? 'App preferences and settings' 
          : 'Manage your safety profile and contacts'}
      </Text>
      {/* Add profile content here */}
    </View>
  );
};

// Auth Loading Screen
const AuthLoadingScreen: React.FC = () => {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#FF0000" />
      <Text style={styles.loadingText}>Loading Safe Route...</Text>
    </View>
  );
};

// Main App Navigator
const AppNavigator: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const { isHealthMode } = useHealthMode();

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    // Check if user is authenticated
    // In production, check JWT token validity
    const token = await AsyncStorage.getItem('jwt_token');
    setIsAuthenticated(!!token);
  };

  if (isAuthenticated === null) {
    return <AuthLoadingScreen />;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: isHealthMode ? '#FFF' : '#000' },
        cardStyleInterpolator: ({ current, next, layouts }) => {
          return {
            cardStyle: {
              transform: [
                {
                  translateX: current.progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [layouts.screen.width, 0],
                  }),
                },
              ],
            },
            overlayStyle: {
              opacity: current.progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.5],
              }),
            },
          };
        },
      }}
    >
      {!isAuthenticated ? (
        // Auth screens
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      ) : (
        // Main app screens
        <>
          <Stack.Screen name="Main" component={MainTabNavigator} />
          <Stack.Screen 
            name="ReportIncident" 
            component={ReportIncidentScreen}
            options={{
              headerShown: true,
              title: 'Report Incident',
              headerBackTitle: 'Back',
              presentation: 'modal',
              animationTypeForReplace: 'push',
            }}
          />
          <Stack.Screen 
            name="FakeCall" 
            component={FakeCallScreen}
            options={{
              headerShown: false,
              presentation: 'fullScreenModal',
              animationTypeForReplace: 'push',
            }}
          />
          <Stack.Screen 
            name="SafeRefuge" 
            component={SafeRefugeView}
            options={{
              headerShown: true,
              title: 'Safe Refuge Details',
              presentation: 'card',
            }}
          />
          <Stack.Screen 
            name="HealthMode" 
            component={HealthModeScreen}
            options={{
              headerShown: false,
              presentation: 'modal',
            }}
          />
          <Stack.Screen 
            name="SOS" 
            component={SOSScreen}
            options={{
              headerShown: false,
              presentation: 'fullScreenModal',
            }}
          />
          <Stack.Screen 
            name="Settings" 
            component={SettingsScreen}
            options={{
              headerShown: true,
              title: 'Settings',
            }}
          />
          <Stack.Screen 
            name="IncidentHistory" 
            component={IncidentHistoryScreen}
            options={{
              headerShown: true,
              title: 'Incident History',
            }}
          />
          <Stack.Screen 
            name="TrustedContacts" 
            component={TrustedContactsScreen}
            options={{
              headerShown: true,
              title: 'Trusted Contacts',
            }}
          />
        </>
      )}
    </Stack.Navigator>
  );
};

// Import missing components and modules
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Tab from '@react-navigation/bottom-tabs';

// Placeholder screens for missing imports
const LoginScreen: React.FC = () => {
  const { isHealthMode } = useHealthMode();
  return (
    <View style={[styles.container, { backgroundColor: isHealthMode ? '#FFF' : '#000', justifyContent: 'center' }]}>
      <Text style={{ color: isHealthMode ? '#000' : '#FFF', textAlign: 'center' }}>
        Login Screen - Implement authentication
      </Text>
    </View>
  );
};

const RegisterScreen: React.FC = () => {
  const { isHealthMode } = useHealthMode();
  return (
    <View style={[styles.container, { backgroundColor: isHealthMode ? '#FFF' : '#000', justifyContent: 'center' }]}>
      <Text style={{ color: isHealthMode ? '#000' : '#FFF', textAlign: 'center' }}>
        Register Screen - Implement registration
      </Text>
    </View>
  );
};

const SOSScreen: React.FC = () => {
  const { isHealthMode } = useHealthMode();
  return (
    <View style={[styles.container, { backgroundColor: isHealthMode ? '#FFF' : '#000', justifyContent: 'center' }]}>
      <Text style={{ color: isHealthMode ? '#000' : '#FFF', textAlign: 'center', fontSize: 24 }}>
        🚨 SOS ACTIVE 🚨
      </Text>
    </View>
  );
};

const SettingsScreen: React.FC = () => {
  const { isHealthMode } = useHealthMode();
  return (
    <View style={[styles.container, { backgroundColor: isHealthMode ? '#FFF' : '#000' }]}>
      <Text style={{ color: isHealthMode ? '#000' : '#FFF' }}>Settings Screen</Text>
    </View>
  );
};

const IncidentHistoryScreen: React.FC = () => {
  const { isHealthMode } = useHealthMode();
  return (
    <View style={[styles.container, { backgroundColor: isHealthMode ? '#FFF' : '#000' }]}>
      <Text style={{ color: isHealthMode ? '#000' : '#FFF' }}>Incident History</Text>
    </View>
  );
};

const TrustedContactsScreen: React.FC = () => {
  const { isHealthMode } = useHealthMode();
  return (
    <View style={[styles.container, { backgroundColor: isHealthMode ? '#FFF' : '#000' }]}>
      <Text style={{ color: isHealthMode ? '#000' : '#FFF' }}>Trusted Contacts</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    marginTop: 20,
    color: '#FFF',
    fontSize: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
  },
});

export default AppNavigator;
