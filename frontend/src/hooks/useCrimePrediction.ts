import { useState, useCallback, useRef } from 'react';
import ApiClient from '../api/client';

interface RiskFactor {
  name: string;
  impact: number;
  weight: number;
  description: string;
}

interface CrimePrediction {
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  colorCode: 'green' | 'yellow' | 'orange' | 'red';
  crimeTypes: string[];
  confidence: number;
  timestamp: string;
  factors: RiskFactor[];
}

interface CrimeStatistics {
  totalIncidents: number;
  avgSeverity: number;
  byType: Record<string, number>;
  byHour: number[];
  byDayOfWeek: number[];
  byMonth: number[];
  hotspots: Array<{
    lat: number;
    lng: number;
    count: number;
    avgSeverity: number;
  }>;
}

interface UseCrimePredictionReturn {
  currentRisk: CrimePrediction | null;
  isLoading: boolean;
  error: string | null;
  predictRisk: (lat: number, lng: number) => Promise<CrimePrediction | null>;
  getStatistics: (lat: number, lng: number, radius?: number) => Promise<CrimeStatistics | null>;
  getHeatmap: (bounds: { north: number; south: number; east: number; west: number }, zoom: number) => Promise<any>;
  clearCache: () => void;
}

export const useCrimePrediction = (): UseCrimePredictionReturn => {
  const [currentRisk, setCurrentRisk] = useState<CrimePrediction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const cacheRef = useRef<Map<string, CrimePrediction>>(new Map());

  const getCacheKey = (lat: number, lng: number): string => {
    return `${lat.toFixed(4)},${lng.toFixed(4)}`;
  };

  const predictRisk = useCallback(async (lat: number, lng: number): Promise<CrimePrediction | null> => {
    const cacheKey = getCacheKey(lat, lng);
    
    // Check cache first
    if (cacheRef.current.has(cacheKey)) {
      const cached = cacheRef.current.get(cacheKey)!;
      setCurrentRisk(cached);
      return cached;
    }

    setIsLoading(true);
    setError(null);

    try {
      const prediction = await ApiClient.getCrimeRisk(lat, lng);
      
      // Cache for 5 minutes
      cacheRef.current.set(cacheKey, prediction);
      setTimeout(() => {
        cacheRef.current.delete(cacheKey);
      }, 5 * 60 * 1000);
      
      setCurrentRisk(prediction);
      return prediction;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to predict crime risk';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getStatistics = useCallback(async (lat: number, lng: number, radius?: number): Promise<CrimeStatistics | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const statistics = await ApiClient.getCrimeStatistics(lat, lng, radius);
      return statistics;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get crime statistics';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getHeatmap = useCallback(async (
    bounds: { north: number; south: number; east: number; west: number },
    zoom: number
  ): Promise<any> => {
    setIsLoading(true);
    setError(null);

    try {
      const heatmap = await ApiClient.getCrimeHeatmap(bounds, zoom);
      return heatmap;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get heatmap data';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  const getRiskColor = (riskLevel: string): string => {
    switch (riskLevel) {
      case 'low': return '#4CAF50';
      case 'medium': return '#FFC107';
      case 'high': return '#FF9800';
      case 'critical': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  const getRiskText = (riskScore: number): string => {
    if (riskScore >= 80) return 'Critical Risk';
    if (riskScore >= 60) return 'High Risk';
    if (riskScore >= 30) return 'Medium Risk';
    return 'Low Risk';
  };

  return {
    currentRisk,
    isLoading,
    error,
    predictRisk,
    getStatistics,
    getHeatmap,
    clearCache,
  };
};

export default useCrimePrediction;
