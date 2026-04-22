// src/utils/constants.ts

import { Dimensions, Platform } from 'react-native';

const { width, height } = Dimensions.get('window');

// App Configuration
export const APP_CONFIG = {
  NAME: 'Safe Route Navigation',
  VERSION: '1.0.0',
  BUILD_NUMBER: 1,
  API_VERSION: 'v1',
  ENVIRONMENT: __DEV__ ? 'development' : 'production',
};

// API Endpoints (will be replaced by environment variables)
export const API_ENDPOINTS = {
  BASE_URL: __DEV__ ? 'http://localhost:3000/api' : 'https://api.saferoute.com/api',
  WS_URL: __DEV__ ? 'ws://localhost:3000' : 'wss://api.saferoute.com',
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
  },
  USER: {
    PROFILE: '/user/profile',
    CHECKIN: '/user/checkin',
    PREFERENCES: '/user/preferences',
  },
  ROUTES: {
    OPTIMIZE: '/routes/optimize',
    SAFEST: '/routes/safest',
    FASTEST: '/routes/fastest',
    LIT: '/routes/lit',
  },
  SAFETY: {
    HEATMAP: '/safety/heatmap',
    ALERTS: '/safety/alerts',
    REFUGES: '/safety/refuges',
  },
  INCIDENTS: {
    REPORT: '/incidents/report',
    NEARBY: '/incidents/nearby',
    HISTORY: '/incidents/history',
  },
  SOS: {
    TRIGGER: '/sos/trigger',
    CANCEL: '/sos/cancel',
    CONTACTS: '/sos/contacts',
  },
};

// Map Configuration
export const MAP_CONFIG = {
  DEFAULT_CENTER: {
    lat: 40.7128,
    lng: -74.0060,
  },
  DEFAULT_ZOOM: 15,
  MIN_ZOOM: 3,
  MAX_ZOOM: 19,
  TILT_ENABLED: true,
  COMPASS_ENABLED: true,
  ZOOM_ENABLED: true,
  SCROLL_ENABLED: true,
  ROTATE_ENABLED: true,
  PITCH_ENABLED: true,
  ANIMATION_DURATION: 1000,
  HEATMAP_RADIUS: 30,
  HEATMAP_OPACITY: 0.8,
  ROUTE_LINE_WIDTH: 4,
  ROUTE_LINE_WIDTH_SELECTED: 6,
};

// Route Colors
export const ROUTE_COLORS = {
  FASTEST: '#2196F3', // Blue
  SAFEST: '#4CAF50',  // Green
  LIT: '#FFC107',     // Yellow
  DEFAULT: '#9E9E9E', // Grey
  SELECTED_BORDER: '#FFFFFF',
};

// Risk Level Colors
export const RISK_COLORS = {
  LOW: '#4CAF50',     // Green
  MEDIUM: '#FFC107',  // Yellow
  HIGH: '#FF9800',    // Orange
  CRITICAL: '#F44336', // Red
  UNKNOWN: '#9E9E9E', // Grey
};

// Refuge Type Colors & Icons
export const REFUGE_CONFIG = {
  police: {
    icon: '👮‍♂️',
    color: '#2196F3',
    name: 'Police Station',
  },
  hospital: {
    icon: '🏥',
    color: '#F44336',
    name: 'Hospital',
  },
  cafe: {
    icon: '☕',
    color: '#FF9800',
    name: 'Cafe',
  },
  store: {
    icon: '🏪',
    color: '#4CAF50',
    name: 'Store',
  },
  community_center: {
    icon: '🏛️',
    color: '#9C27B0',
    name: 'Community Center',
  },
  transit: {
    icon: '🚉',
    color: '#00BCD4',
    name: 'Transit Station',
  },
};

// Incident Types
export const INCIDENT_TYPES = [
  { id: 'harassment', name: 'Harassment', icon: '😡', severity: 'high' },
  { id: 'broken_light', name: 'Broken Light', icon: '💡', severity: 'low' },
  { id: 'blocked_path', name: 'Blocked Path', icon: '🚧', severity: 'medium' },
  { id: 'suspicious_activity', name: 'Suspicious Activity', icon: '👀', severity: 'high' },
  { id: 'assault', name: 'Assault', icon: '🤛', severity: 'critical' },
  { id: 'unsafe_condition', name: 'Unsafe Condition', icon: '⚠️', severity: 'medium' },
  { id: 'theft', name: 'Theft', icon: '👛', severity: 'high' },
  { id: 'medical', name: 'Medical Emergency', icon: '🚑', severity: 'critical' },
];

