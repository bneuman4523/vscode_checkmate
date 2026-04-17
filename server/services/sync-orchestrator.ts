/**
 * Sync Orchestrator - Manages attendee data synchronization from external platforms
 * 
 * Features:
 * - Event code mapping and retrieval
 * - Incremental sync with cursor/pagination support
 * - Field transformation and mapping
 * - Minimal PII extraction (PCI compliant)
 * - Retry logic with exponential backoff
 * - Dead-letter queue for failed jobs
 */

import { createChildLogger } from '../logger';
import { ApiClient } from './api-client';
import { storage } from '../storage';
import type { CustomerIntegration, EventCodeMapping, IntegrationEndpointConfig } from '@shared/schema';

const logger = createChildLogger('SyncOrchestrator');

async function safeJsonParse(response: Response, context: string): Promise<any> {
  const contentType = response.headers.get('content-type') || '';
  const body = await response.text();

  if (!contentType.includes('application/json') && body.trimStart().startsWith('<')) {
    throw new Error(
      `${context}: Expected JSON but received HTML (status ${response.status}, content-type: ${contentType}). ` +
      `Body preview: ${body.substring(0, 200)}`
    );
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(
      `${context}: Failed to parse JSON (status ${response.status}, content-type: ${contentType}). ` +
      `Body preview: ${body.substring(0, 200)}`
    );
  }
}

