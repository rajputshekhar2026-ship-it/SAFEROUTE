// frontend/src/hooks/useAuth.ts

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import ApiClient, { User, UserPreferences, EmergencyContact } from '../api/client';
import webSocketManager from '../api/websocket';

// Types
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<{ requiresVerification: boolean; userId: string }>;
  verifyEmail: (email: string, otp: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: { name?: string; phone?: string }) => Promise<void>;
  updatePreferences: (preferences: Partial<UserPreferences>) => Promise<void>;
  updateEmergencyContacts: (contacts: EmergencyContact[]) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string, confirmPassword: string, otp?: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

interface RegisterData {
  name: string;
  email: string;
  phone?: string;
  password: string;
  confirmPassword: string;
  emergencyContacts?: EmergencyContact[];
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider component
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load user on mount
  useEffect(() => {
    loadUser();
  }, []);

  // Setup WebSocket connection when authenticated
  useEffect(() => {
    if (user) {
      webSocketManager.connect().catch(console.error);
    } else {
      webSocketManager.disconnect();
    }
  }, [user]);

  const loadUser = async () => {
    try {
      setIsLoading(true);
      const token = await SecureStore.getItemAsync('jwt_token');
      
      if (token) {
        const response = await ApiClient.getProfile();
        setUser(response.user);
      }
    } catch (err) {
      console.error('Failed to load user:', err);
      await SecureStore.deleteItemAsync('jwt_token');
      await SecureStore.deleteItemAsync('refresh_token');
    } finally {
      setIsLoading(false);
    }
  };

  const clearError = () => setError(null);

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await ApiClient.login(email, password);
      setUser(response.user);
      await webSocketManager.connect();
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Login failed';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: RegisterData): Promise<{ requiresVerification: boolean; userId: string }> => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await ApiClient.register(data);
      return response;
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Registration failed';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const verifyEmail = async (email: string, otp: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await ApiClient.verifyEmail(email, otp);
      setUser(response.user);
      await webSocketManager.connect();
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Verification failed';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerification = async (email: string) => {
    try {
      setError(null);
      await ApiClient.resendVerification(email);
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Failed to resend verification';
      setError(message);
      throw new Error(message);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      await ApiClient.logout();
      webSocketManager.disconnect();
      setUser(null);
    } catch (err: any) {
      console.error('Logout error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = async (data: { name?: string; phone?: string }) => {
    try {
      setIsLoading(true);
      setError(null);
      await ApiClient.updateProfile(data);
      await refreshUser();
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Update failed';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const updatePreferences = async (preferences: Partial<UserPreferences>) => {
    try {
      setIsLoading(true);
      setError(null);
      await ApiClient.updatePreferences(preferences);
      await refreshUser();
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Update failed';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const updateEmergencyContacts = async (contacts: EmergencyContact[]) => {
    try {
      setIsLoading(true);
      setError(null);
      await ApiClient.updateEmergencyContacts(contacts);
      await refreshUser();
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Update failed';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const forgotPassword = async (email: string) => {
    try {
      setError(null);
      await ApiClient.forgotPassword(email);
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Failed to send reset email';
      setError(message);
      throw new Error(message);
    }
  };

  const resetPassword = async (token: string, password: string, confirmPassword: string, otp?: string) => {
    try {
      setIsLoading(true);
      setError(null);
      await ApiClient.resetPassword(token, password, confirmPassword, otp);
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Password reset failed';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string, confirmPassword: string) => {
    try {
      setIsLoading(true);
      setError(null);
      await ApiClient.changePassword(currentPassword, newPassword, confirmPassword);
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Password change failed';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      const response = await ApiClient.getProfile();
      setUser(response.user);
    } catch (err) {
      console.error('Failed to refresh user:', err);
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    login,
    register,
    verifyEmail,
    resendVerification,
    logout,
    updateProfile,
    updatePreferences,
    updateEmergencyContacts,
    forgotPassword,
    resetPassword,
    changePassword,
    refreshUser,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default useAuth;

