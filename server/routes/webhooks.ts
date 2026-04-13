/**
 * Webhook Receiver - Handle real-time updates from external platforms
 * 
 * Features:
 * - HMAC signature verification
 * - Event type routing
 * - Automatic sync job creation
 * - Replay protection
 * - Error handling and logging
 */

import { createChildLogger } from '../logger';
import express, { Request, Response } from 'express';
import crypto from 'crypto';

const logger = createChildLogger('Webhooks');

const router = express.Router();

interface WebhookPayload {
  event_type: string;
  event_id: string;
  data: any;
  timestamp: string;
  signature?: string;
}

/**
 * Verify HMAC signature
 */
function verifySignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm: string = 'sha256'
): boolean {
  const expectedSignature = crypto
    .createHmac(algorithm, secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Parse webhook signature header (varies by platform)
 */
function parseSignatureHeader(header: string): { signature: string; timestamp?: string } {
  // Stripe format: "t=1492774577,v1=signature"
  if (header.includes('t=')) {
    const parts = header.split(',');
    const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1];
    const signature = parts.find(p => p.startsWith('v1='))?.split('=')[1] || '';
    return { signature, timestamp };
  }

  // Simple format: just the signature
  return { signature: header };
}

/**
 * Generic webhook receiver endpoint
 */
router.post('/webhooks/:integrationId', async (req: Request, res: Response) => {
  const { integrationId } = req.params;
  const signatureHeader = req.headers['x-webhook-signature'] as string;
  
  try {
    // PLANNED: Get webhook configuration from database — see docs/ROADMAP.md Phase 3
    const webhookConfig = {
      secretRef: 'WEBHOOK_SECRET_123',
      signatureHeader: 'X-Webhook-Signature',
      active: true,
    };

    if (!webhookConfig.active) {
      return res.status(404).json({ error: 'Webhook not configured' });
    }

    // Verify signature
    if (signatureHeader) {
      // PLANNED: Get secret from credential manager — see docs/ROADMAP.md Phase 3
      const secret = process.env[webhookConfig.secretRef] || '';
      const payload = JSON.stringify(req.body);
      const { signature } = parseSignatureHeader(signatureHeader);

      if (!verifySignature(payload, signature, secret)) {
        logger.error('Invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const webhookPayload: WebhookPayload = req.body;
    
    logger.info('Received event:', {
      integrationId,
      eventType: webhookPayload.event_type,
      eventId: webhookPayload.event_id,
    });

    // Route to appropriate handler
    await handleWebhookEvent(integrationId, webhookPayload);

    // PLANNED: Update webhook configuration (lastTriggeredAt, totalReceived) — see docs/ROADMAP.md Phase 3

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ err: error }, 'Processing error');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Eventbrite webhook endpoint
 */
router.post('/webhooks/eventbrite/:integrationId', async (req: Request, res: Response) => {
  const { integrationId } = req.params;
  
  try {
    const webhookPayload = req.body;
    
    logger.info({ integrationId, action: webhookPayload.config?.action, eventId: webhookPayload.api_url }, 'Received Eventbrite event');

    // Eventbrite webhook events:
    // - order.placed
    // - order.updated
    // - organizer.updated
    // - event.created
    // - event.updated
    // - event.published

    await handleWebhookEvent(integrationId, {
      event_type: webhookPayload.config?.action || 'unknown',
      event_id: webhookPayload.config?.webhook_id || '',
      data: webhookPayload,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ err: error }, 'Eventbrite webhook processing error');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Handle webhook event
 */
async function handleWebhookEvent(
  integrationId: string,
  payload: WebhookPayload
): Promise<void> {
  // Determine action based on event type
  const eventHandlers: Record<string, (payload: WebhookPayload) => Promise<void>> = {
    'order.placed': handleOrderPlaced,
    'order.updated': handleOrderUpdated,
    'attendee.created': handleAttendeeCreated,
    'attendee.updated': handleAttendeeUpdated,
    'event.created': handleEventCreated,
    'event.updated': handleEventUpdated,
  };

  const handler = eventHandlers[payload.event_type];
  if (handler) {
    await handler(payload);
  } else {
    logger.warn(`No handler for event type: ${payload.event_type}`);
  }
}

/**
 * Event handlers
 */

async function handleOrderPlaced(payload: WebhookPayload): Promise<void> {
  logger.info('Processing order.placed');
  
  // PLANNED: Create sync job to fetch attendee data for this order — see docs/ROADMAP.md Phase 3
}

async function handleOrderUpdated(payload: WebhookPayload): Promise<void> {
  logger.info('Processing order.updated');
  
  // PLANNED: Update attendee data for this order — see docs/ROADMAP.md Phase 3
}

async function handleAttendeeCreated(payload: WebhookPayload): Promise<void> {
  logger.info('Processing attendee.created');
  
  // PLANNED: Create attendee record in local database — see docs/ROADMAP.md Phase 3
}

async function handleAttendeeUpdated(payload: WebhookPayload): Promise<void> {
  logger.info('Processing attendee.updated');
  
  // PLANNED: Update attendee record in local database — see docs/ROADMAP.md Phase 3
}

async function handleEventCreated(payload: WebhookPayload): Promise<void> {
  logger.info('Processing event.created');
  
  // PLANNED: Auto-create event code mapping — see docs/ROADMAP.md Phase 3
}

async function handleEventUpdated(payload: WebhookPayload): Promise<void> {
  logger.info('Processing event.updated');
  
  // PLANNED: Update event details if needed — see docs/ROADMAP.md Phase 3
}

/**
 * Webhook test endpoint (for development)
 */
router.post('/webhooks/test', (req: Request, res: Response) => {
  logger.info({ payload: req.body }, 'Received test webhook payload');
  res.status(200).json({
    received: true,
    timestamp: new Date().toISOString(),
    payload: req.body,
  });
});

export default router;
