import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_BASE_URL = 'https://your-server-ip:3000/api';
const WS_URL = 'ws://your-server-ip:3000';

class ApiClient {
  private static instance: ApiClient;
  private axiosInstance;

  private constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
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

  private setupInterceptors() {
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        const token = await SecureStore.getItemAsync('jwt_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          await this.refreshToken();
        }
        return Promise.reject(error);
      }
    );
  }

  async refreshToken() {
    const refreshToken = await SecureStore.getItemAsync('refresh_token');
    const response = await this.axiosInstance.post('/auth/refresh', {
      refreshToken,
    });
    await SecureStore.setItemAsync('jwt_token', response.data.token);
    return response.data.token;
  }

  // API Endpoints
  async getRoutes(start: any, end: any) {
    const response = await this.axiosInstance.post('/routes/optimize', {
      start,
      end,
      preferences: ['safe', 'fast', 'lit'],
    });
    return response.data;
  }

  async getRiskHeatmap(bbox: any) {
    const response = await this.axiosInstance.get('/heatmap/risk', {
      params: { bbox: JSON.stringify(bbox) },
    });
    return response.data;
  }

  async getSafeRefuges(location: any, radius: number = 1000) {
    const response = await this.axiosInstance.get('/refuges/nearby', {
      params: { lat: location.lat, lng: location.lng, radius },
    });
    return response.data;
  }

  async reportIncident(incident: any) {
    const formData = new FormData();
    formData.append('type', incident.type);
    formData.append('location', JSON.stringify(incident.location));
    formData.append('description', incident.description);
    
    if (incident.photo) {
      formData.append('photo', incident.photo);
    }
    if (incident.audio) {
      formData.append('audio', incident.audio);
    }

    const response = await this.axiosInstance.post('/incidents/report', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async checkIn(location: any) {
    const response = await this.axiosInstance.post('/user/checkin', { location });
    return response.data;
  }

  async getTrustedContacts() {
    const response = await this.axiosInstance.get('/user/contacts');
    return response.data;
  }

  async sendSOSMessage(data: any) {
    const response = await this.axiosInstance.post('/sos/message', data);
    return response.data;
  }
}

export default ApiClient.getInstance();
