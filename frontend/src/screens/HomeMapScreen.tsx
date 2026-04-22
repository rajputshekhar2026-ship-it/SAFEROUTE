import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  Alert,
  Modal,
} from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { useLocation } from '../hooks/useLocation';
import { useWebSocket } from '../hooks/useWebSocket';
import BottomActionBar from '../components/BottomActionBar';
import RiskHeatmap from '../components/RiskHeatmap';
import RouteOptions from '../components/RouteOptions';
import { haptics } from '../utils/haptics';
import { voiceGuidance } from '../utils/voiceGuidance';
import * as Haptics from 'expo-haptics';

MapLibreGL.setAccessToken(null); // Use self-hosted tiles or Mapbox token

const { width, height } = Dimensions.get('window');

const HomeMapScreen: React.FC = () => {
  const { location, startTracking } = useLocation();
  const { sendLocation, safetyAlert } = useWebSocket();
  const [routes, setRoutes] = useState<any>(null);
  const [selectedRoute, setSelectedRoute] = useState<'fastest' | 'safest' | 'lit'>('safest');
  const [showSafetyAlert, setShowSafetyAlert] = useState(false);
  const [safetyTimer, setSafetyTimer] = useState<NodeJS.Timeout | null>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    startTracking();
    setupSafetyCheck();
    return () => {
      if (safetyTimer) clearTimeout(safetyTimer);
    };
  }, []);

  useEffect(() => {
    if (location) {
      sendLocation(location);
      checkDeviation();
    }
  }, [location]);

  useEffect(() => {
    if (safetyAlert) {
      handleSafetyAlert(safetyAlert);
    }
  }, [safetyAlert]);

  const setupSafetyCheck = () => {
    // Check if user is stationary for too long
    let lastLocation = location;
    setInterval(() => {
      if (lastLocation && location && 
          lastLocation.lat === location.lat && 
          lastLocation.lng === location.lng) {
        showSafetyConfirmation();
      }
      lastLocation = location;
    }, 10000);
  };

  const showSafetyConfirmation = () => {
    Alert.alert(
      'Are you safe?',
      'You have been stationary for a while. Press OK if you\'re safe.',
      [
        { text: 'I\'m safe', onPress: () => console.log('User is safe') },
        { 
          text: 'SOS!', 
          onPress: () => triggerSOS(),
          style: 'destructive'
        },
      ],
      { cancelable: false }
    );
  };

  const checkDeviation = () => {
    // Check if user deviated from planned route
    if (routes && location) {
      const isOnRoute = checkIfOnRoute(location, routes[selectedRoute]);
      if (!isOnRoute) {
        Alert.alert(
          'Route Deviation Detected',
          'Would you like to re-route to a safer path?',
          [
            { text: 'No, I\'m fine' },
            { text: 'Yes, re-route', onPress: () => handleReRoute() },
          ]
        );
      }
    }
  };

  const handleReRoute = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Recalculate routes
    const newRoutes = await calculateRoutes();
    setRoutes(newRoutes);
    voiceGuidance.speak('Re-routing to safer path');
  };

  const triggerSOS = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    // Send SOS with location, audio, photo
    const sosData = {
      location,
      timestamp: Date.now(),
      audio: await captureAudio(),
      photo: await capturePhoto(),
    };
    sendLocation({ ...location, sos: true });
    // Additional SOS logic
  };

  const calculateRoutes = async () => {
    // Mock route calculation - replace with actual API call
    return {
      fastest: { coordinates: [], duration: 600, distance: 5000 },
      safest: { coordinates: [], duration: 750, distance: 5500 },
      lit: { coordinates: [], duration: 700, distance: 5200 },
    };
  };

  const checkIfOnRoute = (location: any, route: any) => {
    // Implement route checking logic
    return true;
  };

  const captureAudio = async () => {
    // Implement audio capture
    return null;
  };

  const capturePhoto = async () => {
    // Implement photo capture
    return null;
  };

  const handleSafetyAlert = (alert: any) => {
    setShowSafetyAlert(true);
    voiceGuidance.speak(`Warning: ${alert.message}`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    
    setTimeout(() => setShowSafetyAlert(false), 5000);
  };

  return (
    <View style={styles.container}>
      <MapLibreGL.MapView
        ref={mapRef}
        style={styles.map}
        styleURL="mapbox://styles/mapbox/dark-v10"
        compassEnabled
        logoEnabled={false}
        attributionEnabled={false}
      >
        <MapLibreGL.Camera
          zoomLevel={15}
          centerCoordinate={location ? [location.lng, location.lat] : [0, 0]}
          animationMode="flyTo"
          animationDuration={1000}
        />
        
        {/* User location */}
        <MapLibreGL.UserLocation visible animated />
        
        {/* Risk Heatmap */}
        <RiskHeatmap bbox={getMapBounds()} />
        
        {/* Route overlays */}
        {routes && (
          <>
            <MapLibreGL.ShapeSource
              id="fastestRoute"
              shape={routes.fastest}
              lineMetrics
            >
              <MapLibreGL.LineLayer
                id="fastestRouteLayer"
                style={{
                  lineColor: 'blue',
                  lineWidth: 4,
                  lineOpacity: selectedRoute === 'fastest' ? 1 : 0.5,
                }}
              />
            </MapLibreGL.ShapeSource>
            
            <MapLibreGL.ShapeSource
              id="safestRoute"
              shape={routes.safest}
              lineMetrics
            >
              <MapLibreGL.LineLayer
                id="safestRouteLayer"
                style={{
                  lineColor: 'green',
                  lineWidth: 4,
                  lineOpacity: selectedRoute === 'safest' ? 1 : 0.5,
                }}
              />
            </MapLibreGL.ShapeSource>
            
            <MapLibreGL.ShapeSource
              id="litRoute"
              shape={routes.lit}
              lineMetrics
            >
              <MapLibreGL.LineLayer
                id="litRouteLayer"
                style={{
                  lineColor: 'yellow',
                  lineWidth: 4,
                  lineOpacity: selectedRoute === 'lit' ? 1 : 0.5,
                }}
              />
            </MapLibreGL.ShapeSource>
          </>
        )}
      </MapLibreGL.MapView>

      <RouteOptions
        selected={selectedRoute}
        onSelect={setSelectedRoute}
      />

      <BottomActionBar
        onEmergency={triggerSOS}
        onCheckIn={() => {/* Check-in logic */}}
        onReRoute={handleReRoute}
        onFakeCall={() => {/* Navigate to fake call */}}
        onSOSMessage={() => {/* Send SOS message */}}
      />

      {showSafetyAlert && (
        <View style={styles.safetyAlert}>
          <Text style={styles.safetyAlertText}>⚠️ Safety Alert!</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  safetyAlert: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: 'red',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  safetyAlertText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

const getMapBounds = () => {
  // Return current map bounds for heatmap query
  return { north: 0, south: 0, east: 0, west: 0 };
};

export default HomeMapScreen;
