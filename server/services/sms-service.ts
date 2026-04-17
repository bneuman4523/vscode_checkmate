import { createChildLogger } from '../logger';
import twilio from 'twilio';

const logger = createChildLogger('SMSService');

interface SMSOptions {
  to: string;
  message: string;
}

class SMSService {
  private client: ReturnType<typeof twilio> | null = null;
  private fromNumber: string = '';
  private messagingServiceSid: string = '';

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    const msgServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

    if (accountSid && authToken && (phoneNumber || msgServiceSid)) {
      this.client = twilio(accountSid, authToken);
      this.fromNumber = phoneNumber || '';
      this.messagingServiceSid = msgServiceSid || '';
      logger.info(`Initialized with Twilio (${this.messagingServiceSid ? 'Messaging Service' : 'From Number'})`);
    } else {
      logger.info('Twilio credentials not configured - SMS sending disabled');
    }
  }

  isConfigured(): boolean {
    return this.client !== null && (this.fromNumber !== '' || this.messagingServiceSid !== '');
  }

  async sendSMS(options: SMSOptions): Promise<{ success: boolean; error?: string; sid?: string }> {
    if (!this.client || (!this.fromNumber && !this.messagingServiceSid)) {
      logger.info('SMS not sent - Twilio not configured');
      return { success: false, error: 'SMS service not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID.' };
    }

    try {
      const messageParams: { to: string; body: string; from?: string; messagingServiceSid?: string } = {
        to: options.to,
        body: options.message,
      };

      const isNorthAmerica = options.to.startsWith('+1');

      if (isNorthAmerica && this.fromNumber) {
        messageParams.from = this.fromNumber;
      } else if (this.messagingServiceSid) {
        messageParams.messagingServiceSid = this.messagingServiceSid;
      } else {
        messageParams.from = this.fromNumber;
      }

      logger.info(`Sending to ${options.to} via ${messageParams.from ? 'From Number' : 'Messaging Service'}`);
      const result = await this.client.messages.create(messageParams);

      logger.info('SMS sent successfully to:', options.to, 'SID:', result.sid);
      return { success: true, sid: result.sid };
    } catch (error) {
      logger.error({ err: error }, 'Error sending SMS');
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  async sendPasswordSetupCode(
    phoneNumber: string,
    firstName: string | null,
    code: string,
    baseUrl?: string
  ): Promise<{ success: boolean; error?: string }> {
    const name = firstName || 'there';
    const setupUrl = baseUrl ? `${baseUrl}/api/password-setup?code=${code}` : null;

    const message = setupUrl
      ? `Hi ${name}! Your Greet access code is: ${code}

Set up your password here: ${setupUrl}

This code expires in 48 hours.`
      : `Hi ${name}! Your Greet access code is: ${code}

Enter this code to set up your password. This code expires in 48 hours.`;

    return this.sendSMS({
      to: phoneNumber,
      message,
    });
  }

  async sendPasswordResetCode(
    phoneNumber: string,
    firstName: string | null,
    code: string
  ): Promise<{ success: boolean; error?: string }> {
    const name = firstName || 'there';

    const message = `Hi ${name}! Your Greet password reset code is: ${code}

This code expires in 15 minutes. If you didn't request this, please ignore.`;

    return this.sendSMS({
      to: phoneNumber,
      message,
    });
  }
}

export const smsService = new SMSService();
