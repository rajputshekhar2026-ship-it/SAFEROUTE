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
import { useAuth } from '../hooks/useAuth';
import ApiClient from '../api/client';

const UserPreferencesScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, updatePreferences, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [preferences, setPreferences] = useState({
    notificationsEnabled: true,
    darkMode: true,
    highContrast: false,
    voiceGuidance: true,
    autoSOS: true,
    shareLocationWithContacts: true,
    preferredRouteType: 'safest' as 'fastest' | 'safest' | 'lit',
    alertRadius: 500,
    language: 'en',
    units: 'metric' as 'metric' | 'imperial',
  });

  useEffect(() => {
    if (user?.preferences) {
      setPreferences({
        ...preferences,
        ...user.preferences,
      });
    }
  }, [user]);

  const handleSave = async () => {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      await updatePreferences(preferences);
      await refreshUser();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Preferences saved successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to save preferences');
    } finally {
      setLoading(false);
    }
  };

  const RouteTypeButton = ({ type, label, icon }: { type: string; label: string; icon: string }) => (
    <TouchableOpacity
      style={[
        styles.routeTypeButton,
        preferences.preferredRouteType === type && styles.routeTypeButtonActive,
      ]}
      onPress={() => setPreferences({ ...preferences, preferredRouteType: type as any })}
    >
      <Text style={styles.routeTypeIcon}>{icon}</Text>
      <Text style={[
        styles.routeTypeLabel,
        preferences.preferredRouteType === type && styles.routeTypeLabelActive,
      ]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={['#1a1a2e', '#16213e']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Preferences</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Navigation Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🚗 Navigation</Text>
          
          <View style={styles.routeTypeContainer}>
            <Text style={styles.settingLabel}>Preferred Route Type</Text>
            <View style={styles.routeTypeRow}>
              <RouteTypeButton type="fastest" label="Fastest" icon="⚡" />
              <RouteTypeButton type="safest" label="Safest" icon="🛡️" />
              <RouteTypeButton type="lit" label="Well-Lit" icon="💡" />
            </View>
          </View>

          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>Voice Guidance</Text>
              <Text style={styles.settingDescription}>Turn-by-turn voice navigation</Text>
            </View>
            <Switch
              value={preferences.voiceGuidance}
              onValueChange={(value) => setPreferences({ ...preferences, voiceGuidance: value })}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor={preferences.voiceGuidance ? '#FFF' : '#FFF'}
            />
          </View>

          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>Alert Radius</Text>
              <Text style={styles.settingDescription}>Distance for safety alerts ({preferences.alertRadius}m)</Text>
            </View>
            <View style={styles.radiusContainer}>
              <TouchableOpacity
                style={styles.radiusButton}
                onPress={() => setPreferences({ ...preferences, alertRadius: Math.max(100, preferences.alertRadius - 100) })}
              >
                <Text style={styles.radiusButtonText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.radiusValue}>{preferences.alertRadius}m</Text>
              <TouchableOpacity
                style={styles.radiusButton}
                onPress={() => setPreferences({ ...preferences, alertRadius: Math.min(2000, preferences.alertRadius + 100) })}
              >
                <Text style={styles.radiusButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Safety Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🛡️ Safety</Text>
          
          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>Auto SOS</Text>
              <Text style={styles.settingDescription}>Automatically trigger SOS after inactivity</Text>
            </View>
            <Switch
              value={preferences.autoSOS}
              onValueChange={(value) => setPreferences({ ...preferences, autoSOS: value })}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor={preferences.autoSOS ? '#FFF' : '#FFF'}
            />
          </View>

          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>Share Location with Contacts</Text>
              <Text style={styles.settingDescription}>Share real-time location with emergency contacts</Text>
            </View>
            <Switch
              value={preferences.shareLocationWithContacts}
              onValueChange={(value) => setPreferences({ ...preferences, shareLocationWithContacts: value })}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor={preferences.shareLocationWithContacts ? '#FFF' : '#FFF'}
            />
          </View>
        </View>

        {/* Appearance Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎨 Appearance</Text>
          
          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>Dark Mode</Text>
              <Text style={styles.settingDescription}>Always on for safety</Text>
            </View>
            <Switch
              value={preferences.darkMode}
              onValueChange={(value) => setPreferences({ ...preferences, darkMode: value })}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor={preferences.darkMode ? '#FFF' : '#FFF'}
              disabled={true}
            />
          </View>

          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>High Contrast Mode</Text>
              <Text style={styles.settingDescription}>Enhanced visibility</Text>
            </View>
            <Switch
              value={preferences.highContrast}
              onValueChange={(value) => setPreferences({ ...preferences, highContrast: value })}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor={preferences.highContrast ? '#FFF' : '#FFF'}
            />
          </View>
        </View>

        {/* Units & Language */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🌐 Units & Language</Text>
          
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Units</Text>
            <View style={styles.unitsContainer}>
              <TouchableOpacity
                style={[styles.unitButton, preferences.units === 'metric' && styles.unitButtonActive]}
                onPress={() => setPreferences({ ...preferences, units: 'metric' })}
              >
                <Text style={[styles.unitText, preferences.units === 'metric' && styles.unitTextActive]}>Metric (km, m)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.unitButton, preferences.units === 'imperial' && styles.unitButtonActive]}
                onPress={() => setPreferences({ ...preferences, units: 'imperial' })}
              >
                <Text style={[styles.unitText, preferences.units === 'imperial' && styles.unitTextActive]}>Imperial (mi, ft)</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Language</Text>
            <TouchableOpacity
              style={styles.languageButton}
              onPress={() => {
                Alert.alert(
                  'Select Language',
                  'Choose your preferred language',
                  [
                    { text: 'English', onPress: () => setPreferences({ ...preferences, language: 'en' }) },
                    { text: 'Spanish', onPress: () => setPreferences({ ...preferences, language: 'es' }) },
                    { text: 'Hindi', onPress: () => setPreferences({ ...preferences, language: 'hi' }) },
                    { text: 'Cancel', style: 'cancel' },
                  ]
                );
              }}
            >
              <Text style={styles.languageText}>
                {preferences.language === 'en' ? 'English' : 
                 preferences.language === 'es' ? 'Spanish' : 
                 preferences.language === 'hi' ? 'Hindi' : 'English'}
              </Text>
              <Text style={styles.languageArrow}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Save Button at Bottom */}
        <TouchableOpacity
          style={[styles.saveFullButton, loading && styles.saveFullButtonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          <LinearGradient
            colors={['#e94560', '#c73e54']}
            style={styles.saveFullGradient}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.saveFullText}>Save All Preferences</Text>
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
  routeTypeContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: 8,
  },
  routeTypeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  routeTypeButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    marginHorizontal: 4,
  },
  routeTypeButtonActive: {
    backgroundColor: '#e94560',
  },
  routeTypeIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  routeTypeLabel: {
    fontSize: 12,
    color: '#FFF',
  },
  routeTypeLabelActive: {
    fontWeight: 'bold',
  },
  radiusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radiusButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radiusButtonText: {
    fontSize: 20,
    color: '#FFF',
    fontWeight: 'bold',
  },
  radiusValue: {
    fontSize: 16,
    color: '#FFF',
    marginHorizontal: 16,
    fontWeight: 'bold',
  },
  unitsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  unitButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
  },
  unitButtonActive: {
    backgroundColor: '#e94560',
  },
  unitText: {
    color: 'rgba(255,255,255,0.7)',
  },
  unitTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  languageText: {
    fontSize: 16,
    color: '#FFF',
  },
  languageArrow: {
    fontSize: 20,
    color: '#FFF',
    opacity: 0.7,
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

export default UserPreferencesScreen;
