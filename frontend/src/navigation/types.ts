// src/navigation/types.ts

import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp, RouteProp } from '@react-navigation/native';

// Root Stack Param List
export type RootStackParamList = {
  // Auth screens
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token: string };
  
  // Main app screens
  Main: undefined;
  HomeMap: undefined;
  ReportIncident: {
    incidentType?: string;
    location?: LocationParams;
    photoUri?: string;
  };
  FakeCall: {
    contact?: FakeContact;
    autoAnswer?: boolean;
  };
  SafeRefuge: {
    refugeId?: string;
    refuge?: SafeRefuge;
    autoNavigate?: boolean;
  };
  HealthMode: {
    returnTo?: keyof RootStackParamList;
  };
  SOS: {
    sosData?: SOSData;
    autoTrigger?: boolean;
  };
  Settings: {
    section?: 'profile' | 'privacy' | 'notifications' | 'contacts' | 'about';
  };
  IncidentHistory: undefined;
  TrustedContacts: {
    selectMode?: boolean;
    onContactSelect?: (contact: SOSContact) => void;
  };
  RouteDetails: {
    routeId: string;
    routeType: 'fastest' | 'safest' | 'lit';
  };
  RefugeDetails: {
    refugeId: string;
  };
  WeatherAlerts: undefined;
  CrimeMap: {
    center?: LocationParams;
    zoom?: number;
  };
  EmergencyContacts: undefined;
  PrivacySettings: undefined;
  NotificationSettings: undefined;
  AboutScreen: undefined;
  HelpScreen: undefined;
  TermsScreen: undefined;
};

// Main Tab Param List
export type MainTabParamList = {
  Map: {
    screen?: 'home' | 'route' | 'refuge';
    params?: {
      destination?: LocationParams;
      routeType?: 'fastest' | 'safest' | 'lit';
    };
  };
  Refuge: {
    refugeId?: string;
    category?: string;
  };
  Health: {
    returnTo?: keyof MainTabParamList;
  };
  Profile: {
    section?: string;
  };
  Alerts: {
    alertId?: string;
  };
};

// Navigation Props Types
export type RootStackNavigationProp = StackNavigationProp<RootStackParamList>;
export type MainTabNavigationProp = BottomTabNavigationProp<MainTabParamList>;

// Composite Navigation Prop for screens with both stack and tab navigation
export type CompositeNavigationProp = CompositeNavigationProp<
  RootStackNavigationProp,
  MainTabNavigationProp
>;

// Route Prop Types
export type LoginRouteProp = RouteProp<RootStackParamList, 'Login'>;
export type ReportIncidentRouteProp = RouteProp<RootStackParamList, 'ReportIncident'>;
export type FakeCallRouteProp = RouteProp<RootStackParamList, 'FakeCall'>;
export type SafeRefugeRouteProp = RouteProp<RootStackParamList, 'SafeRefuge'>;
export type SOSRouteProp = RouteProp<RootStackParamList, 'SOS'>;
export type SettingsRouteProp = RouteProp<RootStackParamList, 'Settings'>;
export type TrustedContactsRouteProp = RouteProp<RootStackParamList, 'TrustedContacts'>;

// Component Props with Navigation
export interface WithNavigationProps {
  navigation: RootStackNavigationProp;
  route?: RouteProp<RootStackParamList, keyof RootStackParamList>;
}

export interface WithTabNavigationProps {
  navigation: MainTabNavigationProp;
  route?: RouteProp<MainTabParamList, keyof MainTabParamList>;
}

// Navigation Helpers
export type NavigationParams = {
  [K in keyof RootStackParamList]: RootStackParamList[K];
};

