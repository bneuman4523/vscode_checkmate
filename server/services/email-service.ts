import { createChildLogger } from '../logger';
import sgMail from '@sendgrid/mail';

const logger = createChildLogger('EmailService');

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

class EmailService {
  private configured: boolean = false;
  private fromEmail: string = 'noreply@checkinkit.com';

  constructor() {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (apiKey) {
      sgMail.setApiKey(apiKey);
      this.configured = true;
      logger.info('Initialized with SendGrid');
    } else {
      logger.info('No SENDGRID_API_KEY configured - email sending disabled');
    }

    if (process.env.EMAIL_FROM) {
      this.fromEmail = process.env.EMAIL_FROM;
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
    if (!this.configured) {
      logger.info('Email not sent - no API key configured');
      return { success: false, error: 'Email service not configured. Please set SENDGRID_API_KEY.' };
    }

    try {
      await sgMail.send({
        from: this.fromEmail,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      logger.info('Email sent successfully to:', options.to);
      return { success: true };
    } catch (error: any) {
      logger.error({ err: error?.response?.body || error }, 'Error sending email');
      const message = error?.response?.body?.errors?.[0]?.message || error?.message || 'Unknown error';
      return { success: false, error: message };
    }
  }

  async sendPasswordSetupEmail(
    email: string,
    firstName: string | null,
    token: string,
    baseUrl: string
  ): Promise<{ success: boolean; error?: string }> {
    const setupUrl = `${baseUrl}/set-password?token=${token}`;
    const name = firstName || 'there';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to Checkmate</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hi ${name},</p>
          <p style="font-size: 16px; margin-bottom: 20px;">Your account has been created. Please click the button below to set your password and complete your account setup.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${setupUrl}" style="background: #3b82f6; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Set Your Password</a>
          </div>
          <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">This link will expire in 48 hours. If you didn't request this, you can safely ignore this email.</p>
          <p style="font-size: 14px; color: #6b7280;">If the button doesn't work, copy and paste this URL into your browser:</p>
          <p style="font-size: 12px; color: #9ca3af; word-break: break-all;">${setupUrl}</p>
        </div>
        <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
          <p>Checkmate - Event Check-In Made Easy</p>
        </div>
      </body>
      </html>
    `;

    const text = `
Hi ${name},

Your Checkmate account has been created. Please visit the following link to set your password:

${setupUrl}

This link will expire in 48 hours.

If you didn't request this, you can safely ignore this email.

- Checkmate Team
    `.trim();

    return this.sendEmail({
      to: email,
      subject: 'Set up your Checkmate password',
      html,
      text,
    });
  }

  async sendPasswordResetEmail(
    email: string,
    firstName: string | null,
    code: string
  ): Promise<{ success: boolean; error?: string }> {
    const name = firstName || 'there';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Password Reset</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hi ${name},</p>
          <p style="font-size: 16px; margin-bottom: 20px;">You requested to reset your password. Use the code below to complete your password reset:</p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="background: #1f2937; color: white; padding: 20px 40px; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 8px; display: inline-block; font-family: monospace;">${code}</div>
          </div>
          <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">This code will expire in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
        </div>
        <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
          <p>Checkmate - Event Check-In Made Easy</p>
        </div>
      </body>
      </html>
    `;

    const text = `
Hi ${name},

You requested to reset your password. Use the code below:

${code}

This code will expire in 15 minutes.

If you didn't request this, you can safely ignore this email.

- Checkmate Team
    `.trim();

    return this.sendEmail({
      to: email,
      subject: 'Your Checkmate password reset code',
      html,
      text,
    });
  }

  async sendOTPEmail(
    email: string,
    firstName: string | null,
    code: string
  ): Promise<{ success: boolean; error?: string }> {
    const name = firstName || 'there';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Checkmate Login</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
          <p>Hi ${name},</p>
          <p>Your login code is:</p>
          <div style="background: #fff; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; border: 2px solid #667eea;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #667eea;">${code}</span>
          </div>
          <p style="color: #666; font-size: 14px;">This code expires in 10 minutes.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request this code, you can safely ignore this email.</p>
        </div>
        <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
          Checkmate - Event Registration & Check-In
        </p>
      </body>
      </html>
    `;

    const text = `
Hi ${name},

Your Checkmate login code is: ${code}

This code expires in 10 minutes.

If you didn't request this code, you can safely ignore this email.

- Checkmate Team
    `.trim();

    return this.sendEmail({
      to: email,
      subject: 'Your Checkmate login code',
      html,
      text,
    });
  }
  async sendFeedbackReplyEmail(
    email: string,
    firstName: string | null,
    feedbackType: string,
    adminResponseText: string,
    ticketNumber: number | null
  ): Promise<{ success: boolean; error?: string }> {
    const safeName = escapeHtml(firstName || 'there');
    const ticketRef = ticketNumber ? `#${ticketNumber}` : '';
    const typeLabel = feedbackType === 'feature_request' ? 'Feature Request' 
      : feedbackType === 'issue' ? 'Issue Report' 
      : 'Feedback';
    const safeResponseText = escapeHtml(adminResponseText);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #0B2958 0%, #2FB36D 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Update on Your ${typeLabel} ${ticketRef}</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hi ${safeName},</p>
          <p style="font-size: 16px; margin-bottom: 20px;">The Checkmate team has responded to your ${typeLabel.toLowerCase()}${ticketRef ? ` (${ticketRef})` : ''}:</p>
          <div style="background: #fff; padding: 20px; border-radius: 8px; border-left: 4px solid #2FB36D; margin: 20px 0;">
            <p style="font-size: 15px; color: #1f2937; margin: 0; white-space: pre-wrap;">${safeResponseText}</p>
          </div>
          <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">You can view this update and continue the conversation in your Checkmate dashboard under "My Feedback".</p>
        </div>
        <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
          <p>Checkmate - Event Check-In Made Easy</p>
        </div>
      </body>
      </html>
    `;

    const text = `
Hi ${name},

The Checkmate team has responded to your ${typeLabel.toLowerCase()}${ticketRef ? ` (${ticketRef})` : ''}:

"${adminResponseText}"

You can view this update in your Checkmate dashboard under "My Feedback".

- Checkmate Team
    `.trim();

    return this.sendEmail({
      to: email,
      subject: `Update on your ${typeLabel.toLowerCase()}${ticketRef ? ` ${ticketRef}` : ''} — Checkmate`,
      html,
      text,
    });
  }
}

export const emailService = new EmailService();
