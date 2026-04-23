// src/middleware/validation.ts

import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult, ValidationChain } from 'express-validator';
import { ValidationError } from './errorHandler';

// Custom validation rules
export const validators = {
  // Auth validators
  register: [
    body('name')
      .trim()
      .notEmpty().withMessage('Name is required')
      .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters')
      .matches(/^[a-zA-Z\s\-']+$/).withMessage('Name can only contain letters, spaces, hyphens, and apostrophes'),
    
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Please provide a valid email')
      .normalizeEmail()
      .isLength({ max: 255 }).withMessage('Email must be less than 255 characters'),
    
    body('phone')
      .optional()
      .trim()
      .matches(/^[\+]?[(]?[0-9]{1,3}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}$/)
      .withMessage('Please provide a valid phone number'),
    
    body('password')
      .notEmpty().withMessage('Password is required')
      .isLength({ min: 8, max: 64 }).withMessage('Password must be between 8 and 64 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain at least one uppercase, one lowercase, one number, and one special character'),
    
    body('confirmPassword')
      .notEmpty().withMessage('Please confirm your password')
      .custom((value, { req }) => value === req.body.password)
      .withMessage('Passwords do not match'),
    
    body('emergencyContacts')
      .optional()
      .isArray().withMessage('Emergency contacts must be an array')
      .custom((contacts) => {
        if (contacts && contacts.length > 10) {
          throw new Error('Maximum 10 emergency contacts allowed');
        }
        return true;
      }),
  ],

  login: [
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Please provide a valid email'),
    
    body('password')
      .notEmpty().withMessage('Password is required'),
  ],

  // Route validators
  routeRequest: [
    body('start.lat')
      .notEmpty().withMessage('Start latitude is required')
      .isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
    
    body('start.lng')
      .notEmpty().withMessage('Start longitude is required')
      .isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
    
    body('end.lat')
      .notEmpty().withMessage('End latitude is required')
      .isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
    
    body('end.lng')
      .notEmpty().withMessage('End longitude is required')
      .isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
    
    body('preferences')
      .optional()
      .isArray().withMessage('Preferences must be an array')
      .custom((prefs) => {
        const validPrefs = ['safe', 'fast', 'lit'];
        if (prefs && !prefs.every((p: string) => validPrefs.includes(p))) {
          throw new Error('Invalid preference. Allowed: safe, fast, lit');
        }
        return true;
      }),
    
    body('waypoints')
      .optional()
      .isArray().withMessage('Waypoints must be an array')
      .custom((waypoints) => {
        if (waypoints && waypoints.length > 10) {
          throw new Error('Maximum 10 waypoints allowed');
        }
        return true;
      }),
  ],

  // SOS validators
  sosTrigger: [
    body('location.lat')
      .notEmpty().withMessage('Location latitude is required')
      .isFloat({ min: -90, max: 90 }),
    
    body('location.lng')
      .notEmpty().withMessage('Location longitude is required')
      .isFloat({ min: -180, max: 180 }),
    
    body('message')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Message must be less than 500 characters'),
    
    body('contacts')
      .optional()
      .isArray().withMessage('Contacts must be an array')
      .custom((contacts) => {
        if (contacts && contacts.length > 10) {
          throw new Error('Maximum 10 contacts allowed');
        }
        return true;
      }),
  ],

  // Report incident validators
  reportIncident: [
    body('type')
      .trim()
      .notEmpty().withMessage('Incident type is required')
      .isIn(['harassment', 'broken_light', 'blocked_path', 'suspicious_activity', 'assault', 'unsafe_condition', 'theft', 'medical'])
      .withMessage('Invalid incident type'),
    
    body('location.lat')
      .notEmpty().withMessage('Location latitude is required')
      .isFloat({ min: -90, max: 90 }),
    
    body('location.lng')
      .notEmpty().withMessage('Location longitude is required')
      .isFloat({ min: -180, max: 180 }),
    
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
    
    body('severity')
      .optional()
      .isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity level'),
    
    body('anonymous')
      .optional()
      .isBoolean().withMessage('Anonymous must be a boolean'),
  ],

  // Check-in validators
  checkin: [
    body('location.lat')
      .notEmpty().withMessage('Location latitude is required')
      .isFloat({ min: -90, max: 90 }),
    
    body('location.lng')
      .notEmpty().withMessage('Location longitude is required')
      .isFloat({ min: -180, max: 180 }),
    
    body('status')
      .optional()
      .isIn(['safe', 'unsure', 'danger']).withMessage('Invalid status'),
    
    body('note')
      .optional()
      .trim()
      .isLength({ max: 200 }).withMessage('Note must be less than 200 characters'),
  ],

  // Emergency contacts validators
  emergencyContacts: [
    body('contacts')
      .isArray().withMessage('Contacts must be an array')
      .custom((contacts) => {
        if (contacts.length > 10) {
          throw new Error('Maximum 10 emergency contacts allowed');
        }
        return true;
      }),
    
    body('contacts.*.name')
      .trim()
      .notEmpty().withMessage('Contact name is required')
      .isLength({ min: 2, max: 50 }),
    
    body('contacts.*.phone')
      .trim()
      .notEmpty().withMessage('Contact phone is required')
      .matches(/^[\+]?[(]?[0-9]{1,3}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}$/)
      .withMessage('Invalid phone number'),
    
    body('contacts.*.email')
      .optional()
      .trim()
      .isEmail().withMessage('Invalid email address'),
    
    body('contacts.*.isEmergencyContact')
      .optional()
      .isBoolean(),
  ],

  // Route ID param validator
  routeId: [
    param('id')
      .notEmpty().withMessage('Route ID is required')
      .isInt().withMessage('Route ID must be an integer'),
  ],

  // User ID param validator
  userId: [
    param('userId')
      .notEmpty().withMessage('User ID is required')
      .isUUID().withMessage('Invalid user ID format'),
  ],

  // Pagination validators
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 }).withMessage('Page must be a positive integer')
      .toInt(),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
      .toInt(),
    
    query('sortBy')
      .optional()
      .isString().withMessage('Sort by must be a string'),
    
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
  ],

  // Date range validators
  dateRange: [
    query('startDate')
      .optional()
      .isISO8601().withMessage('Start date must be a valid ISO date'),
    
    query('endDate')
      .optional()
      .isISO8601().withMessage('End date must be a valid ISO date')
      .custom((endDate, { req }) => {
        if (req.query.startDate && endDate && new Date(endDate) <= new Date(req.query.startDate)) {
          throw new Error('End date must be after start date');
        }
        return true;
      }),
  ],

  // Search query validator
  search: [
    query('q')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 }).withMessage('Search query must be between 2 and 100 characters'),
    
    query('type')
      .optional()
      .isString(),
  ],

  // Geofence validators
  geofence: [
    body('identifier')
      .trim()
      .notEmpty().withMessage('Identifier is required')
      .isLength({ min: 3, max: 50 }),
    
    body('latitude')
      .notEmpty().withMessage('Latitude is required')
      .isFloat({ min: -90, max: 90 }),
    
    body('longitude')
      .notEmpty().withMessage('Longitude is required')
      .isFloat({ min: -180, max: 180 }),
    
    body('radius')
      .notEmpty().withMessage('Radius is required')
      .isFloat({ min: 10, max: 1000 }).withMessage('Radius must be between 10 and 1000 meters'),
  ],

  // Settings validators
  updateSettings: [
    body('notificationsEnabled')
      .optional()
      .isBoolean(),
    
    body('darkMode')
      .optional()
      .isBoolean(),
    
    body('voiceGuidance')
      .optional()
      .isBoolean(),
    
    body('autoSOS')
      .optional()
      .isBoolean(),
    
    body('preferredRouteType')
      .optional()
      .isIn(['fastest', 'safest', 'lit']),
    
    body('alertRadius')
      .optional()
      .isInt({ min: 100, max: 5000 }).withMessage('Alert radius must be between 100 and 5000 meters'),
  ],
};

