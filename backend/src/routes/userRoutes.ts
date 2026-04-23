// src/routes/userRoutes.ts

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserModelInstance } from '../models/User';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Get current user profile
 * GET /api/users/profile
 */
router.get('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const user = await UserModelInstance.findById(userId);
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    // Remove sensitive data
    const { passwordHash, ...safeUser } = user;
    
    res.json({ user: safeUser });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * Update user profile
 * PUT /api/users/profile
 */
router.put('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { name, phone } = req.body;
    
    const user = await UserModelInstance.update(userId, { name, phone });
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    const { passwordHash, ...safeUser } = user;
    
    res.json({ message: 'Profile updated successfully', user: safeUser });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * Update user preferences
 * PUT /api/users/preferences
 */
router.put('/preferences', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const preferences = req.body;
    
    const user = await UserModelInstance.updatePreferences(userId, preferences);
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    res.json({ message: 'Preferences updated successfully', preferences: user.preferences });
  } catch (error) {
    logger.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * Get emergency contacts
 * GET /api/users/emergency-contacts
 */
router.get('/emergency-contacts', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const user = await UserModelInstance.findById(userId);
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    res.json({ emergencyContacts: user.emergencyContacts });
  } catch (error) {
    logger.error('Get emergency contacts error:', error);
    res.status(500).json({ error: 'Failed to get emergency contacts' });
  }
});

/**
 * Update emergency contacts
 * PUT /api/users/emergency-contacts
 */
router.put('/emergency-contacts', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { emergencyContacts } = req.body;
    
    const user = await UserModelInstance.update(userId, { emergencyContacts });
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    res.json({ message: 'Emergency contacts updated successfully', emergencyContacts: user.emergencyContacts });
  } catch (error) {
    logger.error('Update emergency contacts error:', error);
    res.status(500).json({ error: 'Failed to update emergency contacts' });
  }
});

/**
 * Add emergency contact
 * POST /api/users/emergency-contacts
 */
router.post('/emergency-contacts', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const contact = req.body;
    
    const user = await UserModelInstance.addEmergencyContact(userId, contact);
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    res.status(201).json({ message: 'Emergency contact added successfully', contact: user.emergencyContacts[user.emergencyContacts.length - 1] });
  } catch (error) {
    logger.error('Add emergency contact error:', error);
    res.status(500).json({ error: 'Failed to add emergency contact' });
  }
});

/**
 * Delete emergency contact
 * DELETE /api/users/emergency-contacts/:contactId
 */
router.delete('/emergency-contacts/:contactId', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { contactId } = req.params;
    
    const user = await UserModelInstance.removeEmergencyContact(userId, contactId);
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    res.json({ message: 'Emergency contact removed successfully' });
  } catch (error) {
    logger.error('Delete emergency contact error:', error);
    res.status(500).json({ error: 'Failed to delete emergency contact' });
  }
});

/**
 * Get user statistics (admin only)
 * GET /api/users/statistics
 */
router.get('/statistics', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { days } = req.query;
    const stats = await UserModelInstance.getStatistics(days ? parseInt(days as string) : 30);
    
    res.json(stats);
  } catch (error) {
    logger.error('Get user statistics error:', error);
    res.status(500).json({ error: 'Failed to get user statistics' });
  }
});

/**
 * Get all users (admin only)
 * GET /api/users/all?page=1&limit=20&search=john&role=user
 */
router.get('/all', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { page, limit, search, role, isVerified, isActive } = req.query;
    
    const result = await UserModelInstance.findAll({
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
      search: search as string,
      role: role as string,
      isVerified: isVerified === 'true',
      isActive: isActive === 'true',
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

/**
 * Get user by ID (admin only)
 * GET /api/users/:userId
 */
router.get('/:userId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await UserModelInstance.findById(userId);
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    const { passwordHash, ...safeUser } = user;
    
    res.json({ user: safeUser });
  } catch (error) {
    logger.error('Get user by ID error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

/**
 * Update user role (admin only)
 * PUT /api/users/:userId/role
 */
router.put('/:userId/role', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    const user = await UserModelInstance.update(userId, { role });
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    res.json({ message: 'User role updated successfully', role: user.role });
  } catch (error) {
    logger.error('Update user role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

/**
 * Delete user (admin only)
 * DELETE /api/users/:userId
 */
router.delete('/:userId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Don't allow self-deletion
    if (userId === req.user!.id) {
      res.status(400).json({ error: 'Cannot delete your own account through admin endpoint' });
      return;
    }
    
    const deleted = await UserModelInstance.softDelete(userId);
    
    if (!deleted) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