// Timing Constants (in milliseconds)
export const TIMING = {
  ANIMATION_SHORT: 200,
  ANIMATION_MEDIUM: 500,
  ANIMATION_LONG: 1000,
  DEBOUNCE_DELAY: 300,
  THROTTLE_DELAY: 500,
  LOCATION_UPDATE_INTERVAL: 5000,
  SOS_COUNTDOWN: 10000,
  SAFETY_CHECK_INTERVAL: 30000,
  AUTO_SAVE_INTERVAL: 60000,
  SESSION_TIMEOUT: 3600000, // 1 hour
  TOKEN_REFRESH_INTERVAL: 300000, // 5 minutes
  CACHE_EXPIRY: 86400000, // 24 hours
  OFFLINE_SYNC_INTERVAL: 300000, // 5 minutes
};

// Location Constants
export const LOCATION_CONFIG = {
  ACCURACY: {
    HIGH: 0,
    BALANCED: 1,
    LOW: 2,
    PASSIVE: 3,
  },
  UPDATE_INTERVAL: 5000, // 5 seconds
  BACKGROUND_UPDATE_INTERVAL: 10000, // 10 seconds
  DISTANCE_FILTER: 5, // 5 meters
  MAX_WAIT_TIME: 10000, // 10 seconds
  GEOCoding_TIMEOUT: 5000, // 5 seconds
};

// Storage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_DATA: 'user_data',
  USER_PREFERENCES: 'user_preferences',
  LOCATION_HISTORY: 'location_history',
  OFFLINE_REPORTS: 'offline_reports',
  CACHED_ROUTES: 'cached_routes',
  CACHED_REFUGES: 'cached_refuges',
  CACHED_HEATMAP: 'cached_heatmap',
  NOTIFICATION_HISTORY: 'notification_history',
  SOS_CONTACTS: 'sos_contacts',
  SOS_CONFIG: 'sos_config',
  HEALTH_MODE_CONFIG: 'health_mode_config',
  APP_SETTINGS: 'app_settings',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  LAST_LOCATION: 'last_location',
  PENDING_SOS: 'pending_sos',
  OFFLINE_QUEUE: 'offline_queue',
};

// Screen Dimensions
export const SCREEN = {
  WIDTH: width,
  HEIGHT: height,
  IS_SMALL: width < 375,
  IS_MEDIUM: width >= 375 && width < 414,
  IS_LARGE: width >= 414,
  IS_TABLET: width >= 768,
  STATUS_BAR_HEIGHT: Platform.OS === 'ios' ? 44 : 0,
  BOTTOM_TAB_HEIGHT: Platform.OS === 'ios' ? 83 : 60,
  BOTTOM_ACTION_BAR_HEIGHT: Platform.OS === 'ios' ? 120 : 100,
};

// Thumb Zone (bottom 30% of screen for easy reach)
export const THUMB_ZONE = {
  HEIGHT: SCREEN.HEIGHT * 0.3,
  Y_POSITION: SCREEN.HEIGHT * 0.7,
  SAFE_AREA: SCREEN.HEIGHT * 0.8,
};

// Haptic Feedback Patterns
export const HAPTIC_PATTERNS = {
  LIGHT: 'light',
  MEDIUM: 'medium',
  HEAVY: 'heavy',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  SELECTION: 'selection',
};

// Voice Guidance Messages
export const VOICE_MESSAGES = {
  ROUTE_CALCULATED: 'Route calculated successfully.',
  ROUTE_STARTED: 'Starting navigation. Follow the route for safety.',
  REROUTING: 'Rerouting to a safer path.',
  DANGER_AHEAD: 'Warning: High risk area ahead. Stay alert.',
  TURN_LEFT: 'Turn left',
  TURN_RIGHT: 'Turn right',
  STRAIGHT: 'Continue straight',
  ARRIVED: 'You have arrived at your destination.',
  SOS_TRIGGERED: 'Emergency alert sent. Help is on the way.',
  SOS_CANCELLED: 'Emergency alert cancelled.',
  CHECKIN_SUCCESS: 'Check-in successful. Your location has been saved.',
  REFUGE_NEARBY: 'Safe refuge nearby.',
  DEVIATION_DETECTED: 'Route deviation detected. Rerouting for safety.',
};

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network connection error. Please check your internet connection.',
  LOCATION_DENIED: 'Location permission denied. Please enable location services.',
  LOCATION_UNAVAILABLE: 'Unable to get your location. Please try again.',
  ROUTE_FAILED: 'Failed to calculate route. Please try again.',
  SOS_FAILED: 'Failed to send SOS. Please try again or call emergency services.',
  INCIDENT_REPORT_FAILED: 'Failed to submit incident report. Please try again.',
  AUTH_FAILED: 'Authentication failed. Please log in again.',
  SESSION_EXPIRED: 'Session expired. Please log in again.',
  OFFLINE_MODE: 'You are offline. Some features may be limited.',
  GENERIC_ERROR: 'Something went wrong. Please try again.',
};

