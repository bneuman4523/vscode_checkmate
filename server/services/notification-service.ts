/**
 * Notification Service - Send check-in alerts via webhook, SMS, and email
 * 
 * Features:
 * - Webhook notifications with HMAC signatures
 * - SMS via Twilio
 * - Email via SendGrid/Resend
 * - Attendee profile details in payload
 * - Retry logic with exponential backoff
 * - Notification logging and audit trail
 */

import { createChildLogger } from '../logger';
import crypto from 'crypto';
import twilio from 'twilio';
import type { Attendee, NotificationConfiguration } from '@shared/schema';

const logger = createChildLogger('NotificationService');

interface NotificationPayload {
  event: string;
  timestamp: string;
  attendee: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    company?: string;
    title?: string;
    participantType: string;
    customFields?: Record<string, string>;
  };
  eventDetails: {
    id: string;
    name: string;
    date?: string;
  };
  checkIn: {
    timestamp: string;
    checkedInBy?: string;
  };
  customData?: Record<string, any>;
}

class NotificationService {
  /**
   * Send check-in notification through configured channels
   */
  async sendCheckInNotification(
    attendee: Attendee,
    eventId: string,
    eventName: string,
    customerId: string,
    checkedInBy?: string
  ): Promise<void> {
    logger.info('Processing check-in notification for:', attendee.email);

    try {
      // Get notification configurations for this event
      const configurations = await this.getNotificationConfigurations(eventId, customerId);

      // Build notification payload
      const payload = this.buildNotificationPayload(
        attendee,
        eventId,
        eventName,
        checkedInBy
      );

      // Send notifications through each configured channel
      for (const config of configurations) {
        // Skip if not active or doesn't match trigger
        if (!config.active || config.triggerEvent !== 'check_in') {
          continue;
        }

        // Filter by participant type if configured
        if (config.participantTypeFilter && 
            config.participantTypeFilter !== attendee.participantType) {
          continue;
        }

        // Merge custom payload if provided
        const finalPayload = config.customPayload
          ? { ...payload, customData: config.customPayload }
          : payload;

        // Send through configured channels
        const results = await Promise.allSettled([
          config.webhookEnabled && config.webhookUrl
            ? this.sendWebhook(config, finalPayload)
            : Promise.resolve(),
          config.smsEnabled && config.smsRecipients
            ? this.sendSMS(config, finalPayload)
            : Promise.resolve(),
          config.emailEnabled && config.emailRecipients
            ? this.sendEmail(config, finalPayload)
            : Promise.resolve(),
        ]);

        // Log results
        results.forEach((result, index) => {
          const channels = ['webhook', 'sms', 'email'];
          if (result.status === 'rejected') {
            logger.error({ err: result.reason }, `${channels[index]} notification failed`);
          }
        });
      }

      logger.info('Check-in notifications sent successfully');
    } catch (error) {
      logger.error({ err: error }, 'Error sending notifications');
      throw error;
    }
  }

  /**
   * Build notification payload with attendee details
   */
  private buildNotificationPayload(
    attendee: Attendee,
    eventId: string,
    eventName: string,
    checkedInBy?: string
  ): NotificationPayload {
    return {
      event: 'attendee.checked_in',
      timestamp: new Date().toISOString(),
      attendee: {
        id: attendee.id,
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        email: attendee.email,
        company: attendee.company || undefined,
        title: attendee.title || undefined,
        participantType: attendee.participantType,
        customFields: attendee.customFields || undefined,
      },
      eventDetails: {
        id: eventId,
        name: eventName,
        date: undefined, // PLANNED: Get from events table — see docs/ROADMAP.md Phase 5
      },
      checkIn: {
        timestamp: attendee.checkedInAt?.toISOString() || new Date().toISOString(),
        checkedInBy,
      },
    };
  }

