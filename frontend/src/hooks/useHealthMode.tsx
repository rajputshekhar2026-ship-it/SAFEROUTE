import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface HealthModeContextType {
  isHealthMode: boolean;
  toggleHealthMode: () => void;
  secretGestureCount: number;
}

const HealthModeContext = createContext<HealthModeContextType | undefined>(undefined);

export const HealthModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isHealthMode, setIsHealthMode] = useState(false);
  const [secretGestureCount, setSecretGestureCount] = useState(0);
  const [lastTap, setLastTap] = useState(0);

  useEffect(() => {
    loadHealthModeState();
  }, []);

  const loadHealthModeState = async () => {
    const saved = await AsyncStorage.getItem('healthMode');
    if (saved) {
      setIsHealthMode(JSON.parse(saved));
    }
  };

  const toggleHealthMode = async () => {
    const newState = !isHealthMode;
    setIsHealthMode(newState);
    await AsyncStorage.setItem('healthMode', JSON.stringify(newState));
    
    // Trigger UI change notification
    if (newState) {
      console.log('Health mode activated - UI disguised as weather app');
    } else {
      console.log('Health mode deactivated - Normal UI restored');
    }
  };

  const handleSecretGesture = () => {
    const now = Date.now();
    if (now - lastTap < 500) {
      // Double tap detected
      if (secretGestureCount + 1 >= 2) {
        toggleHealthMode();
        setSecretGestureCount(0);
      } else {
        setSecretGestureCount(prev => prev + 1);
      }
    } else {
      setSecretGestureCount(1);
    }
    setLastTap(now);
  };

  return (
    <HealthModeContext.Provider
      value={{
        isHealthMode,
        toggleHealthMode,
        secretGestureCount,
      }}
    >
      {children}
    </HealthModeContext.Provider>
  );
};

export const useHealthMode = () => {
  const context = useContext(HealthModeContext);
  if (!context) {
    throw new Error('useHealthMode must be used within HealthModeProvider');
  }
  return context;
};
