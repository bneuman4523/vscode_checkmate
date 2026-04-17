/**
 * CheckinSyncService
 * 
 * Handles real-time synchronization of check-in status with external registration systems.
 * Sends webhook notifications when attendees are checked in or when check-ins are reverted.
 * 
 * Features:
 * - Uses existing integration credentials (Basic Auth)
 * - Exponential backoff retry for 429 rate limit errors
 * - Configurable per-integration webhook endpoint
 */

import { createChildLogger } from '../logger';
import { Attendee, Event, CustomerIntegration, Session } from "../../shared/schema";
import { storage } from "../storage";
import { decryptCredential } from "../credential-manager";

const logger = createChildLogger('CheckinSync');

export interface CheckinSyncPayload {
  event: 'attendee.checkin' | 'attendee.checkin_reverted';
  timestamp: string;
  attendee: {
    id: string;
    externalId: string | null;
    registrationCode?: string;
    firstName: string;
    lastName: string;
    email: string;
    participantType: string;
    registrationStatus: string;
  };
  eventDetails: {
    id: string;
    externalEventId: string | null;
    name: string;
    eventCode?: string | null;
  };
  checkIn: {
    status: 'checked_in' | 'reverted';
    checkedInAt: string | null;
    checkedInBy?: string;
    revertedAt?: string;
    revertedBy?: string;
  };
}

interface RealtimeSyncConfig {
  enabled: boolean;
  endpointUrl: string;
  walkinEndpointUrl?: string;
  walkinStatus?: string;
  walkinSource?: string;
  httpMethod?: 'POST' | 'PUT' | 'PATCH';
  checkinStatus?: string;
  revertStatus?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

interface RealtimeSessionSyncConfig {
  enabled: boolean;
  endpointUrl: string;
  httpMethod?: 'POST' | 'PUT' | 'PATCH';
  checkinStatus?: string; // Status to send on session check-in (default: "Attended")
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

interface CertainCheckinEntry {
  checkInDate: string;
  badgePrintedDate: string;
  entryType: string;
  createdBy: string;
  modifiedBy: string;
  dateCreated: string;
  dateModified: string;
  source: string;
}

interface CertainPayload {
  registrationStatusLabel: string;
  checkins?: CertainCheckinEntry[];
}

interface CertainRegistrationPayload {
  profile: {
    firstName: string;
    lastName: string;
    email?: string;
    pin?: string;
    organization?: string;
    position?: string;
  };
  registrationStatusLabel: string;
  source?: string;
  checkins?: CertainCheckinEntry[];
  reg_categories?: Array<{ catCode: string }>;
}

interface SyncResult {
  success: boolean;
  statusCode?: number;
  attempts: number;
  error?: string;
  retryAfter?: number;
  registrationCode?: string;
}

class CheckinSyncService {
  private readonly DEFAULT_MAX_RETRIES = 3;
  private readonly DEFAULT_RETRY_DELAY_MS = 1000;
  private readonly DEFAULT_TIMEOUT_MS = 30000;
  private readonly MAX_BACKOFF_MS = 60000;

  /**
   * Send check-in notification to external system
   */
  private isRealtimeSyncEnabled(event: Event, integration: CustomerIntegration): boolean {
    const config = integration.realtimeSyncConfig as RealtimeSyncConfig | null;
    if (!config?.enabled || !config?.endpointUrl) {
      return false;
    }
    const eventSyncSettings = event.syncSettings as { realtimeSyncEnabled?: boolean | null } | null;
    if (eventSyncSettings?.realtimeSyncEnabled === false) {
      return false;
    }
    return true;
  }