// Screen Names for type-safe navigation
export const SCREENS = {
  // Auth
  LOGIN: 'Login' as const,
  REGISTER: 'Register' as const,
  FORGOT_PASSWORD: 'ForgotPassword' as const,
  RESET_PASSWORD: 'ResetPassword' as const,
  
  // Main
  MAIN: 'Main' as const,
  HOME_MAP: 'HomeMap' as const,
  REPORT_INCIDENT: 'ReportIncident' as const,
  FAKE_CALL: 'FakeCall' as const,
  SAFE_REFUGE: 'SafeRefuge' as const,
  HEALTH_MODE: 'HealthMode' as const,
  SOS: 'SOS' as const,
  SETTINGS: 'Settings' as const,
  INCIDENT_HISTORY: 'IncidentHistory' as const,
  TRUSTED_CONTACTS: 'TrustedContacts' as const,
  ROUTE_DETAILS: 'RouteDetails' as const,
  REFUGE_DETAILS: 'RefugeDetails' as const,
  WEATHER_ALERTS: 'WeatherAlerts' as const,
  CRIME_MAP: 'CrimeMap' as const,
  EMERGENCY_CONTACTS: 'EmergencyContacts' as const,
  PRIVACY_SETTINGS: 'PrivacySettings' as const,
  NOTIFICATION_SETTINGS: 'NotificationSettings' as const,
  ABOUT_SCREEN: 'AboutScreen' as const,
  HELP_SCREEN: 'HelpScreen' as const,
  TERMS_SCREEN: 'TermsScreen' as const,
} as const;

export const TABS = {
  MAP: 'Map' as const,
  REFUGE: 'Refuge' as const,
  HEALTH: 'Health' as const,
  PROFILE: 'Profile' as const,
  ALERTS: 'Alerts' as const,
} as const;

// Type for screen names
export type ScreenName = typeof SCREENS[keyof typeof SCREENS];
export type TabName = typeof TABS[keyof typeof TABS];

// Navigation State Types
export interface NavigationState {
  currentScreen: ScreenName;
  previousScreen?: ScreenName;
  params?: Record<string, any>;
  timestamp: number;
}

// Deep Link Types
export interface DeepLinkParams {
  screen: ScreenName;
  params?: Record<string, any>;
  action?: 'open' | 'navigate' | 'replace';
}

// Navigation Event Types
export type NavigationEvent = {
  type: 'focus' | 'blur' | 'beforeRemove';
  screen: ScreenName;
  timestamp: number;
};

// Navigation Hook Return Type
export interface UseNavigationReturn {
  navigateToScreen: <T extends keyof RootStackParamList>(
    screen: T,
    params?: RootStackParamList[T]
  ) => void;
  navigateToTab: <T extends keyof MainTabParamList>(
    tab: T,
    params?: MainTabParamList[T]
  ) => void;
  goBack: () => void;
  canGoBack: () => boolean;
  getCurrentScreen: () => ScreenName | null;
  getPreviousScreen: () => ScreenName | null;
  resetToScreen: (screen: ScreenName, params?: Record<string, any>) => void;
  replaceScreen: <T extends keyof RootStackParamList>(
    screen: T,
    params?: RootStackParamList[T]
  ) => void;
}

// Types for navigation params
export interface LocationParams {
  lat: number;
  lng: number;
  address?: string;
  name?: string;
}

export interface FakeContact {
  id: string;
  name: string;
  phone: string;
  photo?: string;
  relationship: string;
  conversationPrompts?: string[];
}

export interface SafeRefuge {
  id: string;
  name: string;
  type: 'police' | 'hospital' | 'cafe' | 'store' | 'community_center' | 'transit';
  location: LocationParams;
  address: string;
  phone?: string;
  hours?: string;
  rating?: number;
  is24Hours: boolean;
  distance?: number;
}

export interface SOSData {
  id: string;
  location: LocationParams;
  timestamp: number;
  message?: string;
  contacts: string[];
  status: 'pending' | 'active' | 'responded' | 'resolved';
}

export interface SOSContact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  isEmergencyContact: boolean;
  relationship: string;
}

// Route transition types
export type TransitionType = 'none' | 'slide' | 'modal' | 'fade' | 'flip';

export interface RouteConfig {
  transition: TransitionType;
  gestureEnabled: boolean;
  animationEnabled: boolean;
  headerShown: boolean;
}

