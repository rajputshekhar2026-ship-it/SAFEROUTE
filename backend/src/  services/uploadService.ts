// backend/src/services/uploadService.ts

import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { Request } from 'express';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

// Types
export interface UploadOptions {
  folder?: string;
  allowedFormats?: string[];
  maxSize?: number;
  quality?: number;
}

export interface UploadResult {
  url: string;
  publicId: string;
  format: string;
  width: number;
  height: number;
  size: number;
  createdAt: Date;
}

export interface ImageUploadResult extends UploadResult {
  thumbnail: string;
  medium: string;
  large: string;
}

export interface VideoUploadResult extends UploadResult {
  duration: number;
  thumbnail: string;
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Configure multer for memory storage (for processing before upload)
const memoryStorage = multer.memoryStorage();
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/temp');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

// File filter for images
const imageFileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WEBP images are allowed.'));
  }
};

// File filter for audio
const audioFileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav', 'audio/aac', 'audio/ogg'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only MP3, WAV, AAC, and OGG audio files are allowed.'));
  }
};

// File filter for video
const videoFileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only MP4, MPEG, MOV, and AVI videos are allowed.'));
  }
};

// Multer upload instances
export const uploadImage = multer({
  storage: memoryStorage,
  limits: {
    fileSize: parseInt(process.env.MAX_IMAGE_SIZE || '5242880'), // 5MB default
  },
  fileFilter: imageFileFilter,
});

export const uploadAudio = multer({
  storage: memoryStorage,
  limits: {
    fileSize: parseInt(process.env.MAX_AUDIO_SIZE || '10485760'), // 10MB default
  },
  fileFilter: audioFileFilter,
});

export const uploadVideo = multer({
  storage: diskStorage,
  limits: {
    fileSize: parseInt(process.env.MAX_VIDEO_SIZE || '52428800'), // 50MB default
  },
  fileFilter: videoFileFilter,
});

export const uploadMultiple = multer({
  storage: memoryStorage,
  limits: {
    fileSize: parseInt(process.env.MAX_IMAGE_SIZE || '5242880'),
  },
  fileFilter: imageFileFilter,
});

class UploadService {
  private isCloudinaryConfigured: boolean;

  constructor() {
    this.isCloudinaryConfigured = !!(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    );
  }

