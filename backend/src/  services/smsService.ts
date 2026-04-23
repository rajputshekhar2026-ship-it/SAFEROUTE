// src/services/smsService.ts

import twilio from 'twilio';
import axios from 'axios';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

// Types
export interface SmsOptions {
  to: string;
  body: string;
  from?: string;
  mediaUrl?: string[];
  priority?: 'low' | 'normal' | 'high';
  scheduleTime?: Date;
  validityPeriod?: number; // in seconds
}

export interface SmsResponse {
  sid: string;
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'delivered';
  to: string;
  from: string;
  body: string;
  createdAt: Date;
  error?: string;
}

export interface SmsTemplate {
  id: string;
  name: string;
  template: string;
  variables: string[];
}

export interface SmsProvider {
  name: string;
  priority: number;
  enabled: boolean;
  rateLimit: number;
  currentUsage: number;
}

class SmsService {
  private twilioClient: twilio.Twilio | null = null;
  private fallbackProviders: SmsProvider[] = [];
  private rateLimitReset: number = Date.now();
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 2000; // 2 seconds

  constructor() {
    this.initializeTwilio();
    this.initializeFallbackProviders();
  }

  /**
   * Initialize Twilio client
   */
  private initializeTwilio(): void {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (accountSid && authToken) {
      this.twilioClient = twilio(accountSid, authToken);
      logger.info('Twilio client initialized');
    } else {
      logger.warn('Twilio credentials not configured, SMS service limited');
    }
  }

  /**
   * Initialize fallback SMS providers
   */
  private initializeFallbackProviders(): void {
    // For production, you might add other providers like:
    // - Vonage (Nexmo)
    // - MessageBird
    // - Plivo
    // - AWS SNS
    this.fallbackProviders = [
      {
        name: 'twilio',
        priority: 1,
        enabled: !!this.twilioClient,
        rateLimit: 10, // 10 per second
        currentUsage: 0,
      },
      // Add more providers as backup
    ];
  }

