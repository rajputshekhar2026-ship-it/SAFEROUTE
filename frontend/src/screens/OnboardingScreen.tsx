import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Animated,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

const onboardingData = [
  {
    id: '1',
    title: 'Your Safety, Our Priority',
    description: 'SafeRoute helps you navigate safely with real-time risk assessment and emergency features.',
    icon: '🛡️',
    color: ['#e94560', '#c73e54'],
  },
  {
    id: '2',
    title: 'Smart Route Planning',
    description: 'Choose between fastest, safest, or well-lit routes based on real-time crime data and lighting conditions.',
    icon: '🗺️',
    color: ['#2196F3', '#1976D2'],
  },
  {
    id: '3',
    title: 'Real-time Safety Alerts',
    description: 'Get instant alerts about high-risk areas, weather warnings, and suspicious activity nearby.',
    icon: '⚠️',
    color: ['#FF9800', '#F57C00'],
  },
  {
    id: '4',
    title: 'One-Tap SOS',
    description: 'Emergency button sends your location, audio, and photos to trusted contacts and emergency services.',
    icon: '🚨',
    color: ['#F44336', '#D32F2F'],
  },
  {
    id: '5',
    title: 'Health Mode',
    description: 'Disguise the app as a weather or news app for discreet usage in unsafe situations.',
    icon: '🎭',
    color: ['#4CAF50', '#388E3C'],
  },
];

const OnboardingScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const handleNext = () => {
    if (currentIndex < onboardingData.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      handleGetStarted();
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem('onboarding_completed', 'true');
    navigation.replace('Login');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleGetStarted = async () => {
    await AsyncStorage.setItem('onboarding_completed', 'true');
    navigation.replace('Login');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const renderItem = ({ item, index }: { item: any; index: number }) => (
    <View style={styles.slide}>
      <LinearGradient
        colors={item.color}
        style={styles.iconContainer}
      >
        <Text style={styles.icon}>{item.icon}</Text>
      </LinearGradient>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.description}>{item.description}</Text>
    </View>
  );

  const renderDots = () => {
    const dotPosition = Animated.divide(scrollX, width);
    
    return (
      <View style={styles.dotsContainer}>
        {onboardingData.map((_, idx) => {
          const opacity = dotPosition.interpolate({
            inputRange: [idx - 1, idx, idx + 1],
            outputRange: [0.3, 1, 0.3],
            extrapolate: 'clamp',
          });
          
          const scale = dotPosition.interpolate({
            inputRange: [idx - 1, idx, idx + 1],
            outputRange: [0.8, 1.2, 0.8],
            extrapolate: 'clamp',
          });
          
          return (
            <Animated.View
              key={idx}
              style={[
                styles.dot,
                {
                  opacity,
                  transform: [{ scale }],
                  backgroundColor: currentIndex === idx ? '#e94560' : 'rgba(255,255,255,0.5)',
                },
              ]}
            />
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <FlatList
        ref={flatListRef}
        data={onboardingData}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
      />
      
      {renderDots()}
      
      <View style={styles.buttonContainer}>
        {currentIndex < onboardingData.length - 1 ? (
          <>
            <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
              <LinearGradient
                colors={['#e94560', '#c73e54']}
                style={styles.nextGradient}
              >
                <Text style={styles.nextText}>Next</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.getStartedButton} onPress={handleGetStarted}>
            <LinearGradient
              colors={['#e94560', '#c73e54']}
              style={styles.getStartedGradient}
            >
              <Text style={styles.getStartedText}>Get Started</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  slide: {
    width,
    paddingHorizontal: 40,
    paddingTop: height * 0.15,
    alignItems: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  icon: {
    fontSize: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 24,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 6,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingBottom: 40,
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  skipText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
  },
  nextButton: {
    borderRadius: 25,
    overflow: 'hidden',
  },
  nextGradient: {
    paddingVertical: 12,
    paddingHorizontal: 30,
  },
  nextText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  getStartedButton: {
    flex: 1,
    borderRadius: 25,
    overflow: 'hidden',
  },
  getStartedGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  getStartedText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default OnboardingScreen;