  async sendCheckinSync(
    attendee: Attendee,
    event: Event,
    integration: CustomerIntegration,
    checkedInBy?: string
  ): Promise<SyncResult> {
    if (!this.isRealtimeSyncEnabled(event, integration)) {
      const reason = (event.syncSettings as any)?.realtimeSyncEnabled === false
        ? `event ${event.id} has realtime sync disabled`
        : `integration ${integration.id}`;
      logger.info(`Realtime sync not enabled for ${reason}`);
      return { success: true, attempts: 0 };
    }

    const config = integration.realtimeSyncConfig as RealtimeSyncConfig;

    if (!attendee.externalId && config.walkinEndpointUrl) {
      logger.info(`Attendee ${attendee.id} has no externalId — routing to walk-in registration sync`);
      return this.sendWalkinRegistrationSync(attendee, event, integration, checkedInBy);
    }

    const now = new Date().toISOString().replace('Z', '').split('.')[0];
    const checkinDate = attendee.checkedInAt
      ? new Date(attendee.checkedInAt).toISOString().replace('Z', '').split('.')[0]
      : now;
    const badgePrintedDate = (attendee as any).badgePrintedAt
      ? new Date((attendee as any).badgePrintedAt).toISOString().replace('Z', '').split('.')[0]
      : checkinDate;

    const payload = this.buildCertainPayload(config.checkinStatus || "Checked In", {
      checkInDate: checkinDate,
      badgePrintedDate: badgePrintedDate,
      entryType: "On-site",
      createdBy: checkedInBy || "Greet",
      modifiedBy: checkedInBy || "Greet",
      dateCreated: now,
      dateModified: now,
      source: "Greet",
    });
    return this.sendWithRetry(payload, integration, config, attendee, event);
  }

  async sendWalkinRegistrationSync(
    attendee: Attendee,
    event: Event,
    integration: CustomerIntegration,
    checkedInBy?: string
  ): Promise<SyncResult> {
    if (!this.isRealtimeSyncEnabled(event, integration)) {
      return { success: true, attempts: 0 };
    }

    const config = integration.realtimeSyncConfig as RealtimeSyncConfig;

    if (!config.walkinEndpointUrl) {
      logger.info(`No walkinEndpointUrl configured for integration ${integration.id} — skipping walk-in sync`);
      return { success: true, attempts: 0 };
    }

    const now = new Date().toISOString().replace('Z', '').split('.')[0];
    const checkinDate = attendee.checkedInAt
      ? new Date(attendee.checkedInAt).toISOString().replace('Z', '').split('.')[0]
      : now;
    const source = config.walkinSource || "Greet";

    const payload: CertainRegistrationPayload = {
      profile: {
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        email: attendee.email || undefined,
        pin: attendee.email || `${attendee.firstName}.${attendee.lastName}`.toLowerCase(),
        organization: attendee.company || undefined,
        position: attendee.title || undefined,
      },
      registrationStatusLabel: config.walkinStatus || config.checkinStatus || "Checked In",
      source,
    };

    if (attendee.checkedIn && attendee.checkedInAt) {
      payload.checkins = [{
        checkInDate: checkinDate,
        badgePrintedDate: checkinDate,
        entryType: "On-site",
        createdBy: checkedInBy || source,
        modifiedBy: checkedInBy || source,
        dateCreated: now,
        dateModified: now,
        source,
      }];
    }

    if (attendee.participantType) {
      payload.reg_categories = [{ catCode: attendee.participantType }];
    }

    const walkinConfig: RealtimeSyncConfig = {
      ...config,
      endpointUrl: config.walkinEndpointUrl,
      httpMethod: 'POST',
    };

    const result = await this.sendWithRetry(payload, integration, walkinConfig, attendee, event);

    if (result.success && result.registrationCode) {
      try {
        await storage.updateAttendee(attendee.id, { externalId: result.registrationCode } as any);
        logger.info(`Updated attendee ${attendee.id} with externalId: ${result.registrationCode}`);
      } catch (error) {
        logger.error({ err: error }, `Failed to update attendee ${attendee.id} externalId after walk-in sync`);
      }
    }

    return result;
  }

