// src/components/RiskHeatmap.tsx

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import ApiClient from '../api/client';
import { BoundingBoxParams } from '../api/endpoints';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');

interface RiskHeatmapProps {
  bbox: BoundingBoxParams;
  visible?: boolean;
  onHeatmapLoaded?: () => void;
  refreshInterval?: number;
}

interface RiskZone {
  id: string;
  coordinates: [number, number][];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  crimeType?: string;
  timestamp: number;
  incidentCount: number;
}

interface HeatmapData {
  zones: RiskZone[];
  gradient: { [key: string]: number };
  maxIntensity: number;
  minIntensity: number;
}

const RiskHeatmap: React.FC<RiskHeatmapProps> = ({
  bbox,
  visible = true,
  onHeatmapLoaded,
  refreshInterval = 30000, // 30 seconds refresh
}) => {
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mapRef = useRef<any>(null);

  // Risk level colors (RGBA format for heatmap)
  const riskColors = {
    low: 'rgba(0, 255, 0, 0.3)',      // Green
    medium: 'rgba(255, 255, 0, 0.5)',  // Yellow
    high: 'rgba(255, 165, 0, 0.7)',    // Orange
    critical: 'rgba(255, 0, 0, 0.9)',  // Red
  };

  // Heatmap gradient stops
  const heatmapGradient = {
    0.0: 'rgba(0, 255, 0, 0)',
    0.2: 'rgba(0, 255, 0, 0.3)',
    0.4: 'rgba(255, 255, 0, 0.5)',
    0.6: 'rgba(255, 165, 0, 0.7)',
    0.8: 'rgba(255, 0, 0, 0.8)',
    1.0: 'rgba(255, 0, 0, 0.95)',
  };

  useEffect(() => {
    if (visible) {
      fetchHeatmapData();
      startAutoRefresh();
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [bbox, visible]);

  const startAutoRefresh = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(() => {
      if (visible) {
        fetchHeatmapData();
      }
    }, refreshInterval);
  };

  const fetchHeatmapData = async () => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch risk zones from backend
      const response = await ApiClient.getRiskHeatmap(bbox);
      
      if (response && response.zones) {
        const processedData = processHeatmapData(response);
        setHeatmapData(processedData);
        setLastUpdate(Date.now());
        
        // Check for high-risk zones near user
        checkNearbyHighRiskZones(processedData.zones);
        
        if (onHeatmapLoaded) {
          onHeatmapLoaded();
        }
      }
    } catch (err) {
      console.error('Failed to fetch heatmap data:', err);
      setError('Unable to load risk heatmap');
      
      // Try to load cached data
      loadCachedHeatmapData();
    } finally {
      setLoading(false);
    }
  };

  const processHeatmapData = (data: any): HeatmapData => {
    // Process and normalize heatmap data
    const zones = data.zones.map((zone: any) => ({
      ...zone,
      riskLevel: determineRiskLevel(zone.incidentCount, zone.crimeType),
    }));

    const maxIntensity = Math.max(...zones.map((z: RiskZone) => z.incidentCount), 1);
    const minIntensity = Math.min(...zones.map((z: RiskZone) => z.incidentCount), 0);

    return {
      zones,
      gradient: heatmapGradient,
      maxIntensity,
      minIntensity,
    };
  };

  const determineRiskLevel = (incidentCount: number, crimeType?: string): RiskZone['riskLevel'] => {
    if (incidentCount >= 10) return 'critical';
    if (incidentCount >= 5) return 'high';
    if (incidentCount >= 2) return 'medium';
    return 'low';
  };

  const loadCachedHeatmapData = async () => {
    try {
      // Load from AsyncStorage
      const cached = await ApiClient.getCachedData('risk_heatmap');
      if (cached && Date.now() - cached.timestamp < 300000) { // 5 minutes cache
        setHeatmapData(cached.data);
      }
    } catch (err) {
      console.error('Failed to load cached heatmap:', err);
    }
  };

  const checkNearbyHighRiskZones = (zones: RiskZone[]) => {
    // Check if user is near any high-risk zones
    const highRiskZones = zones.filter(
      zone => zone.riskLevel === 'high' || zone.riskLevel === 'critical'
    );
    
    if (highRiskZones.length > 0) {
      // Trigger haptic warning for nearby high-risk zones
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      
      // Emit event for app to handle warning
      const event = new CustomEvent('nearbyHighRiskZones', {
        detail: { zones: highRiskZones }
      });
      // @ts-ignore
      window.dispatchEvent(event);
    }
  };

  const generateHeatmapFeatures = () => {
    if (!heatmapData || !heatmapData.zones.length) {
      return [];
    }

    const features: any[] = [];

    heatmapData.zones.forEach((zone) => {
      // Create polygon for each risk zone
      if (zone.coordinates && zone.coordinates.length >= 3) {
        features.push({
          type: 'Feature',
          properties: {
            riskLevel: zone.riskLevel,
            incidentCount: zone.incidentCount,
            crimeType: zone.crimeType || 'unknown',
            intensity: zone.incidentCount / heatmapData.maxIntensity,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [zone.coordinates],
          },
        });
      }

      // Add point features for individual incidents (for more granular heatmap)
      if (zone.incidentCount > 0) {
        const centerPoint = calculatePolygonCenter(zone.coordinates);
        for (let i = 0; i < Math.min(zone.incidentCount, 20); i++) {
          // Add slight random offset for better heatmap distribution
          const offset = 0.0001 * (Math.random() - 0.5);
          features.push({
            type: 'Feature',
            properties: {
              weight: getWeightForRiskLevel(zone.riskLevel),
              riskLevel: zone.riskLevel,
            },
            geometry: {
              type: 'Point',
              coordinates: [
                centerPoint[0] + offset,
                centerPoint[1] + offset,
              ],
            },
          });
        }
      }
    });

    return features;
  };

  const calculatePolygonCenter = (coordinates: [number, number][]): [number, number] => {
    let sumLat = 0;
    let sumLng = 0;
    coordinates.forEach(coord => {
      sumLat += coord[1];
      sumLng += coord[0];
    });
    return [sumLng / coordinates.length, sumLat / coordinates.length];
  };

  const getWeightForRiskLevel = (riskLevel: RiskZone['riskLevel']): number => {
    switch (riskLevel) {
      case 'critical': return 1.0;
      case 'high': return 0.7;
      case 'medium': return 0.4;
      case 'low': return 0.1;
      default: return 0;
    }
  };

  const getHeatmapLayerConfig = () => {
    return {
      id: 'riskHeatmap',
      source: 'riskHeatmapSource',
      type: 'heatmap',
      paint: {
        'heatmap-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 30,
          10, 50,
          15, 80,
          20, 100,
        ],
        'heatmap-weight': [
          'interpolate',
          ['linear'],
          ['get', 'weight'],
          0, 0,
          1, 1,
        ],
        'heatmap-intensity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 0.5,
          10, 1,
        ],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(0, 255, 0, 0)',
          0.2, 'rgba(0, 255, 0, 0.3)',
          0.4, 'rgba(255, 255, 0, 0.5)',
          0.6, 'rgba(255, 165, 0, 0.7)',
          0.8, 'rgba(255, 0, 0, 0.8)',
          1, 'rgba(255, 0, 0, 0.95)',
        ],
        'heatmap-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 0.6,
          10, 0.8,
          15, 1,
        ],
      },
    };
  };

  const getRiskZoneLayerConfig = () => {
    return {
      id: 'riskZones',
      source: 'riskZonesSource',
      type: 'fill',
      paint: {
        'fill-color': [
          'match',
          ['get', 'riskLevel'],
          'low', riskColors.low,
          'medium', riskColors.medium,
          'high', riskColors.high,
          'critical', riskColors.critical,
          'rgba(128, 128, 128, 0.3)',
        ],
        'fill-opacity': 0.4,
        'fill-outline-color': [
          'match',
          ['get', 'riskLevel'],
          'critical', '#FF0000',
          'high', '#FF6600',
          'medium', '#FFCC00',
          'low', '#00FF00',
          '#888888',
        ],
      },
    };
  };

  if (!visible) {
    return null;
  }

  if (loading && !heatmapData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF0000" />
      </View>
    );
  }

  const heatmapFeatures = generateHeatmapFeatures();
  const hasData = heatmapFeatures.length > 0;

  return (
    <View style={styles.container}>
      {hasData && (
        <>
          {/* Heatmap layer for density visualization */}
          <MapLibreGL.ShapeSource
            id="riskHeatmapSource"
            shape={{
              type: 'FeatureCollection',
              features: heatmapFeatures.filter(f => f.geometry.type === 'Point'),
            }}
          >
            <MapLibreGL.HeatmapLayer
              id="riskHeatmapLayer"
              style={getHeatmapLayerConfig().paint}
            />
          </MapLibreGL.ShapeSource>

          {/* Risk zone polygons */}
          <MapLibreGL.ShapeSource
            id="riskZonesSource"
            shape={{
              type: 'FeatureCollection',
              features: heatmapFeatures.filter(f => f.geometry.type === 'Polygon'),
            }}
          >
            <MapLibreGL.FillLayer
              id="riskZonesLayer"
              style={getRiskZoneLayerConfig().paint}
            />
          </MapLibreGL.ShapeSource>
        </>
      )}

      {/* Legend overlay */}
      <View style={styles.legendContainer}>
        <View style={styles.legend}>
          <Text style={styles.legendTitle}>Risk Level</Text>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#00FF00' }]} />
            <Text style={styles.legendText}>Low Risk</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#FFCC00' }]} />
            <Text style={styles.legendText}>Medium Risk</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#FF6600' }]} />
            <Text style={styles.legendText}>High Risk</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#FF0000' }]} />
            <Text style={styles.legendText}>Critical</Text>
          </View>
        </View>
      </View>

      {/* Last update indicator */}
      <View style={styles.updateInfo}>
        <Text style={styles.updateText}>
          Last updated: {new Date(lastUpdate).toLocaleTimeString()}
        </Text>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
};

// Add Text component import
import { Text } from 'react-native';

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  loadingContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -20,
    marginTop: -20,
    zIndex: 1000,
  },
  legendContainer: {
    position: 'absolute',
    bottom: 120,
    right: 10,
    zIndex: 1000,
  },
  legend: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 8,
    padding: 10,
    minWidth: 100,
  },
  legendTitle: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 3,
    marginRight: 8,
  },
  legendText: {
    color: '#FFF',
    fontSize: 10,
  },
  updateInfo: {
    position: 'absolute',
    bottom: 120,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 4,
    padding: 4,
    zIndex: 1000,
  },
  updateText: {
    color: '#FFF',
    fontSize: 8,
  },
  errorContainer: {
    position: 'absolute',
    top: '50%',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 0, 0, 0.9)',
    borderRadius: 8,
    padding: 10,
    zIndex: 1000,
  },
  errorText: {
    color: '#FFF',
    fontSize: 12,
    textAlign: 'center',
  },
});

export default RiskHeatmap;
