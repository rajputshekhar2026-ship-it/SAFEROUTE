// src/screens/SafeRefugeView.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Linking,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';

// Hooks & Services
import { useLocation } from '../hooks/useLocation';
import ApiClient from '../api/client';

const { width, height } = Dimensions.get('window');

interface Refuge {
  id: string;
  name: string;
  type: 'police' | 'hospital' | 'cafe' | 'store' | 'community_center' | 'transit';
  location: {
    lat: number;
    lng: number;
    address: string;
  };
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
  wheelchairAccessible?: boolean;
  description?: string;
}

interface RefugeCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

const refugeCategories: RefugeCategory[] = [
  { id: 'all', name: 'All', icon: '📍', color: '#666' },
  { id: 'police', name: 'Police', icon: '👮', color: '#2196F3' },
  { id: 'hospital', name: 'Hospital', icon: '🏥', color: '#F44336' },
  { id: 'cafe', name: 'Cafe', icon: '☕', color: '#FF9800' },
  { id: 'store', name: 'Store', icon: '🏪', color: '#4CAF50' },
  { id: 'community_center', name: 'Community', icon: '🏛️', color: '#9C27B0' },
  { id: 'transit', name: 'Transit', icon: '🚉', color: '#00BCD4' },
];

const SafeRefugeView: React.FC<{ navigation: any; route?: any }> = ({ navigation, route }) => {
  const { location } = useLocation({ enabled: true });
  const [refuges, setRefuges] = useState<Refuge[]>([]);
  const [filteredRefuges, setFilteredRefuges] = useState<Refuge[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRefuge, setSelectedRefuge] = useState<Refuge | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [sortBy, setSortBy] = useState<'distance' | 'rating' | 'name'>('distance');

  useEffect(() => {
    fetchNearbyRefuges();
  }, [location]);

  useFocusEffect(
    useCallback(() => {
      if (route?.params?.refugeId) {
        fetchRefugeDetails(route.params.refugeId);
      }
    }, [route?.params?.refugeId])
  );

  useEffect(() => {
    filterAndSortRefuges();
  }, [refuges, selectedCategory, sortBy]);

  const fetchNearbyRefuges = async () => {
    if (!location) return;

    setLoading(true);
    try {
      const response = await ApiClient.getSafeRefuges(location, 2000); // 2km radius
      
      const refugesWithDistance = response.refuges.map((refuge: Refuge) => ({
        ...refuge,
        distance: calculateDistance(location, refuge.location),
        estimatedTime: Math.ceil(calculateDistance(location, refuge.location) / 1.4), // 1.4 m/s walking speed
      }));
      
      refugesWithDistance.sort((a: Refuge, b: Refuge) => a.distance - b.distance);
      setRefuges(refugesWithDistance);
    } catch (error) {
      console.error('Failed to fetch refuges:', error);
      Alert.alert('Error', 'Unable to load safe refuges. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRefugeDetails = async (refugeId: string) => {
    try {
      const response = await ApiClient.getRefugeDetails(refugeId);
      setSelectedRefuge(response);
      setShowDetails(true);
    } catch (error) {
      console.error('Failed to fetch refuge details:', error);
    }
  };

  const calculateDistance = (from: { lat: number; lng: number }, to: { lat: number; lng: number }): number => {
    const R = 6371e3;
    const φ1 = (from.lat * Math.PI) / 180;
    const φ2 = (to.lat * Math.PI) / 180;
    const Δφ = ((to.lat - from.lat) * Math.PI) / 180;
    const Δλ = ((to.lng - from.lng) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const filterAndSortRefuges = () => {
    let filtered = [...refuges];

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(refuge => refuge.type === selectedCategory);
    }

    // Sort
    switch (sortBy) {
      case 'distance':
        filtered.sort((a, b) => (a.distance || 0) - (b.distance || 0));
        break;
      case 'rating':
        filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'name':
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    setFilteredRefuges(filtered);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNearbyRefuges();
    setRefreshing(false);
  };

  const handleNavigate = (refuge: Refuge) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Open in maps app
    const url = Platform.select({
      ios: `maps:0,0?q=${refuge.name}@${refuge.location.lat},${refuge.location.lng}`,
      android: `geo:0,0?q=${refuge.location.lat},${refuge.location.lng}(${refuge.name})`,
    });
    
    if (url) {
      Linking.openURL(url);
    }
  };

  const handleCall = (phoneNumber: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(`tel:${phoneNumber}`);
  };

  const getTypeIcon = (type: string): string => {
    const icons = {
      police: '👮‍♂️',
      hospital: '🏥',
      cafe: '☕',
      store: '🏪',
      community_center: '🏛️',
      transit: '🚉',
    };
    return icons[type as keyof typeof icons] || '📍';
  };

  const getTypeColor = (type: string): string => {
    const colors = {
      police: '#2196F3',
      hospital: '#F44336',
      cafe: '#FF9800',
      store: '#4CAF50',
      community_center: '#9C27B0',
      transit: '#00BCD4',
    };
    return colors[type as keyof typeof colors] || '#666';
  };

  const formatDistance = (meters?: number): string => {
    if (!meters) return 'N/A';
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const formatTime = (seconds?: number): string => {
    if (!seconds) return 'N/A';
    if (seconds < 60) return `${seconds} sec`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}min`;
  };

  const renderRefugeCard = (refuge: Refuge) => (
    <TouchableOpacity
      key={refuge.id}
      style={styles.refugeCard}
      onPress={() => {
        setSelectedRefuge(refuge);
        setShowDetails(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      activeOpacity={0.7}
    >
      <View style={[styles.cardIcon, { backgroundColor: getTypeColor(refuge.type) }]}>
        <Text style={styles.cardIconText}>{getTypeIcon(refuge.type)}</Text>
      </View>
      
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.refugeName}>{refuge.name}</Text>
          {refuge.is24Hours && (
            <View style={styles.twentyFourBadge}>
              <Text style={styles.twentyFourText}>24/7</Text>
            </View>
          )}
        </View>
        
        <Text style={styles.refugeAddress} numberOfLines={1}>
          {refuge.location.address}
        </Text>
        
        <View style={styles.cardFooter}>
          <View style={styles.distanceInfo}>
            <Text style={styles.distanceIcon}>📍</Text>
            <Text style={styles.distanceText}>{formatDistance(refuge.distance)}</Text>
            {refuge.estimatedTime && (
              <Text style={styles.timeText}> • {formatTime(refuge.estimatedTime)} walk</Text>
            )}
          </View>
          
          {refuge.rating && (
            <View style={styles.ratingContainer}>
              <Text style={styles.ratingStar}>⭐</Text>
              <Text style={styles.ratingText}>{refuge.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        
        {refuge.hasSecurity && (
          <View style={styles.securityBadge}>
            <Text style={styles.securityText}>✓ Security</Text>
          </View>
        )}
      </View>
      
      <TouchableOpacity
        style={styles.navigateButton}
        onPress={() => handleNavigate(refuge)}
      >
        <Text style={styles.navigateButtonText}>→</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderDetailsModal = () => {
    if (!selectedRefuge) return null;

    return (
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={[styles.modalIcon, { backgroundColor: getTypeColor(selectedRefuge.type) }]}>
                <Text style={styles.modalIconText}>{getTypeIcon(selectedRefuge.type)}</Text>
              </View>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>{selectedRefuge.name}</Text>
                <Text style={styles.modalType}>{selectedRefuge.type.charAt(0).toUpperCase() + selectedRefuge.type.slice(1)}</Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowDetails(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Info Sections */}
            <View style={styles.infoSection}>
              <Text style={styles.infoLabel}>📍 Address</Text>
              <Text style={styles.infoValue}>{selectedRefuge.location.address}</Text>
            </View>

            {selectedRefuge.distance && (
              <View style={styles.infoSection}>
                <Text style={styles.infoLabel}>📏 Distance</Text>
                <Text style={styles.infoValue}>
                  {formatDistance(selectedRefuge.distance)}
                  {selectedRefuge.estimatedTime && ` (${formatTime(selectedRefuge.estimatedTime)} walk)`}
                </Text>
              </View>
            )}

            {selectedRefuge.phone && (
              <TouchableOpacity
                style={styles.infoSection}
                onPress={() => handleCall(selectedRefuge.phone!)}
              >
                <Text style={styles.infoLabel}>📞 Phone</Text>
                <Text style={[styles.infoValue, styles.linkText]}>{selectedRefuge.phone}</Text>
              </TouchableOpacity>
            )}

            {selectedRefuge.hours && (
              <View style={styles.infoSection}>
                <Text style={styles.infoLabel}>🕒 Hours</Text>
                <Text style={styles.infoValue}>{selectedRefuge.hours}</Text>
              </View>
            )}

            {selectedRefuge.is24Hours && (
              <View style={styles.badgeContainer}>
                <View style={styles.open247Badge}>
                  <Text style={styles.open247Text}>Open 24/7</Text>
                </View>
              </View>
            )}

            {selectedRefuge.amenities && selectedRefuge.amenities.length > 0 && (
              <View style={styles.infoSection}>
                <Text style={styles.infoLabel}>✨ Amenities</Text>
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
                <Text style={styles.infoLabel}>🚨 Emergency Services</Text>
                <View style={styles.tagsContainer}>
                  {selectedRefuge.emergencyServices.map((service, index) => (
                    <View key={index} style={[styles.tag, styles.emergencyTag]}>
                      <Text style={styles.emergencyTagText}>{service}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {selectedRefuge.wheelchairAccessible && (
              <View style={styles.accessibilityBadge}>
                <Text style={styles.accessibilityText}>♿ Wheelchair Accessible</Text>
              </View>
            )}

            {selectedRefuge.description && (
              <View style={styles.infoSection}>
                <Text style={styles.infoLabel}>ℹ️ Description</Text>
                <Text style={styles.infoValue}>{selectedRefuge.description}</Text>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.modalFooter}>
            {selectedRefuge.phone && (
              <TouchableOpacity
                style={[styles.actionButton, styles.callButton]}
                onPress={() => handleCall(selectedRefuge.phone!)}
              >
                <Text style={styles.actionButtonText}>📞 Call</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionButton, styles.navigateButtonLarge]}
              onPress={() => handleNavigate(selectedRefuge)}
            >
              <Text style={styles.actionButtonText}>🗺️ Navigate</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Safe Refuges</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Sort Options */}
      <View style={styles.sortBar}>
        <Text style={styles.sortLabel}>Sort by:</Text>
        <TouchableOpacity
          style={[styles.sortOption, sortBy === 'distance' && styles.sortOptionActive]}
          onPress={() => setSortBy('distance')}
        >
          <Text style={[styles.sortOptionText, sortBy === 'distance' && styles.sortOptionTextActive]}>
            Distance
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortOption, sortBy === 'rating' && styles.sortOptionActive]}
          onPress={() => setSortBy('rating')}
        >
          <Text style={[styles.sortOptionText, sortBy === 'rating' && styles.sortOptionTextActive]}>
            Rating
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortOption, sortBy === 'name' && styles.sortOptionActive]}
          onPress={() => setSortBy('name')}
        >
          <Text style={[styles.sortOptionText, sortBy === 'name' && styles.sortOptionTextActive]}>
            Name
          </Text>
        </TouchableOpacity>
      </View>

      {/* Category Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesScroll}
        contentContainerStyle={styles.categoriesContainer}
      >
        {refugeCategories.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryChip,
              selectedCategory === category.id && styles.categoryChipActive,
              { borderColor: category.color },
            ]}
            onPress={() => {
              setSelectedCategory(category.id);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Text style={styles.categoryIcon}>{category.icon}</Text>
            <Text
              style={[
                styles.categoryName,
                selectedCategory === category.id && styles.categoryNameActive,
              ]}
            >
              {category.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Refuges List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Finding safe places near you...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.refugesList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {filteredRefuges.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🏪</Text>
              <Text style={styles.emptyTitle}>No refuges found</Text>
              <Text style={styles.emptyText}>
                No safe refuges found in your area. Try expanding your search radius.
              </Text>
            </View>
          ) : (
            filteredRefuges.map(renderRefugeCard)
          )}
        </ScrollView>
      )}

      {/* Details Modal */}
      {showDetails && renderDetailsModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 28,
    color: '#333',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  placeholder: {
    width: 40,
  },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  sortLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 12,
  },
  sortOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: '#F5F5F5',
  },
  sortOptionActive: {
    backgroundColor: '#4CAF50',
  },
  sortOptionText: {
    fontSize: 13,
    color: '#666',
  },
  sortOptionTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  categoriesScroll: {
    backgroundColor: '#FFF',
    paddingVertical: 12,
  },
  categoriesContainer: {
    paddingHorizontal: 15,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 25,
    backgroundColor: '#F5F5F5',
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categoryChipActive: {
    backgroundColor: '#E8F5E9',
  },
  categoryIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  categoryName: {
    fontSize: 14,
    color: '#666',
  },
  categoryNameActive: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  refugesList: {
    flex: 1,
    padding: 15,
  },
  refugeCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardIconText: {
    fontSize: 24,
  },
  cardContent: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  refugeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  twentyFourBadge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  twentyFourText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  refugeAddress: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  distanceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  distanceIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  distanceText: {
    fontSize: 12,
    color: '#666',
  },
  timeText: {
    fontSize: 12,
    color: '#999',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingStar: {
    fontSize: 12,
    marginRight: 2,
  },
  ratingText: {
    fontSize: 12,
    color: '#FF9800',
    fontWeight: '600',
  },
  securityBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  securityText: {
    fontSize: 10,
    color: '#4CAF50',
  },
  navigateButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  navigateButtonText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: height * 0.9,
    minHeight: height * 0.6,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  modalIconText: {
    fontSize: 32,
  },
  modalHeaderText: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  modalType: {
    fontSize: 14,
    color: '#999',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#666',
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  infoLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  linkText: {
    color: '#2196F3',
    textDecorationLine: 'underline',
  },
  badgeContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  open247Badge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  open247Text: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  tag: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    fontSize: 12,
    color: '#666',
  },
  emergencyTag: {
    backgroundColor: '#FFEBEE',
  },
  emergencyTagText: {
    color: '#F44336',
    fontWeight: '600',
  },
  accessibilityBadge: {
    marginHorizontal: 20,
    marginVertical: 8,
    padding: 10,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    alignItems: 'center',
  },
  accessibilityText: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 6,
  },
  callButton: {
    backgroundColor: '#2196F3',
  },
  navigateButtonLarge: {
    backgroundColor: '#4CAF50',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SafeRefugeView;
