// src/services/CameraService.ts

import { Camera, CameraType, FlashMode, AutoFocus, WhiteBalance } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface CameraOptions {
  quality?: number; // 0-1
  base64?: boolean;
  exif?: boolean;
  allowsEditing?: boolean;
  aspect?: [number, number];
}

export interface PhotoResult {
  uri: string;
  width: number;
  height: number;
  base64?: string;
  exif?: Record<string, any>;
  timestamp: number;
  size: number;
}

export interface VideoResult {
  uri: string;
  duration: number;
  width: number;
  height: number;
  timestamp: number;
  size: number;
}

class CameraServiceClass {
  private cameraRef: Camera | null = null;
  private currentCameraType: CameraType = CameraType.back;
  private isRecording = false;

  constructor() {
    this.initializeCamera();
  }

  private async initializeCamera() {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Camera permission not granted');
      }
    } catch (error) {
      console.error('Failed to initialize camera:', error);
    }
  }

  /**
   * Request camera permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Failed to request camera permissions:', error);
      return false;
    }
  }

  /**
   * Request media library permissions
   */
  async requestMediaLibraryPermissions(): Promise<boolean> {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Failed to request media library permissions:', error);
      return false;
    }
  }

  /**
   * Take a photo using the camera
   */
  async takePhoto(options: CameraOptions = {}): Promise<PhotoResult | null> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Camera permission not granted');
    }

    if (!this.cameraRef) {
      throw new Error('Camera not initialized');
    }

    try {
      const photoOptions: Camera.TakePictureOptions = {
        quality: options.quality || 0.8,
        base64: options.base64 || false,
        exif: options.exif || false,
        skipProcessing: false,
      };

      const photo = await this.cameraRef.takePictureAsync(photoOptions);
      
      // Get file size
      const fileInfo = await FileSystem.getInfoAsync(photo.uri);
      const size = fileInfo.exists ? fileInfo.size : 0;

      const result: PhotoResult = {
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
        timestamp: Date.now(),
        size,
      };

      if (photo.base64) {
        result.base64 = photo.base64;
      }
      if (photo.exif) {
        result.exif = photo.exif;
      }

      return result;
    } catch (error) {
      console.error('Failed to take photo:', error);
      return null;
    }
  }

  /**
   * Pick an image from the gallery
   */
  async pickImage(options: CameraOptions = {}): Promise<PhotoResult | null> {
    const hasPermission = await this.requestMediaLibraryPermissions();
    if (!hasPermission) {
      throw new Error('Media library permission not granted');
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: options.allowsEditing || true,
        quality: options.quality || 0.8,
        base64: options.base64 || false,
        exif: options.exif || false,
        aspect: options.aspect || [4, 3],
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        
        // Get file size
        const fileInfo = await FileSystem.getInfoAsync(asset.uri);
        const size = fileInfo.exists ? fileInfo.size : 0;

        const photoResult: PhotoResult = {
          uri: asset.uri,
          width: asset.width || 0,
          height: asset.height || 0,
          timestamp: Date.now(),
          size,
        };

        if (asset.base64) {
          photoResult.base64 = asset.base64;
        }
        if (asset.exif) {
          photoResult.exif = asset.exif;
        }

        return photoResult;
      }
      return null;
    } catch (error) {
      console.error('Failed to pick image:', error);
      return null;
    }
  }

  /**
   * Take multiple photos
   */
  async takeMultiplePhotos(count: number, options: CameraOptions = {}): Promise<PhotoResult[]> {
    const photos: PhotoResult[] = [];
    for (let i = 0; i < count; i++) {
      const photo = await this.takePhoto(options);
      if (photo) {
        photos.push(photo);
      }
      // Small delay between shots
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return photos;
  }

  /**
   * Record a video
   */
  async recordVideo(options: { maxDuration?: number; quality?: number } = {}): Promise<VideoResult | null> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Camera permission not granted');
    }

    if (!this.cameraRef) {
      throw new Error('Camera not initialized');
    }

    if (this.isRecording) {
      await this.stopRecording();
    }

    try {
      const videoOptions: Camera.RecordVideoOptions = {
        maxDuration: options.maxDuration || 30,
        quality: options.quality || Camera.VideoQuality['720p'],
      };

      this.isRecording = true;
      const video = await this.cameraRef.recordAsync(videoOptions);
      this.isRecording = false;

      // Get file size
      const fileInfo = await FileSystem.getInfoAsync(video.uri);
      const size = fileInfo.exists ? fileInfo.size : 0;

      const result: VideoResult = {
        uri: video.uri,
        duration: video.duration || 0,
        width: video.width || 0,
        height: video.height || 0,
        timestamp: Date.now(),
        size,
      };

      return result;
    } catch (error) {
      console.error('Failed to record video:', error);
      this.isRecording = false;
      return null;
    }
  }

  /**
   * Stop video recording
   */
  async stopRecording(): Promise<void> {
    if (this.cameraRef && this.isRecording) {
      await this.cameraRef.stopRecording();
      this.isRecording = false;
    }
  }

  /**
   * Pick a video from the gallery
   */
  async pickVideo(): Promise<VideoResult | null> {
    const hasPermission = await this.requestMediaLibraryPermissions();
    if (!hasPermission) {
      throw new Error('Media library permission not granted');
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        
        // Get file size
        const fileInfo = await FileSystem.getInfoAsync(asset.uri);
        const size = fileInfo.exists ? fileInfo.size : 0;

        return {
          uri: asset.uri,
          duration: asset.duration || 0,
          width: asset.width || 0,
          height: asset.height || 0,
          timestamp: Date.now(),
          size,
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to pick video:', error);
      return null;
    }
  }

  /**
   * Save photo to permanent storage
   */
  async savePhoto(photoUri: string, fileName: string): Promise<string | null> {
    try {
      const documentsDir = FileSystem.documentDirectory;
      const destination = `${documentsDir}photos/${fileName}`;

      // Create directory if it doesn't exist
      const dirInfo = await FileSystem.getInfoAsync(`${documentsDir}photos/`);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(`${documentsDir}photos/`, { intermediates: true });
      }

      // Copy file
      await FileSystem.copyAsync({
        from: photoUri,
        to: destination,
      });

      // Also save to camera roll
      await this.saveToCameraRoll(photoUri);

      return destination;
    } catch (error) {
      console.error('Failed to save photo:', error);
      return null;
    }
  }

  /**
   * Save to device camera roll
   */
  async saveToCameraRoll(uri: string): Promise<boolean> {
    try {
      if (Platform.OS === 'ios') {
        // On iOS, we need to use MediaLibrary
        const { MediaLibrary } = require('expo-media-library');
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(uri);
          return true;
        }
      } else {
        // On Android, we can use CameraRoll
        const { CameraRoll } = require('@react-native-camera-roll/camera-roll');
        await CameraRoll.save(uri, { type: 'photo' });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to save to camera roll:', error);
      return false;
    }
  }

  /**
   * Delete photo file
   */
  async deletePhoto(uri: string): Promise<boolean> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(uri);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to delete photo:', error);
      return false;
    }
  }

  /**
   * Compress image
   */
  async compressImage(uri: string, quality: number = 0.7): Promise<string | null> {
    try {
      const manipulatedImage = await ImagePicker.manipulateImageAsync(
        uri,
        [{ resize: { width: 1024 } }],
        { compress: quality, format: ImagePicker.ImageFormat.JPEG }
      );
      return manipulatedImage.uri;
    } catch (error) {
      console.error('Failed to compress image:', error);
      return null;
    }
  }

  /**
   * Get image dimensions
   */
  async getImageDimensions(uri: string): Promise<{ width: number; height: number } | null> {
    try {
      // For remote images, we would need to download first
      // For local images, we can use Image.getSize
      return new Promise((resolve) => {
        if (Platform.OS === 'web') {
          const img = new Image();
          img.onload = () => {
            resolve({ width: img.width, height: img.height });
          };
          img.onerror = () => resolve(null);
          img.src = uri;
        } else {
          // React Native's Image doesn't have getSize in all contexts
          // Using expo-image instead
          resolve(null);
        }
      });
    } catch (error) {
      console.error('Failed to get image dimensions:', error);
      return null;
    }
  }

  /**
   * Convert photo to base64
   */
  async photoToBase64(uri: string): Promise<string | null> {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return base64;
    } catch (error) {
      console.error('Failed to convert photo to base64:', error);
      return null;
    }
  }

  /**
   * Set camera reference
   */
  setCameraRef(camera: Camera | null) {
    this.cameraRef = camera;
  }

  /**
   * Switch camera type (front/back)
   */
  switchCamera(): CameraType {
    this.currentCameraType = this.currentCameraType === CameraType.back 
      ? CameraType.front 
      : CameraType.back;
    return this.currentCameraType;
  }

  /**
   * Get current camera type
   */
  getCurrentCameraType(): CameraType {
    return this.currentCameraType;
  }

  /**
   * Check if currently recording
   */
  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Flash modes
   */
  getFlashModes() {
    return {
      auto: FlashMode.auto,
      on: FlashMode.on,
      off: FlashMode.off,
      torch: FlashMode.torch,
    };
  }

  /**
   * Auto focus modes
   */
  getAutoFocusModes() {
    return {
      auto: AutoFocus.auto,
      on: AutoFocus.on,
      off: AutoFocus.off,
    };
  }

  /**
   * White balance modes
   */
  getWhiteBalanceModes() {
    return {
      auto: WhiteBalance.auto,
      sunny: WhiteBalance.sunny,
      cloudy: WhiteBalance.cloudy,
      shadow: WhiteBalance.shadow,
      incandescent: WhiteBalance.incandescent,
      fluorescent: WhiteBalance.fluorescent,
    };
  }

  /**
   * Generate a unique filename for photos
   */
  generatePhotoFilename(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `photo_${timestamp}_${random}.jpg`;
  }

  /**
   * Generate a unique filename for videos
   */
  generateVideoFilename(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `video_${timestamp}_${random}.mp4`;
  }
}

// Export singleton instance
export const CameraService = new CameraServiceClass();
export default CameraService;
