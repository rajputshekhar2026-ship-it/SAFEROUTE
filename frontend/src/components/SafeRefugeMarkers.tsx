// src/components/SafeRefugeMarkers.tsx

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
  ScrollView,
  Linking,
  Platform,
  Dimensions,
} from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import * as Haptics from 'expo-haptics';
import ApiClient from '../api/client';
import { LocationParams } from '../api/endpoints';

const { width, height } = Dimensions.get('window');

interface SafeRefuge {
  id: string;
  name: string;
  type: 'police' | 'hospital' | 'cafe' | 'store' | 'community_center' | 'transit';
  location: LocationParams;
  address: string;
  phone?: string;
  hours?: string;
  rating?: number;
  is24Hours: boolean;
  hasSecurity?: boolean;
  hasLighting?: boolean;
  distance?: number;
  estimatedTime?: number;
  imageUrl?: string;
  amenities?: string[];
  emergencyServices?: string[];
}

interface SafeRefugeMarkersProps {
  visible?: boolean;
  onRefugeSelect?: (refuge: SafeRefuge) => void;
  showRouteButton?: boolean;
  radius?: number; // in meters
  userLocation?: LocationParams;
  onNavigateToRefuge?: (refuge: SafeRefuge) => void;
}

const SafeRefugeMarkers: React.FC<SafeRefugeMarkersProps> = ({
  visible = true,
  onRefugeSelect,
  showRouteButton = true,
  radius = 1000,
  userLocation,
  onNavigateToRefuge,
}) => {
  const [refuges, setRefuges] = useState<SafeRefuge[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRefuge, setSelectedRefuge] = useState<SafeRefuge | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [filterType, setFilterType] = useState<string | null>(null);
  const markerRefs = useRef<{ [key: string]: any }>({});

  const refugeIcons = {
    police: '👮‍♂️',
    hospital: '🏥',
    cafe: '☕',
    store: '🏪',
    community_center: '🏛️',
    transit: '🚉',
  };

  const refugeColors = {
    police: '#2196F3',
    hospital: '#F44336',
    cafe: '#FF9800',
    store: '#4CAF50',
    community_center: '#9C27B0',
    transit: '#00BCD4',
  };

  useEffect(() => {
    if (visible && userLocation) {
      fetchNearbyRefuges();
      
      // Refresh refuges every 5 minutes
      const interval = setInterval(fetchNearbyRefuges, 300000);
      return () => clearInterval(interval);
    }
  }, [visible, userLocation, filterType, radius]);

  const fetchNearbyRefuges = async () => {
    if (!userLocation) return;

    setLoading(true);
    try {
      const response = await ApiClient.getSafeRefuges(userLocation, radius);
      
      let filteredRefuges = response.refuges || [];
      
      // Apply type filter
      if (filterType) {
        filteredRefuges = filteredRefuges.filter((r: SafeRefuge) => r.type === filterType);
      }
      
      // Calculate distances and sort by nearest
      const refugesWithDistance = filteredRefuges.map((refuge: SafeRefuge) => ({
        ...refuge,
        distance: calculateDistance(userLocation, refuge.location),
        estimatedTime: calculateEstimatedTime(userLocation, refuge.location),
      }));
      
      refugesWithDistance.sort((a: SafeRefuge, b: SafeRefuge) => (a.distance || 0) - (b.distance || 0));
      
      setRefuges(refugesWithDistance);
    } catch (error) {
      console.error('Failed to fetch safe refuges:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateDistance = (from: LocationParams, to: LocationParams): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (from.lat * Math.PI) / 180;
    const φ2 = (to.lat * Math.PI) / 180;
    const Δφ = ((to.lat - from.lat) * Math.PI) / 180;
    const Δλ = ((to.lng - from.lng) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const calculateEstimatedTime = (from: LocationParams, to: LocationParams): number => {
    const distance = calculateDistance(from, to);
    // Assume average walking speed of 1.4 m/s
    return Math.ceil(distance / 1.4);
  };

  const handleMarkerPress = (refuge: SafeRefuge) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedRefuge(refuge);
    setShowModal(true);
    if (onRefugeSelect) {
      onRefugeSelect(refuge);
    }
  };

  const handleNavigate = () => {
    if (selectedRefuge && onNavigateToRefuge) {
      onNavigateToRefuge(selectedRefuge);
      setShowModal(false);
    } else if (selectedRefuge) {
      // Open in maps app as fallback
      const url = Platform.select({
        ios: `maps:0,0?q=${selectedRefuge.name}@${selectedRefuge.location.lat},${selectedRefuge.location.lng}`,
        android: `geo:0,0?q=${selectedRefuge.location.lat},${selectedRefuge.location.lng}(${selectedRefuge.name})`,
      });
      if (url) {
        Linking.openURL(url);
      }
    }
  };

  const handleCall = (phoneNumber: string) => {
    if (phoneNumber) {
      Linking.openURL(`tel:${phoneNumber}`);
    }
  };

  const getRefugeMarkers = () => {
    return refuges.map((refuge) => ({
      type: 'Feature',
      properties: {
        id: refuge.id,
        name: refuge.name,
        type: refuge.type,
        is24Hours: refuge.is24Hours,
      },
      geometry: {
        type: 'Point',
        coordinates: [refuge.location.lng, refuge.location.lat],
      },
    }));
  };

  const renderCustomMarker = (refuge: SafeRefuge) => {
    return (
      <TouchableOpacity
        key={refuge.id}
        onPress={() => handleMarkerPress(refuge)}
        activeOpacity={0.8}
      >
        <View style={styles.markerContainer}>
          <View
            style={[
              styles.marker,
              { backgroundColor: refugeColors[refuge.type] },
            ]}
          >
            <Text style={styles.markerIcon}>{refugeIcons[refuge.type]}</Text>
          </View>
          {refuge.is24Hours && (
            <View style={styles.twentyFourBadge}>
              <Text style={styles.twentyFourText}>24/7</Text>
            </View>
          )}
          <View style={styles.markerLabel}>
            <Text style={styles.markerLabelText}>{refuge.name}</Text>
            {refuge.distance && (
              <Text style={styles.distanceText}>
                {refuge.distance < 1000
                  ? `${Math.round(refuge.distance)}m`
                  : `${(refuge.distance / 1000).toFixed(1)}km`}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (!visible) {
    return null;
  }

  return (
    <>
      {/* Map Markers */}
      {refuges.map((refuge) => (
        <MapLibreGL.MarkerView
          key={refuge.id}
          id={`refuge-${refuge.id}`}
          coordinate={[refuge.location.lng, refuge.location.lat]}
          anchor={{ x: 0.5, y: 1 }}
        >
          {renderCustomMarker(refuge)}
        </MapLibreGL.MarkerView>
      ))}

      {/* Filter Buttons */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity
            style={[styles.filterButton, !filterType && styles.filterButtonActive]}
            onPress={() => setFilterType(null)}
          >
            <Text style={[styles.filterText, !filterType && styles.filterTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          {Object.entries(refugeIcons).map(([type, icon]) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.filterButton,
                filterType === type && styles.filterButtonActive,
              ]}
              onPress={() => setFilterType(filterType === type ? null : type)}
            >
              <Text style={styles.filterIcon}>{icon}</Text>
              <Text
                style={[
                  styles.filterText,
                  filterType === type && styles.filterTextActive,
                ]}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Refuge Detail Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedRefuge && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalIcon}>
                    {refugeIcons[selectedRefuge.type]}
                  </Text>
                  <Text style={styles.modalTitle}>{selectedRefuge.name}</Text>
                  <TouchableOpacity
                    onPress={() => setShowModal(false)}
                    style={styles.closeButton}
                  >
                    <Text style={styles.closeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalBody}>
                  <View style={styles.infoSection}>
                    <Text style={styles.infoLabel}>Type</Text>
                    <Text style={styles.infoValue}>
                      {selectedRefuge.type.charAt(0).toUpperCase() + selectedRefuge.type.slice(1)}
                    </Text>
                  </View>

                  <View style={styles.infoSection}>
                    <Text style={styles.infoLabel}>Address</Text>
                    <Text style={styles.infoValue}>{selectedRefuge.address}</Text>
                  </View>

                  {selectedRefuge.distance && (
                    <View style={styles.infoSection}>
                      <Text style={styles.infoLabel}>Distance</Text>
                      <Text style={styles.infoValue}>
                        {selectedRefuge.distance < 1000
                          ? `${Math.round(selectedRefuge.distance)} meters`
                          : `${(selectedRefuge.distance / 1000).toFixed(1)} km`}
                        {selectedRefuge.estimatedTime && 
                          ` (${Math.floor(selectedRefuge.estimatedTime / 60)} min walk)`}
                      </Text>
                    </View>
                  )}

                  {selectedRefuge.hours && (
                    <View style={styles.infoSection}>
                      <Text style={styles.infoLabel}>Hours</Text>
                      <Text style={styles.infoValue}>{selectedRefuge.hours}</Text>
                    </View>
                  )}

                  {selectedRefuge.is24Hours && (
                    <View style={styles.badgeContainer}>
                      <View style={styles.twentyFourBadgeLarge}>
                        <Text style={styles.twentyFourTextLarge}>Open 24/7</Text>
                      </View>
                    </View>
                  )}

                  {selectedRefuge.amenities && selectedRefuge.amenities.length > 0 && (
                    <View style={styles.infoSection}>
                      <Text style={styles.infoLabel}>Amenities</Text>
                      <View style={styles.tagsContainer}>
                        {selectedRefuge.amenities.map((amenity, index) => (
                          <View key={index} style={styles.tag}>
                            <Text style={styles.tagText}>{amenity}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {selectedRefuge.emergencyServices && selectedRefuge.emergencyServices.length > 0 && (
                    <View style={styles.infoSection}>
                      <Text style={styles.infoLabel}>Emergency Services</Text>
                      <View style={styles.tagsContainer}>
                        {selectedRefuge.emergencyServices.map((service, index) => (
                          <View key={index} style={[styles.tag, styles.emergencyTag]}>
                            <Text style={styles.emergencyTagText}>{service}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </ScrollView>

                <View style={styles.modalFooter}>
                  {selectedRefuge.phone && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.callButton]}
                      onPress={() => handleCall(selectedRefuge.phone!)}
                    >
                      <Text style={styles.actionButtonText}>📞 Call</Text>
                    </TouchableOpacity>
                  )}
                  
                  {showRouteButton && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.navigateButton]}
                      onPress={handleNavigate}
                    >
                      <Text style={styles.actionButtonText}>🗺️ Navigate</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  markerContainer: {
    alignItems: 'center',
    position: 'relative',
  },
  marker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  markerIcon: {
    fontSize: 24,
  },
  markerLabel: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  markerLabelText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },
  distanceText: {
    color: '#4CAF50',
    fontSize: 10,
    marginLeft: 6,
  },
  twentyFourBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF9800',
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  twentyFourText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: 'bold',
  },
  filterContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    zIndex: 1000,
  },
  filterButton: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#4CAF50',
  },
  filterIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  filterText: {
    color: '#FFF',
    fontSize: 14,
  },
  filterTextActive: {
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: height * 0.8,
    minHeight: height * 0.5,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  modalTitle: {
    flex: 1,
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 20,
  },
  infoSection: {
    marginBottom: 16,
  },
  infoLabel: {
    color: '#999',
    fontSize: 12,
    marginBottom: 4,
  },
  infoValue: {
    color: '#FFF',
    fontSize: 14,
  },
  badgeContainer: {
    marginBottom: 16,
  },
  twentyFourBadgeLarge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  twentyFourTextLarge: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  tag: {
    backgroundColor: '#333',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    color: '#FFF',
    fontSize: 12,
  },
  emergencyTag: {
    backgroundColor: '#F44336',
  },
  emergencyTagText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 6,
    alignItems: 'center',
  },
  callButton: {
    backgroundColor: '#2196F3',
  },
  navigateButton: {
    backgroundColor: '#4CAF50',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SafeRefugeMarkers;