function formatCertainTimestamp(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const MM = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const HH = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}/${MM}/${dd} ${HH}:${mm}:${ss}`;
}

interface SyncConfig {
  integration: CustomerIntegration;
  eventCodeMapping: EventCodeMapping;
  batchSize?: number;
}

interface EventSyncConfig {
  integration: CustomerIntegration;
  endpointConfig: IntegrationEndpointConfig;
  batchSize?: number;
}

interface EventSyncResult {
  success: boolean;
  processedCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  errors: Array<{ record: any; error: string }>;
}

interface AttendeeData {
  externalId: string;
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  title?: string;
  participantType: string;
  customFields?: Record<string, string>;
  orderCode?: string;
}

interface SyncResult {
  success: boolean;
  processedCount: number;
  failedCount: number;
  cursor?: string;
  errors: Array<{ record: any; error: string }>;
}

class SyncOrchestrator {
  private activeSyncs: Map<string, boolean> = new Map();

  /**
   * Sync attendees for an event from external platform
   */
  async syncEventAttendees(config: SyncConfig): Promise<SyncResult> {
    const { integration, eventCodeMapping, batchSize = 100 } = config;
    const syncKey = `${integration.id}-${eventCodeMapping.id}`;

    // Prevent concurrent syncs for same event
    if (this.activeSyncs.get(syncKey)) {
      throw new Error(`Sync already in progress for: ${syncKey}`);
    }

    this.activeSyncs.set(syncKey, true);

    try {
      const result = await this.performSync(config);
      return result;
    } finally {
      this.activeSyncs.delete(syncKey);
    }
  }

  private async performSync(config: SyncConfig): Promise<SyncResult> {
    const { integration, eventCodeMapping } = config;
    
    // Find attendee sync endpoint
    const attendeeEndpoint = integration.endpoints.find(
      ep => ep.name === 'getAttendees' || ep.name === 'listAttendees'
    );

    if (!attendeeEndpoint) {
      throw new Error('No attendee endpoint configured for integration');
    }

    // Create API client
    const apiClient = new ApiClient({
      baseUrl: integration.baseUrl,
      authStrategy: integration.authType as any,
      credentialsRef: integration.credentialsRef || undefined,
      rateLimit: integration.rateLimitPolicy ? {
        requestsPerMinute: integration.rateLimitPolicy.requestsPerMinute || 60,
        burstSize: integration.rateLimitPolicy.burstSize,
      } : undefined,
    });

    let processedCount = 0;
    let failedCount = 0;
    const errors: Array<{ record: any; error: string }> = [];
    let lastCursor: string | undefined;

    try {
      // Replace path variables
      const path = this.replacePathVariables(
        attendeeEndpoint.path,
        { eventId: eventCodeMapping.externalEventId }
      );

      // Prepare pagination config
      const paginationConfig = {
        type: attendeeEndpoint.pagination?.type || 'offset' as const,
        limitParam: attendeeEndpoint.pagination?.limitParam,
        offsetParam: attendeeEndpoint.pagination?.offsetParam,
        cursorParam: attendeeEndpoint.pagination?.cursorParam,
        extractCursor: (response: any) => {
          // Extract cursor from response (implementation varies by platform)
          return response.pagination?.next_cursor || 
                 response.paging?.cursors?.after ||
                 null;
        },
        extractItems: (response: any) => {
          // Extract attendees array (implementation varies by platform)
          return response.attendees || 
                 response.data || 
                 response.results ||
                 (Array.isArray(response) ? response : []);
        },
      };

      // Paginated sync
      for await (const batch of apiClient.paginatedRequest(
        {
          method: attendeeEndpoint.method,
          path,
          headers: attendeeEndpoint.headers,
        },
        paginationConfig
      )) {
        // Transform each attendee
        for (const rawAttendee of batch) {
          try {
            const transformedAttendee = this.transformAttendee(
              rawAttendee,
              eventCodeMapping.fieldMapping || {}
            );

            // PLANNED: Store attendee in database — see docs/ROADMAP.md Phase 3
            // await this.storeAttendee(eventCodeMapping.eventId, transformedAttendee);

            processedCount++;
          } catch (error) {
            failedCount++;
            errors.push({
              record: rawAttendee,
              error: (error as Error).message,
            });
            logger.error({ err: error }, 'Failed to process attendee');
          }
        }

        // Update progress
        logger.info(`Synced batch: ${processedCount} processed, ${failedCount} failed`);
      }

      return {
        success: failedCount === 0,
        processedCount,
        failedCount,
        cursor: lastCursor,
        errors,
      };
    } catch (error) {
      logger.error({ err: error }, 'Sync failed');
      throw error;
    }
  }

  /**
   * Transform raw attendee data to our format (minimal PII)
   */
  private transformAttendee(
    rawData: any,
    fieldMapping: Record<string, any>
  ): AttendeeData {
    const getField = (fieldName: string): any => {
      const mappingPath = fieldMapping[fieldName];
      if (!mappingPath) return null;

      // Support nested paths like "profile.company"
      const parts = mappingPath.split('.');
      let value = rawData;
      for (const part of parts) {
        value = value?.[part];
        if (value === undefined) break;
      }
      return value;
    };

    // Extract only essential fields (PCI compliance)
    return {
      externalId: rawData.id || rawData.external_id || '',
      firstName: getField('firstName') || rawData.first_name || '',
      lastName: getField('lastName') || rawData.last_name || '',
      email: getField('email') || rawData.email || '',
      company: getField('company'),
      title: getField('title'),
      participantType: getField('participantType') || 'General',
      customFields: this.extractCustomFields(rawData, fieldMapping),
    };
  }

  /**
   * Extract custom fields based on field mapping
   */
  private extractCustomFields(
    rawData: any,
    fieldMapping: Record<string, any>
  ): Record<string, string> {
    const customFields: Record<string, string> = {};

    // Extract mapped custom fields
    Object.entries(fieldMapping).forEach(([targetField, sourcePath]) => {
      if (targetField.startsWith('customField_')) {
        const parts = sourcePath.split('.');
        let value = rawData;
        for (const part of parts) {
          value = value?.[part];
          if (value === undefined) break;
        }
        if (value !== undefined && value !== null) {
          customFields[targetField] = String(value);
        }
      }
    });

    return customFields;
  }

  /**
   * Replace path variables like {{eventId}}
   */
  private replacePathVariables(
    path: string,
    variables: Record<string, string>
  ): string {
    let result = path;
    Object.entries(variables).forEach(([key, value]) => {
      result = result.replace(`{{${key}}}`, value);
      result = result.replace(`{${key}}`, value);
    });
    return result;
  }

  /**
   * Fetch event code from external platform
   */
  async fetchEventCode(
    integration: CustomerIntegration,
    eventName: string
  ): Promise<{ eventId: string; eventCode?: string; eventName: string } | null> {
    // Find event lookup endpoint
    const eventEndpoint = integration.endpoints.find(
      ep => ep.name === 'getEvent' || ep.name === 'searchEvents'
    );

    if (!eventEndpoint) {
      throw new Error('No event endpoint configured for integration');
    }

    const apiClient = new ApiClient({
      baseUrl: integration.baseUrl,
      authStrategy: integration.authType as any,
      credentialsRef: integration.credentialsRef || undefined,
    });

    try {
      const response = await apiClient.request({
        method: eventEndpoint.method,
        path: eventEndpoint.path,
        queryParams: {
          name: eventName,
          q: eventName,
          search: eventName,
        },
      });

      // Extract event details (implementation varies by platform)
      const event = response.events?.[0] || response.data?.[0] || response;
      
      if (!event) return null;

      return {
        eventId: event.id || event.event_id,
        eventCode: event.code || event.event_code,
        eventName: event.name || event.title,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch event code');
      return null;
    }
  }

  /**
   * Test integration connection
   */
  async testConnection(integration: CustomerIntegration): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    const apiClient = new ApiClient({
      baseUrl: integration.baseUrl,
      authStrategy: integration.authType as any,
      credentialsRef: integration.credentialsRef || undefined,
    });

    try {
      // Try to call a simple endpoint (usually /me or /user or similar)
      const testEndpoint = integration.endpoints.find(
        ep => ep.name === 'getCurrentUser' || ep.name === 'getUser' || ep.name === 'me'
      );

      if (!testEndpoint) {
        return {
          success: false,
          message: 'No test endpoint configured',
        };
      }

      const response = await apiClient.request({
        method: testEndpoint.method,
        path: testEndpoint.path,
      });

      return {
        success: true,
        message: 'Connection successful',
        details: response,
      };
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message,
      };
    }
  }

  /**
   * Sync events from external platform and create/update in local database
   */
  async syncEvents(config: EventSyncConfig): Promise<EventSyncResult> {
    const { integration, endpointConfig, batchSize = 100 } = config;
    const syncKey = `events-${integration.id}`;

    if (this.activeSyncs.get(syncKey)) {
      throw new Error(`Event sync already in progress for: ${syncKey}`);
    }

    this.activeSyncs.set(syncKey, true);

    try {
      const result = await this.performEventSync(config);
      return result;
    } finally {
      this.activeSyncs.delete(syncKey);
    }
  }

  private async performEventSync(config: EventSyncConfig): Promise<EventSyncResult> {
    const { integration, endpointConfig } = config;
    
    // Find events endpoint from integration endpoints
    const eventsEndpoint = integration.endpoints?.find(
      (ep: any) => ep.name === 'getEvents' || ep.name === 'listEvents' || ep.name === 'events'
    );

    if (!eventsEndpoint) {
      throw new Error('No events endpoint configured for integration');
    }

    const apiClient = new ApiClient({
      baseUrl: integration.baseUrl,
      authStrategy: integration.authType as any,
      credentialsRef: integration.credentialsRef || undefined,
      rateLimit: integration.rateLimitPolicy ? {
        requestsPerMinute: integration.rateLimitPolicy.requestsPerMinute || 60,
        burstSize: integration.rateLimitPolicy.burstSize,
      } : undefined,
    });

    let processedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    const errors: Array<{ record: any; error: string }> = [];

    try {
      const paginationConfig = {
        type: eventsEndpoint.pagination?.type || 'offset' as const,
        limitParam: eventsEndpoint.pagination?.limitParam,
        offsetParam: eventsEndpoint.pagination?.offsetParam,
        cursorParam: eventsEndpoint.pagination?.cursorParam,
        extractCursor: (response: any) => {
          return response.pagination?.next_cursor || 
                 response.paging?.cursors?.after ||
                 response.nextToken ||
                 null;
        },
        extractItems: (response: any) => {
          return response.events || 
                 response.data || 
                 response.results ||
                 response.items ||
                 (Array.isArray(response) ? response : []);
        },
      };

      for await (const batch of apiClient.paginatedRequest(
        {
          method: eventsEndpoint.method,
          path: eventsEndpoint.path,
          headers: eventsEndpoint.headers,
        },
        paginationConfig
      )) {
        for (const rawEvent of batch) {
          try {
            const eventData = this.transformEvent(rawEvent, endpointConfig.fieldMappingOverrides || {});
            
            const { event, created } = await storage.upsertEventFromSync(
              integration.customerId,
              integration.id,
              eventData
            );

            await this.autoAssignEventLocation(
              integration.customerId,
              event,
              {
                location: eventData.location || null,
                venue: eventData.venue || null,
                city: eventData.city || null,
                state: eventData.state || null,
                country: eventData.country || null,
                address: eventData.address || null,
              }
            );

            if (created) {
              createdCount++;
            } else {
              updatedCount++;
            }
            processedCount++;

            logger.info(`${created ? 'Created' : 'Updated'} event: ${event.name} (${event.externalEventId})`);
          } catch (error) {
            failedCount++;
            errors.push({
              record: rawEvent,
              error: (error as Error).message,
            });
            logger.error({ err: error }, 'Failed to process event');
          }
        }

        logger.info(`Event sync batch: ${processedCount} processed (${createdCount} created, ${updatedCount} updated, ${failedCount} failed)`);
      }

      return {
        success: failedCount === 0,
        processedCount,
        createdCount,
        updatedCount,
        failedCount,
        errors,
      };
    } catch (error) {
      logger.error({ err: error }, 'Event sync failed');
      throw error;
    }
  }

  /**
   * Transform raw event data from external platform to our format
   */
  private transformEvent(
    rawData: any,
    fieldMapping: Record<string, any>
  ): { externalEventId: string; name: string; eventDate: Date; timezone?: string | null; status?: string; location?: string | null; venue?: string | null; city?: string | null; state?: string | null; country?: string | null; address?: string | null } {
    const getField = (fieldName: string, fallbacks: string[] = []): any => {
      const mappingPath = fieldMapping[fieldName];
      if (mappingPath) {
        const parts = mappingPath.split('.');
        let value = rawData;
        for (const part of parts) {
          value = value?.[part];
          if (value === undefined) break;
        }
        if (value !== undefined) return value;
      }

      // Try fallback field names
      for (const fallback of fallbacks) {
        if (rawData[fallback] !== undefined) return rawData[fallback];
      }
      return null;
    };

    const externalEventId = getField('id', ['eventCode', 'event_id', 'id', 'code']) || '';
    const name = getField('name', ['eventName', 'event_name', 'title', 'name']) || 'Unnamed Event';
    
    // Parse date from various formats
    const dateValue = getField('startDate', ['eventStartDate', 'start_date', 'startDate', 'date', 'eventDate']);
    let eventDate: Date;
    if (dateValue) {
      eventDate = new Date(dateValue);
      if (isNaN(eventDate.getTime())) {
        eventDate = new Date(); // Default to now if invalid
      }
    } else {
      eventDate = new Date();
    }

    const status = getField('status', ['eventStatus', 'event_status', 'status']) || 'upcoming';
    const timezone = getField('timezone', ['timeZone', 'time_zone', 'eventTimezone', 'event_timezone', 'tz']) || null;

    const location = getField('location', ['locationName', 'location_name', 'location']) || null;
    const venue = getField('venue', ['venueName', 'venue_name', 'venue']) || null;
    const city = getField('city', ['eventCity', 'event_city', 'city']) || null;
    const state = getField('state', ['eventState', 'state']) || null;
    const country = getField('country', ['eventCountry', 'country']) || null;
    const address = getField('address', ['venueAddress', 'venue_address', 'address']) || null;

    return {
      externalEventId: String(externalEventId),
      name: String(name),
      eventDate,
      timezone: timezone ? String(timezone) : null,
      status: String(status).toLowerCase(),
      location: location ? String(location) : null,
      venue: venue ? String(venue) : null,
      city: city ? String(city) : null,
      state: state ? String(state) : null,
      country: country ? String(country) : null,
      address: address ? String(address) : null,
    };
  }

  /**
   * Discover and create events from Certain platform
   * This is specifically for the Certain integration type
   */
  async discoverEvents(config: {
    integration: CustomerIntegration;
    authHeaders: Record<string, string>;
  }): Promise<{
    success: boolean;
    processedCount: number;
    createdCount: number;
    skippedCount: number;
    removedCount: number;
    filteredOutCount: number;
    errors: Array<{ record: any; error: string }>;
  }> {
    const { integration, authHeaders } = config;
    const startTime = Date.now();
    
    // Create sync log entry
    const syncLog = await storage.createSyncLog({
      integrationId: integration.id,
      customerId: integration.customerId,
      syncType: 'events',
      status: 'started',
      startedAt: new Date(),
    });
    
    if (!integration.eventListEndpointPath) {
      await storage.updateSyncLog(syncLog.id, {
        status: 'failed',
        errorCount: 1,
        errors: [{ error: 'Event list endpoint path not configured' }],
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      });
      throw new Error('Event list endpoint path not configured');
    }

    // Build the URL - handle case where full URL is entered in path field
    const baseUrl = integration.baseUrl.replace(/\/$/, '');
    let endpointPath = integration.eventListEndpointPath;
    
    // Substitute {accountCode} or {{accountCode}} variable BEFORE URL parsing
    // (URL parsing encodes curly braces, breaking the replacement)
    if (integration.accountCode) {
      endpointPath = endpointPath.replace(/\{\{accountCode\}\}/g, integration.accountCode);
      endpointPath = endpointPath.replace(/\{accountCode\}/g, integration.accountCode);
    }
    
    try {
      const pathUrl = new URL(endpointPath);
      endpointPath = pathUrl.pathname + pathUrl.search;
      logger.info(`Extracted path from full URL: ${endpointPath}`);
    } catch {
      // Not a full URL, use as-is
    }
    
    endpointPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;

    if (integration.providerId.startsWith('certain') && !endpointPath.includes('includeList=')) {
      const separator = endpointPath.includes('?') ? '&' : '?';
      endpointPath = `${endpointPath}${separator}includeList=tags`;
    }

    const url = `${baseUrl}${endpointPath}`;

    logger.info(`Discovering events from Certain: ${url}`);

    let processedCount = 0;
    let createdCount = 0;
    let skippedCount = 0;
    const errors: Array<{ record: any; error: string }> = [];

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...authHeaders,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API returned status ${response.status}: ${errorBody.substring(0, 500)}`);
      }

      const data = await safeJsonParse(response, 'Events sync');
      
      // Log full API response for debugging
      logger.debug(`====== API RESPONSE START ======`);
      logger.info(`URL: ${url}`);
      logger.info(`Response type: ${typeof data}, isArray: ${Array.isArray(data)}`);
      logger.info(`Response keys: ${typeof data === 'object' && data !== null ? Object.keys(data).join(', ') : 'N/A'}`);
      logger.debug(`Full response (first 5000 chars): ${JSON.stringify(data, null, 2).substring(0, 5000)}`);
      logger.debug(`====== API RESPONSE END ======`);
      
      // Handle both array responses and nested responses
      let events: any[] = [];
      if (Array.isArray(data)) {
        events = data;
        logger.info(`Detected array response with ${events.length} items`);
      } else if (data.events && Array.isArray(data.events)) {
        events = data.events;
        logger.info(`Detected nested 'events' array with ${events.length} items`);
      } else if (data.results && Array.isArray(data.results)) {
        events = data.results;
        logger.info(`Detected nested 'results' array with ${events.length} items`);
      } else if (data.data && Array.isArray(data.data)) {
        events = data.data;
        logger.info(`Detected nested 'data' array with ${events.length} items`);
      } else {
        logger.info(`WARNING: Could not find events array in response. Structure: ${JSON.stringify(data, null, 2).substring(0, 500)}`);
      }

      logger.info(`Found ${events.length} events from API`);

      const unfilteredCount = events.length;
      const untaggedExternalIds = new Set<string>();
      if (integration.providerId.startsWith('certain')) {
        if (events.length > 0) {
          const sample = events[0];
          const tagKeys = sample.tags ? Object.keys(sample.tags) : [];
          const rawTags = sample.tags?.tag;
          const tagType = Array.isArray(rawTags) ? 'array' : typeof rawTags;
          const tagSample = Array.isArray(rawTags) ? JSON.stringify(rawTags.slice(0, 3)) : JSON.stringify(rawTags);
          logger.debug(`Tag debug — sample event: "${sample.eventName || sample.name || sample.eventCode}" | tags keys: [${tagKeys}] | tags.tag type: ${tagType} | tags.tag sample: ${tagSample?.substring(0, 500)}`);
          const eventsWithAnyTags = events.filter((e: any) => e.tags?.tag && (Array.isArray(e.tags.tag) ? e.tags.tag.length > 0 : true));
          logger.debug(`Tag debug — ${eventsWithAnyTags.length}/${events.length} events have non-empty tags.tag`);
          if (eventsWithAnyTags.length > 0 && eventsWithAnyTags.length <= 5) {
            eventsWithAnyTags.forEach((e: any) => {
              logger.info(`Tagged event: "${e.eventName || e.eventCode}" tags: ${JSON.stringify(e.tags?.tag)?.substring(0, 300)}`);
            });
          }
        }
        const tagged: any[] = [];
        for (const evt of events) {
          if (this.hasGreetTag(evt)) {
            tagged.push(evt);
          } else {
            const eid = evt.eventCode || evt.event_code || evt.eventId || evt.id;
            if (eid) untaggedExternalIds.add(String(eid));
          }
        }
        events = tagged;
        logger.info(`Tag filter: ${unfilteredCount} total → ${events.length} with "checkmate" tag (${untaggedExternalIds.size} without tag)`);
      }
      
      // Log each event's key fields for debugging
      events.forEach((evt, idx) => {
        const keys = Object.keys(evt);
        logger.info(`Event ${idx + 1}: keys=[${keys.slice(0, 10).join(', ')}${keys.length > 10 ? '...' : ''}], sample=${JSON.stringify(evt).substring(0, 300)}`);
      });

      for (const rawEvent of events) {
        try {
          processedCount++;
          
          // Transform event data using Certain-specific field mapping
          const eventData = this.transformCertainEvent(rawEvent);
          
          if (!eventData.externalEventId) {
            logger.info(`Skipping event without ID: ${JSON.stringify(rawEvent).substring(0, 100)}`);
            skippedCount++;
            continue;
          }

          // Upsert the event (creates new or updates existing with latest data including accountCode/eventCode)
          const { event, created } = await storage.upsertEventFromSync(
            integration.customerId,
            integration.id,
            eventData
          );

          await this.autoAssignEventLocation(
            integration.customerId,
            event,
            {
              location: eventData.location,
              venue: eventData.venue,
              city: eventData.city,
              state: eventData.state,
              country: eventData.country,
              address: eventData.address,
            }
          );

          if (created) {
            createdCount++;
            logger.info(`Created event: ${event.name} (${event.externalEventId})`);
          } else {
            logger.info(`Updated event: ${event.name} (${event.externalEventId}) - accountCode=${event.accountCode}, eventCode=${event.eventCode}`);
            skippedCount++;
          }
        } catch (error) {
          errors.push({
            record: rawEvent,
            error: (error as Error).message,
          });
          logger.error({ err: error }, `Failed to process event`);
        }
      }

      let removedCount = 0;
      if (integration.providerId.startsWith('certain') && untaggedExternalIds.size > 0) {
        const allCustomerEvents = await storage.getEvents(integration.customerId);
        const integrationEvents = allCustomerEvents.filter(e => e.integrationId === integration.id && e.externalEventId);
        const eventsToRemove = integrationEvents.filter(e => untaggedExternalIds.has(e.externalEventId!));
        
        for (const event of eventsToRemove) {
          try {
            await storage.deleteEvent(event.id);
            removedCount++;
            logger.info(`Removed untagged event: ${event.name} (${event.externalEventId}) — all associated data cascade-deleted`);
          } catch (error) {
            logger.error({ err: error }, `Failed to remove event ${event.id}`);
            errors.push({ record: { eventId: event.id, name: event.name }, error: `Failed to remove untagged event: ${(error as Error).message}` });
          }
        }
        
        if (removedCount > 0) {
          logger.info(`Pruned ${removedCount} events that lost the "checkmate" tag`);
        }
      }

      // Build API response summary for the sync log
      const apiResponseSummary = `URL: ${url} | Response: ${unfilteredCount} events returned | ${events.length} tagged "checkmate" | ${removedCount} pruned`;
      
      // Update sync log with results
      await storage.updateSyncLog(syncLog.id, {
        status: errors.length === 0 ? 'completed' : 'completed',
        processedCount,
        createdCount,
        updatedCount: skippedCount, // skipped means updated in this context
        errorCount: errors.length,
        errors: errors.length > 0 ? errors.slice(0, 10) : null, // Limit to first 10 errors
        apiResponseSummary,
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      });

      return {
        success: errors.length === 0,
        processedCount,
        createdCount,
        skippedCount,
        removedCount,
        filteredOutCount: unfilteredCount - events.length,
        errors,
      };
    } catch (error) {
      logger.error({ err: error }, 'Event discovery failed');
      
      // Update sync log with failure
      await storage.updateSyncLog(syncLog.id, {
        status: 'failed',
        errorCount: 1,
        errors: [{ error: (error as Error).message }],
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      });
      
      throw error;
    }
  }

  /**
   * Transform Certain-specific event data to our format
   * Extracts all required fields including accountCode and eventCode for check-in updates
   */
  private transformCertainEvent(rawData: any): {
    externalEventId: string;
    name: string;
    eventDate: Date;
    startDate: Date | null;
    endDate: Date | null;
    accountCode: string | null;
    eventCode: string | null;
    timezone: string | null;
    status?: string;
    location: string | null;
    venue: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    address: string | null;
  } {
    // Log raw event data for debugging field mapping
    logger.debug(`Raw Certain event data:`, JSON.stringify(rawData, null, 2).substring(0, 500));

    // Certain API field mappings - eventCode is the primary identifier
    const eventCode = 
      rawData.eventCode || 
      rawData.event_code || 
      rawData.code || 
      null;

    // Account code comes from the Certain account
    const accountCode = 
      rawData.accountCode || 
      rawData.account_code || 
      rawData.accountName || 
      null;

    // External ID for our internal reference (could be same as eventCode)
    const externalEventId = 
      eventCode ||
      rawData.eventId || 
      rawData.id || 
      '';

    const name = 
      rawData.eventName || 
      rawData.event_name || 
      rawData.name || 
      rawData.title || 
      'Unnamed Event';

    // Parse start date
    const startDateValue = 
      rawData.eventStartDate || 
      rawData.startDate || 
      rawData.start_date || 
      rawData.eventDate || 
      rawData.date;
    
    let startDate: Date | null = null;
    let eventDate: Date;
    if (startDateValue) {
      startDate = new Date(startDateValue);
      if (isNaN(startDate.getTime())) {
        startDate = null;
      }
      eventDate = startDate || new Date();
    } else {
      eventDate = new Date();
    }

    // Parse end date
    const endDateValue = 
      rawData.eventEndDate || 
      rawData.endDate || 
      rawData.end_date;
    
    let endDate: Date | null = null;
    if (endDateValue) {
      endDate = new Date(endDateValue);
      if (isNaN(endDate.getTime())) {
        endDate = null;
      }
    }

    const status = 
      rawData.eventStatus || 
      rawData.status || 
      rawData.event_status || 
      'upcoming';

    const timezone = 
      rawData.timezone || 
      rawData.timeZone || 
      rawData.time_zone || 
      rawData.eventTimezone || 
      rawData.event_timezone || 
      rawData.tz || 
      null;

    const locObj = (typeof rawData.location === 'object' && rawData.location !== null) ? rawData.location : null;
    const addrObj = (typeof locObj?.address === 'object' && locObj?.address !== null) ? locObj.address : null;

    const locationName =
      locObj?.locationName ||
      rawData.locationName ||
      rawData.location_name ||
      (typeof rawData.location === 'string' ? rawData.location : null) ||
      null;

    const venue =
      rawData.venueName ||
      rawData.venue_name ||
      rawData.venue ||
      null;

    const city =
      locObj?.locationCity ||
      addrObj?.city ||
      rawData.city ||
      rawData.eventCity ||
      rawData.event_city ||
      null;

    const state =
      addrObj?.state ||
      rawData.state ||
      rawData.eventState ||
      null;

    const country =
      locObj?.locationCountry ||
      addrObj?.country ||
      rawData.country ||
      rawData.eventCountry ||
      null;

    const address =
      addrObj?.line1 ||
      rawData.address ||
      rawData.venueAddress ||
      rawData.venue_address ||
      null;

    logger.info(`Transformed event: name=${name}, eventCode=${eventCode}, accountCode=${accountCode}, startDate=${startDate}, endDate=${endDate}, timezone=${timezone}, location=${locationName}, venue=${venue}`);

    return {
      externalEventId: String(externalEventId),
      name: String(name),
      eventDate,
      startDate,
      endDate,
      accountCode: accountCode ? String(accountCode) : null,
      eventCode: eventCode ? String(eventCode) : null,
      timezone: timezone ? String(timezone) : null,
      status: String(status).toLowerCase(),
      location: locationName ? String(locationName) : null,
      venue: venue ? String(venue) : null,
      city: city ? String(city) : null,
      state: state ? String(state) : null,
      country: country ? String(country) : null,
      address: address ? String(address) : null,
    };
  }

  private hasGreetTag(rawEvent: any): boolean {
    let tags = rawEvent?.tags?.tag;
    if (!tags && Array.isArray(rawEvent?.tags)) {
      tags = rawEvent.tags;
    }
    if (!tags && rawEvent?.tag) {
      tags = Array.isArray(rawEvent.tag) ? rawEvent.tag : [rawEvent.tag];
    }
    if (tags && !Array.isArray(tags)) {
      tags = [tags];
    }
    if (!Array.isArray(tags)) return false;
    return tags.some((t: any) => {
      const name = typeof t === 'string' ? t : t?.name;
      return typeof name === 'string' && name.toLowerCase() === 'checkmate';
    });
  }

  private async autoAssignEventLocation(
    customerId: string,
    event: { id: string; locationId: string | null },
    syncedLocation: {
      location: string | null;
      venue: string | null;
      city: string | null;
      state: string | null;
      country: string | null;
      address: string | null;
    }
  ): Promise<void> {
    if (event.locationId) return;

    const locationName = (syncedLocation.location?.trim() || syncedLocation.venue?.trim() || '');
    if (!locationName) return;

    try {
      let matched = await storage.matchLocationByName(customerId, locationName);

      if (!matched) {
        matched = await storage.createLocation({
          customerId,
          name: locationName,
          address: syncedLocation.address?.trim() || null,
          city: syncedLocation.city?.trim() || null,
          state: syncedLocation.state?.trim() || null,
          country: syncedLocation.country?.trim() || null,
          matchPatterns: [locationName.toLowerCase()],
        });
        logger.info(`Auto-created location "${matched.name}" (${matched.id}) for customer ${customerId}`);
      }

      await storage.updateEvent(event.id, { locationId: matched.id });
      logger.info(`Auto-assigned location "${matched.name}" (${matched.id}) to event ${event.id}`);
    } catch (error) {
      logger.warn(`Failed to auto-assign location for event ${event.id}: ${error}`);
    }
  }

  /**
   * Substitute template variables in endpoint path
   * Supports: {{accountCode}}, {{eventCode}}, {{lastSyncTimestamp}}, {{attendeeExternalId}}
   */
  substituteTemplateVariables(
    template: string,
    variables: {
      accountCode?: string | null;
      eventCode?: string | null;
      lastSyncTimestamp?: string | null;
      attendeeExternalId?: string | null;
    }
  ): string {
    let result = template;
    
    if (variables.accountCode) {
      result = result.replace(/\{\{accountCode\}\}/g, variables.accountCode);
    }
    if (variables.eventCode) {
      result = result.replace(/\{\{eventCode\}\}/g, variables.eventCode);
    }
    if (variables.lastSyncTimestamp) {
      result = result.replace(/\{\{lastSyncTimestamp\}\}/g, encodeURIComponent(variables.lastSyncTimestamp));
    } else {
      result = result.replace(/\{\{lastSyncTimestamp\}\}/g, '');
    }
    if (variables.attendeeExternalId) {
      result = result.replace(/\{\{attendeeExternalId\}\}/g, encodeURIComponent(variables.attendeeExternalId));
    }
    
    return result;
  }
  
  /**
   * Check if a template requires per-attendee iteration
   */
  templateRequiresAttendeeIteration(template: string): boolean {
    return template.includes('{{attendeeExternalId}}');
  }
  
  /**
   * Prepare endpoint for a specific attendee by substituting attendeeExternalId
   * This should be called when iterating through attendees for per-attendee endpoints
   */
  prepareEndpointForAttendee(
    resolvedEndpoint: string,
    attendeeExternalId: string | null
  ): string | null {
    if (!attendeeExternalId) {
      return null; // Skip attendees without external IDs
    }
    return resolvedEndpoint.replace(
      /\{\{attendeeExternalId\}\}/g,
      encodeURIComponent(attendeeExternalId)
    );
  }

  /**
   * Build resolved endpoint from sync template and event data
   * Note: Does NOT substitute {{lastSyncTimestamp}} or {{attendeeExternalId}} - those are done at sync time
   */
  buildResolvedEndpoint(
    templatePath: string,
    event: { accountCode?: string | null; eventCode?: string | null }
  ): string | null {
    if (!templatePath) return null;
    if (!event.accountCode || !event.eventCode) {
      logger.warn('Event missing accountCode or eventCode, cannot resolve endpoint');
      return null;
    }
    // Only substitute accountCode and eventCode, preserve {{lastSyncTimestamp}} and {{attendeeExternalId}} for sync time
    let result = templatePath;
    result = result.replace(/\{\{accountCode\}\}/g, event.accountCode);
    result = result.replace(/\{\{eventCode\}\}/g, event.eventCode);
    return result;
  }
  
  /**
   * Prepare endpoint for sync by substituting lastSyncTimestamp
   * This should be called right before making the sync request
   */
  prepareEndpointForSync(
    resolvedEndpoint: string,
    lastSyncTimestamp: string | null
  ): string {
    if (lastSyncTimestamp) {
      let ts = lastSyncTimestamp;
      if (ts.includes('T') || ts.includes('-')) {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) {
          ts = formatCertainTimestamp(d);
        }
      }
      return resolvedEndpoint.replace(
        /\{\{lastSyncTimestamp\}\}/g, 
        ts
      );
    }
    // Remove the placeholder and any surrounding query parameter syntax if no timestamp
    // Handle cases like: ?modifiedSince={{lastSyncTimestamp}} or &modifiedSince={{lastSyncTimestamp}}
    let result = resolvedEndpoint;
    // Remove query params that only have the timestamp placeholder
    result = result.replace(/[?&][^&=]+=\{\{lastSyncTimestamp\}\}/g, '');
    // Clean up any dangling ? or &
    result = result.replace(/\?&/g, '?').replace(/\?$/g, '');
    return result;
  }

  /**
   * Calculate next sync time based on event dates and sync settings
   * Uses smart scheduling: daily before event, minute-level during event
   */
  calculateNextSyncTime(
    event: { startDate?: Date | null; endDate?: Date | null },
    settings: { preEventIntervalMinutes?: number; duringEventIntervalMinutes?: number }
  ): Date {
    const now = new Date();
    const startDate = event.startDate ? new Date(event.startDate) : null;
    const endDate = event.endDate ? new Date(event.endDate) : null;
    
    const preEventInterval = settings.preEventIntervalMinutes ?? 1440; // Default 24 hours
    const duringEventInterval = settings.duringEventIntervalMinutes ?? 1; // Default 1 minute
    
    let intervalMinutes: number;
    
    if (!startDate || !endDate) {
      intervalMinutes = preEventInterval;
    } else if (now < startDate) {
      intervalMinutes = preEventInterval;
    } else if (now >= startDate && now <= endDate) {
      intervalMinutes = duringEventInterval;
    } else {
      intervalMinutes = 0;
    }
    
    if (intervalMinutes === 0) {
      return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    }
    
    return new Date(now.getTime() + intervalMinutes * 60 * 1000);
  }
  
  /**
   * Run a sequential full sync in order: events → attendees → sessions → session registrations
   * Each step has a configurable delay to allow database writes to complete
   */
  async runSequentialSync(config: {
    integration: CustomerIntegration;
    customerId: string;
    authHeaders: Record<string, string>;
    delayBetweenStepsMs?: number;
    onProgress?: (step: string, status: 'started' | 'completed' | 'error', details?: any) => void;
  }): Promise<{
    success: boolean;
    steps: {
      events: { success: boolean; count: number; error?: string };
      attendees: { success: boolean; count: number; error?: string };
      sessions: { success: boolean; count: number; error?: string };
      sessionRegistrations: { success: boolean; count: number; error?: string };
    };
    totalRecords: number;
    durationMs: number;
  }> {
    const startTime = Date.now();
    const { integration, customerId, authHeaders, delayBetweenStepsMs = 3000, onProgress } = config;
    const syncTemplates = integration.syncTemplates as any;
    
    const result = {
      success: true,
      steps: {
        events: { success: false, count: 0, error: undefined as string | undefined },
        attendees: { success: false, count: 0, error: undefined as string | undefined },
        sessions: { success: false, count: 0, error: undefined as string | undefined },
        sessionRegistrations: { success: false, count: 0, error: undefined as string | undefined },
      },
      totalRecords: 0,
      durationMs: 0,
    };
    
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    try {
      // Step 1: Sync Events
      onProgress?.('events', 'started');
      logger.info('Step 1: Syncing events...');
      
      if (integration.eventListEndpointPath) {
        try {
          const eventsResult = await this.discoverEvents({ integration, authHeaders });
          result.steps.events = {
            success: eventsResult.success,
            count: eventsResult.createdCount,
            error: undefined,
          };
          result.totalRecords += eventsResult.processedCount;
          onProgress?.('events', 'completed', eventsResult);
          logger.info(`Events sync complete: ${eventsResult.processedCount} processed, ${eventsResult.createdCount} created`);
        } catch (err: any) {
          result.steps.events = { success: false, count: 0, error: err.message };
          onProgress?.('events', 'error', { error: err.message });
          logger.error({ err: err.message }, 'Events sync failed');
        }
      } else {
        result.steps.events = { success: true, count: 0, error: 'No event list endpoint configured' };
        logger.info('Skipping events - no endpoint configured');
      }
      
      await delay(delayBetweenStepsMs);
      
      // Get all events for this customer and filter by integration
      const allEvents = await storage.getEvents(customerId);
      const events = allEvents.filter(e => e.integrationId === integration.id);
      logger.info(`Found ${events.length} events to sync data for`);
      
      // Step 2: Sync Attendees for each event
      onProgress?.('attendees', 'started');
      logger.info('Step 2: Syncing attendees...');
      
      if (syncTemplates?.attendees?.endpointPath) {
        let totalAttendees = 0;
        let attendeesErrors: string[] = [];
        
        for (const event of events) {
          const evtSyncSettings = event.syncSettings as { syncFrozen?: boolean; syncIntervalMinutes?: number | null } | null;
          if (evtSyncSettings?.syncFrozen) {
            logger.info(`Skipping frozen event ${event.id} (${event.name})`);
            continue;
          }
          if (!event.accountCode || !event.eventCode) {
            logger.info(`Skipping attendees for event ${event.id} - missing accountCode or eventCode`);
            continue;
          }
          
          try {
            const endpoint = this.buildResolvedEndpoint(
              syncTemplates.attendees.endpointPath,
              { accountCode: event.accountCode, eventCode: event.eventCode }
            );
            
            if (endpoint) {
              const attendeesSyncState = await storage.getEventSyncState(event.id, 'attendees');

              if (evtSyncSettings?.syncIntervalMinutes && attendeesSyncState?.lastSyncAt) {
                const intervalMs = evtSyncSettings.syncIntervalMinutes * 60 * 1000;
                const timeSinceLastSync = Date.now() - new Date(attendeesSyncState.lastSyncAt).getTime();
                if (timeSinceLastSync < intervalMs) {
                  logger.info(`Skipping attendees for ${event.name} — custom interval ${evtSyncSettings.syncIntervalMinutes}m, next in ~${Math.round((intervalMs - timeSinceLastSync) / 60000)}m`);
                  continue;
                }
              }
              const attendeesLastTimestamp = attendeesSyncState?.lastSyncTimestamp || null;
              const preparedEndpoint = this.prepareEndpointForSync(endpoint, attendeesLastTimestamp);
              const baseUrl = integration.baseUrl.replace(/\/$/, '');
              let endpointPath = preparedEndpoint.startsWith('/') ? preparedEndpoint : `/${preparedEndpoint}`;
              const url = `${baseUrl}${endpointPath}`;
              
              logger.info(`Fetching attendees for event ${event.name}: ${url}`);
              
              const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json', ...authHeaders },
              });
              
              const isAttendees404 = !response.ok && response.status === 404;
              
              if (response.ok || isAttendees404) {
                let attendees: any[] = [];
                
                if (response.ok) {
                  const data = await safeJsonParse(response, `Attendees sync for ${event.name}`);
                  attendees = Array.isArray(data) ? data : 
                    (data.results || data.data || data.attendees || data.registrations || []);
                } else {
                  logger.info(`API returned 404 for attendees on ${event.name} — treating as empty (no new data)`);
                }
                
                logger.info(`Received ${attendees.length} attendees for ${event.name}`);
                
                // Upsert each attendee into the database
                let savedCount = 0;
                for (const rawAttendee of attendees) {
                  try {
                    const attendeeData = this.transformCertainAttendee(rawAttendee);
                    if (!attendeeData.externalId) continue;
                    
                    const isAttended = (attendeeData.registrationStatus || '').toLowerCase() === 'attended';

                    const existing = await storage.getAttendeeByExternalId(event.id, attendeeData.externalId);
                    if (existing) {
                      const updatePayload: any = {
                        ...attendeeData,
                        registrationStatusLabel: attendeeData.registrationStatusLabel || null,
                      };
                      if (existing.checkedIn) {
                        updatePayload.registrationStatus = 'Attended';
                        updatePayload.registrationStatusLabel = attendeeData.registrationStatusLabel || existing.registrationStatusLabel || null;
                      } else if (isAttended) {
                        updatePayload.checkedIn = true;
                        updatePayload.checkedInAt = existing.checkedInAt || new Date();
                      }
                      await storage.updateAttendee(existing.id, updatePayload);
                    } else {
                      const createPayload: any = {
                        eventId: event.id,
                        firstName: attendeeData.firstName,
                        lastName: attendeeData.lastName,
                        email: attendeeData.email,
                        company: attendeeData.company || null,
                        title: attendeeData.title || null,
                        participantType: attendeeData.participantType || 'General',
                        externalId: attendeeData.externalId,
                        registrationStatus: attendeeData.registrationStatus || 'Registered',
                        registrationStatusLabel: attendeeData.registrationStatusLabel || null,
                        orderCode: attendeeData.orderCode || null,
                      };
                      if (isAttended) {
                        createPayload.checkedIn = true;
                        createPayload.checkedInAt = new Date();
                      }
                      await storage.createAttendee(createPayload);
                    }
                    savedCount++;
                  } catch (e) {
                    logger.warn({ err: e }, `Failed to save attendee`);
                  }
                }
                
                totalAttendees += savedCount;
                const attendeeSaveErrors = attendees.length - savedCount;
                logger.info(`Saved ${savedCount}/${attendees.length} attendees for ${event.name}`);
                
                if (attendeesSyncState && attendeeSaveErrors === 0) {
                  await storage.updateEventSyncState(attendeesSyncState.id, {
                    lastSyncAt: new Date(),
                    lastSyncTimestamp: formatCertainTimestamp(new Date()),
                    syncStatus: 'success',
                  });
                }
              } else {
                attendeesErrors.push(`Event ${event.name}: API returned ${response.status}`);
              }
            }
          } catch (err: any) {
            attendeesErrors.push(`Event ${event.name}: ${err.message}`);
          }
          
          await delay(500); // Small delay between events
        }
        
        result.steps.attendees = {
          success: attendeesErrors.length === 0,
          count: totalAttendees,
          error: attendeesErrors.length > 0 ? attendeesErrors.join('; ') : undefined,
        };
        result.totalRecords += totalAttendees;
        onProgress?.('attendees', attendeesErrors.length === 0 ? 'completed' : 'error', { count: totalAttendees });
        logger.info(`Attendees sync complete: ${totalAttendees} total`);
      } else {
        result.steps.attendees = { success: true, count: 0, error: 'No attendees endpoint configured' };
        logger.info('Skipping attendees - no endpoint configured');
      }
      
      await delay(delayBetweenStepsMs);
      
      // Step 3: Sync Sessions for each event
      onProgress?.('sessions', 'started');
      logger.info('Step 3: Syncing sessions...');
      
      if (syncTemplates?.sessions?.endpointPath) {
        let totalSessions = 0;
        let sessionsErrors: string[] = [];
        
        for (const event of events) {
          const evtSyncSettings3 = event.syncSettings as { syncFrozen?: boolean; syncIntervalMinutes?: number | null } | null;
          if (evtSyncSettings3?.syncFrozen) continue;
          if (!event.accountCode || !event.eventCode) continue;
          
          try {
            const endpoint = this.buildResolvedEndpoint(
              syncTemplates.sessions.endpointPath,
              { accountCode: event.accountCode, eventCode: event.eventCode }
            );
            
            if (endpoint) {
              const sessionsSyncState = await storage.getEventSyncState(event.id, 'sessions');

              if (evtSyncSettings3?.syncIntervalMinutes && sessionsSyncState?.lastSyncAt) {
                const intervalMs = evtSyncSettings3.syncIntervalMinutes * 60 * 1000;
                const timeSinceLastSync = Date.now() - new Date(sessionsSyncState.lastSyncAt).getTime();
                if (timeSinceLastSync < intervalMs) {
                  logger.info(`Skipping sessions for ${event.name} — custom interval ${evtSyncSettings3.syncIntervalMinutes}m, next in ~${Math.round((intervalMs - timeSinceLastSync) / 60000)}m`);
                  continue;
                }
              }
              const sessionsLastTimestamp = sessionsSyncState?.lastSyncTimestamp || null;
              const preparedEndpoint = this.prepareEndpointForSync(endpoint, sessionsLastTimestamp);
              const baseUrl = integration.baseUrl.replace(/\/$/, '');
              let endpointPath = preparedEndpoint.startsWith('/') ? preparedEndpoint : `/${preparedEndpoint}`;
              const url = `${baseUrl}${endpointPath}`;
              
              logger.info(`Fetching sessions for event ${event.name}: ${url}`);
              
              const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json', ...authHeaders },
              });
              
              const is404NoData = !response.ok && response.status === 404;
              
              if (response.ok || is404NoData) {
                let sessions: any[] = [];
                
                if (response.ok) {
                  const data = await safeJsonParse(response, `Sessions sync for ${event.name}`);
                  sessions = Array.isArray(data) ? data : 
                    (data.results || data.data || data.sessions || data.functions || []);
                } else {
                  logger.info(`API returned 404 for sessions on ${event.name} — treating as empty (no new data)`);
                }
                
                logger.info(`Received ${sessions.length} sessions for ${event.name}`);
                if (sessions.length > 0) {
                  logger.debug('Sample session:', JSON.stringify(sessions[0], null, 2));
                }
                
                let savedCount = 0;
                for (const rawSession of sessions) {
                  try {
                    const transformed = this.transformCertainSession(rawSession);
                    if (!transformed.externalId) continue;
                    
                    const existing = await storage.getSessionByExternalId(event.id, transformed.externalId);
                    
                    const sessionData = {
                      eventId: event.id,
                      externalId: transformed.externalId,
                      instanceId: transformed.instanceId,
                      sessionCode: transformed.sessionCode,
                      name: transformed.name,
                      description: transformed.description,
                      location: transformed.location,
                      venue: transformed.venue,
                      trackName: transformed.trackName,
                      trackColor: transformed.trackColor,
                      typeName: transformed.typeName,
                      startTime: transformed.startTime,
                      endTime: transformed.endTime,
                      capacity: transformed.capacity,
                      status: transformed.isActive ? 'active' : 'inactive',
                    };
                    
                    if (existing) {
                      await storage.updateSession(existing.id, sessionData);
                    } else {
                      await storage.createSession(sessionData as any);
                    }
                    savedCount++;
                  } catch (e) {
                    logger.warn({ err: e }, `Failed to save session`);
                  }
                }
                
                totalSessions += savedCount;
                const sessionSaveErrors = sessions.length - savedCount;
                logger.info(`Saved ${savedCount}/${sessions.length} sessions for ${event.name}`);
                
                if (sessionsSyncState && sessionSaveErrors === 0) {
                  await storage.updateEventSyncState(sessionsSyncState.id, {
                    lastSyncAt: new Date(),
                    lastSyncTimestamp: formatCertainTimestamp(new Date()),
                    syncStatus: 'success',
                  });
                }
              } else {
                sessionsErrors.push(`Event ${event.name}: API returned ${response.status}`);
              }
            }
          } catch (err: any) {
            sessionsErrors.push(`Event ${event.name}: ${err.message}`);
          }
          
          await delay(500);
        }
        
        result.steps.sessions = {
          success: sessionsErrors.length === 0,
          count: totalSessions,
          error: sessionsErrors.length > 0 ? sessionsErrors.join('; ') : undefined,
        };
        result.totalRecords += totalSessions;
        onProgress?.('sessions', sessionsErrors.length === 0 ? 'completed' : 'error', { count: totalSessions });
        logger.info(`Sessions sync complete: ${totalSessions} total`);
      } else {
        result.steps.sessions = { success: true, count: 0, error: 'No sessions endpoint configured' };
        logger.info('Skipping sessions - no endpoint configured');
      }
      
      await delay(delayBetweenStepsMs);
      
      // Step 4: Sync Session Registrations for each event
      onProgress?.('sessionRegistrations', 'started');
      logger.info('Step 4: Syncing session registrations...');
      
      if (syncTemplates?.sessionRegistrations?.endpointPath) {
        let totalRegistrations = 0;
        let registrationsErrors: string[] = [];
        
        // Check if this requires per-attendee iteration
        const requiresAttendeeIteration = this.templateRequiresAttendeeIteration(
          syncTemplates.sessionRegistrations.endpointPath
        );
        
        for (const event of events) {
          const evtSyncSettings4 = event.syncSettings as { syncFrozen?: boolean; syncIntervalMinutes?: number | null } | null;
          if (evtSyncSettings4?.syncFrozen) continue;
          if (!event.accountCode || !event.eventCode) continue;
          
          try {
            const regSyncState = await storage.getEventSyncState(event.id, 'session_registrations');

            if (evtSyncSettings4?.syncIntervalMinutes && regSyncState?.lastSyncAt) {
              const intervalMs = evtSyncSettings4.syncIntervalMinutes * 60 * 1000;
              const timeSinceLastSync = Date.now() - new Date(regSyncState.lastSyncAt).getTime();
              if (timeSinceLastSync < intervalMs) {
                logger.info(`Skipping session registrations for ${event.name} — custom interval ${evtSyncSettings4.syncIntervalMinutes}m, next in ~${Math.round((intervalMs - timeSinceLastSync) / 60000)}m`);
                continue;
              }
            }

            const regLastTimestamp = regSyncState?.lastSyncTimestamp || null;
            
            let eventRegSuccess = true;
            
            if (requiresAttendeeIteration) {
              // Get attendees for this event and iterate
              const attendees = await storage.getAttendees(event.id);
              const attendeesWithExternalId = attendees.filter(a => a.externalId);
              
              for (const attendee of attendeesWithExternalId) {
                const endpoint = this.buildResolvedEndpoint(
                  syncTemplates.sessionRegistrations.endpointPath,
                  { accountCode: event.accountCode, eventCode: event.eventCode }
                );
                
                if (endpoint) {
                  const attendeeEndpoint = this.prepareEndpointForAttendee(endpoint, attendee.externalId);
                  if (!attendeeEndpoint) continue;
                  
                  const preparedEndpoint = this.prepareEndpointForSync(attendeeEndpoint, regLastTimestamp);
                  const baseUrl = integration.baseUrl.replace(/\/$/, '');
                  let endpointPath = preparedEndpoint.startsWith('/') ? preparedEndpoint : `/${preparedEndpoint}`;
                  const url = `${baseUrl}${endpointPath}`;
                  
                  const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json', ...authHeaders },
                  });
                  
                  const isRegEmpty404 = !response.ok && response.status === 404;
                  
                  if (response.ok || isRegEmpty404) {
                    let registrations: any[] = [];
                    
                    if (response.ok) {
                      const data = await safeJsonParse(response, `Session registrations for attendee ${attendee.externalId}`);
                      registrations = Array.isArray(data) ? data : 
                        (data.results || data.data || data.registrations || data.functionRegistrations || []);
                    }
                    
                    if (registrations.length > 0) {
                      logger.info(`Received ${registrations.length} session registrations for attendee ${attendee.externalId}`);
                      if (registrations.length <= 3) {
                        logger.debug('Sample registration:', JSON.stringify(registrations[0], null, 2));
                      }
                    }
                    
                    let savedCount = 0;
                    for (const rawReg of registrations) {
                      try {
                        const sessionExternalId = String(rawReg.instanceId || rawReg.sessionId || rawReg.functionInstanceId || '');
                        if (!sessionExternalId) continue;
                        
                        const session = await storage.getSessionByExternalId(event.id, sessionExternalId);
                        if (!session) {
                          continue;
                        }
                        
                        const existing = await storage.getSessionRegistrationByAttendee(session.id, attendee.id);
                        
                        const status = rawReg.status || rawReg.registrationStatus || 
                          (rawReg.isWaitlisted ? 'waitlisted' : 'registered');
                        
                        if (existing) {
                          await storage.updateSessionRegistration(existing.id, { status });
                        } else {
                          await storage.createSessionRegistration({
                            sessionId: session.id,
                            attendeeId: attendee.id,
                            status,
                          });
                        }
                        savedCount++;
                      } catch (e) {
                        logger.warn({ err: e }, `Failed to save session registration`);
                      }
                    }
                    
                    totalRegistrations += savedCount;
                  } else {
                    eventRegSuccess = false;
                  }
                }
                
                await delay(200); // Small delay between attendees
              }
              
              logger.info(`Saved ${totalRegistrations} session registrations for ${event.name}`);
            } else {
              // Standard endpoint without attendee iteration (bulk registration data)
              const endpoint = this.buildResolvedEndpoint(
                syncTemplates.sessionRegistrations.endpointPath,
                { accountCode: event.accountCode, eventCode: event.eventCode }
              );
              
              if (endpoint) {
                const preparedEndpoint = this.prepareEndpointForSync(endpoint, regLastTimestamp);
                const baseUrl = integration.baseUrl.replace(/\/$/, '');
                let endpointPath = preparedEndpoint.startsWith('/') ? preparedEndpoint : `/${preparedEndpoint}`;
                const url = `${baseUrl}${endpointPath}`;
                
                logger.info(`Fetching session registrations for event ${event.name}: ${url}`);
                
                const response = await fetch(url, {
                  method: 'GET',
                  headers: { 'Accept': 'application/json', ...authHeaders },
                });
                
                const isBulkRegEmpty404 = !response.ok && response.status === 404;
                
                if (response.ok || isBulkRegEmpty404) {
                  let registrations: any[] = [];
                  
                  if (response.ok) {
                    const data = await safeJsonParse(response, `Bulk session registrations for ${event.name}`);
                    registrations = Array.isArray(data) ? data : 
                      (data.results || data.data || data.registrations || data.functionRegistrations || []);
                  }
                  
                  logger.info(`Received ${registrations.length} session registrations for ${event.name}`);
                  if (registrations.length > 0) {
                    logger.debug('Sample registration:', JSON.stringify(registrations[0], null, 2));
                  }
                  
                  let savedCount = 0;
                  let totalSessionRegs = 0;
                  
                  for (const rawReg of registrations) {
                    try {
                      const attendeeExternalId = String(rawReg.registrationCode || rawReg.attendeeId || rawReg.pkRegId || '');
                      if (!attendeeExternalId) continue;
                      
                      const attendee = await storage.getAttendeeByExternalId(event.id, attendeeExternalId);
                      if (!attendee) continue;
                      
                      // Handle nested sessions array (Certain API format)
                      const sessionsArray = rawReg.sessions || [];
                      totalSessionRegs += sessionsArray.length;
                      
                      for (const sessionReg of sessionsArray) {
                        const sessionExternalId = String(sessionReg.instanceId || sessionReg.sessionId || '');
                        if (!sessionExternalId) continue;
                        
                        const session = await storage.getSessionByExternalId(event.id, sessionExternalId);
                        if (!session) continue;
                        
                        const existing = await storage.getSessionRegistrationByAttendee(session.id, attendee.id);
                        
                        const status = sessionReg.regSessionStatus?.toLowerCase() || 
                          sessionReg.status || 'registered';
                        
                        if (existing) {
                          await storage.updateSessionRegistration(existing.id, { status });
                        } else {
                          await storage.createSessionRegistration({
                            sessionId: session.id,
                            attendeeId: attendee.id,
                            status,
                          });
                        }
                        savedCount++;
                      }
                    } catch (e) {
                      logger.warn({ err: e }, `Failed to save session registration`);
                    }
                  }
                  
                  totalRegistrations += savedCount;
                  logger.info(`Saved ${savedCount}/${totalSessionRegs} session registrations for ${event.name}`);
                } else {
                  eventRegSuccess = false;
                  registrationsErrors.push(`Event ${event.name}: API returned ${response.status}`);
                }
              }
            }
            
            if (regSyncState && eventRegSuccess) {
              await storage.updateEventSyncState(regSyncState.id, {
                lastSyncAt: new Date(),
                lastSyncTimestamp: formatCertainTimestamp(new Date()),
                syncStatus: 'success',
              });
            }
          } catch (err: any) {
            registrationsErrors.push(`Event ${event.name}: ${err.message}`);
          }
          
          await delay(500);
        }
        
        result.steps.sessionRegistrations = {
          success: registrationsErrors.length === 0,
          count: totalRegistrations,
          error: registrationsErrors.length > 0 ? registrationsErrors.join('; ') : undefined,
        };
        result.totalRecords += totalRegistrations;
        onProgress?.('sessionRegistrations', registrationsErrors.length === 0 ? 'completed' : 'error', { count: totalRegistrations });
        logger.info(`Session registrations sync complete: ${totalRegistrations} total`);
      } else {
        result.steps.sessionRegistrations = { success: true, count: 0, error: 'No session registrations endpoint configured' };
        logger.info('Skipping session registrations - no endpoint configured');
      }
      
      result.success = result.steps.events.success && result.steps.attendees.success && 
                       result.steps.sessions.success && result.steps.sessionRegistrations.success;
      result.durationMs = Date.now() - startTime;
      
      logger.info(`Complete! Total records: ${result.totalRecords}, Duration: ${result.durationMs}ms`);
      
      return result;
    } catch (err: any) {
      result.success = false;
      result.durationMs = Date.now() - startTime;
      logger.error({ err: err }, 'Fatal error');
      throw err;
    }
  }
  
  /**
   * Transform raw attendee data from external platform (simple version for sequential sync)
   */
  private transformAttendeeSimple(rawData: any): {
    externalId: string;
    firstName: string;
    lastName: string;
    email: string;
    company?: string;
    title?: string;
    participantType?: string;
  } {
    return {
      externalId: String(rawData.registrationCode || rawData.registration_code || rawData.id || rawData.attendeeId || ''),
      firstName: rawData.firstName || rawData.first_name || rawData.givenName || '',
      lastName: rawData.lastName || rawData.last_name || rawData.familyName || '',
      email: rawData.email || rawData.emailAddress || rawData.email_address || '',
      company: rawData.company || rawData.organization || rawData.companyName || '',
      title: rawData.title || rawData.jobTitle || rawData.job_title || '',
      participantType: rawData.participantType || rawData.participant_type || rawData.registrationType || rawData.type || 'General',
    };
  }

  /**
   * Transform Certain-specific attendee data (profile is nested)
   */
  private transformCertainAttendee(rawData: any): {
    externalId: string;
    firstName: string;
    lastName: string;
    email: string;
    company?: string;
    title?: string;
    participantType?: string;
    registrationStatus?: string;
    registrationStatusLabel?: string;
    orderCode?: string;
  } {
    const profile = rawData.profile || {};
    const statusLabel = rawData.registrationStatusLabel || '';
    const externalId = String(rawData.registrationCode || rawData.pkRegId || '');
    // orderCode links guests to primary attendee - matches primary's externalId
    // For primary attendees, orderCode equals their own externalId
    const orderCode = String(rawData.orderCode || externalId);
    return {
      externalId,
      firstName: profile.firstName || rawData.firstName || '',
      lastName: profile.lastName || rawData.lastName || '',
      email: profile.email || rawData.email || '',
      company: profile.organization || profile.company || '',
      title: profile.position || profile.title || '',
      participantType: rawData.attendeeType || rawData.attendeeTypeCode || 'General',
      registrationStatus: statusLabel || (rawData.isActive ? 'Registered' : 'Invited'),
      registrationStatusLabel: statusLabel || null,
      orderCode,
    };
  }

  /**
   * Transform Certain-specific session data
   */
  private transformCertainSession(rawData: any): {
    externalId: string;
    instanceId?: number;
    sessionCode: string;
    name: string;
    description?: string;
    location?: string;
    venue?: string;
    trackName?: string;
    trackColor?: string;
    typeName?: string;
    startTime?: Date;
    endTime?: Date;
    capacity?: number;
    isActive: boolean;
  } {
    const parseDateTime = (dateStr: string): Date | undefined => {
      if (!dateStr) return undefined;
      // Certain format: "12/02/2026 13:00:00" (MM/DD/YYYY HH:MM:SS)
      const parts = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/);
      if (parts) {
        return new Date(
          parseInt(parts[3]), // year
          parseInt(parts[1]) - 1, // month (0-indexed)
          parseInt(parts[2]), // day
          parseInt(parts[4]), // hours
          parseInt(parts[5]), // minutes
          parseInt(parts[6])  // seconds
        );
      }
      return undefined;
    };

    const rawInstanceId = rawData.instanceId || rawData.sessionId;
    return {
      externalId: String(rawInstanceId || ''),
      instanceId: rawInstanceId ? parseInt(String(rawInstanceId), 10) || undefined : undefined,
      sessionCode: rawData.sessionCode || rawData.instanceCode || '',
      name: (rawData.sessionTitle || rawData.name || '').replace(/&amp;/g, '&'),
      description: rawData.sessionDescription?.replace(/&amp;/g, '&'),
      location: rawData.locationName,
      venue: rawData.venue,
      trackName: rawData.trackName?.replace(/&amp;/g, '&'),
      trackColor: rawData.trackColour || rawData.trackColor,
      typeName: rawData.typeName,
      startTime: parseDateTime(rawData.startTime),
      endTime: parseDateTime(rawData.endTime),
      capacity: rawData.capacity || undefined,
      isActive: rawData.isActive !== false,
    };
  }
  
  /**
   * Transform raw session data from external platform
   */
  private transformSession(rawData: any): {
    externalId: string;
    name: string;
    description?: string;
    startTime?: Date;
    endTime?: Date;
    location?: string;
    capacity?: number;
  } {
    return {
      externalId: String(rawData.functionCode || rawData.function_code || rawData.sessionCode || rawData.id || ''),
      name: rawData.functionName || rawData.function_name || rawData.sessionName || rawData.name || rawData.title || '',
      description: rawData.description || rawData.summary || '',
      startTime: rawData.startDate || rawData.start_date || rawData.startTime ? new Date(rawData.startDate || rawData.start_date || rawData.startTime) : undefined,
      endTime: rawData.endDate || rawData.end_date || rawData.endTime ? new Date(rawData.endDate || rawData.end_date || rawData.endTime) : undefined,
      location: rawData.location || rawData.room || rawData.venue || '',
      capacity: parseInt(rawData.capacity || rawData.maxAttendees || '0') || undefined,
    };
  }

  async pushAttendeesToExternal(config: {
    integration: CustomerIntegration;
    eventId: string;
    externalEventId: string;
    attendees: Array<{
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      company?: string | null;
      title?: string | null;
      participantType: string;
      registrationStatus?: string;
      customFields?: Record<string, string> | null;
    }>;
  }): Promise<OutboundSyncResult> {
    const { integration, externalEventId, attendees } = config;
    const syncKey = `outbound-${integration.id}-${config.eventId}`;

    if (this.activeSyncs.get(syncKey)) {
      throw new Error(`Outbound sync already in progress for: ${syncKey}`);
    }

    this.activeSyncs.set(syncKey, true);

    try {
      const pushEndpoint = integration.endpoints.find(
        ep => ep.name === 'createAttendee' || ep.name === 'pushAttendees' || ep.name === 'postAttendee'
      );

      if (!pushEndpoint) {
        throw new Error('No outbound attendee endpoint configured for this integration. Configure an endpoint named "createAttendee" or "pushAttendees".');
      }

      const apiClient = new ApiClient({
        baseUrl: integration.baseUrl,
        authStrategy: integration.authType as any,
        credentialsRef: integration.credentialsRef || undefined,
        rateLimit: integration.rateLimitPolicy ? {
          requestsPerMinute: integration.rateLimitPolicy.requestsPerMinute || 60,
          burstSize: integration.rateLimitPolicy.burstSize,
        } : undefined,
      });

      let pushedCount = 0;
      let failedCount = 0;
      const errors: Array<{ attendeeId: string; error: string }> = [];
      const results: Array<{ attendeeId: string; externalId?: string }> = [];

      for (const attendee of attendees) {
        try {
          const path = this.replacePathVariables(
            pushEndpoint.path,
            { eventId: externalEventId, eventCode: externalEventId }
          );

          const payload = this.transformAttendeeForOutbound(attendee, integration);

          const response = await apiClient.request<any>({
            method: pushEndpoint.method || 'POST',
            path,
            headers: {
              'Content-Type': 'application/json',
              ...(pushEndpoint.headers || {}),
            },
            body: payload,
          });

          const externalId = response?.registrationCode ||
            response?.id ||
            response?.externalId ||
            response?.data?.id ||
            response?.data?.registrationCode;

          if (externalId) {
            await storage.updateAttendee(attendee.id, { externalId: String(externalId) } as any);
            results.push({ attendeeId: attendee.id, externalId: String(externalId) });
          } else {
            results.push({ attendeeId: attendee.id });
          }

          pushedCount++;
        } catch (error) {
          failedCount++;
          errors.push({
            attendeeId: attendee.id,
            error: (error as Error).message,
          });
          logger.error({ err: error }, `Failed to push attendee ${attendee.id}`);
        }
      }

      return {
        success: failedCount === 0,
        pushed: pushedCount,
        failed: failedCount,
        results,
        errors,
      };
    } finally {
      this.activeSyncs.delete(syncKey);
    }
  }

  private transformAttendeeForOutbound(
    attendee: {
      firstName: string;
      lastName: string;
      email: string;
      company?: string | null;
      title?: string | null;
      participantType: string;
      registrationStatus?: string;
      customFields?: Record<string, string> | null;
    },
    integration: CustomerIntegration
  ): Record<string, any> {
    const fieldMapping = integration.fieldMapping || {};
    const reverseMapping: Record<string, string> = {};

    for (const [internal, external] of Object.entries(fieldMapping)) {
      if (typeof external === 'string') {
        reverseMapping[internal] = external;
      }
    }

    const setNestedField = (obj: Record<string, any>, path: string, value: any) => {
      const parts = path.split('.');
      let current = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
    };

    const payload: Record<string, any> = {};

    const fields: Record<string, any> = {
      firstName: attendee.firstName,
      lastName: attendee.lastName,
      email: attendee.email,
      company: attendee.company || '',
      title: attendee.title || '',
      participantType: attendee.participantType,
      registrationStatus: attendee.registrationStatus || 'Registered',
    };

    for (const [internal, value] of Object.entries(fields)) {
      const externalPath = reverseMapping[internal];
      if (externalPath) {
        setNestedField(payload, externalPath, value);
      } else {
        payload[internal] = value;
      }
    }

    if (attendee.customFields) {
      for (const [key, value] of Object.entries(attendee.customFields)) {
        const mappingKey = `customField_${key}`;
        const externalPath = reverseMapping[mappingKey];
        if (externalPath) {
          setNestedField(payload, externalPath, value);
        } else {
          if (!payload.customFields) payload.customFields = {};
          payload.customFields[key] = value;
        }
      }
    }

    return payload;
  }
}

interface OutboundSyncResult {
  success: boolean;
  pushed: number;
  failed: number;
  results: Array<{ attendeeId: string; externalId?: string }>;
  errors: Array<{ attendeeId: string; error: string }>;
}

export const syncOrchestrator = new SyncOrchestrator();
export { type SyncConfig, type AttendeeData, type SyncResult, type EventSyncConfig, type EventSyncResult, type OutboundSyncResult };
