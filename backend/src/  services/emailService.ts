// backend/src/services/emailService.ts

import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

// Types
export interface EmailOptions {
  to: string | string[];
  subject: string;
  template?: string;
  data?: Record<string, any>;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content?: string;
    path?: string;
    contentType?: string;
  }>;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private useSendGrid: boolean;
  private templates: Map<string, EmailTemplate> = new Map();

  constructor() {
    this.useSendGrid = !!process.env.SENDGRID_API_KEY;
    this.initializeTransporter();
    this.loadTemplates();
  }

  /**
   * Initialize email transporter
   */
  private initializeTransporter(): void {
    if (this.useSendGrid) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
      logger.info('SendGrid initialized for email service');
    } else if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      logger.info('SMTP transporter initialized for email service');
    } else {
      logger.warn('No email service configured. Emails will be logged only.');
    }
  }

  /**
   * Load email templates
   */
  private loadTemplates(): void {
    const templatesDir = path.join(__dirname, '../templates/emails');
    
    // Define templates programmatically (since template files may not exist)
    this.templates.set('welcome', {
      subject: 'Welcome to SafeRoute!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #e94560; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .button { display: inline-block; padding: 10px 20px; background: #e94560; color: white; text-decoration: none; border-radius: 5px; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to SafeRoute!</h1>
            </div>
            <div class="content">
              <p>Hello {{name}},</p>
              <p>Thank you for joining SafeRoute! We're committed to helping you stay safe while navigating your city.</p>
              <p>With SafeRoute, you can:</p>
              <ul>
                <li>Get real-time safety alerts</li>
                <li>Share your location with trusted contacts</li>
                <li>Access safe refuges nearby</li>
                <li>Trigger SOS alerts in emergencies</li>
              </ul>
              <p>Get started by exploring the app and setting up your emergency contacts.</p>
              <p>Stay safe,<br>The SafeRoute Team</p>
            </div>
            <div class="footer">
              <p>&copy; {{year}} SafeRoute. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Welcome to SafeRoute!
        
        Hello {{name}},
        
        Thank you for joining SafeRoute! We're committed to helping you stay safe while navigating your city.
        
        With SafeRoute, you can:
        - Get real-time safety alerts
        - Share your location with trusted contacts
        - Access safe refuges nearby
        - Trigger SOS alerts in emergencies
        
        Get started by exploring the app and setting up your emergency contacts.
        
        Stay safe,
        The SafeRoute Team
        
        © {{year}} SafeRoute. All rights reserved.
      `,
    });

    this.templates.set('verification', {
      subject: 'Verify Your Email - SafeRoute',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #e94560; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; text-align: center; }
            .otp-code { font-size: 32px; font-weight: bold; color: #e94560; letter-spacing: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Verify Your Email</h1>
            </div>
            <div class="content">
              <p>Hello {{name}},</p>
              <p>Thank you for signing up for SafeRoute! Please use the verification code below to complete your registration.</p>
              <div class="otp-code">{{otp}}</div>
              <p>This code will expire in 10 minutes.</p>
              <p>If you didn't create an account with SafeRoute, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; {{year}} SafeRoute. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Verify Your Email
        
        Hello {{name}},
        
        Thank you for signing up for SafeRoute! Please use the verification code below to complete your registration.
        
        Your verification code is: {{otp}}
        
        This code will expire in 10 minutes.
        
        If you didn't create an account with SafeRoute, please ignore this email.
        
        © {{year}} SafeRoute. All rights reserved.
      `,
    });

    this.templates.set('password_reset', {
      subject: 'Password Reset Request - SafeRoute',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #e94560; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; text-align: center; }
            .otp-code { font-size: 32px; font-weight: bold; color: #e94560; letter-spacing: 5px; margin: 20px 0; }
            .button { display: inline-block; padding: 12px 24px; background: #e94560; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hello {{name}},</p>
              <p>We received a request to reset your password. Use the code below or click the button to reset your password.</p>
              <div class="otp-code">{{otp}}</div>
              <a href="{{resetLink}}" class="button">Reset Password</a>
              <p>This link will expire in 1 hour.</p>
              <p>If you didn't request a password reset, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; {{year}} SafeRoute. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Password Reset Request
        
        Hello {{name}},
        
        We received a request to reset your password. Use the code below to reset your password.
        
        Your reset code is: {{otp}}
        
        Or click this link: {{resetLink}}
        
        This link will expire in 1 hour.
        
        If you didn't request a password reset, please ignore this email.
        
        © {{year}} SafeRoute. All rights reserved.
      `,
    });

    this.templates.set('sos_alert', {
      subject: '🚨 SOS ALERT - Immediate Attention Required',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #e94560; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .alert-box { background: #ffebee; border-left: 4px solid #e94560; padding: 15px; margin: 20px 0; }
            .location { background: #f5f5f5; padding: 10px; font-family: monospace; margin: 10px 0; }
            .button { display: inline-block; padding: 10px 20px; background: #e94560; color: white; text-decoration: none; border-radius: 5px; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚨 SOS ALERT</h1>
            </div>
            <div class="content">
              <div class="alert-box">
                <p><strong>{{userName}}</strong> has triggered an emergency SOS alert.</p>
                <p><strong>Time:</strong> {{time}}</p>
                <p><strong>Location:</strong></p>
                <div class="location">
                  <a href="{{locationUrl}}">View on Map</a><br>
                  Lat: {{lat}}, Lng: {{lng}}
                </div>
                {{#if message}}
                <p><strong>Message:</strong> {{message}}</p>
                {{/if}}
              </div>
              <p>Please check on {{userName}} immediately.</p>
              {{#if audioUrl}}
              <p>Audio recording attached.</p>
              {{/if}}
              {{#if photoUrl}}
              <p>Photo attached.</p>
              {{/if}}
            </div>
            <div class="footer">
              <p>This is an automated emergency alert from SafeRoute.</p>
              <p>&copy; {{year}} SafeRoute. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        🚨 SOS ALERT - Immediate Attention Required
        
        {{userName}} has triggered an emergency SOS alert.
        
        Time: {{time}}
        Location: https://maps.google.com/?q={{lat}},{{lng}}
        
        {{#if message}}
        Message: {{message}}
        {{/if}}
        
        Please check on {{userName}} immediately.
        
        This is an automated emergency alert from SafeRoute.
      `,
    });

    this.templates.set('safety_alert', {
      subject: '⚠️ Safety Alert - SafeRoute',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #ff9800; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .alert-box { background: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⚠️ Safety Alert</h1>
            </div>
            <div class="content">
              <div class="alert-box">
                <p><strong>{{alertType}}</strong></p>
                <p>{{message}}</p>
                <p><strong>Location:</strong> {{location}}</p>
                <p><strong>Severity:</strong> {{severity}}</p>
              </div>
              <p>Please stay alert and aware of your surroundings.</p>
            </div>
            <div class="footer">
              <p>&copy; {{year}} SafeRoute. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        ⚠️ Safety Alert
        
        {{alertType}}
        {{message}}
        Location: {{location}}
        Severity: {{severity}}
        
        Please stay alert and aware of your surroundings.
        
        © {{year}} SafeRoute. All rights reserved.
      `,
    });

    logger.info(`Loaded ${this.templates.size} email templates`);
  }

  /**
   * Send email
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      let subject = options.subject;
      let html = options.html;
      let text = options.text;

      // Use template if specified
      if (options.template) {
        const template = this.templates.get(options.template);
        if (template) {
          subject = this.compileTemplate(template.subject, options.data || {});
          html = this.compileTemplate(template.html, options.data || {});
          text = this.compileTemplate(template.text, options.data || {});
        } else {
          logger.warn(`Template not found: ${options.template}`);
        }
      }

      const to = Array.isArray(options.to) ? options.to : [options.to];
      
      if (this.useSendGrid) {
        return await this.sendWithSendGrid(to, subject, html, text, options.attachments);
      } else if (this.transporter) {
        return await this.sendWithNodemailer(to, subject, html, text, options.attachments);
      } else {
        // Log email instead of sending
        logger.info('Email would be sent (no email service configured):', {
          to,
          subject,
          body: text || html?.substring(0, 500),
        });
        return true;
      }
    } catch (error) {
      logger.error('Failed to send email:', error);
      return false;
    }
  }

  /**
   * Send email using SendGrid
   */
  private async sendWithSendGrid(
    to: string[],
    subject: string,
    html?: string,
    text?: string,
    attachments?: EmailOptions['attachments']
  ): Promise<boolean> {
    const msg = {
      to,
      from: process.env.FROM_EMAIL || 'noreply@saferoute.com',
      fromName: process.env.FROM_NAME || 'SafeRoute',
      subject,
      text: text || html?.replace(/<[^>]*>/g, ''),
      html,
      attachments: attachments?.map(att => ({
        filename: att.filename,
        content: att.content,
        path: att.path,
        type: att.contentType,
      })),
    };

    await sgMail.send(msg);
    logger.info(`Email sent via SendGrid to ${to.join(', ')}`);
    return true;
  }

  /**
   * Send email using Nodemailer (SMTP)
   */
  private async sendWithNodemailer(
    to: string[],
    subject: string,
    html?: string,
    text?: string,
    attachments?: EmailOptions['attachments']
  ): Promise<boolean> {
    if (!this.transporter) return false;

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${process.env.FROM_NAME || 'SafeRoute'}" <${process.env.FROM_EMAIL || 'noreply@saferoute.com'}>`,
      to: to.join(', '),
      subject,
      text: text || html?.replace(/<[^>]*>/g, ''),
      html,
      attachments,
    };

    await this.transporter.sendMail(mailOptions);
    logger.info(`Email sent via SMTP to ${to.join(', ')}`);
    return true;
  }

  /**
   * Compile Handlebars template
   */
  private compileTemplate(template: string, data: Record<string, any>): string {
    const compiled = handlebars.compile(template);
    return compiled(data);
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(to: string, name: string): Promise<boolean> {
    return this.sendEmail({
      to,
      template: 'welcome',
      data: {
        name,
        year: new Date().getFullYear(),
      },
    });
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(to: string, name: string, otp: string): Promise<boolean> {
    return this.sendEmail({
      to,
      template: 'verification',
      data: {
        name,
        otp,
        year: new Date().getFullYear(),
      },
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(to: string, name: string, otp: string, resetLink: string): Promise<boolean> {
    return this.sendEmail({
      to,
      template: 'password_reset',
      data: {
        name,
        otp,
        resetLink,
        year: new Date().getFullYear(),
      },
    });
  }

  /**
   * Send SOS alert email
   */
  async sendSOSAlertEmail(
    to: string,
    userName: string,
    location: { lat: number; lng: number },
    message?: string,
    audioUrl?: string,
    photoUrl?: string
  ): Promise<boolean> {
    return this.sendEmail({
      to,
      template: 'sos_alert',
      data: {
        userName,
        time: new Date().toLocaleString(),
        lat: location.lat,
        lng: location.lng,
        locationUrl: `https://maps.google.com/?q=${location.lat},${location.lng}`,
        message,
        audioUrl,
        photoUrl,
        year: new Date().getFullYear(),
      },
    });
  }

  /**
   * Send safety alert email
   */
  async sendSafetyAlertEmail(
    to: string,
    alertType: string,
    message: string,
    location: string,
    severity: string
  ): Promise<boolean> {
    return this.sendEmail({
      to,
      template: 'safety_alert',
      data: {
        alertType,
        message,
        location,
        severity,
        year: new Date().getFullYear(),
      },
    });
  }

  /**
   * Send bulk emails
   */
  async sendBulkEmails(
    recipients: Array<{ email: string; data: Record<string, any> }>,
    template: string
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const result = await this.sendEmail({
        to: recipient.email,
        template,
        data: recipient.data,
      });
      
      if (result) {
        success++;
      } else {
        failed++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info(`Bulk email completed: ${success} sent, ${failed} failed`);
    return { success, failed };
  }

  /**
   * Test email configuration
   */
  async testConfiguration(to: string): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: 'SafeRoute Email Test',
      html: '<h1>Test Email</h1><p>If you receive this, your email configuration is working!</p>',
      text: 'Test Email - If you receive this, your email configuration is working!',
    });
  }
}

// Export singleton instance
export const emailService = new EmailService();
export default emailService;
