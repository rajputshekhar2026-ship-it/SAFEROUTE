// src/types/index.ts

// Location Types
export interface LocationParams {
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  timestamp: number;
  address?: string;
}

export interface BoundingBoxParams {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface GeocodingResult {
  address: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  street?: string;
  streetNumber?: string;
  formattedAddress: string;
}

// Route Types
export interface RouteParams {
  start: LocationParams;
  end: LocationParams;
  waypoints?: LocationParams[];
  preferences?: ('safe' | 'fast' | 'lit')[];
  avoidHighCrime?: boolean;
  prioritizeLighting?: boolean;
  includeRefuges?: boolean;
}

export interface Route {
  id: string;
  type: 'fastest' | 'safest' | 'lit';
  coordinates: [number, number][];
  duration: number; // in seconds
  distance: number; // in meters
  safetyScore: number; // 0-100
  lightingScore: number; // 0-100
  crimeRiskScore: number; // 0-100
  steps: RouteStep[];
  polyline: string;
  summary: string;
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  startLocation: LocationParams;
  endLocation: LocationParams;
  maneuver: 'straight' | 'turn-left' | 'turn-right' | 'slight-left' | 'slight-right' | 'sharp-left' | 'sharp-right' | 'u-turn';
  safetyWarning?: string;
}

// Safety & Risk Types
export interface RiskZone {
  id: string;
  coordinates: [number, number][];
  center: LocationParams;
  radius: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  crimeType?: string;
  incidentCount: number;
  timestamp: number;
  lastUpdated: number;
}

export interface HeatmapData {
  zones: RiskZone[];
  gradient: { [key: string]: number };
  maxIntensity: number;
  minIntensity: number;
}

export interface SafetyAlert {
  id: string;
  type: 'danger_zone' | 'suspicious_activity' | 'weather_warning' | 'crime_alert' | 'route_deviation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  location?: LocationParams;
  timestamp: number;
  actionRequired: boolean;
  actionDeadline?: number;
  acknowledged: boolean;
}

// Incident Types
export interface IncidentReport {
  id?: string;
  type: 'harassment' | 'broken_light' | 'blocked_path' | 'suspicious_activity' | 'assault' | 'unsafe_condition' | 'theft' | 'medical';
  location: LocationParams;
  description: string;
  severity: 'low' | 'medium' | 'high';
  photoUri?: string;
  audioUri?: string;
  videoUri?: string;
  anonymous: boolean;
  timestamp: number;
  status: 'pending' | 'verified' | 'resolved' | 'dismissed';
}

export interface IncidentType {
  id: string;
  name: string;
  icon: string;
  color: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

// Refuge Types
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
  hasSecurity?: boolean;
  hasLighting?: boolean;
  distance?: number;
  estimatedTime?: number;
  imageUrl?: string;
  amenities?: string[];
  emergencyServices?: string[];
  wheelchairAccessible?: boolean;
  description?: string;
}

// SOS Types
export interface SOSData {
  id: string;
  location: LocationParams;
  timestamp: number;
  audioUri?: string;
  photoUri?: string;
  message?: string;
  contacts: string[];
  includeLocationHistory: boolean;
  status: 'pending' | 'sent' | 'failed' | 'cancelled' | 'responded';
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
  relationship: string;
}

// User Types
export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  isVerified: boolean;
  createdAt: number;
  preferences: UserPreferences;
}

export interface UserPreferences {
  notificationsEnabled: boolean;
  darkMode: boolean;
  highContrast: boolean;
  voiceGuidance: boolean;
  autoSOS: boolean;
  shareLocationWithContacts: boolean;
  preferredRouteType: 'fastest' | 'safest' | 'lit';
  alertRadius: number; // in meters
}

export interface CheckIn {
  id: string;
  location: LocationParams;
  status: 'safe' | 'unsure' | 'danger';
  note?: string;
  timestamp: number;
  shareWithContacts: boolean;
}

// WebSocket Types
export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: number;
  id: string;
}

export interface WebSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  lastMessage: WebSocketMessage | null;
  error: string | null;
  reconnectAttempts: number;
}

// Notification Types
export interface Notification {
  id: string;
  title: string;
  body: string;
  data?: any;
  timestamp: number;
  read: boolean;
  type: 'sos' | 'alert' | 'weather' | 'crime' | 'safety' | 'system';
  priority: 'low' | 'medium' | 'high' | 'critical';
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
    start: string;
    end: string;
  };
}

// Weather Types
export interface WeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  feelsLike: number;
  uvIndex: number;
  airQuality: 'good' | 'moderate' | 'poor' | 'hazardous';
  visibility: number;
  precipitation: number;
  timestamp: number;
}