// Default route configurations
export const defaultRouteConfigs: Record<ScreenName, RouteConfig> = {
  [SCREENS.LOGIN]: { transition: 'fade', gestureEnabled: false, animationEnabled: true, headerShown: false },
  [SCREENS.REGISTER]: { transition: 'slide', gestureEnabled: true, animationEnabled: true, headerShown: false },
  [SCREENS.FORGOT_PASSWORD]: { transition: 'slide', gestureEnabled: true, animationEnabled: true, headerShown: true },
  [SCREENS.RESET_PASSWORD]: { transition: 'slide', gestureEnabled: true, animationEnabled: true, headerShown: true },
  [SCREENS.MAIN]: { transition: 'none', gestureEnabled: false, animationEnabled: false, headerShown: false },
  [SCREENS.HOME_MAP]: { transition: 'none', gestureEnabled: false, animationEnabled: false, headerShown: false },
  [SCREENS.REPORT_INCIDENT]: { transition: 'modal', gestureEnabled: true, animationEnabled: true, headerShown: true },
  [SCREENS.FAKE_CALL]: { transition: 'modal', gestureEnabled: false, animationEnabled: true, headerShown: false },
  [SCREENS.SAFE_REFUGE]: { transition: 'slide', gestureEnabled: true, animationEnabled: true, headerShown: true },
  [SCREENS.HEALTH_MODE]: { transition: 'modal', gestureEnabled: false, animationEnabled: true, headerShown: false },
  [SCREENS.SOS]: { transition: 'modal', gestureEnabled: false, animationEnabled: true, headerShown: false },
  [SCREENS.SETTINGS]: { transition: 'slide', gestureEnabled: true, animationEnabled: true, headerShown: true },
  [SCREENS.INCIDENT_HISTORY]: { transition: 'slide', gestureEnabled: true, animationEnabled: true, headerShown: true },
  [SCREENS.TRUSTED_CONTACTS]: { transition: 'slide', gestureEnabled: true, animationEnabled: true, headerShown: true },
  [SCREENS.ROUTE_DETAILS]: { transition: 'slide', gestureEnabled: true, animationEnabled: true, headerShown: true },
  [SCREENS.REFUGE_DETAILS]: { transition: 'slide', gestureEnabled: true, animationEnabled: true, headerShown: true },
  [SCREENS.WEATHER_ALERTS]: { transition: 'slide', gestureEnabled: true, animationEnabled: true, headerShown: true },
  [SCREENS.CRIME_MAP]: { transition: 'slide', gestureEnabled: true, animationEnabled: true, headerShown: true },
  [SCREENS.EMERGENCY_CONTACTS]: { transition: 'slide', gestureEnabled: true, animationEnabled: true, headerShown: true },
  [SCREENS.PRIVACY_SETTINGS]: { transition: 'slide', gestureEnabled: true, animationEnabled: true, headerShown: true },
  [SCREENS.NOTIFICATION_SETTINGS]: { transition: 'slide', gestureEnabled: true, animationEnabled: true, headerShown: true },
  [SCREENS.ABOUT_SCREEN]: { transition: 'slide', gestureEnabled: true, animationEnabled: true, headerShown: true },
  [SCREENS.HELP_SCREEN]: { transition: 'slide', gestureEnabled: true, animationEnabled: true, headerShown: true },
  [SCREENS.TERMS_SCREEN]: { transition: 'slide', gestureEnabled: true, animationEnabled: true, headerShown: true },
};

// Type guard for checking if a screen exists
export function isScreenName(screen: string): screen is ScreenName {
  return Object.values(SCREENS).includes(screen as ScreenName);
}

// Type guard for checking if a tab exists
export function isTabName(tab: string): tab is TabName {
  return Object.values(TABS).includes(tab as TabName);
}

// Helper type for extracting params
export type ScreenParams<T extends ScreenName> = RootStackParamList[T];
export type TabParams<T extends TabName> = MainTabParamList[T];

// Navigation context type
export interface NavigationContextType {
  currentScreen: ScreenName | null;
  previousScreen: ScreenName | null;
  navigationHistory: NavigationState[];
  addToHistory: (screen: ScreenName, params?: Record<string, any>) => void;
  clearHistory: () => void;
  goBackTo: (screen: ScreenName) => boolean;
}

export default {
  SCREENS,
  TABS,
  defaultRouteConfigs,
  isScreenName,
  isTabName,
};
