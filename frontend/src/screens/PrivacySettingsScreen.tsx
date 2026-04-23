import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../hooks/useAuth';

const PrivacySettingsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState({
    shareAnalytics: true,
    shareCrashReports: true,
    dataRetentionDays: 30,
    locationHistoryEnabled: true,
    anonymousUsageData: true,
  });

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            // Call API to delete account
            // await ApiClient.deleteAccount();
            // await logout();
          },
        },
      ]
    );
  };

  const handleExportData = () => {
    Alert.alert('Export Data', 'Your data export will be prepared and sent to your registered email address.');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <LinearGradient colors={['#1a1a2e', '#16213e']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy & Security</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Data Collection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Data Collection</Text>
          
          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>Anonymous Usage Data</Text>
              <Text style={styles.settingDescription}>Help us improve the app</Text>
            </View>
            <Switch
              value={settings.anonymousUsageData}
              onValueChange={(value) => setSettings({ ...settings, anonymousUsageData: value })}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor={settings.anonymousUsageData ? '#FFF' : '#FFF'}
            />
          </View>

          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>Share Crash Reports</Text>
              <Text style={styles.settingDescription}>Automatically send crash reports</Text>
            </View>
            <Switch
              value={settings.shareCrashReports}
              onValueChange={(value) => setSettings({ ...settings, shareCrashReports: value })}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor={settings.shareCrashReports ? '#FFF' : '#FFF'}
            />
          </View>
        </View>

        {/* Location Privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Location Privacy</Text>
          
          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>Location History</Text>
              <Text style={styles.settingDescription}>Store your location history for safety features</Text>
            </View>
            <Switch
              value={settings.locationHistoryEnabled}
              onValueChange={(value) => setSettings({ ...settings, locationHistoryEnabled: value })}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor={settings.locationHistoryEnabled ? '#FFF' : '#FFF'}
            />
          </View>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuLabel}>Clear Location History</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuLabel}>Data Retention Period</Text>
            <Text style={styles.menuValue}>{settings.dataRetentionDays} days</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Account Management */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👤 Account Management</Text>
          
          <TouchableOpacity style={styles.menuItem} onPress={handleExportData}>
            <Text style={styles.menuLabel}>Export My Data</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuLabel}>Change Password</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuLabel}>Manage Connected Devices</Text>
            <Text style={styles.menuValue}>2 devices</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Legal */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚖️ Legal</Text>
          
          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuLabel}>Terms of Service</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuLabel}>Privacy Policy</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuLabel}>Cookie Policy</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={[styles.section, styles.dangerSection]}>
          <Text style={[styles.sectionTitle, styles.dangerTitle]}>⚠️ Danger Zone</Text>
          
          <TouchableOpacity style={styles.dangerButton} onPress={handleDeleteAccount}>
            <Text style={styles.dangerButtonText}>Delete Account</Text>
          </TouchableOpacity>
        </View>
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
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  menuLabel: {
    fontSize: 16,
    color: '#FFF',
  },
  menuValue: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginRight: 8,
  },
  menuArrow: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.5)',
  },
  dangerSection: {
    borderWidth: 1,
    borderColor: '#F44336',
    backgroundColor: 'rgba(244,67,54,0.1)',
  },
  dangerTitle: {
    color: '#F44336',
  },
  dangerButton: {
    backgroundColor: '#F44336',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default PrivacySettingsScreen;