// Success Messages
export const SUCCESS_MESSAGES = {
  REPORT_SUBMITTED: 'Incident report submitted successfully. Thank you for helping keep our community safe.',
  CHECKIN_SUCCESS: 'Check-in successful. Your location has been recorded.',
  SOS_SENT: 'Emergency alert sent successfully. Help is on the way.',
  SETTINGS_SAVED: 'Settings saved successfully.',
  CONTACT_ADDED: 'Emergency contact added successfully.',
  CONTACT_REMOVED: 'Emergency contact removed.',
};

// Validation Constants
export const VALIDATION = {
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 64,
  MIN_NAME_LENGTH: 2,
  MAX_NAME_LENGTH: 50,
  MAX_DESCRIPTION_LENGTH: 500,
  PHONE_REGEX: /^[\+]?[(]?[0-9]{1,3}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}$/,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
};

// Date Formats
export const DATE_FORMATS = {
  FULL: 'MMMM DD, YYYY [at] HH:mm',
  DATE_ONLY: 'MMMM DD, YYYY',
  TIME_ONLY: 'HH:mm',
  TIME_WITH_SECONDS: 'HH:mm:ss',
  RELATIVE: 'relative',
  SHORT_DATE: 'MM/DD/YYYY',
  ISO: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
};

// Theme Constants
export const THEME = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
};

// Animation Constants
export const ANIMATION = {
  SPRING_CONFIG: {
    damping: 10,
    mass: 1,
    stiffness: 100,
    overshootClamping: false,
    restSpeedThreshold: 0.001,
    restDisplacementThreshold: 0.001,
  },
  TIMING_CONFIG: {
    duration: 300,
    easing: 'ease-in-out',
  },
};

// Feature Flags
export const FEATURES = {
  ENABLE_WATCH: true,
  ENABLE_OFFLINE_MODE: true,
  ENABLE_HEALTH_MODE: true,
  ENABLE_FAKE_CALL: true,
  ENABLE_VOICE_GUIDANCE: true,
  ENABLE_HAPTICS: true,
  ENABLE_PUSH_NOTIFICATIONS: true,
  ENABLE_BACKGROUND_LOCATION: true,
  ENABLE_SMART_WATCH: Platform.OS === 'ios',
};

// Log Levels
export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4,
};

// Current log level (set to DEBUG in development)
export const CURRENT_LOG_LEVEL = __DEV__ ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;

// App Deep Links
export const DEEP_LINKS = {
  SOS: 'saferoute://sos',
  REPORT_INCIDENT: 'saferoute://report',
  SAFE_REFUGE: 'saferoute://refuge',
  SETTINGS: 'saferoute://settings',
};

// Default Contacts
export const DEFAULT_EMERGENCY_CONTACTS = [
  { name: 'Emergency Services', phone: '911', isEmergencyContact: true },
  { name: 'Police', phone: '911', isEmergencyContact: true },
  { name: 'Ambulance', phone: '911', isEmergencyContact: true },
];

// Fake Call Presets
export const FAKE_CALL_PRESETS = [
  { name: 'Mom', relationship: 'Mother', icon: '👩', conversationPrompts: [
    "I'm on my way home, should be there soon",
    "Yes, I'm walking on Main Street",
    "Can you stay on the phone with me?",
    "I see a well-lit area ahead",
    "I'll be home in about 10 minutes",
  ]},
  { name: 'Brother', relationship: 'Brother', icon: '👨', conversationPrompts: [
    "Hey, just checking in",
    "Where are you right now?",
    "Want me to come pick you up?",
    "Stay on the main roads",
    "I'll meet you at the corner",
  ]},
  { name: 'Friend', relationship: 'Best Friend', icon: '👩', conversationPrompts: [
    "Are you almost here?",
    "I'm waiting for you",
    "Let me know when you're close",
    "Be careful out there",
    "Text me when you get home",
  ]},
  { name: 'Police', relationship: 'Emergency', icon: '👮', conversationPrompts: [
    "This is the police department",
    "What is your emergency?",
    "Stay on the line",
    "Officers are on their way",
    "Can you describe your location?",
  ]},
];

// Export all constants as default object
export default {
  APP_CONFIG,
  API_ENDPOINTS,
  MAP_CONFIG,
  ROUTE_COLORS,
  RISK_COLORS,
  REFUGE_CONFIG,
  INCIDENT_TYPES,
  TIMING,
  LOCATION_CONFIG,
  STORAGE_KEYS,
  SCREEN,
  THUMB_ZONE,
  HAPTIC_PATTERNS,
  VOICE_MESSAGES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  VALIDATION,
  DATE_FORMATS,
  THEME,
  ANIMATION,
  FEATURES,
  LOG_LEVELS,
  CURRENT_LOG_LEVEL,
  DEEP_LINKS,
  DEFAULT_EMERGENCY_CONTACTS,
  FAKE_CALL_PRESETS,
};
