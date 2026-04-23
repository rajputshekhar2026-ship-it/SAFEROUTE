import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../hooks/useAuth';

const ProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, logout, isLoading } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await logout();
            setLoggingOut(false);
          },
        },
      ]
    );
  };

  const menuItems = [
    {
      icon: '👤',
      title: 'Personal Information',
      subtitle: 'Update your profile details',
      onPress: () => navigation.navigate('EditProfile'),
    },
    {
      icon: '📞',
      title: 'Emergency Contacts',
      subtitle: 'Manage your emergency contacts',
      onPress: () => navigation.navigate('EmergencyContacts'),
    },
    {
      icon: '⚙️',
      title: 'Preferences',
      subtitle: 'App settings and preferences',
      onPress: () => navigation.navigate('UserPreferences'),
    },
    {
      icon: '🔔',
      title: 'Notifications',
      subtitle: 'Configure alert preferences',
      onPress: () => navigation.navigate('NotificationSettings'),
    },
    {
      icon: '⌚',
      title: 'Smart Watch',
      subtitle: 'Connect and manage your watch',
      onPress: () => navigation.navigate('WatchConnection'),
    },
    {
      icon: '🛡️',
      title: 'Privacy & Security',
      subtitle: 'Manage your privacy settings',
      onPress: () => navigation.navigate('PrivacySettings'),
    },
    {
      icon: '📜',
      title: 'SOS History',
      subtitle: 'View past SOS alerts',
      onPress: () => navigation.navigate('SOSHistory'),
    },
    {
      icon: '❓',
      title: 'Help & Support',
      subtitle: 'FAQs and contact support',
      onPress: () => navigation.navigate('Help'),
    },
    {
      icon: 'ℹ️',
      title: 'About',
      subtitle: 'Version 1.0.0',
      onPress: () => navigation.navigate('About'),
    },
  ];

  return (
    <LinearGradient colors={['#1a1a2e', '#16213e']} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity onPress={handleLogout} disabled={loggingOut}>
          {loggingOut ? (
            <ActivityIndicator size="small" color="#e94560" />
          ) : (
            <Text style={styles.logoutText}>Logout</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <LinearGradient
            colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']}
            style={styles.profileGradient}
          >
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
            <Text style={styles.userName}>{user?.name || 'User'}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
            {user?.phone && (
              <Text style={styles.userPhone}>{user.phone}</Text>
            )}
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedText}>
                {user?.isVerified ? '✓ Verified Account' : '⚠️ Email Not Verified'}
              </Text>
            </View>
          </LinearGradient>
        </View>

        {/* Menu Items */}
        <View style={styles.menuContainer}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appName}>SafeRoute</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
          <Text style={styles.copyright}>© 2024 SafeRoute. All rights reserved.</Text>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
  },
  logoutText: {
    color: '#e94560',
    fontSize: 16,
    fontWeight: '500',
  },
  profileCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 20,
    overflow: 'hidden',
  },
  profileGradient: {
    padding: 24,
    alignItems: 'center',
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e94560',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFF',
  },
  userName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 2,
  },
  userPhone: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 12,
  },
  verifiedBadge: {
    backgroundColor: 'rgba(76,175,80,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  verifiedText: {
    fontSize: 11,
    color: '#4CAF50',
    fontWeight: '500',
  },
  menuContainer: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  menuIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '500',
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  menuArrow: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.4)",
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingBottom: 40,
  },
  appName: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    marginBottom: 8,
  },
  copyright: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.2)',
  },
});

export default ProfileScreen;
