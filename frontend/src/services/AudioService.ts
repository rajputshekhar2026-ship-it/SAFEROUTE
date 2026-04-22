// src/services/AudioService.ts

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface AudioRecordingOptions {
  duration?: number; // in milliseconds
  quality?: 'low' | 'medium' | 'high';
  keepAfterRecording?: boolean;
}

export interface AudioRecording {
  uri: string;
  duration: number;
  size: number;
  timestamp: number;
}

class AudioServiceClass {
  private recording: Audio.Recording | null = null;
  private sound: Audio.Sound | null = null;
  private isRecording = false;
  private recordingStartTime = 0;
  private recordingTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeAudio();
  }

  private async initializeAudio() {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (error) {
      console.error('Failed to initialize audio:', error);
    }
  }

  /**
   * Request microphone permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const permission = await Audio.requestPermissionsAsync();
      return permission.granted;
    } catch (error) {
      console.error('Failed to request audio permissions:', error);
      return false;
    }
  }

  /**
   * Start recording audio
   */
  async startRecording(options: AudioRecordingOptions = {}): Promise<boolean> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Microphone permission not granted');
      }

      // Stop any existing recording
      if (this.recording) {
        await this.stopRecording();
      }

      const quality = options.quality || 'high';
      const recordingOptions: Audio.RecordingOptions = this.getRecordingOptions(quality);

      this.recording = new Audio.Recording();
      await this.recording.prepareToRecordAsync(recordingOptions);
      await this.recording.startAsync();

      this.isRecording = true;
      this.recordingStartTime = Date.now();

      // Auto-stop after duration if specified
      if (options.duration && options.duration > 0) {
        this.recordingTimer = setTimeout(() => {
          if (this.isRecording) {
            this.stopRecording();
          }
        }, options.duration);
      }

      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      return false;
    }
  }

  /**
   * Stop recording and return the recording data
   */
  async stopRecording(): Promise<AudioRecording | null> {
    if (!this.recording || !this.isRecording) {
      return null;
    }

    try {
      if (this.recordingTimer) {
        clearTimeout(this.recordingTimer);
        this.recordingTimer = null;
      }

      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      const duration = Date.now() - this.recordingStartTime;

      if (!uri) {
        throw new Error('No recording URI found');
      }

      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(uri);
      const size = fileInfo.exists ? fileInfo.size : 0;

      const recordingData: AudioRecording = {
        uri,
        duration,
        size,
        timestamp: Date.now(),
      };

      this.recording = null;
      this.isRecording = false;
      this.recordingStartTime = 0;

      return recordingData;
    } catch (error) {
      console.error('Failed to stop recording:', error);
      return null;
    }
  }

  /**
   * Cancel current recording without saving
   */
  async cancelRecording(): Promise<void> {
    if (this.recording && this.isRecording) {
      try {
        await this.recording.stopAndUnloadAsync();
      } catch (error) {
        console.error('Failed to cancel recording:', error);
      } finally {
        this.recording = null;
        this.isRecording = false;
        this.recordingStartTime = 0;
        if (this.recordingTimer) {
          clearTimeout(this.recordingTimer);
          this.recordingTimer = null;
        }
      }
    }
  }

  /**
   * Record audio with automatic stop after duration
   */
  async recordAudio(durationMs: number = 5000): Promise<string | null> {
    const success = await this.startRecording({ duration: durationMs });
    if (!success) return null;

    // Wait for recording to complete
    return new Promise((resolve) => {
      const checkInterval = setInterval(async () => {
        if (!this.isRecording) {
          clearInterval(checkInterval);
          const recording = await this.stopRecording();
          resolve(recording?.uri || null);
        }
      }, 100);
    });
  }

  /**
   * Play audio from URI
   */
  async playAudio(uri: string): Promise<void> {
    try {
      // Stop any currently playing sound
      if (this.sound) {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true }
      );
      this.sound = sound;

      // Auto cleanup when done
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          this.sound = null;
          sound.unloadAsync();
        }
      });
    } catch (error) {
      console.error('Failed to play audio:', error);
      throw error;
    }
  }

  /**
   * Stop currently playing audio
   */
  async stopAudio(): Promise<void> {
    if (this.sound) {
      try {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
      } catch (error) {
        console.error('Failed to stop audio:', error);
      } finally {
        this.sound = null;
      }
    }
  }

  /**
   * Save recording to permanent storage
   */
  async saveRecording(recordingUri: string, fileName: string): Promise<string | null> {
    try {
      const documentsDir = FileSystem.documentDirectory;
      const destination = `${documentsDir}audio/${fileName}`;

      // Create directory if it doesn't exist
      const dirInfo = await FileSystem.getInfoAsync(`${documentsDir}audio/`);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(`${documentsDir}audio/`, { intermediates: true });
      }

      // Copy file
      await FileSystem.copyAsync({
        from: recordingUri,
        to: destination,
      });

      return destination;
    } catch (error) {
      console.error('Failed to save recording:', error);
      return null;
    }
  }

  /**
   * Delete recording file
   */
  async deleteRecording(uri: string): Promise<boolean> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(uri);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to delete recording:', error);
      return false;
    }
  }

  /**
   * Get recording options based on quality
   */
  private getRecordingOptions(quality: 'low' | 'medium' | 'high'): Audio.RecordingOptions {
    const baseOptions = {
      android: {
        extension: '.m4a',
        outputFormat: Audio.AndroidOutputFormat.MPEG_4,
        audioEncoder: Audio.AndroidAudioEncoder.AAC,
        sampleRate: quality === 'high' ? 44100 : quality === 'medium' ? 22050 : 16000,
        numberOfChannels: quality === 'high' ? 2 : 1,
        bitRate: quality === 'high' ? 128000 : quality === 'medium' ? 64000 : 32000,
      },
      ios: {
        extension: '.m4a',
        outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
        audioQuality: quality === 'high' ? Audio.IOSAudioQuality.MAX : 
                      quality === 'medium' ? Audio.IOSAudioQuality.MEDIUM : 
                      Audio.IOSAudioQuality.MIN,
        sampleRate: quality === 'high' ? 44100 : quality === 'medium' ? 22050 : 16000,
        numberOfChannels: quality === 'high' ? 2 : 1,
        bitRate: quality === 'high' ? 128000 : quality === 'medium' ? 64000 : 32000,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
      web: {
        mimeType: 'audio/webm',
        bitsPerSecond: quality === 'high' ? 128000 : quality === 'medium' ? 64000 : 32000,
      },
    };

    return baseOptions;
  }

  /**
   * Check if currently recording
   */
  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Get recording duration in milliseconds
   */
  getRecordingDuration(): number {
    if (!this.isRecording) return 0;
    return Date.now() - this.recordingStartTime;
  }

  /**
   * Format duration to readable string
   */
  formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
  }
}

// Export singleton instance
export const AudioService = new AudioServiceClass();
export default AudioService;