  /**
   * Send check-in revert notification to external system
   */
  async sendCheckinRevertSync(
    attendee: Attendee,
    event: Event,
    integration: CustomerIntegration,
    revertedBy?: string
  ): Promise<SyncResult> {
    if (!this.isRealtimeSyncEnabled(event, integration)) {
      const reason = (event.syncSettings as any)?.realtimeSyncEnabled === false
        ? `event ${event.id} has realtime sync disabled`
        : `integration ${integration.id}`;
      logger.info(`Realtime sync not enabled for ${reason}`);
      return { success: true, attempts: 0 };
    }

    const config = integration.realtimeSyncConfig as RealtimeSyncConfig;
    const payload = this.buildCertainPayload(config.revertStatus || "Registered");
    return this.sendWithRetry(payload, integration, config, attendee, event);
  }

  /**
   * Build Certain-compatible payload with optional checkins array
   */
  private buildCertainPayload(statusLabel: string, checkinEntry?: CertainCheckinEntry): CertainPayload {
    const payload: CertainPayload = {
      registrationStatusLabel: statusLabel,
    };
    if (checkinEntry) {
      payload.checkins = [checkinEntry];
    }
    return payload;
  }

  /**
   * Build payload for check-in event (legacy format, kept for reference)
   */
  private buildCheckinPayload(
    attendee: Attendee,
    event: Event,
    checkedInBy?: string
  ): CheckinSyncPayload {
    return {
      event: 'attendee.checkin',
      timestamp: new Date().toISOString(),
      attendee: {
        id: attendee.id,
        externalId: attendee.externalId,
        registrationCode: attendee.customFields?.registrationCode as string | undefined,
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        email: attendee.email,
        participantType: attendee.participantType,
        registrationStatus: attendee.registrationStatus,
      },
      eventDetails: {
        id: event.id,
        externalEventId: event.externalEventId,
        name: event.name,
        eventCode: event.eventCode,
      },
      checkIn: {
        status: 'checked_in',
        checkedInAt: attendee.checkedInAt?.toISOString() || new Date().toISOString(),
        checkedInBy,
      },
    };
  }

  /**
   * Build payload for check-in revert event
   */
  private buildRevertPayload(
    attendee: Attendee,
    event: Event,
    revertedBy?: string
  ): CheckinSyncPayload {
    return {
      event: 'attendee.checkin_reverted',
      timestamp: new Date().toISOString(),
      attendee: {
        id: attendee.id,
        externalId: attendee.externalId,
        registrationCode: attendee.customFields?.registrationCode as string | undefined,
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        email: attendee.email,
        participantType: attendee.participantType,
        registrationStatus: attendee.registrationStatus,
      },
      eventDetails: {
        id: event.id,
        externalEventId: event.externalEventId,
        name: event.name,
        eventCode: event.eventCode,
      },
      checkIn: {
        status: 'reverted',
        checkedInAt: null,
        revertedAt: new Date().toISOString(),
        revertedBy,
      },
    };
  }

  /**
   * Get Basic Auth header from integration connection's stored credentials
   */
  private async getAuthHeader(integrationId: string): Promise<string | null> {
    try {
      // Get the connection for this integration
      const connection = await storage.getIntegrationConnectionByIntegration(integrationId);
      if (!connection) {
        logger.warn(`No connection found for integration: ${integrationId}`);
        return null;
      }

      // Get stored credentials for this connection
      const usernameCredential = await storage.getStoredCredentialByType(connection.id, 'basic_username');
      const passwordCredential = await storage.getStoredCredentialByType(connection.id, 'basic_password');

      if (usernameCredential && passwordCredential) {
        // Decrypt credentials
        const username = decryptCredential({
          encryptedValue: usernameCredential.encryptedValue,
          iv: usernameCredential.iv,
          authTag: usernameCredential.authTag,
          encryptionKeyId: usernameCredential.encryptionKeyId,
        });
        const password = decryptCredential({
          encryptedValue: passwordCredential.encryptedValue,
          iv: passwordCredential.iv,
          authTag: passwordCredential.authTag,
          encryptionKeyId: passwordCredential.encryptionKeyId,
        });

        // Build Basic Auth header
        const credentials = `${username}:${password}`;
        const encoded = Buffer.from(credentials).toString('base64');
        return `Basic ${encoded}`;
      } else {
        logger.warn(`Missing credentials for connection: ${connection.id}`);
        return null;
      }
    } catch (error) {
      logger.error({ err: error }, 'Error getting credentials');
      return null;
    }
  }