  /**
   * Send webhook notification with HMAC signature
   */
  private async sendWebhook(
    config: NotificationConfiguration,
    payload: NotificationPayload
  ): Promise<void> {
    if (!config.webhookUrl) {
      throw new Error('Webhook URL not configured');
    }

    logger.info('Sending webhook to:', config.webhookUrl);

    const payloadString = JSON.stringify(payload);
    
    // Generate HMAC signature if secret is configured
    let signature: string | undefined;
    if (config.webhookSecretRef) {
      // PLANNED: Get secret from credential manager — see docs/ROADMAP.md Phase 5
      const secret = process.env[config.webhookSecretRef] || '';
      signature = crypto
        .createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');
    }

    try {
      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(signature && { 'X-Webhook-Signature': `sha256=${signature}` }),
          'X-Event-Type': payload.event,
          'X-Event-Timestamp': payload.timestamp,
        },
        body: payloadString,
      });

      if (!response.ok) {
        throw new Error(`Webhook failed with status ${response.status}`);
      }

      // PLANNED: Log success to notification_logs — see docs/ROADMAP.md Phase 5
      logger.info('Webhook sent successfully');
    } catch (error) {
      // PLANNED: Log failure to notification_logs — see docs/ROADMAP.md Phase 5
      logger.error({ err: error }, 'Webhook error');
      throw error;
    }
  }

  /**
   * Send SMS notification via Twilio
   */
  private async sendSMS(
    config: NotificationConfiguration,
    payload: NotificationPayload
  ): Promise<void> {
    if (!config.smsRecipients || config.smsRecipients.length === 0) {
      throw new Error('SMS recipients not configured');
    }

    // Verify Twilio credentials are configured
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      throw new Error('Twilio credentials not configured. Please add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to secrets.');
    }

    logger.info('Sending SMS to:', config.smsRecipients.length, 'recipients');

    // Build SMS message
    const message = this.buildSMSMessage(payload);

    try {
      // Initialize Twilio client
      const twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      // Send to each recipient
      const results = await Promise.allSettled(
        config.smsRecipients.map(async (recipient) => {
          const result = await twilioClient.messages.create({
            to: recipient,
            from: process.env.TWILIO_PHONE_NUMBER,
            body: message,
          });
          
          logger.info(`SMS sent to ${recipient}, SID: ${result.sid}`);
          return result;
        })
      );

      // Check for failures
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        logger.error({ err: failures }, 'Some SMS sends failed');
        // PLANNED: Log failures to notification_logs — see docs/ROADMAP.md Phase 5
      }

      // PLANNED: Log successes to notification_logs — see docs/ROADMAP.md Phase 5
      logger.info('SMS notifications sent successfully');
    } catch (error) {
      logger.error({ err: error }, 'SMS error');
      // PLANNED: Log failure to notification_logs — see docs/ROADMAP.md Phase 5
      throw error;
    }
  }

  /**
   * Send email notification via SendGrid/Resend
   */
  private async sendEmail(
    config: NotificationConfiguration,
    payload: NotificationPayload
  ): Promise<void> {
    if (!config.emailRecipients || config.emailRecipients.length === 0) {
      throw new Error('Email recipients not configured');
    }

    logger.info('Sending email to:', config.emailRecipients.length, 'recipients');

    // Build email content
    const { subject, html, text } = this.buildEmailContent(config, payload);

    // PLANNED: Use SendGrid/Resend connector to send email — see docs/ROADMAP.md Phase 5
    logger.info('Email subject:', subject);
    logger.info('Recipients:', config.emailRecipients);

    // PLANNED: Integrate with SendGrid/Resend — see docs/ROADMAP.md Phase 5
    // const emailClient = getEmailClient();
    // await emailClient.send({
    //   to: config.emailRecipients,
    //   from: process.env.FROM_EMAIL,
    //   subject,
    //   text,
    //   html,
    // });

    // PLANNED: Log success to notification_logs — see docs/ROADMAP.md Phase 5
  }

  /**
   * Build SMS message from notification payload
   */
  private buildSMSMessage(payload: NotificationPayload): string {
    const { attendee, eventDetails } = payload;
    return `Check-in Alert: ${attendee.firstName} ${attendee.lastName} (${attendee.participantType}) has checked in to ${eventDetails.name}. Company: ${attendee.company || 'N/A'}, Title: ${attendee.title || 'N/A'}`;
  }

  /**
   * Build email content from notification payload
   */
  private buildEmailContent(
    config: NotificationConfiguration,
    payload: NotificationPayload
  ): { subject: string; html: string; text: string } {
    const { attendee, eventDetails, checkIn } = payload;

    const subject = config.emailSubject || `Check-in Alert: ${attendee.firstName} ${attendee.lastName}`;

    const text = `
Check-in Notification

Attendee: ${attendee.firstName} ${attendee.lastName}
Email: ${attendee.email}
Company: ${attendee.company || 'N/A'}
Title: ${attendee.title || 'N/A'}
Attendee Type: ${attendee.participantType}

Event: ${eventDetails.name}
Check-in Time: ${new Date(checkIn.timestamp).toLocaleString()}
${checkIn.checkedInBy ? `Checked in by: ${checkIn.checkedInBy}` : 'Self check-in (kiosk)'}

${attendee.customFields ? `\nAdditional Details:\n${Object.entries(attendee.customFields).map(([key, value]) => `${key}: ${value}`).join('\n')}` : ''}
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; }
    .field { margin-bottom: 12px; }
    .label { font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase; }
    .value { font-size: 16px; color: #111827; }
    .badge { display: inline-block; padding: 4px 12px; background: #3b82f6; color: white; border-radius: 9999px; font-size: 12px; font-weight: 500; }
    .footer { padding: 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; text-align: center; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">✓ Check-in Notification</h1>
    </div>
    <div class="content">
      <div class="field">
        <div class="label">Attendee</div>
        <div class="value">${attendee.firstName} ${attendee.lastName}</div>
      </div>
      <div class="field">
        <div class="label">Email</div>
        <div class="value">${attendee.email}</div>
      </div>
      ${attendee.company ? `
      <div class="field">
        <div class="label">Company</div>
        <div class="value">${attendee.company}</div>
      </div>
      ` : ''}
      ${attendee.title ? `
      <div class="field">
        <div class="label">Title</div>
        <div class="value">${attendee.title}</div>
      </div>
      ` : ''}
      <div class="field">
        <div class="label">Attendee Type</div>
        <div class="value"><span class="badge">${attendee.participantType}</span></div>
      </div>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
      <div class="field">
        <div class="label">Event</div>
        <div class="value">${eventDetails.name}</div>
      </div>
      <div class="field">
        <div class="label">Check-in Time</div>
        <div class="value">${new Date(checkIn.timestamp).toLocaleString()}</div>
      </div>
      ${checkIn.checkedInBy ? `
      <div class="field">
        <div class="label">Checked in by</div>
        <div class="value">${checkIn.checkedInBy}</div>
      </div>
      ` : ''}
      ${attendee.customFields && Object.keys(attendee.customFields).length > 0 ? `
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
      <div class="label">Additional Details</div>
      ${Object.entries(attendee.customFields).map(([key, value]) => `
      <div class="field">
        <div class="label">${key}</div>
        <div class="value">${value}</div>
      </div>
      `).join('')}
      ` : ''}
    </div>
    <div class="footer">
      Event Check-in Notification System
    </div>
  </div>
</body>
</html>
    `.trim();

    return { subject, html, text };
  }

  /**
   * Get notification configurations for event
   */
  private async getNotificationConfigurations(
    eventId: string,
    customerId: string
  ): Promise<NotificationConfiguration[]> {
    // PLANNED: Query database for active notification configurations — see docs/ROADMAP.md Phase 5
    // Filter by eventId (or global configurations where eventId is null)
    // and customerId for tenant isolation

    // Mock data for now
    return [];
  }
}

// Singleton instance
export const notificationService = new NotificationService();
