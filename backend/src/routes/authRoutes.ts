// src/routes/authRoutes.ts

import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authenticate, verifyRefreshToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { rateLimit } from 'express-rate-limit';

const router = Router();

// Rate limiters for auth endpoints
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 registrations per hour
  message: 'Too many registration attempts, please try again later',
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: 'Too many login attempts, please try again later',
});

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  registerLimiter,
  validate([
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('confirmPassword').custom((value, { req }) => value === req.body.password)
      .withMessage('Passwords do not match'),
  ]),
  AuthController.register
);

/**
 * @route   POST /api/auth/verify-email
 * @desc    Verify email with OTP
 * @access  Public
 */
router.post(
  '/verify-email',
  validate([
    body('email').isEmail().withMessage('Valid email is required'),
    body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  ]),
  AuthController.verifyEmail
);

/**
 * @route   POST /api/auth/resend-verification
 * @desc    Resend verification OTP
 * @access  Public
 */
router.post(
  '/resend-verification',
  validate([
    body('email').isEmail().withMessage('Valid email is required'),
  ]),
  AuthController.resendVerification
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post(
  '/login',
  loginLimiter,
  validate([
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ]),
  AuthController.login
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', authenticate, AuthController.logout);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh access token
 * @access  Public
 */
router.post(
  '/refresh-token',
  validate([
    body('refreshToken').notEmpty().withMessage('Refresh token is required'),
  ]),
  verifyRefreshToken,
  AuthController.refreshToken
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authenticate, AuthController.getProfile);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put(
  '/profile',
  authenticate,
  validate([
    body('name').optional().notEmpty().withMessage('Name cannot be empty'),
    body('phone').optional().matches(/^[\+]?[(]?[0-9]{1,3}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}$/)
      .withMessage('Invalid phone number'),
  ]),
  AuthController.updateProfile
);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.put(
  '/change-password',
  authenticate,
  validate([
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
    body('confirmPassword').custom((value, { req }) => value === req.body.newPassword)
      .withMessage('Passwords do not match'),
  ]),
  AuthController.changePassword
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post(
  '/forgot-password',
  loginLimiter,
  validate([
    body('email').isEmail().withMessage('Valid email is required'),
  ]),
  AuthController.forgotPassword
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token/OTP
 * @access  Public
 */
router.post(
  '/reset-password',
  validate([
    body('token').notEmpty().withMessage('Reset token is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('confirmPassword').custom((value, { req }) => value === req.body.password)
      .withMessage('Passwords do not match'),
  ]),
  AuthController.resetPassword
);

/**
 * @route   PUT /api/auth/emergency-contacts
 * @desc    Update emergency contacts
 * @access  Private
 */
router.put(
  '/emergency-contacts',
  authenticate,
  validate([
    body('emergencyContacts').isArray().withMessage('Emergency contacts must be an array'),
    body('emergencyContacts.*.name').notEmpty().withMessage('Contact name is required'),
    body('emergencyContacts.*.phone').notEmpty().withMessage('Contact phone is required'),
  ]),
  AuthController.updateEmergencyContacts
);

/**
 * @route   DELETE /api/auth/account
 * @desc    Delete user account
 * @access  Private
 */
router.delete('/account', authenticate, AuthController.deleteAccount);

export default router;
