// src/controllers/authController.ts

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { sendEmail } from '../services/emailService';
import { smsService } from '../services/smsService';
import { notificationService } from '../services/notificationService';
import { AuthRequest } from '../middleware/auth';
import { generateOTP, isValidEmail, isValidPhone } from '../utils/helpers';

// Types
interface TokenPayload {
  userId: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

interface RegisterBody {
  name: string;
  email: string;
  phone?: string;
  password: string;
  confirmPassword: string;
  emergencyContacts?: any[];
}

interface LoginBody {
  email: string;
  password: string;
}

interface VerifyOtpBody {
  email: string;
  otp: string;
}

interface ForgotPasswordBody {
  email: string;
}

interface ResetPasswordBody {
  token: string;
  password: string;
  confirmPassword: string;
}

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface UpdateProfileBody {
  name?: string;
  phone?: string;
  preferences?: any;
}

export class AuthController {
  /**
   * Register new user
   */
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { name, email, phone, password, confirmPassword, emergencyContacts }: RegisterBody = req.body;

      // Validate input
      if (!name || !email || !password) {
        res.status(400).json({ error: 'Name, email, and password are required' });
        return;
      }

      if (password !== confirmPassword) {
        res.status(400).json({ error: 'Passwords do not match' });
        return;
      }

      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
      }

      if (!isValidEmail(email)) {
        res.status(400).json({ error: 'Invalid email format' });
        return;
      }

      if (phone && !isValidPhone(phone)) {
        res.status(400).json({ error: 'Invalid phone number format' });
        return;
      }

      // Check if user exists
      const existingUser = await query(
        'SELECT id, email FROM users WHERE email = $1 OR phone = $2',
        [email.toLowerCase(), phone || '']
      );

      if (existingUser.rows.length > 0) {
        res.status(409).json({ error: 'User with this email or phone already exists' });
        return;
      }

      // Hash password
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(password, salt);

      // Create user
      const userId = uuidv4();
      const otp = generateOTP(6);
      const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await query(
        `INSERT INTO users (id, name, email, phone, password_hash, emergency_contacts, is_verified, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [userId, name, email.toLowerCase(), phone || null, passwordHash, JSON.stringify(emergencyContacts || []), false]
      );

      // Store OTP in Redis
      await redisClient.setex(`otp:${email.toLowerCase()}`, 600, otp);

      // Send verification email
      await sendEmail(email, 'Verify Your Email', 'verification', {
        name,
        otp,
        year: new Date().getFullYear(),
      });

      // Send SMS if phone provided
      if (phone) {
        await smsService.sendVerificationCode(phone, otp);
      }

      logger.info(`User registered: ${email} (${userId})`);

      res.status(201).json({
        message: 'Registration successful. Please verify your email.',
        userId,
        requiresVerification: true,
      });
    } catch (error) {
      logger.error('Registration error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Verify email with OTP
   */
  async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { email, otp }: VerifyOtpBody = req.body;

      if (!email || !otp) {
        res.status(400).json({ error: 'Email and OTP are required' });
        return;
      }

      // Get OTP from Redis
      const storedOtp = await redisClient.get(`otp:${email.toLowerCase()}`);
      
      if (!storedOtp || storedOtp !== otp) {
        res.status(400).json({ error: 'Invalid or expired OTP' });
        return;
      }

      // Update user as verified
      await query(
        'UPDATE users SET is_verified = true WHERE email = $1',
        [email.toLowerCase()]
      );

      // Delete OTP from Redis
      await redisClient.del(`otp:${email.toLowerCase()}`);

      // Generate tokens
      const user = await query('SELECT id, name, email, phone FROM users WHERE email = $1', [email.toLowerCase()]);
      const token = this.generateToken(user.rows[0].id);
      const refreshToken = this.generateRefreshToken(user.rows[0].id);

      // Store session
      await query(
        `INSERT INTO sessions (user_id, token, refresh_token, expires_at, last_activity)
         VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', NOW())`,
        [user.rows[0].id, token, refreshToken]
      );

      // Send welcome email
      await sendEmail(email, 'Welcome to SafeRoute', 'welcome', {
        name: user.rows[0].name,
        year: new Date().getFullYear(),
      });

      logger.info(`User verified: ${email}`);