  /**
   * Send SMS using primary provider with fallback
   */
  async sendSms(options: SmsOptions): Promise<SmsResponse> {
    // Validate phone number
    if (!this.isValidPhoneNumber(options.to)) {
      throw new Error('Invalid phone number format');
    }

    // Check rate limit
    await this.checkRateLimit();

    // Try sending with primary provider
    let response: SmsResponse | null = null;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        if (this.twilioClient) {
          response = await this.sendWithTwilio(options);
        } else {
          // Use fallback provider
          response = await this.sendWithFallback(options);
        }
        
        if (response && response.status !== 'failed') {
          // Log successful send
          await this.logSmsSent(response);
          return response;
        }
      } catch (error) {
        lastError = error as Error;
        logger.warn(`SMS attempt ${attempt} failed:`, error);
        
        if (attempt < this.MAX_RETRIES) {
          await this.delay(this.RETRY_DELAY * attempt);
        }
      }
    }

    // All attempts failed
    throw new Error(`Failed to send SMS after ${this.MAX_RETRIES} attempts: ${lastError?.message}`);
  }

  /**
   * Send SMS using Twilio
   */
  private async sendWithTwilio(options: SmsOptions): Promise<SmsResponse> {
    if (!this.twilioClient) {
      throw new Error('Twilio client not initialized');
    }

    const from = options.from || process.env.TWILIO_PHONE_NUMBER;
    if (!from) {
      throw new Error('Twilio from number not configured');
    }

    try {
      const messageOptions: any = {
        to: options.to,
        from,
        body: options.body,
      };

      if (options.mediaUrl && options.mediaUrl.length > 0) {
        messageOptions.mediaUrl = options.mediaUrl;
      }

      if (options.scheduleTime) {
        messageOptions.sendAt = options.scheduleTime;
      }

      if (options.validityPeriod) {
        messageOptions.validityPeriod = options.validityPeriod;
      }

      const message = await this.twilioClient.messages.create(messageOptions);

      return {
        sid: message.sid,
        status: message.status as any,
        to: message.to,
        from: message.from,
        body: message.body || options.body,
        createdAt: new Date(),
      };
    } catch (error: any) {
      logger.error('Twilio SMS error:', error);
      throw new Error(`Twilio error: ${error.message}`);
    }
  }

  /**
   * Send SMS using fallback provider
   */
  private async sendWithFallback(options: SmsOptions): Promise<SmsResponse> {
    // Get enabled provider with highest priority
    const provider = this.fallbackProviders
      .filter(p => p.enabled)
      .sort((a, b) => a.priority - b.priority)[0];

    if (!provider) {
      throw new Error('No SMS provider available');
    }

    // Implement provider-specific logic here
    // For now, simulate sending
    await this.delay(500);

    return {
      sid: `mock_${Date.now()}`,
      status: 'sent',
      to: options.to,
      from: options.from || 'mock',
      body: options.body,
      createdAt: new Date(),
    };
  }

  /**
   * Send emergency alert SMS
   */
  async sendEmergencyAlert(
    to: string,
    userName: string,
    location: { lat: number; lng: number; address?: string },
    message?: string
  ): Promise<SmsResponse> {
    const mapsUrl = `https://maps.google.com/?q=${location.lat},${location.lng}`;
    const addressText = location.address ? ` at ${location.address}` : '';
    
    const body = `🚨 EMERGENCY SOS! ${userName} needs immediate help${addressText}. Location: ${mapsUrl} Time: ${new Date().toLocaleString()}. ${message ? `Message: ${message}` : ''}`;
    
    return this.sendSms({
      to,
      body,
      priority: 'high',
      validityPeriod: 3600, // 1 hour validity
    });
  }

  /**
   * Send safety alert SMS
   */
  async sendSafetyAlert(
    to: string,
    alertType: string,
    severity: string,
    location: { lat: number; lng: number; address?: string }
  ): Promise<SmsResponse> {
    const mapsUrl = `https://maps.google.com/?q=${location.lat},${location.lng}`;
    const severityEmoji = severity === 'high' ? '⚠️⚠️' : severity === 'medium' ? '⚠️' : 'ℹ️';
    
    const body = `${severityEmoji} SAFETY ALERT: ${alertType} reported in your area${location.address ? ` at ${location.address}` : ''}. Stay alert and aware. Location: ${mapsUrl} Time: ${new Date().toLocaleString()}`;
    
    return this.sendSms({
      to,
      body,
      priority: severity === 'high' ? 'high' : 'normal',
    });
  }

  /**
   * Send check-in confirmation SMS
   */
  async sendCheckInConfirmation(
    to: string,
    userName: string,
    location: { lat: number; lng: number; address?: string }
  ): Promise<SmsResponse> {
    const addressText = location.address ? ` at ${location.address}` : '';
    const body = `✅ ${userName} has checked in as safe${addressText}. Time: ${new Date().toLocaleString()}`;
    
    return this.sendSms({
      to,
      body,
      priority: 'normal',
    });
  }

  /**
   * Send route deviation alert
   */
  async sendDeviationAlert(
    to: string,
    userName: string,
    deviationDistance: number,
    location: { lat: number; lng: number; address?: string }
  ): Promise<SmsResponse> {
    const mapsUrl = `https://maps.google.com/?q=${location.lat},${location.lng}`;
    const body = `⚠️ Route deviation detected for ${userName}. They have deviated ${Math.round(deviationDistance)}m from their planned route. Current location: ${mapsUrl}`;
    
    return this.sendSms({
      to,
      body,
      priority: 'high',
    });
  }

  /**
   * Send verification code
   */
  async sendVerificationCode(to: string, code: string): Promise<SmsResponse> {
    const body = `Your SafeRoute verification code is: ${code}. This code expires in 10 minutes. Do not share this code with anyone.`;
    
    return this.sendSms({
      to,
      body,
      priority: 'high',
      validityPeriod: 600, // 10 minutes
    });
  }

  /**
   * Send OTP (One-Time Password)
   */
  async sendOtp(to: string, otp: string, purpose: string = 'login'): Promise<SmsResponse> {
    const body = `Your OTP for ${purpose} is: ${otp}. Valid for 5 minutes. Do not share this code.`;
    
    return this.sendSms({
      to,
      body,
      priority: 'high',
      validityPeriod: 300, // 5 minutes
    });
  }

  /**
   * Send bulk SMS (batch processing)
   */
  async sendBulkSms(
    recipients: string[],
    message: string,
    options?: Partial<SmsOptions>
  ): Promise<{ success: number; failed: number; errors: Error[] }> {
    let success = 0;
    let failed = 0;
    const errors: Error[] = [];

    // Process in batches to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const promises = batch.map(to =>
        this.sendSms({ to, body: message, ...options })
          .then(() => success++)
          .catch(err => {
            failed++;
            errors.push(err);
          })
      );
      
      await Promise.all(promises);
      
      // Delay between batches
      if (i + batchSize < recipients.length) {
        await this.delay(1000);
      }
    }

    logger.info(`Bulk SMS completed: ${success} sent, ${failed} failed`);
    return { success, failed, errors };
  }

  /**
   * Send scheduled SMS
   */
  async sendScheduledSms(
    to: string,
    body: string,
    scheduleTime: Date,
    options?: Partial<SmsOptions>
  ): Promise<SmsResponse> {
    return this.sendSms({
      to,
      body,
      scheduleTime,
      ...options,
    });
  }

  /**
   * Send SMS template
   */
  async sendTemplate(
    to: string,
    templateId: string,
    variables: Record<string, string>
  ): Promise<SmsResponse> {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    let body = template.template;
    for (const [key, value] of Object.entries(variables)) {
      body = body.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    return this.sendSms({ to, body });
  }

  /**
   * Get SMS template from database
   */
  private async getTemplate(templateId: string): Promise<SmsTemplate | null> {
    // In production, fetch from database
    const templates: Record<string, SmsTemplate> = {
      'welcome': {
        id: 'welcome',
        name: 'Welcome Message',
        template: 'Welcome to SafeRoute, {{name}}! Your safety is our priority.',
        variables: ['name'],
      },
      'sos_alert': {
        id: 'sos_alert',
        name: 'SOS Alert',
        template: '🚨 EMERGENCY SOS! {{name}} needs immediate help. Location: {{location}}',
        variables: ['name', 'location'],
      },
      'verification': {
        id: 'verification',
        name: 'Verification Code',
        template: 'Your SafeRoute verification code is: {{code}}. Valid for 10 minutes.',
        variables: ['code'],
      },
    };

    return templates[templateId] || null;
  }

  /**
   * Check rate limit for SMS sending
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const key = 'sms:rate_limit:global';
    
    // Get current usage
    const usage = await redisClient.get(key);
    const currentUsage = usage ? parseInt(usage) : 0;
    
    // Reset rate limit window if needed
    if (now > this.rateLimitReset) {
      this.rateLimitReset = now + this.RATE_LIMIT_WINDOW;
      await redisClient.setex(key, Math.ceil(this.RATE_LIMIT_WINDOW / 1000), '1');
      return;
    }
    
    // Check rate limit (100 per minute default)
    const maxRequests = parseInt(process.env.SMS_RATE_LIMIT || '100');
    if (currentUsage >= maxRequests) {
      const waitTime = this.rateLimitReset - now;
      throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds`);
    }
    
    // Increment usage
    await redisClient.incr(key);
  }

  /**
   * Log SMS sent to database
   */
  private async logSmsSent(response: SmsResponse): Promise<void> {
    try {
      // In production, store in database
      logger.info('SMS sent', {
        sid: response.sid,
        to: response.to,
        status: response.status,
        timestamp: response.createdAt,
      });
    } catch (error) {
      logger.error('Failed to log SMS:', error);
    }
  }

  /**
   * Track SMS delivery status
   */
  async trackDeliveryStatus(messageSid: string): Promise<SmsResponse | null> {
    if (!this.twilioClient) {
      return null;
    }

    try {
      const message = await this.twilioClient.messages(messageSid).fetch();
      
      return {
        sid: message.sid,
        status: message.status as any,
        to: message.to,
        from: message.from,
        body: message.body || '',
        createdAt: message.dateCreated,
        error: message.errorMessage,
      };
    } catch (error) {
      logger.error('Failed to track SMS delivery:', error);
      return null;
    }
  }

  /**
   * Validate phone number format
   */
  private isValidPhoneNumber(phone: string): boolean {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Check if phone has valid length (10-15 digits)
    const isValid = cleaned.length >= 10 && cleaned.length <= 15;
    
    if (!isValid) {
      logger.warn(`Invalid phone number format: ${phone}`);
    }
    
    return isValid;
  }

  /**
   * Format phone number to E.164 format
   */
  formatPhoneNumber(phone: string, countryCode: string = '1'): string {
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Add country code if not present
    if (cleaned.length === 10) {
      cleaned = `${countryCode}${cleaned}`;
    }
    
    return `+${cleaned}`;
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get SMS provider status
   */
  getProviderStatus(): SmsProvider[] {
    return this.fallbackProviders;
  }

  /**
   * Check if SMS service is available
   */
  isAvailable(): boolean {
    return !!this.twilioClient || this.fallbackProviders.some(p => p.enabled);
  }

  /**
   * Get remaining rate limit for current window
   */
  async getRemainingRateLimit(): Promise<number> {
    const key = 'sms:rate_limit:global';
    const usage = await redisClient.get(key);
    const currentUsage = usage ? parseInt(usage) : 0;
    const maxRequests = parseInt(process.env.SMS_RATE_LIMIT || '100');
    
    return Math.max(0, maxRequests - currentUsage);
  }
}

// Export singleton instance
export const smsService = new SmsService();
export default smsService;
