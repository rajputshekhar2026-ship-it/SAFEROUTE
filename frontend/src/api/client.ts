// frontend/src/api/client.ts

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Types
export interface LocationParams {
  lat: number;
  lng: number;
  address?: string;
}

export interface RouteRequest {
  start: LocationParams;
  end: LocationParams;
  waypoints?: LocationParams[];
  preferences?: ('safe' | 'fast' | 'lit')[];
  avoidHighCrime?: boolean;
  prioritizeLighting?: boolean;
  includeRefuges?: boolean;
}

export interface RouteResponse {
  id: string;
  type: 'fastest' | 'safest' | 'lit';
  coordinates: [number, number][];
  distance: number;
  duration: number;
  safetyScore: number;
  lightingScore: number;
  crimeRiskScore: number;
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
  maneuver: string;
  safetyWarning?: string;
  crimeRisk?: number;
  lightingScore?: number;
}

export interface CrimePrediction {
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  colorCode: 'green' | 'yellow' | 'orange' | 'red';
  crimeTypes: string[];
  confidence: number;
  timestamp: string;
  factors: RiskFactor[];
}

export interface RiskFactor {
  name: string;
  impact: number;
  weight: number;
  description: string;
}

export interface Refuge {
  id: number;
  name: string;
  location: LocationParams;
  type: 'police' | 'hospital' | 'cafe' | 'store' | 'community_center' | 'transit';
  address?: string;
  phone?: string;
  hours?: any;
  is24Hours: boolean;
  hasSecurity: boolean;
  hasLighting: boolean;
  rating?: number;
  amenities?: string[];
  emergencyServices?: string[];
  wheelchairAccessible: boolean;
  distance?: number;
  estimatedTime?: number;
}

export interface IncidentReport {
  type: string;
  location: LocationParams;
  description?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  isAnonymous?: boolean;
  mediaUrls?: string[];
}

export interface SOSRequest {
  location: LocationParams;
  message?: string;
  audioUri?: string;
  photoUri?: string;
  contacts?: string[];
  autoTriggered?: boolean;
}

export interface SOSResponse {
  message: string;
  sosId: string;
  contactsNotified: number;
  totalContacts: number;
  timestamp: string;
}

export interface SOSEvent {
  id: string;
  status: 'active' | 'responded' | 'resolved' | 'cancelled';
  location: LocationParams;
  message?: string;
  createdAt: string;
  resolvedAt?: string;
  responderId?: string;
  responderName?: string;
  eta?: number;
}

export interface CheckInData {
  location: LocationParams;
  status?: 'safe' | 'unsure' | 'danger';
  note?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'user' | 'admin' | 'moderator' | 'responder';
  isVerified: boolean;
  isActive: boolean;
  preferences: UserPreferences;
  emergencyContacts: EmergencyContact[];
  createdAt: string;
  lastLogin?: string;
}

export interface UserPreferences {
  notificationsEnabled: boolean;
  darkMode: boolean;
  highContrast: boolean;
  voiceGuidance: boolean;
  autoSOS: boolean;
  shareLocationWithContacts: boolean;
  preferredRouteType: 'fastest' | 'safest' | 'lit';
  alertRadius: number;
  language: string;
  units: 'metric' | 'imperial';
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  relationship: string;
  isEmergencyContact: boolean;
  notifyViaSMS: boolean;
  notifyViaPush: boolean;
  notifyViaEmail: boolean;
  userId?: string;
}

export interface WatchSyncData {
  deviceType: 'apple_watch' | 'wear_os';
  deviceId: string;
  watchName?: string;
  osVersion?: string;
  appVersion?: string;
}

export interface WatchStatus {
  connected: boolean;
  device?: {
    id: string;
    type: string;
    name?: string;
    osVersion?: string;
    appVersion?: string;
  };
  lastSync?: string;
  lastSyncAge?: number;
}

export interface WatchRoutePreview {
  routeId: string;
  startPoint: LocationParams;
  endPoint: LocationParams;
  waypoints?: LocationParams[];
  duration: number;
  distance: number;
  safetyScore: number;
  steps: Array<{
    instruction: string;
    distance: number;
    duration: number;
    maneuver: string;
  }>;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  type: 'sos' | 'alert' | 'weather' | 'crime' | 'safety' | 'system';
  priority: 'low' | 'medium' | 'high' | 'critical';
  data?: any;
  isRead: boolean;
  createdAt: string;
}

export interface HealthModeStatus {
  isActive: boolean;
  disguiseType: 'weather' | 'news' | 'calculator' | 'notes' | 'settings';
  autoActivateOnShake: boolean;
  autoActivateOnTimeRange?: {
    enabled: boolean;
    startTime: string;
    endTime: string;
  };
}

