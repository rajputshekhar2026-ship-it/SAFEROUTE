// src/screens/ReportIncidentScreen.tsx

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
  Modal,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Video } from 'expo-av';

// Hooks & Services
import { useLocation } from '../hooks/useLocation';
import { useWebSocket } from '../hooks/useWebSocket';
import ApiClient from '../api/client';

const { width, height } = Dimensions.get('window');

interface IncidentType {
  id: string;
  name: string;
  icon: string;
  color: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

interface IncidentReport {
  type: string;
  location: {
    lat: number;
    lng: number;
    address?: string;
  };
  description: string;
  severity: 'low' | 'medium' | 'high';
  photoUri?: string;
  audioUri?: string;
  videoUri?: string;
  anonymous: boolean;
  timestamp: number;
}

const incidentTypes: IncidentType[] = [
  {
    id: 'harassment',
    name: 'Harassment',
    icon: '😡',
    color: '#F44336',
    severity: 'high',
    description: 'Verbal or physical harassment, stalking, or threatening behavior',
  },
  {
    id: 'broken_light',
    name: 'Broken Street Light',
    icon: '💡',
    color: '#FF9800',
    severity: 'low',
    description: 'Non-functioning street light creating unsafe conditions',
  },
  {
    id: 'blocked_path',
    name: 'Blocked Path',
    icon: '🚧',
    color: '#FFC107',
    severity: 'medium',
    description: 'Sidewalk or path obstructed by construction, debris, or vehicles',
  },
  {
    id: 'suspicious_activity',
    name: 'Suspicious Activity',
    icon: '👀',
    color: '#9C27B0',
    severity: 'high',
    description: 'Unusual or suspicious behavior in the area',
  },
  {
    id: 'assault',
    name: 'Assault',
    icon: '🤛',
    color: '#D32F2F',
    severity: 'high',
    description: 'Physical assault or violent incident',
  },
  {
    id: 'unsafe_condition',
    name: 'Unsafe Condition',
    icon: '⚠️',
    color: '#F44336',
    severity: 'medium',
    description: 'General unsafe condition (ice, uneven pavement, poor visibility)',
  },
  {
    id: 'theft',
    name: 'Theft/Robbery',
    icon: '👛',
    color: '#E91E63',
    severity: 'high',
    description: 'Theft, pickpocketing, or robbery incident',
  },
  {
    id: 'medical',
    name: 'Medical Emergency',
    icon: '🚑',
    color: '#2196F3',
    severity: 'high',
    description: 'Medical emergency requiring assistance',
  },
];

const ReportIncidentScreen: React.FC<{ navigation: any; route?: any }> = ({ navigation, route }) => {
  const { location } = useLocation({ enabled: true });
  const { sendMessage } = useWebSocket({});
  
  const [selectedType, setSelectedType] = useState<IncidentType | null>(null);
  const [description, setDescription] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [currentLocationAddress, setCurrentLocationAddress] = useState<string>('');
  
  const audioPermissionRef = useRef<boolean>(false);
  const cameraPermissionRef = useRef<boolean>(false);

  useEffect(() => {
    requestPermissions();
    reverseGeocodeLocation();
  }, []);

  const requestPermissions = async () => {
    // Camera permission
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    cameraPermissionRef.current = cameraPermission.granted;
    
    // Audio permission
    const audioPermission = await Audio.requestPermissionsAsync();
    audioPermissionRef.current = audioPermission.granted;
  };

  const reverseGeocodeLocation = async () => {
    if (location) {
      try {
        // In production, use a geocoding service
        setCurrentLocationAddress(`${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`);
      } catch (error) {
        console.error('Failed to get address:', error);
      }
    }
  };

  const handleTakePhoto = async () => {
    if (!cameraPermissionRef.current) {
      Alert.alert('Permission Needed', 'Please grant camera permission to take photos');
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets[0].uri) {
        setPhotoUri(result.assets[0].uri);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Failed to take photo:', error);
      Alert.alert('Error', 'Failed to capture photo');
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0].uri) {
      setPhotoUri(result.assets[0].uri);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const startRecording = async () => {
    if (!audioPermissionRef.current) {
      Alert.alert('Permission Needed', 'Please grant microphone permission');
      return;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(newRecording);
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setAudioUri(uri);
      setIsRecording(false);
      setRecording(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  const handleSubmit = async () => {
    if (!selectedType) {
      Alert.alert('Missing Info', 'Please select an incident type');
      return;
    }

    if (!location) {
      Alert.alert('Location Error', 'Unable to get your current location');
      return;
    }

    setIsSubmitting(true);

    try {
      const report: IncidentReport = {
        type: selectedType.id,
        location: {
          lat: location.lat,
          lng: location.lng,
          address: currentLocationAddress,
        },
        description: description.trim(),
        severity: selectedType.severity,
        photoUri: photoUri || undefined,
        audioUri: audioUri || undefined,
        videoUri: videoUri || undefined,
        anonymous: anonymous,
        timestamp: Date.now(),
      };

      // Submit to backend
      const response = await ApiClient.reportIncident(report);
      
      // Send via WebSocket for real-time updates
      sendMessage('incident_report', {
        id: response.id,
        ...report,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowSuccessModal(true);

      // Reset form after 2 seconds and navigate back
      setTimeout(() => {
        setShowSuccessModal(false);
        navigation.goBack();
      }, 2000);
    } catch (error) {
      console.error('Failed to submit report:', error);
      Alert.alert(
        'Submission Failed',
        'Unable to submit incident report. Please check your connection and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return '#F44336';
      case 'medium': return '#FF9800';
      case 'low': return '#4CAF50';
      default: return '#999';
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Report Incident</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Location Info */}
        {location && (
          <View style={styles.locationCard}>
            <Text style={styles.locationIcon}>📍</Text>
            <View style={styles.locationInfo}>
              <Text style={styles.locationLabel}>Your Location</Text>
              <Text style={styles.locationAddress}>{currentLocationAddress}</Text>
            </View>
          </View>
        )}

        {/* Incident Types */}
        <Text style={styles.sectionTitle}>Select Incident Type</Text>
        <View style={styles.typesGrid}>
          {incidentTypes.map((type) => (
            <TouchableOpacity
              key={type.id}
              style={[
                styles.typeCard,
                selectedType?.id === type.id && styles.typeCardSelected,
                { borderLeftColor: type.color },
              ]}
              onPress={() => {
                setSelectedType(type);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Text style={styles.typeIcon}>{type.icon}</Text>
              <Text style={styles.typeName}>{type.name}</Text>
              {selectedType?.id === type.id && (
                <View style={styles.checkMark}>
                  <Text>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Description */}
        <Text style={styles.sectionTitle}>Description (Optional)</Text>
        <TextInput
          style={styles.descriptionInput}
          placeholder="Describe what happened..."
          placeholderTextColor="#999"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* Media Attachments */}
        <Text style={styles.sectionTitle}>Attachments</Text>
        <View style={styles.mediaButtons}>
          <TouchableOpacity style={styles.mediaButton} onPress={handleTakePhoto}>
            <Text style={styles.mediaIcon}>📷</Text>
            <Text style={styles.mediaText}>Camera</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.mediaButton} onPress={handlePickImage}>
            <Text style={styles.mediaIcon}>🖼️</Text>
            <Text style={styles.mediaText}>Gallery</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.mediaButton, isRecording && styles.recordingButton]}
            onPress={isRecording ? stopRecording : startRecording}
          >
            <Text style={styles.mediaIcon}>{isRecording ? '⏹️' : '🎙️'}</Text>
            <Text style={styles.mediaText}>{isRecording ? 'Stop' : 'Record'}</Text>
          </TouchableOpacity>
        </View>

        {/* Media Preview */}
        {(photoUri || audioUri || videoUri) && (
          <View style={styles.mediaPreview}>
            {photoUri && (
              <View style={styles.previewItem}>
                <Image source={{ uri: photoUri }} style={styles.previewImage} />
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => setPhotoUri(null)}
                >
                  <Text style={styles.removeText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
            {audioUri && (
              <View style={styles.audioPreview}>
                <Text style={styles.audioIcon}>🎵</Text>
                <Text style={styles.audioText}>Audio Recording</Text>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => setAudioUri(null)}
                >
                  <Text style={styles.removeText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Anonymous Option */}
        <View style={styles.anonymousContainer}>
          <Text style={styles.anonymousLabel}>Report Anonymously</Text>
          <TouchableOpacity
            style={[styles.checkbox, anonymous && styles.checkboxChecked]}
            onPress={() => setAnonymous(!anonymous)}
          >
            {anonymous && <Text style={styles.checkboxMark}>✓</Text>}
          </TouchableOpacity>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, (!selectedType || isSubmitting) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!selectedType || isSubmitting}
        >
          <LinearGradient
            colors={['#F44336', '#D32F2F']}
            style={styles.submitGradient}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitText}>Submit Report</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Note */}
        <Text style={styles.noteText}>
          Your report helps keep the community safe. All reports are reviewed and used to update safety heatmaps.
        </Text>
      </ScrollView>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.successModal}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Report Submitted</Text>
            <Text style={styles.successMessage}>
              Thank you for helping keep our community safe. Your report has been recorded.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
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
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    margin: 20,
    padding: 15,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  locationIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    color: '#333',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 12,
  },
  typesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 15,
  },
  typeCard: {
    width: (width - 50) / 3,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 5,
    marginBottom: 10,
    alignItems: 'center',
    borderLeftWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  typeCardSelected: {
    backgroundColor: '#F5F5F5',
    transform: [{ scale: 1.02 }],
  },
  typeIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  typeName: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
  },
  checkMark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  descriptionInput: {
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    padding: 15,
    borderRadius: 12,
    fontSize: 14,
    color: '#333',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  mediaButtons: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 15,
  },
  mediaButton: {
    flex: 1,
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 5,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  recordingButton: {
    backgroundColor: '#FFEBEE',
  },
  mediaIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  mediaText: {
    fontSize: 14,
    color: '#666',
  },
  mediaPreview: {
    marginHorizontal: 20,
    marginBottom: 15,
  },
  previewItem: {
    position: 'relative',
    marginBottom: 10,
  },
  previewImage: {
    width: '100%',
    height: 150,
    borderRadius: 12,
  },
  audioPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 10,
  },
  audioIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  audioText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  anonymousContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginVertical: 15,
    padding: 15,
    backgroundColor: '#FFF',
    borderRadius: 12,
  },
  anonymousLabel: {
    fontSize: 16,
    color: '#333',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CCC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  checkboxMark: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  submitButton: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  noteText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginHorizontal: 40,
    marginTop: 20,
    marginBottom: 30,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successModal: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    width: width * 0.8,
  },
  successIcon: {
    fontSize: 64,
    color: '#4CAF50',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  successMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default ReportIncidentScreen;