// Validation result handler
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    
    if (errors.isEmpty()) {
      return next();
    }

    const extractedErrors = errors.array().map(err => ({
      field: err.param,
      message: err.msg,
      value: err.value,
    }));

    throw new ValidationError('Validation failed', extractedErrors);
  };
};

// Sanitize inputs
export const sanitize = {
  // Remove HTML tags
  html: (input: string): string => {
    if (!input) return input;
    return input.replace(/<[^>]*>/g, '');
  },
  
  // Escape special characters
  escape: (input: string): string => {
    if (!input) return input;
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
  
  // Trim whitespace
  trim: (input: string): string => {
    if (!input) return input;
    return input.trim();
  },
  
  // Normalize email
  normalizeEmail: (email: string): string => {
    if (!email) return email;
    return email.toLowerCase().trim();
  },
  
  // Sanitize phone number
  phone: (phone: string): string => {
    if (!phone) return phone;
    return phone.replace(/[^\d+]/g, '');
  },
};

// Custom validators
export const customValidators = {
  // Check if value is a valid coordinate
  isValidCoordinate: (lat: number, lng: number): boolean => {
    return (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180
    );
  },
  
  // Check if value is a valid UUID
  isValidUUID: (uuid: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  },
  
  // Check if value is a valid URL
  isValidURL: (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },
  
  // Check if value is within allowed enum
  isInEnum: <T>(value: any, enumObj: T): boolean => {
    return Object.values(enumObj as any).includes(value);
  },
};

// Async validation wrapper
export const asyncValidate = (fn: Function) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req);
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Export all validators
export default {
  validators,
  validate,
  sanitize,
  customValidators,
  asyncValidate,
};