  /**
   * Upload image to Cloudinary
   */
  async uploadImage(
    file: Express.Multer.File,
    options: UploadOptions = {}
  ): Promise<ImageUploadResult | null> {
    if (!this.isCloudinaryConfigured) {
      logger.warn('Cloudinary not configured, using local storage fallback');
      return this.saveLocally(file, 'images') as Promise<ImageUploadResult | null>;
    }

    try {
      const result = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: options.folder || 'safe-route/images',
            resource_type: 'image',
            quality: options.quality || 'auto',
            format: 'webp',
            transformation: [{ quality: 'auto' }, { fetch_format: 'auto' }],
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );

        uploadStream.end(file.buffer);
      });

      // Generate different size URLs
      const baseUrl = result.secure_url.split('/upload/')[0] + '/upload/';
      const publicId = result.public_id;

      return {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        size: result.bytes,
        createdAt: new Date(),
        thumbnail: `${baseUrl}w_150,h_150,c_fill/${publicId}`,
        medium: `${baseUrl}w_500,h_500,c_limit/${publicId}`,
        large: `${baseUrl}w_1200,h_1200,c_limit/${publicId}`,
      };
    } catch (error) {
      logger.error('Cloudinary image upload error:', error);
      return this.saveLocally(file, 'images') as Promise<ImageUploadResult | null>;
    }
  }

  /**
   * Upload multiple images
   */
  async uploadMultipleImages(
    files: Express.Multer.File[],
    options: UploadOptions = {}
  ): Promise<ImageUploadResult[]> {
    const results: ImageUploadResult[] = [];
    for (const file of files) {
      const result = await this.uploadImage(file, options);
      if (result) results.push(result);
    }
    return results;
  }

  /**
   * Upload audio file
   */
  async uploadAudio(
    file: Express.Multer.File,
    options: UploadOptions = {}
  ): Promise<UploadResult | null> {
    if (!this.isCloudinaryConfigured) {
      logger.warn('Cloudinary not configured, using local storage fallback');
      return this.saveLocally(file, 'audio');
    }

    try {
      const result = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: options.folder || 'safe-route/audio',
            resource_type: 'video', // Audio is treated as video in Cloudinary
            quality: options.quality || 'auto',
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );

        uploadStream.end(file.buffer);
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        width: 0,
        height: 0,
        size: result.bytes,
        createdAt: new Date(),
      };
    } catch (error) {
      logger.error('Cloudinary audio upload error:', error);
      return this.saveLocally(file, 'audio');
    }
  }

  /**
   * Upload video file
   */
  async uploadVideo(
    file: Express.Multer.File,
    options: UploadOptions = {}
  ): Promise<VideoUploadResult | null> {
    if (!this.isCloudinaryConfigured) {
      logger.warn('Cloudinary not configured, using local storage fallback');
      return this.saveLocally(file, 'videos') as Promise<VideoUploadResult | null>;
    }

    try {
      const result = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: options.folder || 'safe-route/videos',
            resource_type: 'video',
            quality: options.quality || 'auto',
            eager: [
              { width: 300, height: 200, crop: 'fill', format: 'jpg' }, // Thumbnail
            ],
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );

        uploadStream.end(file.buffer);
      });

      const thumbnailUrl = result.eager?.[0]?.secure_url || '';

      return {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        size: result.bytes,
        duration: result.duration || 0,
        thumbnail: thumbnailUrl,
        createdAt: new Date(),
      };
    } catch (error) {
      logger.error('Cloudinary video upload error:', error);
      return this.saveLocally(file, 'videos') as Promise<VideoUploadResult | null>;
    }
  }

  /**
   * Upload SOS photo (special handling)
   */
  async uploadSOSPhoto(
    file: Express.Multer.File,
    userId: string,
    sosId: string
  ): Promise<ImageUploadResult | null> {
    return this.uploadImage(file, {
      folder: `safe-route/sos/${userId}/${sosId}/photos`,
    });
  }

  /**
   * Upload SOS audio (special handling)
   */
  async uploadSOSAudio(
    file: Express.Multer.File,
    userId: string,
    sosId: string
  ): Promise<UploadResult | null> {
    return this.uploadAudio(file, {
      folder: `safe-route/sos/${userId}/${sosId}/audio`,
    });
  }

  /**
   * Upload incident report media
   */
  async uploadIncidentMedia(
    file: Express.Multer.File,
    reportId: string,
    mediaType: 'image' | 'audio' | 'video'
  ): Promise<UploadResult | null> {
    const folder = `safe-route/reports/${reportId}/${mediaType}s`;
    
    switch (mediaType) {
      case 'image':
        return this.uploadImage(file, { folder });
      case 'audio':
        return this.uploadAudio(file, { folder });
      case 'video':
        return this.uploadVideo(file, { folder });
      default:
        return null;
    }
  }

  /**
   * Upload user avatar
   */
  async uploadAvatar(
    file: Express.Multer.File,
    userId: string
  ): Promise<ImageUploadResult | null> {
    return this.uploadImage(file, {
      folder: `safe-route/users/${userId}/avatar`,
    });
  }

  /**
   * Save file locally (fallback when Cloudinary is not configured)
   */
  private async saveLocally(
    file: Express.Multer.File,
    subfolder: string
  ): Promise<UploadResult | null> {
    try {
      const uploadDir = path.join(__dirname, `../../uploads/${subfolder}`);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const filename = `${uniqueSuffix}-${file.originalname}`;
      const filepath = path.join(uploadDir, filename);

      // Write file to disk
      fs.writeFileSync(filepath, file.buffer);

      const stats = fs.statSync(filepath);
      const url = `${process.env.API_URL}/uploads/${subfolder}/${filename}`;

      return {
        url,
        publicId: filename,
        format: path.extname(filename).substring(1),
        width: 0,
        height: 0,
        size: stats.size,
        createdAt: new Date(),
      };
    } catch (error) {
      logger.error('Local file save error:', error);
      return null;
    }
  }

  /**
   * Delete file from Cloudinary by public ID
   */
  async deleteFile(publicId: string): Promise<boolean> {
    if (!this.isCloudinaryConfigured) {
      return this.deleteLocalFile(publicId);
    }

    try {
      const result = await cloudinary.uploader.destroy(publicId);
      if (result.result === 'ok') {
        logger.info(`File deleted from Cloudinary: ${publicId}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Cloudinary delete error:', error);
      return false;
    }
  }

  /**
   * Delete local file
   */
  private deleteLocalFile(filename: string): boolean {
    try {
      // Search for file in uploads directory
      const uploadsDir = path.join(__dirname, '../../uploads');
      const findFile = (dir: string): string | null => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            const found = findFile(filePath);
            if (found) return found;
          } else if (file === filename || file.includes(filename)) {
            return filePath;
          }
        }
        return null;
      };

      const filePath = findFile(uploadsDir);
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info(`Local file deleted: ${filePath}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Local file delete error:', error);
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
   * Get optimized image URL with transformations
   */
  getOptimizedImageUrl(publicId: string, options: {
    width?: number;
    height?: number;
    crop?: 'fill' | 'limit' | 'fit' | 'scale' | 'pad' | 'thumb';
    quality?: number;
    format?: 'jpg' | 'png' | 'webp' | 'auto';
  } = {}): string {
    if (!this.isCloudinaryConfigured || !publicId.startsWith('http')) {
      // For local files or non-Cloudinary URLs
      return publicId;
    }

    const transformations: string[] = [];
    
    if (options.width || options.height) {
      transformations.push(`w_${options.width || 'auto'},h_${options.height || 'auto'},c_${options.crop || 'limit'}`);
    }
    
    if (options.quality) {
      transformations.push(`q_${options.quality}`);
    }
    
    if (options.format && options.format !== 'auto') {
      transformations.push(`f_${options.format}`);
    }
    
    transformations.push('q_auto,f_auto');
    
    // Cloudinary URL format: https://res.cloudinary.com/cloud_name/image/upload/transformations/publicId
    const urlParts = publicId.split('/upload/');
    if (urlParts.length === 2) {
      return `${urlParts[0]}/upload/${transformations.join(',')}/${urlParts[1]}`;
    }
    
    return publicId;
  }

  /**
   * Check if Cloudinary is configured
   */
  isCloudinaryReady(): boolean {
    return this.isCloudinaryConfigured;
  }

  /**
   * Clean up temporary files older than 1 hour
   */
  async cleanupTempFiles(): Promise<number> {
    const tempDir = path.join(__dirname, '../../uploads/temp');
    if (!fs.existsSync(tempDir)) return 0;

    let deletedCount = 0;
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      if (stats.mtimeMs < oneHourAgo) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }

    return deletedCount;
  }
}

// Export singleton instance
export const uploadService = new UploadService();

// Export multer instances for routes
export const multerUploads = {
  singleImage: uploadImage.single('image'),
  singleAudio: uploadAudio.single('audio'),
  singleVideo: uploadVideo.single('video'),
  multipleImages: uploadMultiple.array('images', 10),
  sosPhoto: uploadImage.single('photo'),
  sosAudio: uploadAudio.single('audio'),
};

export default uploadService;
