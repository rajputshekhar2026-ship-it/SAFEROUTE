import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MapLibreGL from '@maplibre/maplibre-react-native';
import * as Haptics from 'expo-haptics';
import ApiClient from '../api/client';

const SOSDetailsScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { sosId } = route.params;
  const [sos, setSos] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [responderLocation, setResponderLocation] = useState<any>(null);

  useEffect(() => {
    loadSOSDetails();
  }, [sosId]);

  const loadSOSDetails = async () => {
    try {
      const response = await ApiClient.getSOSStatus(sosId);
      setSos(response.sos);
      
      if (response.sos.responderId) {
        // Load responder location if available
        // setResponderLocation(...);
      }
    } catch (error) {
      console.error('Failed to load SOS details:', error);
      Alert.alert('Error', 'Failed to load SOS details');
    } finally {
      setLoading(false);
    }
  };

  const handleShareLocation = async () => {
    if (!sos) return;
    
    const message = `🚨 SOS Alert!\nLocation: https://maps.google.com/?q=${sos.location.lat},${sos.location.lng}\nTime: ${new Date(sos.createdAt).toLocaleString()}`;
    
    try {
      await Share.share({ message });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  const handleOpenMaps = () => {
    const url = Platform.select({
      ios: `maps:0,0?q=${sos.location.lat},${sos.location.lng}`,
      android: `geo:0,0?q=${sos.location.lat},${sos.location.lng}`,
    });
    if (url) Linking.openURL(url);
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'active':
        return { color: '#F44336', icon: '🚨', text: 'ACTIVE', bg: 'rgba(244,67,54,0.1)' };
      case 'responded':
        return { color: '#FF9800', icon: '👮', text: 'RESPONDED', bg: 'rgba(255,152,0,0.1)' };
      case 'resolved':
        return { color: '#4CAF50', icon: '✅', text: 'RESOLVED', bg: 'rgba(76,175,80,0.1)' };
      case 'cancelled':
        return { color: '#9E9E9E', icon: '❌', text: 'CANCELLED', bg: 'rgba(158,158,158,0.1)' };
      default:
        return { color: '#9E9E9E', icon: '📋', text: 'UNKNOWN', bg: 'rgba(158,158,158,0.1)' };
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#e94560" />
        <Text style={styles.loadingText}>Loading SOS details...</Text>
      </View>
    );
  }

  if (!sos) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>SOS event not found</Text>
        <TouchableOpacity
          style={styles.errorButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusConfig = getStatusConfig(sos.status);

  return (
    <LinearGradient colors={['#1a1a2e', '#16213e']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SOS Details</Text>
        <TouchableOpacity onPress={handleShareLocation} style={styles.shareButton}>
          <Text style={styles.shareIcon}>📤</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Status Card */}
        <View style={[styles.statusCard, { backgroundColor: statusConfig.bg }]}>
          <View style={styles.statusHeader}>
            <Text style={styles.statusIcon}>{statusConfig.icon}</Text>
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.text}
            </Text>
          </View>
          <Text style={styles.statusDate}>{formatDate(sos.createdAt)}</Text>
        </View>

        {/* Location Map */}
        <View style={styles.mapContainer}>
          <MapLibreGL.MapView
            style={styles.map}
            styleURL="mapbox://styles/mapbox/dark-v10"
            logoEnabled={false}
            attributionEnabled={false}
          >
            <MapLibreGL.Camera
              zoomLevel={15}
              centerCoordinate={[sos.location.lng, sos.location.lat]}
              animationMode="flyTo"
            />
            <MapLibreGL.PointAnnotation
              id="sos-location"
              coordinate={[sos.location.lng, sos.location.lat]}
            >
              <View style={styles.mapMarker}>
                <Text style={styles.mapMarkerIcon}>🚨</Text>
              </View>
            </MapLibreGL.PointAnnotation>
          </MapLibreGL.MapView>
          
          <TouchableOpacity style={styles.mapButton} onPress={handleOpenMaps}>
            <Text style={styles.mapButtonText}>Open in Maps</Text>
          </TouchableOpacity>
        </View>

        {/* Location Details */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📍 Location Details</Text>
          <Text style={styles.infoCoordinates}>
            Latitude: {sos.location.lat.toFixed(6)}
          </Text>
          <Text style={styles.infoCoordinates}>
            Longitude: {sos.location.lng.toFixed(6)}
          </Text>
        </View>

        {/* Message */}
        {sos.message && (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>💬 Message</Text>
            <Text style={styles.infoMessage}>"{sos.message}"</Text>
          </View>
        )}

        {/* Responder Info */}
        {sos.responderId && (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>👮 Responder Information</Text>
            <Text style={styles.infoText}>Responder ID: {sos.responderId}</Text>
            {sos.eta && <Text style={styles.infoText}>ETA: {sos.eta} minutes</Text>}
            {sos.responderName && <Text style={styles.infoText}>Name: {sos.responderName}</Text>}
          </View>
        )}

        {/* Timeline */}
        <View style={styles.timelineCard}>
          <Text style={styles.timelineTitle}>⏱️ Timeline</Text>
          <View style={styles.timelineItem}>
            <View style={styles.timelineDot} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTime}>
                {new Date(sos.createdAt).toLocaleTimeString()}
              </Text>
              <Text style={styles.timelineText}>SOS Triggered</Text>
            </View>
          </View>
          
          {sos.respondedAt && (
            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, styles.timelineDotActive]} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTime}>
                  {new Date(sos.respondedAt).toLocaleTimeString()}
                </Text>
                <Text style={styles.timelineText}>Response Received</Text>
              </View>
            </View>
          )}
          
          {sos.resolvedAt && (
            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, styles.timelineDotSuccess]} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTime}>
                  {new Date(sos.resolvedAt).toLocaleTimeString()}
                </Text>
                <Text style={styles.timelineText}>SOS Resolved</Text>
              </View>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        {sos.status === 'active' && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => {
              Alert.alert(
                'Cancel SOS',
                'Are you sure you want to cancel this SOS alert?',
                [
                  { text: 'No', style: 'cancel' },
                  { text: 'Yes, Cancel', style: 'destructive', onPress: () => cancelSOS() },
                ]
              );
            }}
          >
            <Text style={styles.cancelButtonText}>Cancel SOS</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#FFF',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 18,
    color: '#FFF',
    marginBottom: 20,
  },
  errorButton: {
    backgroundColor: '#e94560',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
  },
  errorButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 28,
    color: '#FFF',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  shareButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareIcon: {
    fontSize: 20,
    color: '#FFF',
  },
  statusCard: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  statusText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusDate: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  mapContainer: {
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
    height: 200,
  },
  map: {
    flex: 1,
  },
  mapMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e94560',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  mapMarkerIcon: {
    fontSize: 20,
  },
  mapButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  mapButtonText: {
    color: '#FFF',
    fontSize: 12,
  },
  infoCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 12,
  },
  infoCoordinates: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 4,
  },
  infoMessage: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontStyle: 'italic',
  },
  infoText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 4,
  },
  timelineCard: {
    marginHorizontal: 16,
    marginBottom: 30,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 16,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#9E9E9E',
    marginRight: 12,
    marginTop: 4,
  },
  timelineDotActive: {
    backgroundColor: '#FF9800',
  },
  timelineDotSuccess: {
    backgroundColor: '#4CAF50',
  },
  timelineContent: {
    flex: 1,
  },
  timelineTime: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 2,
  },
  timelineText: {
    fontSize: 13,
    color: '#FFF',
  },
  cancelButton: {
    marginHorizontal: 16,
    marginBottom: 40,
    backgroundColor: '#F44336',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SOSDetailsScreen;
