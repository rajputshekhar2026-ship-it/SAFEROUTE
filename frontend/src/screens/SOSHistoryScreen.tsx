// frontend/src/screens/SOSHistoryScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import ApiClient, { SOSEvent } from '../api/client';

const SOSHistoryScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const [sosEvents, setSosEvents] = useState<SOSEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadSOSHistory();
    }, [])
  );

  const loadSOSHistory = async () => {
    try {
      setIsLoading(true);
      const response = await ApiClient.getSOSHistory(50, 0);
      setSosEvents(response.sosEvents);
    } catch (error) {
      console.error('Failed to load SOS history:', error);
      Alert.alert('Error', 'Failed to load SOS history');
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadSOSHistory();
    setIsRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#FF6B6B';
      case 'responded': return '#FFD93D';
      case 'resolved': return '#6BCB77';
      case 'cancelled': return '#AAAAAA';
      default: return '#AAAAAA';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return '🚨';
      case 'responded': return '👮';
      case 'resolved': return '✅';
      case 'cancelled': return '❌';
      default: return '📋';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  };

  const renderSOSItem = ({ item }: { item: SOSEvent }) => (
    <TouchableOpacity
      style={styles.sosCard}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate('SOSDetails', { sosId: item.id });
      }}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>
            {getStatusIcon(item.status)} {item.status.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.timestamp}>{formatDate(item.createdAt)}</Text>
      </View>

      <View style={styles.locationInfo}>
        <Text style={styles.locationIcon}>📍</Text>
        <Text style={styles.locationText}>
          {item.location.lat.toFixed(4)}, {item.location.lng.toFixed(4)}
        </Text>
      </View>

      {item.message && (
        <Text style={styles.message} numberOfLines={2}>
          "{item.message}"
        </Text>
      )}

      {item.responderName && (
        <View style={styles.responderInfo}>
          <Text style={styles.responderIcon}>👮</Text>
          <Text style={styles.responderText}>
            Responded by: {item.responderName}
            {item.eta && ` (ETA: ${item.eta} min)`}
          </Text>
        </View>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.footerText}>
          {item.status === 'resolved' ? '✓ Resolved' : 
           item.status === 'responded' ? '⏳ Help En Route' :
           item.status === 'active' ? '⚠️ Active Emergency' : '✗ Cancelled'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🛡️</Text>
      <Text style={styles.emptyTitle}>No SOS Events</Text>
      <Text style={styles.emptyText}>
        You haven't triggered any SOS alerts yet. Your safety history will appear here.
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#e94560" />
        <Text style={styles.loadingText}>Loading SOS history...</Text>
      </View>
    );
  }

  return (
    <LinearGradient colors={['#1a1a2e', '#16213e']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SOS History</Text>
        <View style={styles.placeholder} />
      </View>

      {sosEvents.length > 0 && (
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{sosEvents.length}</Text>
            <Text style={styles.statLabel}>Total SOS</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#FF6B6B' }]}>
              {sosEvents.filter(e => e.status === 'active').length}
            </Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#6BCB77' }]}>
              {sosEvents.filter(e => e.status === 'resolved').length}
            </Text>
            <Text style={styles.statLabel}>Resolved</Text>
          </View>
        </View>
      )}

      <FlatList
        data={sosEvents}
        keyExtractor={(item) => item.id}
        renderItem={renderSOSItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#e94560" />
        }
        ListEmptyComponent={renderEmptyState}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  placeholder: {
    width: 40,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingVertical: 15,
    marginBottom: 10,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 12,
    minWidth: 80,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#e94560',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  sosCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFF',
  },
  timestamp: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  locationText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  message: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  responderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  responderIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  responderText: {
    fontSize: 12,
    color: '#FFD93D',
  },
  cardFooter: {
    marginTop: 10,
  },
  footerText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
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
    color: 'rgba(255,255,255,0.7)',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});

export default SOSHistoryScreen;
