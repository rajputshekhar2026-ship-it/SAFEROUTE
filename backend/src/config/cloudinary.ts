// src/config/cloudinary.ts

import { v2 as cloudinary } from 'cloudinary';
import { logger } from '../utils/logger';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Upload options interface
export interface UploadOptions {
  folder?: string;
  public_id?: string;
  overwrite?: boolean;
  invalidate?: boolean;
  resource_type?: 'auto' | 'image' | 'video' | 'raw';
  transformation?: any[];
  quality?: string | number;
  format?: string;
  width?: number;
  height?: number;
  crop?: string;
  gravity?: string;
  tags?: string[];
  context?: Record<string, string>;
}

class CloudinaryService {
  private isConfigured: boolean;

  constructor() {
    this.isConfigured = !!(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    );

    if (this.isConfigured) {
      logger.info('Cloudinary configured successfully');
    } else {
      logger.warn('Cloudinary not configured. File uploads will be stored locally.');
    }
  }

  /**
   * Upload file to Cloudinary
   */
  async uploadFile(
    filePath: string,
    options: UploadOptions = {}
  ): Promise<{ url: string; publicId: string; format: string; width: number; height: number } | null> {
    if (!this.isConfigured) {
      logger.warn('Cloudinary not configured, skipping upload');
      return null;
    }

    try {
      const uploadOptions: any = {
        folder: options.folder || 'safe-route',
        resource_type: options.resource_type || 'auto',
        quality: options.quality || 'auto',
        tags: options.tags || [],
        context: options.context || {},
      };

      if (options.public_id) {
        uploadOptions.public_id = options.public_id;
      }

      if (options.overwrite !== undefined) {
        uploadOptions.overwrite = options.overwrite;
      }

      if (options.invalidate !== undefined) {
        uploadOptions.invalidate = options.invalidate;
      }

      if (options.transformation) {
        uploadOptions.transformation = options.transformation;
      }

      const result = await cloudinary.uploader.upload(filePath, uploadOptions);

      logger.info(`File uploaded to Cloudinary: ${result.public_id}`);

      return {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
      };
    } catch (error) {
      logger.error('Cloudinary upload error:', error);
      return null;
    }
  }

  /**
   * Upload image with optimization for different device sizes
   */
  async uploadImage(
    filePath: string,
    options: UploadOptions = {}
  ): Promise<{
    original: string;
    thumbnail: string;
    medium: string;
    large: string;
    publicId: string;
  } | null> {
    if (!this.isConfigured) {
      return null;
    }

    try {
      const result = await this.uploadFile(filePath, {
        ...options,
        folder: `${options.folder || 'safe-route'}/images`,
      });

      if (!result) return null;

      // Generate different size URLs using Cloudinary transformations
      const baseUrl = result.url.split('/upload/')[0] + '/upload/';
      const publicId = result.publicId;

      return {
        original: result.url,
        thumbnail: `${baseUrl}w_150,h_150,c_fill/${publicId}`,
        medium: `${baseUrl}w_500,h_500,c_limit/${publicId}`,
        large: `${baseUrl}w_1200,h_1200,c_limit/${publicId}`,
        publicId: result.publicId,
      };
    } catch (error) {
      logger.error('Cloudinary image upload error:', error);
      return null;
    }
  }

  /**
   * Upload SOS audio recording
   */
  async uploadAudio(
    filePath: string,
    userId: string,
    sosId: string
  ): Promise<{ url: string; publicId: string; duration: number } | null> {
    if (!this.isConfigured) {
      return null;
    }

    try {
      const result = await cloudinary.uploader.upload(filePath, {
        folder: `safe-route/sos/${userId}/${sosId}`,
        resource_type: 'video', // Audio is treated as video type in Cloudinary
        public_id: `audio_${Date.now()}`,
        tags: ['sos', 'audio', userId, sosId],
        context: {
          user_id: userId,
          sos_id: sosId,
          type: 'sos_audio',
        },
      });

      logger.info(`SOS audio uploaded: ${result.public_id}`);

      return {
        url: result.secure_url,
        publicId: result.public_id,
        duration: result.duration || 0,
      };
    } catch (error) {
      logger.error('Cloudinary audio upload error:', error);
      return null;
    }
  }

  /**
   * Upload SOS photo
   */
  async uploadPhoto(
    filePath: string,
    userId: string,
    sosId: string
  ): Promise<{ url: string; thumbnail: string; publicId: string } | null> {
    if (!this.isConfigured) {
      return null;
    }

    try {
      const result = await cloudinary.uploader.upload(filePath, {
        folder: `safe-route/sos/${userId}/${sosId}`,
        resource_type: 'image',
        public_id: `photo_${Date.now()}`,
        tags: ['sos', 'photo', userId, sosId],
        transformation: [{ quality: 'auto' }, { fetch_format: 'auto' }],
        context: {
          user_id: userId,
          sos_id: sosId,
          type: 'sos_photo',
        },
      });

      const thumbnailUrl = cloudinary.url(result.public_id, {
        transformation: [{ width: 300, height: 300, crop: 'fill', quality: 'auto' }],
      });

      logger.info(`SOS photo uploaded: ${result.public_id}`);

      return {
        url: result.secure_url,
        thumbnail: thumbnailUrl,
        publicId: result.public_id,
      };
    } catch (error) {
      logger.error('Cloudinary photo upload error:', error);
      return null;
    }
  }