export interface HeatmapData {
  points: Array<{
    lat: number;
    lng: number;
    intensity: number;
    severity: number;
    types: string[];
  }>;
  config: {
    radius: number;
    blur: number;
    minOpacity: number;
    maxOpacity: number;
    gradient: Record<number, string>;
  };
  timestamp: string;
}

class ApiClient {
  private static instance: ApiClient;
  private axiosInstance: AxiosInstance;
  public baseURL: string;
  public wsURL: string;

  private constructor() {
    this.baseURL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.saferoute.com/api/v1';
    this.wsURL = process.env.EXPO_PUBLIC_WS_URL || 'wss://api.saferoute.com';
    
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const token = await SecureStore.getItemAsync('jwt_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        config.headers['X-Device-Platform'] = Platform.OS;
        config.headers['X-App-Version'] = '1.0.0';
        
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          try {
            const refreshToken = await SecureStore.getItemAsync('refresh_token');
            if (refreshToken) {
              const response = await this.refreshToken(refreshToken);
              await SecureStore.setItemAsync('jwt_token', response.token);
              await SecureStore.setItemAsync('refresh_token', response.refreshToken);
              originalRequest.headers.Authorization = `Bearer ${response.token}`;
              return this.axiosInstance(originalRequest);
            }
          } catch (refreshError) {
            await SecureStore.deleteItemAsync('jwt_token');
            await SecureStore.deleteItemAsync('refresh_token');
          }
        }
        
        return Promise.reject(error);
      }
    );
  }

  // ============================================
  // AUTH ENDPOINTS
  // ============================================

  async register(userData: {
    name: string;
    email: string;
    phone?: string;
    password: string;
    confirmPassword: string;
    emergencyContacts?: EmergencyContact[];
  }): Promise<{ message: string; userId: string; requiresVerification: boolean }> {
    const response = await this.axiosInstance.post('/auth/register', userData);
    return response.data;
  }

  async verifyEmail(email: string, otp: string): Promise<{ token: string; refreshToken: string; user: User }> {
    const response = await this.axiosInstance.post('/auth/verify-email', { email, otp });
    await SecureStore.setItemAsync('jwt_token', response.data.token);
    await SecureStore.setItemAsync('refresh_token', response.data.refreshToken);
    return response.data;
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const response = await this.axiosInstance.post('/auth/resend-verification', { email });
    return response.data;
  }

  async login(email: string, password: string): Promise<{ token: string; refreshToken: string; user: User }> {
    const response = await this.axiosInstance.post('/auth/login', { email, password });
    await SecureStore.setItemAsync('jwt_token', response.data.token);
    await SecureStore.setItemAsync('refresh_token', response.data.refreshToken);
    return response.data;
  }

  async logout(): Promise<{ message: string }> {
    const response = await this.axiosInstance.post('/auth/logout');
    await SecureStore.deleteItemAsync('jwt_token');
    await SecureStore.deleteItemAsync('refresh_token');
    return response.data;
  }

  async refreshToken(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
    const response = await this.axiosInstance.post('/auth/refresh-token', { refreshToken });
    return response.data;
  }

  async forgotPassword(email: string): Promise<{ message: string; resetToken?: string }> {
    const response = await this.axiosInstance.post('/auth/forgot-password', { email });
    return response.data;
  }

  async resetPassword(token: string, password: string, confirmPassword: string, otp?: string): Promise<{ message: string }> {
    const response = await this.axiosInstance.post('/auth/reset-password', { token, password, confirmPassword, otp });
    return response.data;
  }

  async changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Promise<{ message: string }> {
    const response = await this.axiosInstance.post('/auth/change-password', { currentPassword, newPassword, confirmPassword });
    return response.data;
  }

  // ============================================
  // USER ENDPOINTS
  // ============================================

  async getProfile(): Promise<{ user: User }> {
    const response = await this.axiosInstance.get('/users/profile');
    return response.data;
  }

  async updateProfile(data: { name?: string; phone?: string }): Promise<{ message: string }> {
    const response = await this.axiosInstance.put('/users/profile', data);
    return response.data;
  }

  async updatePreferences(preferences: Partial<UserPreferences>): Promise<{ message: string }> {
    const response = await this.axiosInstance.put('/users/preferences', preferences);
    return response.data;
  }

  async getEmergencyContacts(): Promise<{ emergencyContacts: EmergencyContact[] }> {
    const response = await this.axiosInstance.get('/users/emergency-contacts');
    return response.data;
  }

  async updateEmergencyContacts(emergencyContacts: EmergencyContact[]): Promise<{ message: string; emergencyContacts: EmergencyContact[] }> {
    const response = await this.axiosInstance.put('/users/emergency-contacts', { emergencyContacts });
    return response.data;
  }

  async addEmergencyContact(contact: Omit<EmergencyContact, 'id'>): Promise<{ contact: EmergencyContact }> {
    const response = await this.axiosInstance.post('/users/emergency-contacts', contact);
    return response.data;
  }

  async deleteEmergencyContact(contactId: string): Promise<{ message: string }> {
    const response = await this.axiosInstance.delete(`/users/emergency-contacts/${contactId}`);
    return response.data;
  }

  async deleteAccount(): Promise<{ message: string }> {
    const response = await this.axiosInstance.delete('/users/account');
    return response.data;
  }

  // ============================================
  // ROUTE ENDPOINTS
  // ============================================

  async getShortestRoute(request: RouteRequest): Promise<{ route: RouteResponse; refuges?: Refuge[]; summary: any }> {
    const response = await this.axiosInstance.post('/route/shortest', request);
    return response.data;
  }

  async getSafestRoute(request: RouteRequest): Promise<{ route: RouteResponse; riskAssessment: any; refuges: Refuge[]; summary: any }> {
    const response = await this.axiosInstance.post('/route/safest', request);
    return response.data;
  }

  async getLitStreetRoute(request: RouteRequest): Promise<{ route: RouteResponse; lightingAssessment: any; summary: any }> {
    const response = await this.axiosInstance.post('/route/lit-street', request);
    return response.data;
  }

  async getRouteAlternatives(request: RouteRequest): Promise<{ alternatives: any[]; recommendation: any }> {
    const response = await this.axiosInstance.post('/route/alternatives', request);
    return response.data;
  }

  async reroute(currentLocation: LocationParams, destination: LocationParams, originalRouteId: string): Promise<{ route: RouteResponse; deviation: any }> {
    const response = await this.axiosInstance.post('/route/reroute', {
      currentLocation,
      destination,
      originalRouteId,
    });
    return response.data;
  }

  async getRefugesAlongRoute(routeId: string, maxDetour?: number): Promise<{ refuges: Refuge[]; total: number }> {
    const response = await this.axiosInstance.get(`/route/${routeId}/refuges`, {
      params: { maxDetour },
    });
    return response.data;
  }

  async saveRoute(routeId: string, name?: string): Promise<{ message: string }> {
    const response = await this.axiosInstance.post('/route/save', { routeId, name });
    return response.data;
  }

  async getSavedRoutes(limit?: number, offset?: number): Promise<{ routes: any[]; pagination: any }> {
    const response = await this.axiosInstance.get('/route/saved', { params: { limit, offset } });
    return response.data;
  }

  async getRouteDetails(routeId: string): Promise<{ route: any }> {
    const response = await this.axiosInstance.get(`/route/${routeId}`);
    return response.data;
  }

  async deleteSavedRoute(routeId: string): Promise<{ message: string }> {
    const response = await this.axiosInstance.delete(`/route/${routeId}`);
    return response.data;
  }

  // ============================================
  // CRIME PREDICTION ENDPOINTS
  // ============================================

  async getCrimeRisk(lat: number, lng: number): Promise<CrimePrediction> {
    const response = await this.axiosInstance.get(`/crime/risk/${lat}/${lng}`);
    return response.data;
  }

  async getCrimeHeatmap(
    bounds: { north: number; south: number; east: number; west: number },
    zoom: number
  ): Promise<HeatmapData> {
    const response = await this.axiosInstance.get('/crime/heatmap', {
      params: { ...bounds, zoom },
    });
    return response.data;
  }

  async getCrimeStatistics(lat: number, lng: number, radius?: number): Promise<any> {
    const response = await this.axiosInstance.get('/crime/statistics', {
      params: { lat, lng, radius },
    });
    return response.data;
  }

  async getCrimeTrends(lat: number, lng: number, radius?: number, months?: number): Promise<any> {
    const response = await this.axiosInstance.get('/crime/trends', {
      params: { lat, lng, radius, months },
    });
    return response.data;
  }

  // ============================================
  // INCIDENT REPORT ENDPOINTS
  // ============================================

  async reportIncident(report: IncidentReport): Promise<{ message: string; reportId: number }> {
    const response = await this.axiosInstance.post('/report', report);
    return response.data;
  }

  async getNearbyReports(lat: number, lng: number, radius?: number, limit?: number): Promise<{ reports: any[]; count: number }> {
    const response = await this.axiosInstance.get('/report/nearby', {
      params: { lat, lng, radius, limit },
    });
    return response.data;
  }

  async getReportHeatmap(
    bounds: { north: number; south: number; east: number; west: number },
    zoom: number,
    severity?: string
  ): Promise<HeatmapData> {
    const response = await this.axiosInstance.get('/report/heatmap', {
      params: { ...bounds, zoom, severity },
    });
    return response.data;
  }

  async getReportById(reportId: number): Promise<{ report: any }> {
    const response = await this.axiosInstance.get(`/report/${reportId}`);
    return response.data;
  }

  async getMyReports(limit?: number, offset?: number): Promise<{ reports: any[]; pagination: any }> {
    const response = await this.axiosInstance.get('/report/my', { params: { limit, offset } });
    return response.data;
  }

  // ============================================
  // SOS ENDPOINTS
  // ============================================

  async triggerSOS(sosData: SOSRequest): Promise<SOSResponse> {
    const response = await this.axiosInstance.post('/sos/trigger', sosData);
    return response.data;
  }

  async cancelSOS(sosId: string): Promise<{ message: string; sosId: string }> {
    const response = await this.axiosInstance.post(`/sos/${sosId}/cancel`);
    return response.data;
  }

  async getSOSStatus(sosId: string): Promise<{ sos: SOSEvent; responder?: any }> {
    const response = await this.axiosInstance.get(`/sos/${sosId}/status`);
    return response.data;
  }

  async getSOSHistory(limit?: number, offset?: number): Promise<{ sosEvents: SOSEvent[]; pagination: any }> {
    const response = await this.axiosInstance.get('/sos/history', { params: { limit, offset } });
    return response.data;
  }

  async getFakeCall(contactId?: string): Promise<{ contact: any; callId: string; expiresIn: number }> {
    const response = await this.axiosInstance.get('/sos/fake-call', { params: { contactId } });
    return response.data;
  }

  // ============================================
  // CHECK-IN ENDPOINTS
  // ============================================

  async checkIn(data: CheckInData): Promise<{ message: string; checkinId: number }> {
    const response = await this.axiosInstance.post('/checkin', data);
    return response.data;
  }

  async getCheckInHistory(limit?: number, offset?: number): Promise<{ checkins: any[]; pagination: any }> {
    const response = await this.axiosInstance.get('/checkin/history', { params: { limit, offset } });
    return response.data;
  }

  async getCheckInTimeline(days?: number): Promise<{ timeline: any[] }> {
    const response = await this.axiosInstance.get('/checkin/timeline', { params: { days } });
    return response.data;
  }

  // ============================================
  // REFUGE ENDPOINTS
  // ============================================

  async getNearbyRefuges(lat: number, lng: number, radius?: number, type?: string): Promise<{ refuges: Refuge[] }> {
    const response = await this.axiosInstance.get('/refuges/nearby', {
      params: { lat, lng, radius, type },
    });
    return response.data;
  }

  async getAllRefuges(type?: string, limit?: number, offset?: number): Promise<{ refuges: Refuge[]; total: number }> {
    const response = await this.axiosInstance.get('/refuges', { params: { type, limit, offset } });
    return response.data;
  }

  async getRefugeById(refugeId: number): Promise<{ refuge: Refuge }> {
    const response = await this.axiosInstance.get(`/refuges/${refugeId}`);
    return response.data;
  }

  async rateRefuge(refugeId: number, rating: number): Promise<{ message: string; newRating: number }> {
    const response = await this.axiosInstance.post(`/refuges/${refugeId}/rate`, { rating });
    return response.data;
  }

  // ============================================
  // WATCH ENDPOINTS
  // ============================================

  async syncWatch(watchData: WatchSyncData): Promise<{ message: string; deviceId: string; deviceType: string; lastSync: string; pendingAlerts: any[] }> {
    const response = await this.axiosInstance.post('/watch/sync', watchData);
    return response.data;
  }

  async getWatchStatus(): Promise<WatchStatus> {
    const response = await this.axiosInstance.get('/watch/status');
    return response.data;
  }

  async disconnectWatch(deviceId: string): Promise<{ message: string }> {
    const response = await this.axiosInstance.delete(`/watch/${deviceId}`);
    return response.data;
  }

  async getWatchRoutePreview(routeId: string): Promise<{ route: WatchRoutePreview; summary: any }> {
    const response = await this.axiosInstance.get(`/watch/route/${routeId}/preview`);
    return response.data;
  }

  async sendHapticAlertToWatch(alertType: string, message: string, severity: string, location?: LocationParams): Promise<{ message: string; alertId: string; timestamp: string }> {
    const response = await this.axiosInstance.post('/watch/haptic', {
      alertType,
      message,
      severity,
      location,
    });
    return response.data;
  }

  async sendLocationToWatch(location: LocationParams): Promise<{ message: string; timestamp: string }> {
    const response = await this.axiosInstance.post('/watch/location', { location });
    return response.data;
  }

  async sendRouteProgress(routeId: string, currentStep: number, progressPercentage: number, remainingDistance: number, remainingDuration: number): Promise<{ message: string; progress: any }> {
    const response = await this.axiosInstance.post('/watch/route-progress', {
      routeId,
      currentStep,
      progressPercentage,
      remainingDistance,
      remainingDuration,
    });
    return response.data;
  }

  async syncHealthData(deviceId: string, healthData: { heartRate?: number; steps?: number; distance?: number; calories?: number }): Promise<{ message: string; timestamp: string }> {
    const response = await this.axiosInstance.post('/watch/health', { deviceId, ...healthData });
    return response.data;
  }

  async getWatchNotifications(): Promise<{ notifications: any[]; count: number }> {
    const response = await this.axiosInstance.get('/watch/notifications');
    return response.data;
  }

  // ============================================
  // NOTIFICATION ENDPOINTS
  // ============================================

  async getNotifications(page?: number, limit?: number, unreadOnly?: boolean): Promise<{ notifications: Notification[]; total: number }> {
    const response = await this.axiosInstance.get('/notifications', {
      params: { page, limit, unreadOnly },
    });
    return response.data;
  }

  async markNotificationAsRead(notificationId: string): Promise<{ message: string }> {
    const response = await this.axiosInstance.put(`/notifications/${notificationId}/read`);
    return response.data;
  }

  async markAllNotificationsAsRead(): Promise<{ message: string }> {
    const response = await this.axiosInstance.put('/notifications/read-all');
    return response.data;
  }

  async deleteNotification(notificationId: string): Promise<{ message: string }> {
    const response = await this.axiosInstance.delete(`/notifications/${notificationId}`);
    return response.data;
  }

  async getUnreadNotificationCount(): Promise<{ count: number }> {
    const response = await this.axiosInstance.get('/notifications/unread-count');
    return response.data;
  }

  async updateNotificationPreferences(preferences: {
    pushEnabled?: boolean;
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    sosAlerts?: boolean;
    safetyAlerts?: boolean;
    weatherWarnings?: boolean;
    crimeAlerts?: boolean;
    systemUpdates?: boolean;
    quietHours?: { enabled: boolean; start: string; end: string };
  }): Promise<{ message: string }> {
    const response = await this.axiosInstance.put('/notifications/preferences', preferences);
    return response.data;
  }

  async registerPushToken(token: string, platform: 'ios' | 'android' | 'web'): Promise<{ message: string }> {
    const response = await this.axiosInstance.post('/notifications/register-token', { token, platform });
    return response.data;
  }

  // ============================================
  // HEALTH MODE ENDPOINTS
  // ============================================

  async toggleHealthMode(enabled: boolean): Promise<{ message: string; status: HealthModeStatus }> {
    const response = await this.axiosInstance.post('/health-mode/toggle', { enabled });
    return response.data;
  }

  async getHealthModeStatus(): Promise<HealthModeStatus> {
    const response = await this.axiosInstance.get('/health-mode/status');
    return response.data;
  }

  async updateHealthModeSettings(settings: Partial<HealthModeStatus>): Promise<{ message: string; status: HealthModeStatus }> {
    const response = await this.axiosInstance.put('/health-mode/settings', settings);
    return response.data;
  }

  // ============================================
  // STATISTICS & ANALYTICS ENDPOINTS
  // ============================================

  async getUserStatistics(): Promise<{ user: any; safety: any; route: any }> {
    const response = await this.axiosInstance.get('/statistics/user');
    return response.data;
  }

  async getSafetyStatistics(days?: number): Promise<{ summary: any; trend: any[] }> {
    const response = await this.axiosInstance.get('/statistics/safety', { params: { days } });
    return response.data;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  getBaseURL(): string {
    return this.baseURL;
  }

  getWebSocketURL(): string {
    return this.wsURL;
  }

  setAuthToken(token: string | null): void {
    if (token) {
      this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete this.axiosInstance.defaults.headers.common['Authorization'];
    }
  }

  async clearAuth(): Promise<void> {
    await SecureStore.deleteItemAsync('jwt_token');
    await SecureStore.deleteItemAsync('refresh_token');
    this.setAuthToken(null);
  }
}

export default ApiClient.getInstance();
