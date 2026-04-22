// src/api/endpoints.ts

export const API_ENDPOINTS = {
  // Auth endpoints
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    REFRESH_TOKEN: '/auth/refresh',
    VERIFY_EMAIL: '/auth/verify-email',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password',
    CHANGE_PASSWORD: '/auth/change-password',
  },

  // User endpoints
  USER: {
    PROFILE: '/user/profile',
    UPDATE_PROFILE: '/user/profile/update',
    DELETE_ACCOUNT: '/user/account/delete',
    CHECKIN: '/user/checkin',
    CHECKIN_HISTORY: '/user/checkin/history',
    LOCATION_HISTORY: '/user/location/history',
    STATISTICS: '/user/statistics',
    PREFERENCES: '/user/preferences',
  },

  // Routes endpoints
  ROUTES: {
    OPTIMIZE: '/routes/optimize',
    SAFEST: '/routes/safest',
    FASTEST: '/routes/fastest',
    LIT_STREET: '/routes/lit-street',
    PREVIEW: '/routes/preview',
    SAVE: '/routes/save',
    HISTORY: '/routes/history',
    DEVIATION_CHECK: '/routes/check-deviation',
  },

  // Safety & Risk endpoints
  SAFETY: {
    RISK_HEATMAP: '/safety/heatmap/risk',
    CRIME_HOTSPOTS: '/safety/crime-hotspots',
    SAFE_ZONES: '/safety/safe-zones',
    LIGHTING_SCORE: '/safety/lighting-score',
    REAL_TIME_RISK: '/safety/real-time-risk',
    ALERT_CONFIG: '/safety/alert-config',
    SAFETY_RATING: '/safety/rating',
  },

  // Refuge endpoints
  REFUGES: {
    NEARBY: '/refuges/nearby',
    ALL: '/refuges/all',
    DETAILS: '/refuges/details',
    CATEGORIES: '/refuges/categories',
    ALONG_ROUTE: '/refuges/along-route',
    ADD: '/refuges/add',
    REVIEW: '/refuges/review',
    REPORT_CLOSED: '/refuges/report-closed',
  },

  // Incident endpoints
  INCIDENTS: {
    REPORT: '/incidents/report',
    NEARBY: '/incidents/nearby',
    HISTORY: '/incidents/history',
    TYPES: '/incidents/types',
    UPDATE: '/incidents/update',
    VERIFY: '/incidents/verify',
    TRENDS: '/incidents/trends',
    STATISTICS: '/incidents/statistics',
  },

  // SOS endpoints
  SOS: {
    TRIGGER: '/sos/trigger',
    CANCEL: '/sos/cancel',
    MESSAGE: '/sos/message',
    BROADCAST: '/sos/broadcast',
    HISTORY: '/sos/history',
    CONTACTS: '/sos/contacts',
    UPDATE_CONTACTS: '/sos/contacts/update',
    STATUS: '/sos/status',
    RESPOND: '/sos/respond',
  },

  // Contacts endpoints
  CONTACTS: {
    LIST: '/contacts/list',
    ADD: '/contacts/add',
    REMOVE: '/contacts/remove',
    UPDATE: '/contacts/update',
    TRUSTED: '/contacts/trusted',
    EMERGENCY: '/contacts/emergency',
    GROUPS: '/contacts/groups',
  },

  // Notifications endpoints
  NOTIFICATIONS: {
    REGISTER: '/notifications/register',
    UNREGISTER: '/notifications/unregister',
    HISTORY: '/notifications/history',
    MARK_READ: '/notifications/mark-read',
    PREFERENCES: '/notifications/preferences',
    SEND: '/notifications/send',
    BROADCAST: '/notifications/broadcast',
  },

  // Weather endpoints
  WEATHER: {
    CURRENT: '/weather/current',
    FORECAST: '/weather/forecast',
    ALERTS: '/weather/alerts',
    ALONG_ROUTE: '/weather/along-route',
    DANGER_ZONES: '/weather/danger-zones',
  },

  // Watch endpoints
  WATCH: {
    SYNC: '/watch/sync',
    ROUTE_PREVIEW: '/watch/route-preview',
    HEARTBEAT: '/watch/heartbeat',
    ALERT: '/watch/alert',
    SOS_FROM_WATCH: '/watch/sos',
    LOCATION_SYNC: '/watch/location-sync',
  },

  // Health mode endpoints
  HEALTH_MODE: {
    TOGGLE: '/health-mode/toggle',
    STATUS: '/health-mode/status',
    FAKE_DATA: '/health-mode/fake-data',
    DISGUISE_SETTINGS: '/health-mode/disguise-settings',
  },

  // Offline endpoints
  OFFLINE: {
    SYNC: '/offline/sync',
    CACHE_DATA: '/offline/cache',
    SAFE_ZONES_CACHE: '/offline/safe-zones-cache',
    MAP_TILES: '/offline/map-tiles',
    PENDING_REPORTS: '/offline/pending-reports',
    LAST_SYNC: '/offline/last-sync',
  },

  // Analytics endpoints
  ANALYTICS: {
    USER_BEHAVIOR: '/analytics/user-behavior',
    ROUTE_STATISTICS: '/analytics/route-statistics',
    INCIDENT_REPORTS: '/analytics/incident-reports',
    APP_USAGE: '/analytics/app-usage',
    PERFORMANCE: '/analytics/performance',
  },

  // Admin endpoints (for backend use)
  ADMIN: {
    USERS: '/admin/users',
    INCIDENTS: '/admin/incidents',
    REFUGES: '/admin/refuges',
    HEATMAP_CONFIG: '/admin/heatmap-config',
    SYSTEM_STATUS: '/admin/system-status',
    BROADCAST_ALERT: '/admin/broadcast-alert',
    METRICS: '/admin/metrics',
  },
};

