// src/screens/HealthModeScreen.tsx

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Animated,
  Dimensions,
  Image,
  Platform,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useHealthMode } from '../hooks/useHealthMode';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

interface WeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  feelsLike: number;
  uvIndex: number;
  airQuality: string;
  forecast: Array<{
    day: string;
    high: number;
    low: number;
    condition: string;
    precipitation: number;
  }>;
}

interface NewsData {
  headlines: Array<{
    id: string;
    title: string;
    source: string;
    timestamp: string;
    category: string;
    summary: string;
    imageUrl?: string;
  }>;
  breakingNews: string;
  topStories: string[];
}

const HealthModeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const {
    isHealthMode,
    toggleHealthMode,
    config,
    updateConfig,
    fakeWeatherData,
    fakeNewsData,
    registerSecretGesture,
    secretGestureCount,
  } = useHealthMode();

  const [activeTab, setActiveTab] = useState<'weather' | 'news' | 'settings'>('weather');
  const [weatherData, setWeatherData] = useState<WeatherData>({
    temperature: 72,
    condition: 'Partly Cloudy',
    humidity: 65,
    windSpeed: 8,
    feelsLike: 70,
    uvIndex: 5,
    airQuality: 'Moderate',
    forecast: [
      { day: 'Today', high: 74, low: 62, condition: 'Sunny', precipitation: 10 },
      { day: 'Tue', high: 72, low: 60, condition: 'Partly Cloudy', precipitation: 20 },
      { day: 'Wed', high: 68, low: 58, condition: 'Light Rain', precipitation: 60 },
      { day: 'Thu', high: 70, low: 59, condition: 'Cloudy', precipitation: 30 },
      { day: 'Fri', high: 73, low: 61, condition: 'Sunny', precipitation: 5 },
    ],
  });
  
  const [newsData, setNewsData] = useState<NewsData>({
    headlines: [
      {
        id: '1',
        title: 'Local Community Center Launches New Safety Program',
        source: 'City News',
        timestamp: '2 hours ago',
        category: 'Local',
        summary: 'The community center announces a new initiative to improve neighborhood safety.',
      },
      {
        id: '2',
        title: 'City Council Approves Downtown Revitalization Plan',
        source: 'Daily Times',
        timestamp: '5 hours ago',
        category: 'Politics',
        summary: 'Major funding approved for downtown improvement projects.',
      },
      {
        id: '3',
        title: 'New Park Opening Celebrated by Residents',
        source: 'Morning Post',
        timestamp: '1 day ago',
        category: 'Community',
        summary: 'Hundreds gather for the grand opening of Central Park.',
      },
      {
        id: '4',
        title: 'Public Transit Announces Extended Hours',
        source: 'Metro News',
        timestamp: '1 day ago',
        category: 'Transit',
        summary: 'Bus and train services to operate later on weekends.',
      },
      {
        id: '5',
        title: 'Weather Alert: Clear Skies Expected All Week',
        source: 'Weather Network',
        timestamp: '2 days ago',
        category: 'Weather',
        summary: 'Perfect weather conditions forecasted for the coming days.',
      },
    ],
    breakingNews: 'City announces new community safety initiatives',
    topStories: ['Local News', 'Community Updates', 'Weather Forecast'],
  });
  
  const [autoActivateEnabled, setAutoActivateEnabled] = useState(
    config.autoActivateOnTimeRange?.enabled || false
  );
  const [startTime, setStartTime] = useState(config.autoActivateOnTimeRange?.startTime || '22:00');
  const [endTime, setEndTime] = useState(config.autoActivateOnTimeRange?.endTime || '06:00');
  const [shakeToActivate, setShakeToActivate] = useState(config.autoActivateOnShake);
  const [biometricRequired, setBiometricRequired] = useState(config.biometricRequiredForExit);
  
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Generate realistic fake data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (isHealthMode) {
        refreshFakeData();
      }
    }, 300000); // Every 5 minutes

    return () => clearInterval(interval);
  }, [isHealthMode]);

  // Animate on tab change
  useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0.5,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.95,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [activeTab]);

  const refreshFakeData = () => {
    // Generate random weather data
    const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Clear Sky', 'Misty'];
    const randomCondition = conditions[Math.floor(Math.random() * conditions.length)];
    const baseTemp = Math.floor(Math.random() * 30) + 50; // 50-80°F
    
    setWeatherData({
      temperature: baseTemp,
      condition: randomCondition,
      humidity: Math.floor(Math.random() * 40) + 40,
      windSpeed: Math.floor(Math.random() * 15) + 2,
      feelsLike: baseTemp - Math.floor(Math.random() * 5) + 2,
      uvIndex: Math.floor(Math.random() * 10),
      airQuality: ['Good', 'Moderate', 'Poor'][Math.floor(Math.random() * 3)],
      forecast: weatherData.forecast.map(day => ({
        ...day,
        high: baseTemp + Math.floor(Math.random() * 10) - 2,
        low: baseTemp - Math.floor(Math.random() * 10) - 2,
        condition: conditions[Math.floor(Math.random() * conditions.length)],
        precipitation: Math.floor(Math.random() * 80),
      })),
    });
  };

  const handleToggleHealthMode = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await toggleHealthMode();
    
    if (!isHealthMode) {
      // Just activated health mode
      Alert.alert(
        'Health Mode Active',
        'Your app now appears as a weather/news app. Double-tap the logo to exit.',
        [{ text: 'OK' }]
      );
    } else {
      navigation.goBack();
    }
  };

  const handleSaveSettings = async () => {
    await updateConfig({
      autoActivateOnShake: shakeToActivate,
      autoActivateOnTimeRange: {
        enabled: autoActivateEnabled,
        startTime,
        endTime,
      },
      biometricRequiredForExit: biometricRequired,
    });
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Settings Saved', 'Your health mode settings have been updated.');
  };

  const renderWeatherUI = () => (
    <Animated.View style={[styles.contentContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      {/* Current Weather */}
      <LinearGradient
        colors={['#4A90E2', '#357ABD']}
        style={styles.currentWeatherCard}
      >
        <Text style={styles.currentTemp}>{weatherData.temperature}°F</Text>
        <Text style={styles.currentCondition}>{weatherData.condition}</Text>
        <Text style={styles.feelsLike}>Feels like {weatherData.feelsLike}°F</Text>
        
        <View style={styles.weatherDetails}>
          <View style={styles.detailItem}>
            <Text style={styles.detailValue}>{weatherData.humidity}%</Text>
            <Text style={styles.detailLabel}>Humidity</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailValue}>{weatherData.windSpeed} mph</Text>
            <Text style={styles.detailLabel}>Wind</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailValue}>UV {weatherData.uvIndex}</Text>
            <Text style={styles.detailLabel}>UV Index</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailValue}>{weatherData.airQuality}</Text>
            <Text style={styles.detailLabel}>Air Quality</Text>
          </View>
        </View>
      </LinearGradient>

      {/* 5-Day Forecast */}
      <View style={styles.forecastCard}>
        <Text style={styles.sectionTitle}>5-Day Forecast</Text>
        {weatherData.forecast.map((day, index) => (
          <View key={index} style={styles.forecastItem}>
            <Text style={styles.forecastDay}>{day.day}</Text>
            <Text style={styles.forecastCondition}>{day.condition}</Text>
            <Text style={styles.forecastTemp}>
              {day.high}° / {day.low}°
            </Text>
            <Text style={styles.forecastPrecip}>{day.precipitation}%</Text>
          </View>
        ))}
      </View>

      {/* Weather Alert */}
      {weatherData.uvIndex > 7 && (
        <View style={styles.alertCard}>
          <Text style={styles.alertText}>⚠️ High UV Index - Wear sunscreen</Text>
        </View>
      )}
    </Animated.View>
  );

  const renderNewsUI = () => (
    <Animated.View style={[styles.contentContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      {/* Breaking News */}
      {newsData.breakingNews && (
        <View style={styles.breakingNewsCard}>
          <Text style={styles.breakingLabel}>BREAKING</Text>
          <Text style={styles.breakingText}>{newsData.breakingNews}</Text>
        </View>
      )}

      {/* News Categories */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll}>
        {newsData.topStories.map((category, index) => (
          <TouchableOpacity key={index} style={styles.categoryChip}>
            <Text style={styles.categoryText}>{category}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Headlines */}
      {newsData.headlines.map((headline) => (
        <TouchableOpacity key={headline.id} style={styles.newsCard}>
          <View style={styles.newsHeader}>
            <Text style={styles.newsCategory}>{headline.category}</Text>
            <Text style={styles.newsTime}>{headline.timestamp}</Text>
          </View>
          <Text style={styles.newsTitle}>{headline.title}</Text>
          <Text style={styles.newsSummary}>{headline.summary}</Text>
          <View style={styles.newsFooter}>
            <Text style={styles.newsSource}>{headline.source}</Text>
            <Text style={styles.readMore}>Read more →</Text>
          </View>
        </TouchableOpacity>
      ))}
    </Animated.View>
  );

  const renderSettingsUI = () => (
    <Animated.View style={[styles.contentContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      <View style={styles.settingsCard}>
        <Text style={styles.settingsTitle}>Disguise Settings</Text>
        
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Shake to Activate</Text>
          <Switch
            value={shakeToActivate}
            onValueChange={setShakeToActivate}
            trackColor={{ false: '#767577', true: '#4A90E2' }}
            thumbColor={shakeToActivate ? '#FFF' : '#F4F3F4'}
          />
        </View>

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Auto-Activate Schedule</Text>
          <Switch
            value={autoActivateEnabled}
            onValueChange={setAutoActivateEnabled}
            trackColor={{ false: '#767577', true: '#4A90E2' }}
            thumbColor={autoActivateEnabled ? '#FFF' : '#F4F3F4'}
          />
        </View>

        {autoActivateEnabled && (
          <View style={styles.timeRangeContainer}>
            <View style={styles.timeInput}>
              <Text style={styles.timeLabel}>Start Time</Text>
              <TouchableOpacity
                style={styles.timeButton}
                onPress={() => {
                  // Implement time picker
                  Alert.alert('Set Start Time', 'Time picker would open here');
                }}
              >
                <Text style={styles.timeValue}>{startTime}</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.timeInput}>
              <Text style={styles.timeLabel}>End Time</Text>
              <TouchableOpacity
                style={styles.timeButton}
                onPress={() => {
                  Alert.alert('Set End Time', 'Time picker would open here');
                }}
              >
                <Text style={styles.timeValue}>{endTime}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Biometric Required for Exit</Text>
          <Switch
            value={biometricRequired}
            onValueChange={setBiometricRequired}
            trackColor={{ false: '#767577', true: '#4A90E2' }}
            thumbColor={biometricRequired ? '#FFF' : '#F4F3F4'}
          />
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSaveSettings}>
          <Text style={styles.saveButtonText}>Save Settings</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>About Health Mode</Text>
        <Text style={styles.infoText}>
          Health Mode disguises your app as a weather or news application for your safety.
          Use the secret gesture (double-tap logo) to exit this mode quickly.
        </Text>
      </View>
    </Animated.View>
  );

  // Secret gesture detector (double tap on logo area)
  const handleLogoPress = () => {
    registerSecretGesture();
    
    if (secretGestureCount === 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else if (secretGestureCount >= 2) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.logoContainer}
          onPress={handleLogoPress}
          activeOpacity={0.7}
        >
          <Text style={styles.logo}>
            {activeTab === 'weather' ? '🌤️' : '📰'}
          </Text>
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>
          {activeTab === 'weather' ? 'Weather' : 'News Today'}
        </Text>
        
        <TouchableOpacity 
          style={styles.menuButton}
          onPress={() => {
            if (activeTab === 'weather') {
              refreshFakeData();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } else {
              setActiveTab('settings');
            }
          }}
        >
          <Text style={styles.menuIcon}>⋮</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'weather' && styles.activeTab]}
          onPress={() => setActiveTab('weather')}
        >
          <Text style={[styles.tabText, activeTab === 'weather' && styles.activeTabText]}>
            Weather
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'news' && styles.activeTab]}
          onPress={() => setActiveTab('news')}
        >
          <Text style={[styles.tabText, activeTab === 'news' && styles.activeTabText]}>
            News
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'settings' && styles.activeTab]}
          onPress={() => setActiveTab('settings')}
        >
          <Text style={[styles.tabText, activeTab === 'settings' && styles.activeTabText]}>
            Settings
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {activeTab === 'weather' && renderWeatherUI()}
        {activeTab === 'news' && renderNewsUI()}
        {activeTab === 'settings' && renderSettingsUI()}
      </ScrollView>

      {/* Exit Button (only visible when not in health mode for preview) */}
      {!isHealthMode && (
        <TouchableOpacity style={styles.exitPreviewButton} onPress={handleToggleHealthMode}>
          <Text style={styles.exitPreviewText}>Enter Health Mode</Text>
        </TouchableOpacity>
      )}
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
  logoContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 24,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuIcon: {
    fontSize: 24,
    color: '#666',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#4A90E2',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#FFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  contentContainer: {
    padding: 20,
  },
  currentWeatherCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  currentTemp: {
    fontSize: 72,
    fontWeight: 'bold',
    color: '#FFF',
  },
  currentCondition: {
    fontSize: 24,
    color: '#FFF',
    marginTop: 10,
  },
  feelsLike: {
    fontSize: 16,
    color: '#FFF',
    opacity: 0.9,
    marginTop: 5,
  },
  weatherDetails: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.3)',
  },
  detailItem: {
    alignItems: 'center',
  },
  detailValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  detailLabel: {
    fontSize: 12,
    color: '#FFF',
    opacity: 0.8,
    marginTop: 5,
  },
  forecastCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  forecastItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  forecastDay: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    width: 60,
  },
  forecastCondition: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  forecastTemp: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    width: 80,
    textAlign: 'right',
  },
  forecastPrecip: {
    fontSize: 12,
    color: '#4A90E2',
    width: 50,
    textAlign: 'right',
  },
  alertCard: {
    backgroundColor: '#FF9800',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
  },
  alertText: {
    color: '#FFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  breakingNewsCard: {
    backgroundColor: '#F44336',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
  },
  breakingLabel: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 12,
    marginBottom: 5,
  },
  breakingText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  categoriesScroll: {
    marginBottom: 20,
  },
  categoryChip: {
    backgroundColor: '#E0E0E0',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
  },
  categoryText: {
    color: '#666',
    fontSize: 14,
  },
  newsCard: {
    backgroundColor: '#FFF',
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  newsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  newsCategory: {
    color: '#4A90E2',
    fontSize: 12,
    fontWeight: '600',
  },
  newsTime: {
    color: '#999',
    fontSize: 12,
  },
  newsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  newsSummary: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 10,
  },
  newsFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  newsSource: {
    color: '#999',
    fontSize: 12,
  },
  readMore: {
    color: '#4A90E2',
    fontSize: 12,
    fontWeight: '600',
  },
  settingsCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
  },
  timeRangeContainer: {
    marginTop: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeInput: {
    flex: 1,
    marginHorizontal: 5,
  },
  timeLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  timeButton: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  timeValue: {
    fontSize: 16,
    color: '#333',
  },
  saveButton: {
    backgroundColor: '#4A90E2',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  exitPreviewButton: {
    backgroundColor: '#4CAF50',
    margin: 20,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  exitPreviewText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default HealthModeScreen;
