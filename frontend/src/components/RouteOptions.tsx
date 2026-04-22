// src/components/RouteOptions.tsx

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');

interface RouteOptionsProps {
  selected: 'fastest' | 'safest' | 'lit';
  onSelect: (route: 'fastest' | 'safest' | 'lit') => void;
  routeMetrics?: {
    fastest: { duration: number; distance: number; safetyScore?: number };
    safest: { duration: number; distance: number; safetyScore?: number };
    lit: { duration: number; distance: number; safetyScore?: number };
  };
  onInfoPress?: (routeType: string) => void;
  minimized?: boolean;
  onMinimizeToggle?: () => void;
}

const RouteOptions: React.FC<RouteOptionsProps> = ({
  selected,
  onSelect,
  routeMetrics,
  onInfoPress,
  minimized = false,
  onMinimizeToggle,
}) => {
  const [animation] = useState(new Animated.Value(minimized ? 0 : 1));
  const [expanded, setExpanded] = useState(!minimized);
  const slideAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    animateTransition();
  }, [minimized, expanded]);

  const animateTransition = () => {
    Animated.parallel([
      Animated.timing(animation, {
        toValue: expanded ? 1 : 0,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.spring(slideAnim, {
        toValue: expanded ? 0 : 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleSelect = (route: 'fastest' | 'safest' | 'lit') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(route);
    
    // Announce selection for accessibility
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      // You can implement TTS here
      console.log(`Selected ${route} route`);
    }
  };

  const getRouteIcon = (routeType: string) => {
    switch (routeType) {
      case 'fastest':
        return '⚡';
      case 'safest':
        return '🛡️';
      case 'lit':
        return '💡';
      default:
        return '📍';
    }
  };

  const getRouteColor = (routeType: string, isSelected: boolean) => {
    if (!isSelected) return '#666666';
    switch (routeType) {
      case 'fastest':
        return '#2196F3';
      case 'safest':
        return '#4CAF50';
      case 'lit':
        return '#FFC107';
      default:
        return '#999999';
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  const formatDistance = (meters?: number) => {
    if (!meters) return 'N/A';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const getSafetyScoreBadge = (score?: number) => {
    if (!score) return null;
    if (score >= 80) return { text: 'Very Safe', color: '#4CAF50', icon: '✅' };
    if (score >= 60) return { text: 'Safe', color: '#8BC34A', icon: '👍' };
    if (score >= 40) return { text: 'Moderate', color: '#FFC107', icon: '⚠️' };
    if (score >= 20) return { text: 'Risky', color: '#FF9800', icon: '⚠️⚠️' };
    return { text: 'Dangerous', color: '#F44336', icon: '🚨' };
  };

  const containerHeight = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [60, height * 0.35],
  });

  const containerOpacity = animation.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0.8, 0.9, 1],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          height: containerHeight,
          opacity: containerOpacity,
          transform: [
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, height * 0.7],
              }),
            },
          ],
        },
      ]}
    >
      <LinearGradient
        colors={['rgba(0,0,0,0.95)', 'rgba(0,0,0,0.85)']}
        style={styles.gradient}
      >
        {/* Header with minimize toggle */}
        <TouchableOpacity
          style={styles.header}
          onPress={() => {
            setExpanded(!expanded);
            if (onMinimizeToggle) onMinimizeToggle();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Text style={styles.headerTitle}>Route Options</Text>
          <Text style={styles.headerIcon}>{expanded ? '▼' : '▲'}</Text>
        </TouchableOpacity>

        {expanded && (
          <View style={styles.optionsContainer}>
            {/* Fastest Route Option */}
            <TouchableOpacity
              style={[
                styles.optionCard,
                selected === 'fastest' && styles.selectedCard,
                { borderLeftColor: getRouteColor('fastest', selected === 'fastest') },
              ]}
              onPress={() => handleSelect('fastest')}
              activeOpacity={0.7}
            >
              <View style={styles.optionHeader}>
                <Text style={styles.optionIcon}>⚡</Text>
                <Text style={styles.optionTitle}>Fastest Route</Text>
                {selected === 'fastest' && (
                  <View style={styles.selectedBadge}>
                    <Text style={styles.selectedText}>Selected</Text>
                  </View>
                )}
              </View>

              <View style={styles.optionDetails}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Duration</Text>
                  <Text style={styles.detailValue}>
                    {formatDuration(routeMetrics?.fastest.duration)}
                  </Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Distance</Text>
                  <Text style={styles.detailValue}>
                    {formatDistance(routeMetrics?.fastest.distance)}
                  </Text>
                </View>
                {routeMetrics?.fastest.safetyScore && (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Safety Score</Text>
                    <Text
                      style={[
                        styles.detailValue,
                        {
                          color: getSafetyScoreBadge(routeMetrics.fastest.safetyScore)?.color,
                        },
                      ]}
                    >
                      {routeMetrics.fastest.safetyScore}/100
                    </Text>
                  </View>
                )}
              </View>

              {routeMetrics?.fastest.safetyScore && routeMetrics.fastest.safetyScore < 50 && (
                <View style={styles.warningContainer}>
                  <Text style={styles.warningText}>⚠️ Higher risk area</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Safest Route Option */}
            <TouchableOpacity
              style={[
                styles.optionCard,
                selected === 'safest' && styles.selectedCard,
                { borderLeftColor: getRouteColor('safest', selected === 'safest') },
              ]}
              onPress={() => handleSelect('safest')}
              activeOpacity={0.7}
            >
              <View style={styles.optionHeader}>
                <Text style={styles.optionIcon}>🛡️</Text>
                <Text style={styles.optionTitle}>Safest Route</Text>
                {selected === 'safest' && (
                  <View style={styles.selectedBadge}>
                    <Text style={styles.selectedText}>Selected</Text>
                  </View>
                )}
              </View>

              <View style={styles.optionDetails}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Duration</Text>
                  <Text style={styles.detailValue}>
                    {formatDuration(routeMetrics?.safest.duration)}
                  </Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Distance</Text>
                  <Text style={styles.detailValue}>
                    {formatDistance(routeMetrics?.safest.distance)}
                  </Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Safety Score</Text>
                  <Text
                    style={[
                      styles.detailValue,
                      {
                        color: getSafetyScoreBadge(routeMetrics?.safest.safetyScore)?.color,
                      },
                    ]}
                  >
                    {routeMetrics?.safest.safetyScore || 'N/A'}/100
                  </Text>
                </View>
              </View>

              {getSafetyScoreBadge(routeMetrics?.safest.safetyScore) && (
                <View
                  style={[
                    styles.safetyBadge,
                    {
                      backgroundColor: getSafetyScoreBadge(routeMetrics?.safest.safetyScore)
                        ?.color,
                    },
                  ]}
                >
                  <Text style={styles.safetyBadgeText}>
                    {getSafetyScoreBadge(routeMetrics?.safest.safetyScore)?.icon}{' '}
                    {getSafetyScoreBadge(routeMetrics?.safest.safetyScore)?.text}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Well-Lit Route Option */}
            <TouchableOpacity
              style={[
                styles.optionCard,
                selected === 'lit' && styles.selectedCard,
                { borderLeftColor: getRouteColor('lit', selected === 'lit') },
              ]}
              onPress={() => handleSelect('lit')}
              activeOpacity={0.7}
            >
              <View style={styles.optionHeader}>
                <Text style={styles.optionIcon}>💡</Text>
                <Text style={styles.optionTitle}>Well-Lit Route</Text>
                {selected === 'lit' && (
                  <View style={styles.selectedBadge}>
                    <Text style={styles.selectedText}>Selected</Text>
                  </View>
                )}
              </View>

              <View style={styles.optionDetails}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Duration</Text>
                  <Text style={styles.detailValue}>
                    {formatDuration(routeMetrics?.lit.duration)}
                  </Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Distance</Text>
                  <Text style={styles.detailValue}>
                    {formatDistance(routeMetrics?.lit.distance)}
                  </Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Lighting Score</Text>
                  <Text style={styles.detailValue}>
                    {routeMetrics?.lit.safetyScore || 'N/A'}/100
                  </Text>
                </View>
              </View>

              <View style={styles.lightingIndicator}>
                <View style={styles.lightingBar}>
                  <View
                    style={[
                      styles.lightingFill,
                      { width: `${routeMetrics?.lit.safetyScore || 0}%` },
                    ]}
                  />
                </View>
                <Text style={styles.lightingText}>Street lighting coverage</Text>
              </View>
            </TouchableOpacity>

            {/* Info Button */}
            {onInfoPress && (
              <TouchableOpacity
                style={styles.infoButton}
                onPress={() => onInfoPress(selected)}
              >
                <Text style={styles.infoButtonText}>ℹ️ Route Comparison</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Minimized View */}
        {!expanded && (
          <View style={styles.minimizedContainer}>
            <Text style={styles.minimizedText}>
              {getRouteIcon(selected)} {selected.charAt(0).toUpperCase() + selected.slice(1)} Route Selected
            </Text>
            {routeMetrics && (
              <Text style={styles.minimizedMetrics}>
                {formatDuration(routeMetrics[selected].duration)} • {formatDistance(routeMetrics[selected].distance)}
              </Text>
            )}
          </View>
        )}
      </LinearGradient>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  gradient: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  headerIcon: {
    color: '#FFF',
    fontSize: 14,
  },
  optionsContainer: {
    padding: 15,
    maxHeight: height * 0.3,
  },
  optionCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  selectedCard: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  optionIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  optionTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  selectedBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  selectedText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  optionDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailItem: {
    alignItems: 'center',
  },
  detailLabel: {
    color: '#999',
    fontSize: 10,
    marginBottom: 4,
  },
  detailValue: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
  },
  warningContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  warningText: {
    color: '#FF9800',
    fontSize: 11,
  },
  safetyBadge: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  safetyBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
  lightingIndicator: {
    marginTop: 8,
  },
  lightingBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  lightingFill: {
    height: '100%',
    backgroundColor: '#FFC107',
    borderRadius: 2,
  },
  lightingText: {
    color: '#999',
    fontSize: 9,
  },
  infoButton: {
    marginTop: 8,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    alignItems: 'center',
  },
  infoButtonText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '500',
  },
  minimizedContainer: {
    padding: 15,
    alignItems: 'center',
  },
  minimizedText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  minimizedMetrics: {
    color: '#999',
    fontSize: 12,
  },
});

export default RouteOptions;