  /**
   * Upload incident report media
   */
  async uploadIncidentMedia(
    filePath: string,
    reportId: number,
    mediaType: 'image' | 'video' | 'audio'
  ): Promise<{ url: string; publicId: string; mediaType: string } | null> {
    if (!this.isConfigured) {
      return null;
    }

    try {
      const resourceType = mediaType === 'audio' ? 'video' : mediaType;
      const result = await cloudinary.uploader.upload(filePath, {
        folder: `safe-route/reports/${reportId}`,
        resource_type: resourceType,
        public_id: `${mediaType}_${Date.now()}`,
        tags: ['incident_report', mediaType, `report_${reportId}`],
        context: {
          report_id: reportId.toString(),
          media_type: mediaType,
        },
      });

      logger.info(`Incident media uploaded: ${result.public_id}`);

      return {
        url: result.secure_url,
        publicId: result.public_id,
        mediaType,
      };
    } catch (error) {
      logger.error('Cloudinary incident media upload error:', error);
      return null;
    }
  }

  /**
   * Delete file from Cloudinary
   */
  async deleteFile(publicId: string): Promise<boolean> {
    if (!this.isConfigured) {
      return false;
    }

    try {
      const result = await cloudinary.uploader.destroy(publicId);
      
      if (result.result === 'ok') {
        logger.info(`File deleted from Cloudinary: ${publicId}`);
        return true;
      }
      
      logger.warn(`File not found on Cloudinary: ${publicId}`);
      return false;
    } catch (error) {
      logger.error('Cloudinary delete error:', error);
      return false;
    }
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(publicIds: string[]): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (const publicId of publicIds) {
      const deleted = await this.deleteFile(publicId);
      if (deleted) {
        success.push(publicId);
      } else {
        failed.push(publicId);
      }
    }

    return { success, failed };
  }

  /**
   * Get optimized URL for image
   */
  getOptimizedImageUrl(publicId: string, options: {
    width?: number;
    height?: number;
    crop?: string;
    quality?: number;
    format?: string;
  } = {}): string {
    if (!this.isConfigured) {
      return '';
    }

    const transformations: any[] = [];

    if (options.width || options.height) {
      transformations.push({
        width: options.width,
        height: options.height,
        crop: options.crop || 'limit',
      });
    }

    if (options.quality) {
      transformations.push({ quality: options.quality });
    }

    if (options.format) {
      transformations.push({ fetch_format: options.format });
    }

    transformations.push({ fetch_format: 'auto', quality: 'auto' });

    return cloudinary.url(publicId, {
      transformation: transformations,
      secure: true,
    });
  }

  /**
   * Get video thumbnail URL
   */
  getVideoThumbnail(publicId: string, timeSeconds: number = 0): string {
    if (!this.isConfigured) {
      return '';
    }

    return cloudinary.url(publicId, {
      resource_type: 'video',
      transformation: [
        { start_offset: timeSeconds },
        { width: 300, height: 200, crop: 'fill' },
      ],
      secure: true,
    });
  }

  /**
   * Generate signed URL for secure upload (client-side)
   */
  generateUploadSignature(options: UploadOptions = {}): { signature: string; timestamp: number; apiKey: string } {
    const timestamp = Math.round(Date.now() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp,
        folder: options.folder || 'safe-route',
        ...options,
      },
      process.env.CLOUDINARY_API_SECRET!
    );

    return {
      signature,
      timestamp,
      apiKey: process.env.CLOUDINARY_API_KEY!,
    };
  }

  /**
   * Get upload preset for client-side uploads
   */
  getUploadPreset(): string | undefined {
    return process.env.CLOUDINARY_UPLOAD_PRESET;
  }

  /**
   * Check if Cloudinary is configured
   */
  isReady(): boolean {
    return this.isConfigured;
  }
}

// Export singleton instance
export const cloudinaryService = new CloudinaryService();

// Export individual functions for convenience
export const uploadFile = (filePath: string, options?: UploadOptions) =>
  cloudinaryService.uploadFile(filePath, options);

export const uploadImage = (filePath: string, options?: UploadOptions) =>
  cloudinaryService.uploadImage(filePath, options);

export const uploadAudio = (filePath: string, userId: string, sosId: string) =>
  cloudinaryService.uploadAudio(filePath, userId, sosId);

export const uploadPhoto = (filePath: string, userId: string, sosId: string) =>
  cloudinaryService.uploadPhoto(filePath, userId, sosId);

export const deleteFromCloudinary = (publicId: string) =>
  cloudinaryService.deleteFile(publicId);

export default cloudinaryService;