  /**
   * Build full URL from base URL and relative path
   */
  private buildFullUrl(baseUrl: string | null, relativePath: string): string {
    // If the path is already a full URL, return it as-is
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
      return relativePath;
    }

    // If we have a base URL and a relative path, combine them
    if (baseUrl) {
      const normalizedBase = baseUrl.replace(/\/$/, ''); // Remove trailing slash
      const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
      return `${normalizedBase}${normalizedPath}`;
    }

    // Fallback: return the path as-is (will likely fail if it's relative)
    logger.warn({ err: relativePath }, 'No base URL available for relative path');
    return relativePath;
  }

  /**
   * Replace URL placeholders with actual data from attendee and event
   */
  private resolveEndpointUrl(urlTemplate: string, attendee: Attendee, event: Event): string {
    return urlTemplate
      .replace(/\{\{accountCode\}\}/g, event.accountCode || '')
      .replace(/\{\{eventCode\}\}/g, event.eventCode || '')
      .replace(/\{\{externalId\}\}/g, attendee.externalId || '')
      .replace(/\{\{attendeeId\}\}/g, attendee.id)
      .replace(/\{\{eventId\}\}/g, event.id)
      .replace(/\{\{externalEventId\}\}/g, event.externalEventId || '')
      .replace(/\{\{email\}\}/g, encodeURIComponent(attendee.email));
  }

  /**
   * Send webhook with exponential backoff retry for 429 errors
   */
  private async sendWithRetry(
    payload: CertainPayload | CheckinSyncPayload | CertainRegistrationPayload,
    integration: CustomerIntegration,
    config: RealtimeSyncConfig,
    attendee: Attendee,
    event: Event
  ): Promise<SyncResult> {
    const maxRetries = config.maxRetries ?? this.DEFAULT_MAX_RETRIES;
    const baseDelay = config.retryDelayMs ?? this.DEFAULT_RETRY_DELAY_MS;
    const timeout = config.timeoutMs ?? this.DEFAULT_TIMEOUT_MS;

    // Get auth header from connection credentials
    const authHeader = await this.getAuthHeader(integration.id);

    // Replace placeholders in URL with actual values
    const resolvedPath = this.resolveEndpointUrl(config.endpointUrl, attendee, event);
    
    // Build full URL from integration's base URL + relative path
    const resolvedUrl = this.buildFullUrl(integration.baseUrl, resolvedPath);

    let attempts = 0;
    let lastError: string | undefined;

    while (attempts <= maxRetries) {
      attempts++;
      
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        // Apply Basic Auth from integration connection's stored credentials
        if (authHeader) {
          headers['Authorization'] = authHeader;
        } else {
          logger.warn({ err: integration.id }, 'No credentials found for integration');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const method = config.httpMethod || 'POST';
        const isRegistrationCreate = 'profile' in payload;
        const eventType = 'registrationStatusLabel' in payload 
          ? `status update (${payload.registrationStatusLabel})${isRegistrationCreate ? ' [new registration]' : ''}`
          : (payload as CheckinSyncPayload).event;
        const bodyJson = JSON.stringify(payload);
        logger.info(`${method} ${eventType} to ${resolvedUrl} (attempt ${attempts}/${maxRetries + 1})`);
        if (isRegistrationCreate) {
          const { profile, ...rest } = payload as CertainRegistrationPayload;
          logger.info(`Request body: ${JSON.stringify({ profile: { firstName: '***', lastName: '***', email: '***' }, ...rest })}`);
        } else {
          logger.info(`Request body: ${bodyJson}`);
        }

        const response = await fetch(resolvedUrl, {
          method,
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          let registrationCode: string | undefined;
          try {
            const responseBody = await response.json();
            registrationCode = responseBody?.registrationCode
              || responseBody?.registration?.registrationCode
              || responseBody?.data?.registrationCode
              || responseBody?.id;
            if (registrationCode) {
              registrationCode = String(registrationCode);
            }
          } catch {
          }

          logger.info(`Successfully sent ${eventType} (status: ${response.status}${registrationCode ? `, registrationCode: ${registrationCode}` : ''})`);
          return {
            success: true,
            statusCode: response.status,
            attempts,
            registrationCode,
          };
        }

        // Rate limited - retry with backoff
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
          const delay = retryAfter > 0 
            ? retryAfter * 1000 
            : Math.min(baseDelay * Math.pow(2, attempts - 1) + this.jitter(), this.MAX_BACKOFF_MS);
          
          logger.warn(`Rate limited (429). Waiting ${delay}ms before retry...`);
          
          if (attempts <= maxRetries) {
            await this.sleep(delay);
            continue;
          }
          
          return {
            success: false,
            statusCode: 429,
            attempts,
            error: 'Rate limit exceeded after max retries',
            retryAfter: delay,
          };
        }

        // Other error - don't retry
        const errorText = await response.text();
        lastError = `HTTP ${response.status}: ${errorText.substring(0, 200)}`;
        logger.error(`Failed to send webhook: ${lastError}`);
        
        return {
          success: false,
          statusCode: response.status,
          attempts,
          error: lastError,
        };

      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = `Request timeout after ${timeout}ms`;
        }
        
        logger.error({ err: lastError }, `Request error (attempt ${attempts})`);

        // Retry on network errors
        if (attempts <= maxRetries) {
          const delay = Math.min(baseDelay * Math.pow(2, attempts - 1) + this.jitter(), this.MAX_BACKOFF_MS);
          logger.info(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
          continue;
        }
      }
    }

    return {
      success: false,
      attempts,
      error: lastError || 'Max retries exceeded',
    };
  }