// WebSocket event types
export const WS_EVENTS = {
  // Client to Server
  CLIENT: {
    LOCATION_UPDATE: 'location_update',
    SOS_TRIGGER: 'sos_trigger',
    CHECKIN: 'checkin',
    INCIDENT_REPORT: 'incident_report',
    ROUTE_REQUEST: 'route_request',
    SAFETY_STATUS: 'safety_status',
    HEARTBEAT: 'heartbeat',
  },

  // Server to Client
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
};

// HTTP status codes
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
};

// Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  statusCode: number;
  timestamp: string;
}

// Pagination types
export interface PaginatedResponse<T> extends ApiResponse {
  data: {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Request parameter types
export interface LocationParams {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: number;
}

export interface BoundingBoxParams {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface RouteParams {
  start: LocationParams;
  end: LocationParams;
  waypoints?: LocationParams[];
  preferences?: ('safe' | 'fast' | 'lit')[];
  avoidHighCrime?: boolean;
  prioritizeLighting?: boolean;
  includeRefuges?: boolean;
}

export interface IncidentReportParams {
  type: string;
  location: LocationParams;
  description?: string;
  severity?: 'low' | 'medium' | 'high';
  photoUri?: string;
  audioUri?: string;
  anonymous?: boolean;
}

export interface SOSParams {
  location: LocationParams;
  audioUri?: string;
  photoUri?: string;
  message?: string;
  contacts?: string[];
  includeLocationHistory?: boolean;
}

export interface CheckInParams {
  location: LocationParams;
  status?: 'safe' | 'unsure' | 'danger';
  note?: string;
  shareWithContacts?: boolean;
}

// Configuration endpoints
export const CONFIG = {
  API_TIMEOUT: 10000,
  WS_RECONNECT_ATTEMPTS: 5,
  WS_RECONNECT_DELAY: 1000,
  LOCATION_UPDATE_INTERVAL: 5000, // 5 seconds
  SOS_AUTO_TIMEOUT: 10000, // 10 seconds
  CACHE_EXPIRY: 3600000, // 1 hour
  MAX_PHOTO_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_AUDIO_DURATION: 30000, // 30 seconds
};

export default API_ENDPOINTS;
