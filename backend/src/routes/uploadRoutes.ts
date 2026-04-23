// src/routes/uploadRoutes.ts

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { uploadService, multerUploads } from '../services/uploadService';
import { logger } from '../utils/logger';

const router = Router();

// All upload routes require authentication
router.use(authenticate);

/**
 * Upload single image
 * POST /api/upload/image
 */
router.post('/image', multerUploads.singleImage, async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const result = await uploadService.uploadImage(req.file, {
      folder: `safe-route/users/${req.user!.id}/uploads`,
    });

    res.json({
      message: 'Image uploaded successfully',
      file: result,
    });
  } catch (error) {
    logger.error('Image upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

/**
 * Upload multiple images
 * POST /api/upload/images
 */
router.post('/images', multerUploads.multipleImages, async (req, res) => {
  try {
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const files = req.files as Express.Multer.File[];
    const results = await uploadService.uploadMultipleImages(files, {
      folder: `safe-route/users/${req.user!.id}/uploads`,
    });

    res.json({
      message: `${results.length} images uploaded successfully`,
      files: results,
    });
  } catch (error) {
    logger.error('Multiple images upload error:', error);
    res.status(500).json({ error: 'Failed to upload images' });
  }
});

/**
 * Upload audio file
 * POST /api/upload/audio
 */
router.post('/audio', multerUploads.singleAudio, async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const result = await uploadService.uploadAudio(req.file, {
      folder: `safe-route/users/${req.user!.id}/audio`,
    });

    res.json({
      message: 'Audio uploaded successfully',
      file: result,
    });
  } catch (error) {
    logger.error('Audio upload error:', error);
    res.status(500).json({ error: 'Failed to upload audio' });
  }
});

/**
 * Upload video file
 * POST /api/upload/video
 */
router.post('/video', multerUploads.singleVideo, async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const result = await uploadService.uploadVideo(req.file, {
      folder: `safe-route/users/${req.user!.id}/videos`,
    });

    res.json({
      message: 'Video uploaded successfully',
      file: result,
    });
  } catch (error) {
    logger.error('Video upload error:', error);
    res.status(500).json({ error: 'Failed to upload video' });
  }
});

/**
 * Upload avatar
 * POST /api/upload/avatar
 */
router.post('/avatar', multerUploads.singleImage, async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const result = await uploadService.uploadAvatar(req.file, req.user!.id);

    // Update user's avatar URL in database
    // await UserModel.update(req.user!.id, { avatar: result.url });

    res.json({
      message: 'Avatar uploaded successfully',
      avatar: result,
    });
  } catch (error) {
    logger.error('Avatar upload error:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

/**
 * Delete file
 * DELETE /api/upload/:publicId
 */
router.delete('/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    const deleted = await uploadService.deleteFile(publicId);

    if (deleted) {
      res.json({ message: 'File deleted successfully' });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    logger.error('File delete error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;