  /**
   * Add random jitter to prevent thundering herd
   */
  private jitter(): number {
    return Math.floor(Math.random() * 500);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if realtime session sync is enabled for this event/integration
   */
  private isSessionSyncEnabled(event: Event, integration: CustomerIntegration): boolean {
    const config = integration.realtimeSessionSyncConfig as RealtimeSessionSyncConfig | null;
    if (!config?.enabled || !config?.endpointUrl) {
      return false;
    }
    const eventSyncSettings = event.syncSettings as { realtimeSyncEnabled?: boolean | null; realtimeSessionSyncEnabled?: boolean | null } | null;
    if (eventSyncSettings?.realtimeSyncEnabled === false) {
      return false;
    }
    if (eventSyncSettings?.realtimeSessionSyncEnabled === false) {
      return false;
    }
    return true;
  }

  /**
   * Send session check-in to external system (Certain session registration endpoint).
   * Payload: array of [{registrationCode, instanceId, status}]
   */
  async sendSessionCheckinSync(
    attendee: Attendee,
    session: Session,
    event: Event,
    integration: CustomerIntegration
  ): Promise<SyncResult> {
    if (!this.isSessionSyncEnabled(event, integration)) {
      logger.info(`Session realtime sync not enabled for integration ${integration.id}`);
      return { success: true, attempts: 0 };
    }

    const config = integration.realtimeSessionSyncConfig as RealtimeSessionSyncConfig;
    const registrationCode = attendee.externalId;
    const instanceId = session.instanceId;

    if (!registrationCode) {
      logger.warn(`No externalId (registrationCode) for attendee ${attendee.id}, skipping session sync`);
      return { success: false, attempts: 0, error: 'Attendee has no externalId (registrationCode)' };
    }

    if (!instanceId) {
      logger.warn(`No instanceId for session ${session.id}, skipping session sync`);
      return { success: false, attempts: 0, error: 'Session has no instanceId' };
    }

    const status = config.checkinStatus || 'Attended';
    const payload = [{
      registrationCode,
      instanceId,
      status,
    }];

    return this.sendSessionSyncWithRetry(payload, integration, config, event);
  }

  /**
   * Send session sync request with retry logic
   */
  private async sendSessionSyncWithRetry(
    payload: Array<{ registrationCode: string; instanceId: number; status: string }>,
    integration: CustomerIntegration,
    config: RealtimeSessionSyncConfig,
    event: Event
  ): Promise<SyncResult> {
    const maxRetries = config.maxRetries ?? this.DEFAULT_MAX_RETRIES;
    const baseDelay = config.retryDelayMs ?? this.DEFAULT_RETRY_DELAY_MS;
    const timeout = config.timeoutMs ?? this.DEFAULT_TIMEOUT_MS;

    const authHeader = await this.getAuthHeader(integration.id);

    let resolvedPath = config.endpointUrl
      .replace(/\{\{accountCode\}\}/g, event.accountCode || '')
      .replace(/\{\{eventCode\}\}/g, event.eventCode || '')
      .replace(/\{\{eventId\}\}/g, event.id)
      .replace(/\{\{externalEventId\}\}/g, event.externalEventId || '');

    const resolvedUrl = this.buildFullUrl(integration.baseUrl, resolvedPath);

    let attempts = 0;
    let lastError: string | undefined;

    while (attempts <= maxRetries) {
      attempts++;

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (authHeader) {
          headers['Authorization'] = authHeader;
        } else {
          logger.warn({ err: integration.id }, 'No credentials found for session sync, integration');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const method = config.httpMethod || 'POST';
        const bodyJson = JSON.stringify(payload);
        logger.info(`Session sync ${method} to ${resolvedUrl} (attempt ${attempts}/${maxRetries + 1})`);
        logger.info(`Session sync body: ${bodyJson}`);

        const response = await fetch(resolvedUrl, {
          method,
          headers,
          body: bodyJson,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          logger.info(`Session sync successful (status: ${response.status})`);
          return { success: true, statusCode: response.status, attempts };
        }

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
          const delay = retryAfter > 0
            ? retryAfter * 1000
            : Math.min(baseDelay * Math.pow(2, attempts - 1) + this.jitter(), this.MAX_BACKOFF_MS);

          logger.warn(`Session sync rate limited (429). Waiting ${delay}ms...`);

          if (attempts <= maxRetries) {
            await this.sleep(delay);
            continue;
          }

          return { success: false, statusCode: 429, attempts, error: 'Rate limit exceeded after max retries', retryAfter: delay };
        }

        const errorText = await response.text();
        lastError = `HTTP ${response.status}: ${errorText.substring(0, 200)}`;
        logger.error(`Session sync failed: ${lastError}`);

        return { success: false, statusCode: response.status, attempts, error: lastError };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';

        if (error instanceof Error && error.name === 'AbortError') {
          lastError = `Request timeout after ${timeout}ms`;
        }

        logger.error({ err: lastError }, `Session sync request error (attempt ${attempts})`);

        if (attempts <= maxRetries) {
          const delay = Math.min(baseDelay * Math.pow(2, attempts - 1) + this.jitter(), this.MAX_BACKOFF_MS);
          await this.sleep(delay);
          continue;
        }
      }
    }

    return { success: false, attempts, error: lastError || 'Max retries exceeded' };
  }

  /**
   * Get integration for an event (looks up via event's integrationId or customer default)
   */
  async getIntegrationForEvent(event: Event): Promise<CustomerIntegration | undefined> {
    if (event.integrationId) {
      return storage.getCustomerIntegration(event.integrationId);
    }
    
    // Fallback: get first active integration for customer
    const integrations = await storage.getCustomerIntegrations(event.customerId);
    return integrations.find(i => i.status === 'active');
  }
}

export const checkinSyncService = new CheckinSyncService();
