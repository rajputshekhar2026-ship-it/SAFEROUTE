import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import ApiClient from '../api/client';

const NotificationSettingsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState({
    pushEnabled: true,
    emailEnabled: true,
    smsEnabled: true,
    sosAlerts: true,
    safetyAlerts: true,
    weatherWarnings: true,
    crimeAlerts: true,
    systemUpdates: false,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '07:00',
    },
  });

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const response = await ApiClient.getNotificationPreferences();
      setPreferences(response);
    } catch (error) {
      console.error('Failed to load preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      await ApiClient.updateNotificationPreferences(preferences);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Notification preferences saved');
    } catch (error) {
      Alert.alert('Error', 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const toggleQuietHours = () => {
    setPreferences({
      ...preferences,
      quietHours: {
        ...preferences.quietHours,
        enabled: !preferences.quietHours.enabled,
      },
    });
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
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Channels */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📢 Notification Channels</Text>
          
          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>Push Notifications</Text>
              <Text style={styles.settingDescription}>Receive alerts on your device</Text>
            </View>
            <Switch
              value={preferences.pushEnabled}
              onValueChange={(value) => setPreferences({ ...preferences, pushEnabled: value })}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor={preferences.pushEnabled ? '#FFF' : '#FFF'}
            />
          </View>

          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>Email Notifications</Text>
              <Text style={styles.settingDescription}>Receive alerts via email</Text>
            </View>
            <Switch
              value={preferences.emailEnabled}
              onValueChange={(value) => setPreferences({ ...preferences, emailEnabled: value })}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor={preferences.emailEnabled ? '#FFF' : '#FFF'}
            />
          </View>

          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>SMS Notifications</Text>
              <Text style={styles.settingDescription}>Receive alerts via text message</Text>
            </View>
            <Switch
              value={preferences.smsEnabled}
              onValueChange={(value) => setPreferences({ ...preferences, smsEnabled: value })}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor={preferences.smsEnabled ? '#FFF' : '#FFF'}
            />
          </View>
        </View>

        {/* Alert Types */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🚨 Alert Types</Text>
          
          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>SOS Alerts</Text>
              <Text style={styles.settingDescription}>Emergency SOS notifications</Text>
            </View>
            <Switch
              value={preferences.sosAlerts}
              onValueChange={(value) => setPreferences({ ...preferences, sosAlerts: value })}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor={preferences.sosAlerts ? '#FFF' : '#FFF'}
            />
          </View>

          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>Safety Alerts</Text>
              <Text style={styles.settingDescription}>General safety notifications</Text>
            </View>
            <Switch
              value={preferences.safetyAlerts}
              onValueChange={(value) => setPreferences({ ...preferences, safetyAlerts: value })}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor={preferences.safetyAlerts ? '#FFF' : '#FFF'}
            />
          </View>

          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>Weather Warnings</Text>
              <Text style={styles.settingDescription}>Severe weather alerts</Text>
            </View>
            <Switch
              value={preferences.weatherWarnings}
              onValueChange={(value) => setPreferences({ ...preferences, weatherWarnings: value })}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor={preferences.weatherWarnings ? '#FFF' : '#FFF'}
            />
          </View>

          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>Crime Alerts</Text>
              <Text style={styles.settingDescription}>Nearby crime notifications</Text>
            </View>
            <Switch
              value={preferences.crimeAlerts}
              onValueChange={(value) => setPreferences({ ...preferences, crimeAlerts: value })}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor={preferences.crimeAlerts ? '#FFF' : '#FFF'}
            />
          </View>

          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>System Updates</Text>
              <Text style={styles.settingDescription}>App and feature updates</Text>
            </View>
            <Switch
              value={preferences.systemUpdates}
              onValueChange={(value) => setPreferences({ ...preferences, systemUpdates: value })}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor={preferences.systemUpdates ? '#FFF' : '#FFF'}
            />
          </View>
        </View>

        {/* Quiet Hours */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🌙 Quiet Hours</Text>
          
          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>Enable Quiet Hours</Text>
              <Text style={styles.settingDescription}>Silence non-critical notifications</Text>
            </View>
            <Switch
              value={preferences.quietHours.enabled}
              onValueChange={toggleQuietHours}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor={preferences.quietHours.enabled ? '#FFF' : '#FFF'}
            />
          </View>

          {preferences.quietHours.enabled && (
            <View style={styles.quietHoursContainer}>
              <View style={styles.timeRow}>
                <Text style={styles.timeLabel}>Start Time</Text>
                <TouchableOpacity
                  style={styles.timeButton}
                  onPress={() => {
                    // Time picker would go here
                    Alert.alert('Set Start Time', 'Time picker would open');
                  }}
                >
                  <Text style={styles.timeValue}>{preferences.quietHours.start}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.timeRow}>
                <Text style={styles.timeLabel}>End Time</Text>
                <TouchableOpacity
                  style={styles.timeButton}
                  onPress={() => {
                    Alert.alert('Set End Time', 'Time picker would open');
                  }}
                >
                  <Text style={styles.timeValue}>{preferences.quietHours.end}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveFullButton, saving && styles.saveFullButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <LinearGradient
            colors={['#e94560', '#c73e54']}
            style={styles.saveFullGradient}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.saveFullText}>Save Settings</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
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
  saveButton: {
    backgroundColor: '#e94560',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  saveButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  quietHoursContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  timeLabel: {
    fontSize: 14,
    color: '#FFF',
  },
  timeButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  timeValue: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '500',
  },
  saveFullButton: {
    marginHorizontal: 16,
    marginVertical: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  saveFullButtonDisabled: {
    opacity: 0.6,
  },
  saveFullGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveFullText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default NotificationSettingsScreen;
