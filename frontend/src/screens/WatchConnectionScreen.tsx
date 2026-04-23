import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import ApiClient from '../api/client';

const WatchConnectionScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [watchInfo, setWatchInfo] = useState<any>(null);
  const [settings, setSettings] = useState({
    hapticAlerts: true,
    routePreview: true,
    sosFromWatch: true,
    healthSync: true,
  });

  useEffect(() => {
    checkWatchStatus();
  }, []);

  const checkWatchStatus = async () => {
    try {
      const status = await ApiClient.getWatchStatus();
      setConnected(status.connected);
      setWatchInfo(status.device);
    } catch (error) {
      console.error('Failed to check watch status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // In production, this would trigger watch pairing
      // For now, simulate connection
      setTimeout(() => {
        setConnected(true);
        setWatchInfo({
          id: 'watch_123',
          type: Platform.OS === 'ios' ? 'apple_watch' : 'wear_os',
          name: Platform.OS === 'ios' ? 'Apple Watch' : 'Wear OS Device',
        });
        setConnecting(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', 'Watch connected successfully');
      }, 2000);
    } catch (error) {
      setConnecting(false);
      Alert.alert('Error', 'Failed to connect watch');
    }
  };

  const handleDisconnect = async () => {
    Alert.alert(
      'Disconnect Watch',
      'Are you sure you want to disconnect your watch?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setConnected(false);
            setWatchInfo(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  };

  const handleSendTestAlert = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await ApiClient.sendHapticAlertToWatch('info', 'Test alert from SafeRoute', 'low');
      Alert.alert('Success', 'Test alert sent to watch');
    } catch (error) {
      Alert.alert('Error', 'Failed to send test alert');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#e94560" />
      </View>
    );
  }

  return (
    <LinearGradient colors={['#1a1a2e', '#16213e']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Smart Watch</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Connection Card */}
        <View style={styles.connectionCard}>
          <LinearGradient
            colors={connected ? ['#1a472a', '#0d2615'] : ['#2a1a1a', '#1a0d0d']}
            style={styles.connectionGradient}
          >
            <Text style={styles.connectionIcon}>{connected ? '⌚✅' : '⌚❌'}</Text>
            <Text style={styles.connectionStatus}>
              {connected ? 'Connected' : 'Not Connected'}
            </Text>
            {watchInfo && (
              <Text style={styles.watchName}>{watchInfo.name}</Text>
            )}
            {connected ? (
              <TouchableOpacity
                style={styles.disconnectButton}
                onPress={handleDisconnect}
              >
                <Text style={styles.disconnectButtonText}>Disconnect</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.connectButton}
                onPress={handleConnect}
                disabled={connecting}
              >
                <LinearGradient
                  colors={['#e94560', '#c73e54']}
                  style={styles.connectGradient}
                >
                  {connecting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.connectButtonText}>Connect Watch</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            )}
          </LinearGradient>
        </View>

        {/* Features Section */}
        {connected && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>⌚ Watch Features</Text>
              
              <View style={styles.settingItem}>
                <View>
                  <Text style={styles.settingLabel}>Haptic Alerts</Text>
                  <Text style={styles.settingDescription}>Vibrate for safety alerts</Text>
                </View>
                <Switch
                  value={settings.hapticAlerts}
                  onValueChange={(value) => setSettings({ ...settings, hapticAlerts: value })}
                  trackColor={{ false: '#333', true: '#e94560' }}
                  thumbColor={settings.hapticAlerts ? '#FFF' : '#FFF'}
                />
              </View>

              <View style={styles.settingItem}>
                <View>
                  <Text style={styles.settingLabel}>Route Preview</Text>
                  <Text style={styles.settingDescription}}>Show route on watch</Text>
                </View>
                <Switch
                  value={settings.routePreview}
                  onValueChange={(value) => setSettings({ ...settings, routePreview: value })}
                  trackColor={{ false: '#333', true: '#e94560' }}
                  thumbColor={settings.routePreview ? '#FFF' : '#FFF'}
                />
              </View>

              <View style={styles.settingItem}>
                <View>
                  <Text style={styles.settingLabel}>SOS from Watch</Text>
                  <Text style={styles.settingDescription}>Trigger SOS from watch</Text>
                </View>
                <Switch
                  value={settings.sosFromWatch}
                  onValueChange={(value) => setSettings({ ...settings, sosFromWatch: value })}
                  trackColor={{ false: '#333', true: '#e94560' }}
                  thumbColor={settings.sosFromWatch ? '#FFF' : '#FFF'}
                />
              </View>

              <View style={styles.settingItem}>
                <View>
                  <Text style={styles.settingLabel}>Health Data Sync</Text>
                  <Text style={styles.settingDescription}>Sync heart rate and activity</Text>
                </View>
                <Switch
                  value={settings.healthSync}
                  onValueChange={(value) => setSettings({ ...settings, healthSync: value })}
                  trackColor={{ false: '#333', true: '#e94560' }}
                  thumbColor={settings.healthSync ? '#FFF' : '#FFF'}
                />
              </View>
            </View>

            {/* Test Alert */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🔔 Test</Text>
              <TouchableOpacity
                style={styles.testButton}
                onPress={handleSendTestAlert}
              >
                <Text style={styles.testButtonText}>Send Test Alert to Watch</Text>
              </TouchableOpacity>
            </View>

            {/* Instructions */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>ℹ️ Instructions</Text>
              <View style={styles.instructionItem}>
                <Text style={styles.instructionIcon}>1️⃣</Text>
                <Text style={styles.instructionText}>Open the SafeRoute app on your watch</Text>
              </View>
              <View style={styles.instructionItem}>
                <Text style={styles.instructionIcon}>2️⃣</Text>
                <Text style={styles.instructionText}>Ensure Bluetooth is enabled on both devices</Text>
              </View>
              <View style={styles.instructionItem}>
                <Text style={styles.instructionIcon}>3️⃣</Text>
                <Text style={styles.instructionText}>Tap "Connect Watch" to pair</Text>
              </View>
              <View style={styles.instructionItem}>
                <Text style={styles.instructionIcon}>4️⃣</Text>
                <Text style={styles.instructionText}>Allow permissions when prompted</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectionCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 24,
    borderRadius: 20,
    overflow: 'hidden',
  },
  connectionGradient: {
    padding: 32,
    alignItems: 'center',
  },
  connectionIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  connectionStatus: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  watchName: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 20,
  },
  connectButton: {
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
  },
  connectGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  connectButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disconnectButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
  },
  disconnectButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  section: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  settingLabel: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '500',
  },
  settingDescription: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  testButton: {
    backgroundColor: '#e94560',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  testButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  instructionIcon: {
    fontSize: 16,
    marginRight: 12,
    color: '#FFF',
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
  },
});

export default WatchConnectionScreen;