export interface WeatherWarning {
  id: string;
  type: 'storm' | 'flood' | 'extreme_heat' | 'extreme_cold' | 'fog' | 'lightning';
  severity: 'low' | 'medium' | 'high';
  message: string;
  affectedArea: {
    center: LocationParams;
    radius: number;
  };
  timestamp: number;
  expiryTime: number;
}

// Health Mode Types
export interface HealthModeConfig {
  isActive: boolean;
  disguiseType: 'weather' | 'news' | 'calculator' | 'notes' | 'settings';
  autoActivateOnShake: boolean;
  autoActivateOnTimeRange?: {
    enabled: boolean;
    startTime: string;
    endTime: string;
  };
  quickExitGesture: 'doubleTap' | 'longPress' | 'shake' | 'threeFingerTap';
  fakeDataRefreshInterval: number;
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

// Watch Types
export interface WatchMessage {
  type: string;
  data: any;
  timestamp: number;
  requiresResponse?: boolean;
}

export interface WatchRoutePreview {
  start: LocationParams;
  end: LocationParams;
  waypoints?: LocationParams[];
  duration: number;
  distance: number;
  safetyScore?: number;
  steps?: Array<{
    instruction: string;
    distance: number;
    duration: number;
  }>;
}

export interface WatchAlert {
  type: 'danger' | 'warning' | 'info' | 'sos';
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
}

export interface WatchLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp: number;
}

export interface WatchHealthData {
  heartRate?: number;
  steps?: number;
  distance?: number;
  calories?: number;
  timestamp: number;
}

export interface WatchConnectionState {
  isReachable: boolean;
  isInstalled: boolean;
  isPaired: boolean;
  watchName?: string;
  watchOSVersion?: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  statusCode: number;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse {
  data: {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: User;
  expiresIn: number;
}

// Storage Types
export interface StorageItem<T = any> {
  key: string;
  value: T;
  timestamp: number;
  expiresAt?: number;
  version?: number;
}

export interface OfflineData {
  id: string;
  type: string;
  data: any;
  timestamp: number;
  synced: boolean;
}

// Navigation Types
export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Main: undefined;
  HomeMap: undefined;
  ReportIncident: { incidentType?: string; location?: LocationParams };
  FakeCall: { contact?: SOSContact };
  SafeRefuge: { refugeId?: string };
  HealthMode: undefined;
  SOS: { sosData?: SOSData };
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

// Utility Types
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type ValueOf<T> = T[keyof T];

export type AsyncFunction<T = any> = (...args: any[]) => Promise<T>;

// Constants
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const WS_EVENTS = {
  CLIENT: {
    LOCATION_UPDATE: 'location_update',
    SOS_TRIGGER: 'sos_trigger',
    CHECKIN: 'checkin',
    INCIDENT_REPORT: 'incident_report',
    ROUTE_REQUEST: 'route_request',
    SAFETY_STATUS: 'safety_status',
    HEARTBEAT: 'heartbeat',
  },
  SERVER: {
    SAFETY_ALERT: 'safety_alert',
    ROUTE_DEVIATION: 'route_deviation',
    DANGER_ZONE_ALERT: 'danger_zone_alert',
    SOS_RECEIVED: 'sos_received',
    WEATHER_WARNING: 'weather_warning',
    CRIME_ALERT: 'crime_alert',
    REFUGE_ALERT: 'refuge_alert',
    CONNECTION_ACK: 'connection_ack',
    RECONNECT: 'reconnect',
    LOCATION_ACK: 'location_ack',
    SAFETY_CHECK: 'safety_check',
  },
} as const;

export const CONFIG = {
  API_TIMEOUT: 10000,
  WS_RECONNECT_ATTEMPTS: 5,
  WS_RECONNECT_DELAY: 1000,
  LOCATION_UPDATE_INTERVAL: 5000,
  SOS_AUTO_TIMEOUT: 10000,
  CACHE_EXPIRY: 3600000,
  MAX_PHOTO_SIZE: 5 * 1024 * 1024,
  MAX_AUDIO_DURATION: 30000,
} as const;

// Default values
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  notificationsEnabled: true,
  darkMode: true,
  highContrast: false,
  voiceGuidance: true,
  autoSOS: true,
  shareLocationWithContacts: true,
  preferredRouteType: 'safest',
  alertRadius: 500,
};

export const DEFAULT_HEALTH_MODE_CONFIG: HealthModeConfig = {
  isActive: false,
  disguiseType: 'weather',
  autoActivateOnShake: true,
  autoActivateOnTimeRange: {
    enabled: true,
    startTime: '22:00',
    endTime: '06:00',
  },
  quickExitGesture: 'doubleTap',
  fakeDataRefreshInterval: 300000,
  biometricRequiredForExit: false,
};
