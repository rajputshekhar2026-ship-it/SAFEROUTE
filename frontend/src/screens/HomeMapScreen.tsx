import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  Alert,
  Modal,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

// Hooks & Services
import { useLocation } from '../hooks/useLocation';
import { useWebSocket } from '../hooks/useWebSocket';
import { useSOS } from '../hooks/useSOS';
import { useHealthMode } from '../hooks/useHealthMode';
import { useCrimePrediction } from '../hooks/useCrimePrediction';
import ApiClient from '../api/client';

// Components
import BottomActionBar from '../components/BottomActionBar';
import RiskHeatmap from '../components/RiskHeatmap';
import RouteOptions from '../components/RouteOptions';
import SafeRefugeMarkers from '../components/SafeRefugeMarkers';

// Utils
import { voiceGuidance } from '../utils/voiceGuidance';
import { haptics } from '../utils/haptics';

const { width, height } = Dimensions.get('window');

interface Route {
  id: string;
  coordinates: [number, number][];
  duration: number;
  distance: number;
  safetyScore: number;
  lightingScore: number;
  crimeRiskScore: number;
  steps: any[];
}

const HomeMapScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  // Hooks
  const { location, startTracking, stopTracking, subscribe } = useLocation({
    enabled: true,
    highAccuracy: true,
    backgroundTracking: true,
  });
  const { sendLocation, safetyAlerts, acknowledgeAlert, isConnected } = useWebSocket({});
  const { triggerSOS, isSOSActive } = useSOS({});
  const { isHealthMode } = useHealthMode();
  const { predictRisk, currentRisk, isLoading: riskLoading } = useCrimePrediction();

  // State
  const [routes, setRoutes] = useState<{
    fastest: Route | null;
    safest: Route | null;
    lit: Route | null;
  }>({
    fastest: null,
    safest: null,
    lit: null,
  });
  const [selectedRoute, setSelectedRoute] = useState<'fastest' | 'safest' | 'lit'>('safest');
  const [loading, setLoading] = useState(false);
  const [destination, setDestination] = useState<{ lat: number; lng: number; address?: string } | null>(null);
  const [showDestinationModal, setShowDestinationModal] = useState(false);
  const [destinationAddress, setDestinationAddress] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationProgress, setNavigationProgress] = useState(0);
  const [remainingTime, setRemainingTime] = useState(0);
  const [remainingDistance, setRemainingDistance] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [showSafetyAlert, setShowSafetyAlert] = useState(false);
  const [currentSafetyAlert, setCurrentSafetyAlert] = useState<any>(null);
  const [showRouteInfo, setShowRouteInfo] = useState(false);
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(true);
  const [showEta, setShowEta] = useState(false);

  // Animation values
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  // Refs
  const mapRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const locationSubscriptionRef = useRef<() => void>();
  const navigationIntervalRef = useRef<NodeJS.Timeout>();
  const lastLocationRef = useRef<{ lat: number; lng: number; timestamp: number } | null>(null);
  const destinationInputRef = useRef<any>(null);

  // Initialize
  useEffect(() => {
    initializeMap();
    startTracking();
    setupLocationSubscription();
    startPulseAnimation();

    return () => {
      stopTracking();
      if (navigationIntervalRef.current) {
        clearInterval(navigationIntervalRef.current);
      }
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current();
      }
      voiceGuidance.stop();
    };
  }, []);

  // Send location updates via WebSocket
  useEffect(() => {
    if (location && isConnected && isTrackingEnabled) {
      sendLocation(location);
      checkSafetyStatus();
    }
  }, [location, isConnected]);

  // Handle safety alerts
  useEffect(() => {
    if (safetyAlerts.length > 0 && !isHealthMode) {
      const latestAlert = safetyAlerts[0];
      if (latestAlert.severity === 'high' || latestAlert.severity === 'critical') {
        showSafetyAlertModal(latestAlert);
      }
    }
  }, [safetyAlerts]);

  // Update risk prediction when location changes
  useEffect(() => {
    if (location && !isHealthMode) {
      predictRisk(location.lat, location.lng);
    }
  }, [location]);

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const initializeMap = async () => {
    try {
      await MapLibreGL.setTelemetryEnabled(false);
      // Request permissions on Android
      if (Platform.OS === 'android') {
        const { status } = await MapLibreGL.requestAndroidLocationPermissions();
        if (status !== 'granted') {
          console.warn('Location permissions not granted');
        }
      }
    } catch (error) {
      console.error('Failed to initialize map:', error);
    }
  };

  const setupLocationSubscription = () => {
    locationSubscriptionRef.current = subscribe((newLocation) => {
      if (isNavigating && destination) {
        updateNavigationProgress(newLocation);
      }
      
      // Check for stationary behavior (potential safety issue)
      if (lastLocationRef.current) {
        const timeDiff = Date.now() - lastLocationRef.current.timestamp;
        const distance = calculateDistance(
          lastLocationRef.current.lat,
          lastLocationRef.current.lng,
          newLocation.lat,
          newLocation.lng
        );
        
        if (timeDiff > 30000 && distance < 10 && !isSOSActive && !isHealthMode) {
          checkUserSafety();
        }
      }
      
      lastLocationRef.current = {
        lat: newLocation.lat,
        lng: newLocation.lng,
        timestamp: Date.now(),
      };
    });
  };

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  };

  const checkUserSafety = () => {
    Alert.alert(
      'Are you safe?',
      'You have been stationary for a while. Press OK if you\'re safe.',
      [
        { text: 'I\'m safe', onPress: () => console.log('User confirmed safe') },
        { 
          text: 'Emergency!', 
          onPress: () => triggerSOS(),
          style: 'destructive',
        },
      ],
      { cancelable: false }
    );
  };

  const checkSafetyStatus = async () => {
    if (!location) return;
    
    try {
      const safetyStatus = await ApiClient.getCrimeRisk(location.lat, location.lng);
      if (safetyStatus.riskLevel === 'high' && !isHealthMode) {
        voiceGuidance.speak('Warning: You are entering a high-risk area. Stay alert.');
        haptics.warning();
      }
    } catch (error) {
      console.error('Failed to check safety status:', error);
    }
  };

  const showSafetyAlertModal = (alert: any) => {
    setCurrentSafetyAlert(alert);
    setShowSafetyAlert(true);
    
    // Haptic feedback
    if (alert.severity === 'critical') {
      haptics.error();
      voiceGuidance.speak(`Emergency: ${alert.message}`);
    } else {
      haptics.warning();
      voiceGuidance.speak(`Alert: ${alert.message}`);
    }
    
    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      setShowSafetyAlert(false);
      acknowledgeAlert(alert.id);
    }, 8000);
  };

  const handleSetDestination = async () => {
    if (!destinationAddress.trim()) {
      Alert.alert('Error', 'Please enter a destination');
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Geocode address to coordinates
      const geocoded = await ApiClient.geocodeAddress(destinationAddress);
      if (!geocoded) {
        Alert.alert('Error', 'Could not find that address. Please try again.');
        return;
      }

      setDestination({
        lat: geocoded.lat,
        lng: geocoded.lng,
        address: destinationAddress,
      });

      // Calculate routes
      await calculateRoutes(geocoded);
      setShowDestinationModal(false);
      setShowRouteInfo(true);
      
      // Animate slide in
      Animated.spring(slideAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();
      
      voiceGuidance.speak('Route calculated. Select your preferred route option.');
    } catch (error) {
      console.error('Failed to set destination:', error);
      Alert.alert('Error', 'Failed to set destination. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const calculateRoutes = async (dest: { lat: number; lng: number }) => {
    if (!location) return;
    
    try {
      const [shortest, safest, lit] = await Promise.all([
        ApiClient.getShortestRoute({
          start: { lat: location.lat, lng: location.lng },
          end: dest,
        }),
        ApiClient.getSafestRoute({
          start: { lat: location.lat, lng: location.lng },
          end: dest,
        }),
        ApiClient.getLitStreetRoute({
          start: { lat: location.lat, lng: location.lng },
          end: dest,
        }),
      ]);
      
      setRoutes({
        fastest: shortest.route,
        safest: safest.route,
        lit: lit.route,
      });
      
      // Default to safest route
      setSelectedRoute('safest');
    } catch (error) {
      console.error('Failed to calculate routes:', error);
      throw error;
    }
  };

  const startNavigation = () => {
    if (!routes[selectedRoute]) return;
    
    setIsNavigating(true);
    setShowRouteInfo(false);
    
    const selectedRouteData = routes[selectedRoute];
    if (selectedRouteData) {
      setRemainingTime(selectedRouteData.duration);
      setRemainingDistance(selectedRouteData.distance);
      setNavigationProgress(0);
      setCurrentStep(0);
      
      // Start turn-by-turn navigation
      startTurnByTurnNavigation(selectedRouteData);
      
      voiceGuidance.speak(`Starting navigation on ${selectedRoute} route. Total distance ${formatDistance(selectedRouteData.distance)}. Estimated time ${formatDuration(selectedRouteData.duration)}.`);
      haptics.success();
      
      // Animate ETA display
      setShowEta(true);
      setTimeout(() => setShowEta(false), 5000);
    }
  };

  const startTurnByTurnNavigation = (route: Route) => {
    const waypoints = route.coordinates;
    let currentWaypointIndex = 0;
    
    navigationIntervalRef.current = setInterval(() => {
      if (location && currentWaypointIndex < waypoints.length - 1) {
        const nextWaypoint = waypoints[currentWaypointIndex + 1];
        const distanceToNext = calculateDistance(
          location.lat,
          location.lng,
          nextWaypoint[1],
          nextWaypoint[0]
        );
        
        // Update progress
        const totalProgress = ((currentWaypointIndex + 1) / waypoints.length) * 100;
        setNavigationProgress(totalProgress);
        
        // Voice guidance for turns
        if (distanceToNext < 50 && distanceToNext > 45) {
          const direction = getDirection(currentWaypointIndex, waypoints);
          voiceGuidance.speak(`In 50 meters, ${direction}`);
          haptics.light();
        } else if (distanceToNext < 20) {
          currentWaypointIndex++;
          if (currentWaypointIndex < waypoints.length - 1) {
            voiceGuidance.speak(`Proceeding to next waypoint`);
          }
        } else if (distanceToNext > 200 && currentWaypointIndex === 0) {
          voiceGuidance.speak(`Continue straight for ${formatDistance(distanceToNext)}`);
        }
        
        // Update remaining distance and time
        const remainingDist = calculateRemainingDistance(location, waypoints, currentWaypointIndex);
        setRemainingDistance(remainingDist);
        setRemainingTime(Math.ceil(remainingDist / 1.4));
        
        // Check if arrived
        if (remainingDist < 20) {
          handleArrival();
        }
      }
    }, 2000);
  };

  const getDirection = (index: number, waypoints: [number, number][]): string => {
    if (index >= waypoints.length - 1) return 'arrive at destination';
    
    const current = waypoints[index];
    const next = waypoints[index + 1];
    const nextNext = waypoints[index + 2];
    
    if (!nextNext) return 'turn';
    
    const bearing1 = calculateBearing(current[1], current[0], next[1], next[0]);
    const bearing2 = calculateBearing(next[1], next[0], nextNext[1], nextNext[0]);
    const angle = Math.abs(bearing2 - bearing1);
    
    if (angle < 20) return 'continue straight';
    if (angle < 70) return 'turn slightly';
    if (angle < 110) return 'turn';
    if (angle < 160) return 'turn sharply';
    return 'make a U-turn';
  };

  const calculateBearing = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const λ1 = (lng1 * Math.PI) / 180;
    const λ2 = (lng2 * Math.PI) / 180;
    
    const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
              Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
    const θ = Math.atan2(y, x);
    return (θ * 180 / Math.PI + 360) % 360;
  };

  const calculateRemainingDistance = (
    currentLocation: any,
    waypoints: [number, number][],
    currentIndex: number
  ): number => {
    let totalDistance = 0;
    
    // Distance to next waypoint
    const nextWaypoint = waypoints[currentIndex + 1];
    if (nextWaypoint) {
      totalDistance += calculateDistance(
        currentLocation.lat,
        currentLocation.lng,
        nextWaypoint[1],
        nextWaypoint[0]
      );
    }
    
    // Distance through remaining waypoints
    for (let i = currentIndex + 1; i < waypoints.length - 1; i++) {
      totalDistance += calculateDistance(
        waypoints[i][1],
        waypoints[i][0],
        waypoints[i + 1][1],
        waypoints[i + 1][0]
      );
    }
    
    return totalDistance;
  };

  const handleArrival = () => {
    if (navigationIntervalRef.current) {
      clearInterval(navigationIntervalRef.current);
    }
    setIsNavigating(false);
    voiceGuidance.speak('You have arrived at your destination.');
    haptics.success();
    
    Alert.alert(
      'Destination Reached',
      'You have arrived at your destination. Stay safe!',
      [{ text: 'OK' }]
    );
  };

  const stopNavigation = () => {
    setIsNavigating(false);
    setShowRouteInfo(false);
    setDestination(null);
    setRoutes({ fastest: null, safest: null, lit: null });
    
    if (navigationIntervalRef.current) {
      clearInterval(navigationIntervalRef.current);
    }
    
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
    
    voiceGuidance.speak('Navigation stopped.');
    haptics.light();
  };

  const handleReRoute = async () => {
    if (!destination) return;
    
    haptics.medium();
    setLoading(true);
    
    try {
      await calculateRoutes(destination);
      voiceGuidance.speak('Re-routing to a safer path.');
      haptics.success();
    } catch (error) {
      console.error('Failed to reroute:', error);
      Alert.alert('Error', 'Failed to recalculate route');
    } finally {
      setLoading(false);
    }
  };

  const handleEmergency = () => {
    triggerSOS();
  };

  const handleCheckIn = async () => {
    if (location) {
      try {
        await ApiClient.checkIn({
          location: { lat: location.lat, lng: location.lng },
          status: 'safe',
        });
        haptics.success();
        voiceGuidance.speak('Check-in successful');
        
        // Show temporary confirmation
        Animated.sequence([
          Animated.timing(fadeAnim, { toValue: 0.5, duration: 100, useNativeDriver: true }),
          Animated.timing(fadeAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
        ]).start();
      } catch (error) {
        console.error('Check-in failed:', error);
      }
    }
  };

  const handleFakeCall = () => {
    navigation.navigate('FakeCall');
  };

  const handleSOSMessage = () => {
    navigation.navigate('SOSMessage');
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${Math.round(meters)} meters`;
    return `${(meters / 1000).toFixed(1)} kilometers`;
  };

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours} hour${hours > 1 ? 's' : ''} ${remainingMinutes} minutes`;
  };

  const getRiskColor = () => {
    if (!currentRisk) return '#4CAF50';
    switch (currentRisk.colorCode) {
      case 'green': return '#4CAF50';
      case 'yellow': return '#FFC107';
      case 'orange': return '#FF9800';
      case 'red': return '#F44336';
      default: return '#4CAF50';
    }
  };

  const toggleTracking = () => {
    setIsTrackingEnabled(!isTrackingEnabled);
    haptics.light();
    voiceGuidance.speak(isTrackingEnabled ? 'Location tracking disabled' : 'Location tracking enabled');
  };

  return (
    <View style={styles.container}>
      {/* Map View */}
      <MapLibreGL.MapView
        ref={mapRef}
        style={styles.map}
        styleURL="mapbox://styles/mapbox/dark-v10"
        compassEnabled
        logoEnabled={false}
        attributionEnabled={false}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          zoomLevel={15}
          centerCoordinate={location ? [location.lng, location.lat] : [0, 0]}
          animationMode="flyTo"
          animationDuration={1000}
        />
        
        {/* User location */}
        <MapLibreGL.UserLocation 
          visible 
          animated 
          showsUserHeadingIndicator
          renderMode="normal"
        />
        
        {/* Risk Heatmap */}
        {!isHealthMode && (
          <RiskHeatmap 
            bbox={getMapBounds()} 
            visible={!isNavigating}
          />
        )}
        
        {/* Safe Refuge Markers */}
        <SafeRefugeMarkers 
          visible={!isNavigating}
          userLocation={location || undefined}
        />
      </MapLibreGL.MapView>

      {/* Header */}
      <LinearGradient
        colors={['rgba(0,0,0,0.8)', 'transparent']}
        style={styles.header}
      >
        <TouchableOpacity 
          style={styles.menuButton}
          onPress={() => navigation.openDrawer()}
        >
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>SafeRoute</Text>
          {currentRisk && !isHealthMode && (
            <View style={[styles.riskBadge, { backgroundColor: getRiskColor() }]}>
              <Text style={styles.riskText}>
                {currentRisk.riskLevel.toUpperCase()} RISK
              </Text>
            </View>
          )}
        </View>
        
        <TouchableOpacity 
          style={styles.trackingButton}
          onPress={toggleTracking}
        >
          <Text style={[styles.trackingIcon, isTrackingEnabled && styles.trackingActive]}>
            {isTrackingEnabled ? '📍' : '📍'}
          </Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Destination Input Modal */}
      <Modal
        visible={showDestinationModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDestinationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient
              colors={['#1a1a2e', '#16213e']}
              style={styles.modalGradient}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Where to?</Text>
                <TouchableOpacity onPress={() => setShowDestinationModal(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.destinationInputContainer}>
                <Text style={styles.inputIcon}>📍</Text>
                <TextInput
                  ref={destinationInputRef}
                  style={styles.destinationInput}
                  placeholder="Enter address or place name"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={destinationAddress}
                  onChangeText={setDestinationAddress}
                  onSubmitEditing={handleSetDestination}
                  returnKeyType="search"
                  autoFocus
                />
              </View>
              
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleSetDestination}
                disabled={loading}
              >
                <LinearGradient
                  colors={['#e94560', '#c73e54']}
                  style={styles.confirmGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.confirmText}>Go</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
              
              <View style={styles.suggestionsContainer}>
                <Text style={styles.suggestionsTitle}>Suggestions</Text>
                <TouchableOpacity 
                  style={styles.suggestionItem}
                  onPress={() => {
                    setDestinationAddress('Police Station');
                  }}
                >
                  <Text style={styles.suggestionIcon}>👮</Text>
                  <Text style={styles.suggestionText}>Nearest Police Station</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.suggestionItem}
                  onPress={() => {
                    setDestinationAddress('Hospital');
                  }}
                >
                  <Text style={styles.suggestionIcon}>🏥</Text>
                  <Text style={styles.suggestionText}>Nearest Hospital</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.suggestionItem}
                  onPress={() => {
                    setDestinationAddress('Cafe');
                  }}
                >
                  <Text style={styles.suggestionIcon}>☕</Text>
                  <Text style={styles.suggestionText}>Nearby Cafe</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      {/* Route Options Panel */}
      {showRouteInfo && routes.safest && (
        <Animated.View 
          style={[
            styles.routePanel,
            {
              transform: [{
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [400, 0],
                })
              }]
            }
          ]}
        >
          <LinearGradient
            colors={['rgba(0,0,0,0.95)', 'rgba(26,26,46,0.95)']}
            style={styles.routePanelGradient}
          >
            <View style={styles.routePanelHeader}>
              <Text style={styles.routePanelTitle}>Choose Your Route</Text>
              <TouchableOpacity onPress={stopNavigation}>
                <Text style={styles.routePanelClose}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <RouteOptions
              selected={selectedRoute}
              onSelect={setSelectedRoute}
              routeMetrics={{
                fastest: {
                  duration: routes.fastest?.duration || 0,
                  distance: routes.fastest?.distance || 0,
                  safetyScore: routes.fastest?.safetyScore || 0,
                },
                safest: {
                  duration: routes.safest?.duration || 0,
                  distance: routes.safest?.distance || 0,
                  safetyScore: routes.safest?.safetyScore || 0,
                },
                lit: {
                  duration: routes.lit?.duration || 0,
                  distance: routes.lit?.distance || 0,
                  safetyScore: routes.lit?.safetyScore || 0,
                },
              }}
            />
            
            <TouchableOpacity
              style={styles.startButton}
              onPress={startNavigation}
            >
              <LinearGradient
                colors={['#4CAF50', '#45a049']}
                style={styles.startGradient}
              >
                <Text style={styles.startText}>Start Navigation</Text>
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>
      )}

      {/* Navigation Progress Panel */}
      {isNavigating && (
        <Animated.View style={[styles.navigationPanel, { opacity: fadeAnim }]}>
          <LinearGradient
            colors={['rgba(0,0,0,0.9)', 'rgba(26,26,46,0.9)']}
            style={styles.navigationGradient}
          >
            <View style={styles.navigationHeader}>
              <Text style={styles.navigationTitle}>Navigation Active</Text>
              <TouchableOpacity onPress={stopNavigation}>
                <Text style={styles.navigationStop}>Stop</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${navigationProgress}%` }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>{Math.round(navigationProgress)}% Complete</Text>
            </View>
            
            <View style={styles.navigationStats}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{formatDistance(remainingDistance)}</Text>
                <Text style={styles.statLabel}>Remaining</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{formatDuration(remainingTime)}</Text>
                <Text style={styles.statLabel}>Estimated Time</Text>
              </View>
            </View>
            
            {showEta && (
              <Animated.View style={styles.etaContainer}>
                <Text style={styles.etaText}>⏰ ETA: {new Date(Date.now() + remainingTime * 1000).toLocaleTimeString()}</Text>
              </Animated.View>
            )}
          </LinearGradient>
        </Animated.View>
      )}

      {/* Safety Alert Modal */}
      <Modal
        visible={showSafetyAlert}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.alertOverlay}>
          <Animated.View style={[styles.alertContainer, { transform: [{ scale: pulseAnim }] }]}>
            <LinearGradient
              colors={currentSafetyAlert?.severity === 'critical' 
                ? ['#F44336', '#D32F2F'] 
                : ['#FF9800', '#F57C00']}
              style={styles.alertGradient}
            >
              <Text style={styles.alertIcon}>
                {currentSafetyAlert?.severity === 'critical' ? '🚨' : '⚠️'}
              </Text>
              <Text style={styles.alertTitle}>
                {currentSafetyAlert?.severity === 'critical' ? 'CRITICAL ALERT' : 'SAFETY ALERT'}
              </Text>
              <Text style={styles.alertMessage}>{currentSafetyAlert?.message}</Text>
              <TouchableOpacity
                style={styles.alertButton}
                onPress={() => setShowSafetyAlert(false)}
              >
                <Text style={styles.alertButtonText}>I Understand</Text>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>

      {/* Set Destination Button */}
      {!isNavigating && !showRouteInfo && (
        <TouchableOpacity
          style={styles.destinationFab}
          onPress={() => setShowDestinationModal(true)}
        >
          <LinearGradient
            colors={['#e94560', '#c73e54']}
            style={styles.destinationFabGradient}
          >
            <Text style={styles.destinationFabIcon}>📍</Text>
            <Text style={styles.destinationFabText}>Set Destination</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Bottom Action Bar */}
      <BottomActionBar
        onEmergency={handleEmergency}
        onCheckIn={handleCheckIn}
        onReRoute={handleReRoute}
        onFakeCall={handleFakeCall}
        onSOSMessage={handleSOSMessage}
      />

      {/* Connection Status */}
      {!isConnected && (
        <View style={styles.connectionWarning}>
          <Text style={styles.connectionWarningText}>⚠️ Connection lost. Reconnecting...</Text>
        </View>
      )}
    </View>
  );
};

const getMapBounds = () => {
  return { north: 0, south: 0, east: 0, west: 0 };
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    zIndex: 10,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuIcon: {
    fontSize: 20,
    color: '#FFF',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  riskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginTop: 4,
  },
  riskText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFF',
  },
  trackingButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackingIcon: {
    fontSize: 20,
    opacity: 0.5,
  },
  trackingActive: {
    opacity: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
    maxHeight: height * 0.8,
  },
  modalGradient: {
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
  },
  modalClose: {
    fontSize: 20,
    color: '#FFF',
    opacity: 0.7,
  },
  destinationInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  inputIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  destinationInput: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: '#FFF',
  },
  confirmButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  confirmGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  suggestionsContainer: {
    marginTop: 10,
  },
  suggestionsTitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 12,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  suggestionIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  suggestionText: {
    fontSize: 14,
    color: '#FFF',
  },
  destinationFab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 140 : 120,
    right: 20,
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  destinationFabGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  destinationFabIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  destinationFabText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  routePanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
    zIndex: 20,
  },
  routePanelGradient: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  routePanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  routePanelTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  routePanelClose: {
    fontSize: 20,
    color: '#FFF',
    opacity: 0.7,
  },
  startButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 16,
  },
  startGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  startText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  navigationPanel: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 80,
    left: 16,
    right: 16,
    borderRadius: 20,
    overflow: 'hidden',
    zIndex: 15,
  },
  navigationGradient: {
    padding: 16,
  },
  navigationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  navigationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  navigationStop: {
    fontSize: 14,
    color: '#F44336',
    fontWeight: '600',
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  navigationStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  etaContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  etaText: {
    fontSize: 12,
    color: '#FFC107',
  },
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertContainer: {
    margin: 24,
    borderRadius: 20,
    overflow: 'hidden',
    width: width - 48,
  },
  alertGradient: {
    padding: 24,
    alignItems: 'center',
  },
  alertIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 12,
  },
  alertMessage: {
    fontSize: 14,
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  alertButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 25,
  },
  alertButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  connectionWarning: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 120 : 100,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(244,67,54,0.9)',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  connectionWarningText: {
    color: '#FFF',
    fontSize: 12,
  },
});

export default HomeMapScreen;