      res.json({
        message: 'Email verified successfully',
        token,
        refreshToken,
        user: {
          id: user.rows[0].id,
          name: user.rows[0].name,
          email: user.rows[0].email,
          phone: user.rows[0].phone,
        },
      });
    } catch (error) {
      logger.error('Email verification error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Resend verification OTP
   */
  async resendVerification(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({ error: 'Email is required' });
        return;
      }

      // Check if user exists and not verified
      const user = await query(
        'SELECT id, name, is_verified FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (user.rows.length === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (user.rows[0].is_verified) {
        res.status(400).json({ error: 'Email already verified' });
        return;
      }

      // Generate new OTP
      const otp = generateOTP(6);
      await redisClient.setex(`otp:${email.toLowerCase()}`, 600, otp);

      // Send verification email
      await sendEmail(email, 'Verify Your Email', 'verification', {
        name: user.rows[0].name,
        otp,
        year: new Date().getFullYear(),
      });

      logger.info(`Verification OTP resent to: ${email}`);

      res.json({ message: 'Verification code sent successfully' });
    } catch (error) {
      logger.error('Resend verification error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Login user
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password }: LoginBody = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      // Get user
      const result = await query(
        `SELECT id, name, email, phone, password_hash, is_verified, role, preferences 
         FROM users 
         WHERE email = $1 AND deleted_at IS NULL`,
        [email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const user = result.rows[0];

      // Check if email is verified
      if (!user.is_verified) {
        res.status(401).json({ error: 'Please verify your email before logging in' });
        return;
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // Invalidate old sessions
      await query(
        'UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [user.id]
      );

      // Generate tokens
      const token = this.generateToken(user.id);
      const refreshToken = this.generateRefreshToken(user.id);

      // Store session
      await query(
        `INSERT INTO sessions (user_id, token, refresh_token, expires_at, last_activity, ip_address, user_agent)
         VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', NOW(), $4, $5)`,
        [user.id, token, refreshToken, req.ip, req.headers['user-agent']]
      );

      // Update last login
      await query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [user.id]
      );

      logger.info(`User logged in: ${email} (${user.id})`);

      res.json({
        message: 'Login successful',
        token,
        refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          preferences: user.preferences,
        },
      });
    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({ error: 'Refresh token required' });
        return;
      }

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as TokenPayload;
      
      if (decoded.type !== 'refresh') {
        res.status(401).json({ error: 'Invalid token type' });
        return;
      }

      // Check session exists and not revoked
      const session = await query(
        `SELECT id, user_id, revoked_at 
         FROM sessions 
         WHERE refresh_token = $1 AND expires_at > NOW()`,
        [refreshToken]
      );

      if (session.rows.length === 0) {
        res.status(401).json({ error: 'Invalid refresh token' });
        return;
      }

      if (session.rows[0].revoked_at) {
        res.status(401).json({ error: 'Session revoked' });
        return;
      }

      // Generate new tokens
      const newToken = this.generateToken(session.rows[0].user_id);
      const newRefreshToken = this.generateRefreshToken(session.rows[0].user_id);

      // Update session
      await query(
        `UPDATE sessions 
         SET token = $1, refresh_token = $2, last_activity = NOW() 
         WHERE id = $3`,
        [newToken, newRefreshToken, session.rows[0].id]
      );

      res.json({
        token: newToken,
        refreshToken: newRefreshToken,
      });
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({ error: 'Refresh token expired' });
      } else if (error instanceof jwt.JsonWebTokenError) {
        res.status(401).json({ error: 'Invalid refresh token' });
      } else {
        logger.error('Token refresh error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Logout user
   */
  async logout(req: AuthRequest, res: Response): Promise<void> {
    try {
      const token = req.token;

      if (token) {
        // Revoke session
        await query(
          'UPDATE sessions SET revoked_at = NOW() WHERE token = $1',
          [token]
        );

        // Blacklist token
        await redisClient.setex(`blacklist:${token}`, 86400, 'true');
      }

      logger.info(`User logged out: ${req.user?.id}`);

      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      logger.error('Logout error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get current user profile
   */
  async getProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await query(
        `SELECT id, name, email, phone, role, is_verified, preferences, emergency_contacts, created_at, last_login
         FROM users 
         WHERE id = $1 AND deleted_at IS NULL`,
        [req.user!.id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ user: result.rows[0] });
    } catch (error) {
      logger.error('Get profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { name, phone, preferences }: UpdateProfileBody = req.body;
      const userId = req.user!.id;

      const updates: string[] = [];
      const params: any[] = [];
      let paramCount = 1;

      if (name) {
        updates.push(`name = $${paramCount++}`);
        params.push(name);
      }

      if (phone) {
        if (!isValidPhone(phone)) {
          res.status(400).json({ error: 'Invalid phone number format' });
          return;
        }
        updates.push(`phone = $${paramCount++}`);
        params.push(phone);
      }

      if (preferences) {
        updates.push(`preferences = preferences || $${paramCount++}`);
        params.push(JSON.stringify(preferences));
      }

      if (updates.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      params.push(userId);
      await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`,
        params
      );

      logger.info(`Profile updated for user: ${userId}`);

      res.json({ message: 'Profile updated successfully' });
    } catch (error) {
      logger.error('Update profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Change password
   */
  async changePassword(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { currentPassword, newPassword, confirmPassword }: ChangePasswordBody = req.body;
      const userId = req.user!.id;

      if (!currentPassword || !newPassword || !confirmPassword) {
        res.status(400).json({ error: 'All password fields are required' });
        return;
      }

      if (newPassword !== confirmPassword) {
        res.status(400).json({ error: 'New passwords do not match' });
        return;
      }

      if (newPassword.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
      }

      // Get current password hash
      const result = await query(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
      if (!isValid) {
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
      }

      // Hash new password
      const salt = await bcrypt.genSalt(12);
      const newPasswordHash = await bcrypt.hash(newPassword, salt);

      // Update password
      await query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [newPasswordHash, userId]
      );

      // Invalidate all sessions except current
      await query(
        'UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND token != $2',
        [userId, req.token]
      );

      logger.info(`Password changed for user: ${userId}`);

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      logger.error('Change password error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Forgot password - send reset OTP
   */
  async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email }: ForgotPasswordBody = req.body;

      if (!email) {
        res.status(400).json({ error: 'Email is required' });
        return;
      }

      // Check if user exists
      const result = await query(
        'SELECT id, name, email FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        // Don't reveal that user doesn't exist for security
        res.json({ message: 'If an account exists, a reset code has been sent' });
        return;
      }

      const user = result.rows[0];
      const otp = generateOTP(6);
      const resetToken = uuidv4();

      // Store reset token
      await redisClient.setex(`reset:${resetToken}`, 3600, user.id);
      await redisClient.setex(`otp:reset:${email.toLowerCase()}`, 600, otp);

      // Send reset email
      await sendEmail(email, 'Password Reset Request', 'password_reset', {
        name: user.name,
        otp,
        resetLink: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`,
        year: new Date().getFullYear(),
      });

      // Send SMS if phone exists
      const phoneResult = await query('SELECT phone FROM users WHERE id = $1', [user.id]);
      if (phoneResult.rows[0]?.phone) {
        await smsService.sendOtp(phoneResult.rows[0].phone, otp, 'password reset');
      }

      logger.info(`Password reset requested for: ${email}`);

      res.json({ 
        message: 'If an account exists, a reset code has been sent',
        resetToken, // Only return in development
      });
    } catch (error) {
      logger.error('Forgot password error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Reset password with OTP
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { token, otp, password, confirmPassword }: ResetPasswordBody & { otp?: string } = req.body;

      if (!token || !password || !confirmPassword) {
        res.status(400).json({ error: 'Token, password, and confirm password are required' });
        return;
      }

      if (password !== confirmPassword) {
        res.status(400).json({ error: 'Passwords do not match' });
        return;
      }

      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
      }

      // Get user ID from reset token
      let userId: string | null = null;
      
      if (otp) {
        // OTP verification path
        const email = await redisClient.get(`otp:reset:${token}`);
        if (!email) {
          res.status(400).json({ error: 'Invalid or expired reset code' });
          return;
        }
        
        const storedOtp = await redisClient.get(`otp:reset:${email}`);
        if (storedOtp !== otp) {
          res.status(400).json({ error: 'Invalid reset code' });
          return;
        }
        
        const user = await query('SELECT id FROM users WHERE email = $1', [email]);
        if (user.rows.length === 0) {
          res.status(404).json({ error: 'User not found' });
          return;
        }
        
        userId = user.rows[0].id;
        await redisClient.del(`otp:reset:${email}`);
      } else {
        // Token verification path
        userId = await redisClient.get(`reset:${token}`);
        if (!userId) {
          res.status(400).json({ error: 'Invalid or expired reset token' });
          return;
        }
        await redisClient.del(`reset:${token}`);
      }

      // Hash new password
      const salt = await bcrypt.genSalt(12);
      const newPasswordHash = await bcrypt.hash(password, salt);

      // Update password
      await query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [newPasswordHash, userId]
      );

      // Invalidate all sessions
      await query(
        'UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1',
        [userId]
      );

      logger.info(`Password reset for user: ${userId}`);

      res.json({ message: 'Password reset successful' });
    } catch (error) {
      logger.error('Reset password error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Update emergency contacts
   */
  async updateEmergencyContacts(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { emergencyContacts } = req.body;
      const userId = req.user!.id;

      if (!emergencyContacts || !Array.isArray(emergencyContacts)) {
        res.status(400).json({ error: 'Emergency contacts must be an array' });
        return;
      }

      if (emergencyContacts.length > 10) {
        res.status(400).json({ error: 'Maximum 10 emergency contacts allowed' });
        return;
      }

      await query(
        'UPDATE users SET emergency_contacts = $1 WHERE id = $2',
        [JSON.stringify(emergencyContacts), userId]
      );

      logger.info(`Emergency contacts updated for user: ${userId}`);

      res.json({ 
        message: 'Emergency contacts updated successfully',
        emergencyContacts,
      });
    } catch (error) {
      logger.error('Update emergency contacts error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Delete user account
   */
  async deleteAccount(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      // Soft delete user
      await query(
        'UPDATE users SET deleted_at = NOW() WHERE id = $1',
        [userId]
      );

      // Invalidate all sessions
      await query(
        'UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1',
        [userId]
      );

      logger.info(`Account deleted for user: ${userId}`);

      res.json({ message: 'Account deleted successfully' });
    } catch (error) {
      logger.error('Delete account error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Generate JWT access token
   */
  private generateToken(userId: string): string {
    return jwt.sign(
      { userId, type: 'access' },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRY || '7d' }
    );
  }

  /**
   * Generate JWT refresh token
   */
  private generateRefreshToken(userId: string): string {
    return jwt.sign(
      { userId, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: process.env.JWT_REFRESH_EXPIRY || '30d' }
    );
  }
}

export default new AuthController();
