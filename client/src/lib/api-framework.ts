import { offlineDB, SyncQueueItem } from './offline-db';
import { apiRequest } from './queryClient';
import { safeTransform } from './safe-transform';

export interface ApiEndpoint {
  name: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  transformations?: {
    request?: string;
    response?: string;
  };
  variables?: Record<string, string>;
}

export interface ApiConfiguration {
  id: string;
  name: string;
  baseUrl: string;
  authType: 'bearer' | 'apikey' | 'basic' | 'oauth2';
  credentials: Record<string, string>;
  endpoints: ApiEndpoint[];
  lastSync?: string;
}

export interface SyncResult {
  synced: number;
  failed: number;
  pending: number;
}

class ApiFramework {
  private isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;
  private statusListeners: Set<(isOnline: boolean) => void> = new Set();

  constructor() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifyStatusListeners();
      this.processSyncQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifyStatusListeners();
    });
  }

  getOnlineStatus() {
    return this.isOnline;
  }

  onStatusChange(callback: (isOnline: boolean) => void) {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  private notifyStatusListeners() {
    this.statusListeners.forEach(cb => cb(this.isOnline));
  }

  private replaceVariables(str: string, variables: Record<string, string>): string {
    return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] || match;
    });
  }

  private applyTransformation(data: any, transformationCode?: string): any {
    if (!transformationCode) return data;

    try {
      return safeTransform(data, transformationCode);
    } catch (error) {
      console.error('Transformation error:', error);
      return data;
    }
  }

  async callEndpoint(
    configId: string,
    endpointName: string,
    data?: any,
    variables?: Record<string, string>
  ): Promise<any> {
    const config = await offlineDB.getApiConfig(configId);
    if (!config) {
      throw new Error(`API configuration '${configId}' not found`);
    }

    const endpoint = config.endpoints.find(e => e.name === endpointName);
    if (!endpoint) {
      throw new Error(`Endpoint '${endpointName}' not found in configuration '${configId}'`);
    }

    const mergedVariables = { ...endpoint.variables, ...variables };
    const url = config.baseUrl + this.replaceVariables(endpoint.path, mergedVariables);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...endpoint.headers,
    };

    // Add authentication
    switch (config.authType) {
      case 'bearer':
        if (config.credentials.token) {
          headers['Authorization'] = `Bearer ${config.credentials.token}`;
        }
        break;
      case 'apikey':
        if (config.credentials.key && config.credentials.value) {
          headers[config.credentials.key] = config.credentials.value;
        }
        break;
      case 'basic':
        if (config.credentials.username && config.credentials.password) {
          headers['Authorization'] = `Basic ${btoa(
            `${config.credentials.username}:${config.credentials.password}`
          )}`;
        }
        break;
    }

    // Apply request transformation
    const transformedData = this.applyTransformation(data, endpoint.transformations?.request);

    if (!this.isOnline) {
      throw new Error('No internet connection. Action queued for sync.');
    }

    try {
      const response = await fetch(url, {
        method: endpoint.method,
        headers,
        body: transformedData ? JSON.stringify(transformedData) : undefined,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();

      // Apply response transformation
      return this.applyTransformation(responseData, endpoint.transformations?.response);
    } catch (error) {
      console.error('API call failed:', error);
      throw error;
    }
  }

  async syncAttendees(configId: string, eventId: string) {
    try {
      const attendees = await this.callEndpoint(configId, 'getAttendees', null, { eventId });

      // Save to offline database
      for (const attendee of attendees) {
        await offlineDB.saveAttendee({
          ...attendee,
          eventId,
          syncStatus: 'synced',
          lastModified: new Date().toISOString(),
        });
      }

      // Update last sync time
      const config = await offlineDB.getApiConfig(configId);
      if (config) {
        await offlineDB.saveApiConfig({
          ...config,
          lastSync: new Date().toISOString(),
        });
      }

      return attendees;
    } catch (error) {
      console.error('Sync failed:', error);
      throw error;
    }
  }

  async queueAction(
    action: 'create' | 'update' | 'delete',
    entity: 'attendee' | 'event' | 'checkin' | 'badge',
    entityId: string,
    data: any
  ) {
    await offlineDB.addToSyncQueue({
      action,
      entity,
      entityId,
      data,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    });

    if (this.isOnline) {
      this.processSyncQueue();
    }
  }

  async processSyncQueue(): Promise<SyncResult> {
    if (this.syncInProgress || !this.isOnline) {
      const pending = await offlineDB.getPendingSyncCount();
      return { synced: 0, failed: 0, pending };
    }

    this.syncInProgress = true;
    let synced = 0;
    let failed = 0;

    try {
      const queue = await offlineDB.getSyncQueue();

      for (const item of queue) {
        try {
          await this.processSyncItem(item);
          
          if (item.id) {
            await offlineDB.clearSyncQueueItem(item.id);
          }
          synced++;
        } catch (error) {
          console.error('[ApiFramework] Failed to process sync item:', item, error);
          
          if (item.id) {
            const newRetryCount = (item.retryCount || 0) + 1;
            const maxRetries = item.maxRetries || 5;
            
            if (newRetryCount >= maxRetries) {
              console.warn('[ApiFramework] Max retries reached, removing item:', item.id);
              await offlineDB.clearSyncQueueItem(item.id);
              failed++;
            } else {
              await offlineDB.updateSyncQueueItem(item.id, { retryCount: newRetryCount });
            }
          }
        }
      }

      await offlineDB.saveAppState('lastSyncTime', new Date().toISOString());
    } finally {
      this.syncInProgress = false;
    }

    const pending = await offlineDB.getPendingSyncCount();
    return { synced, failed, pending };
  }

  private async processSyncItem(item: SyncQueueItem): Promise<void> {

    switch (item.action) {
      case 'checkin':
        if (item.entity === 'attendee') {
          await apiRequest('POST', `/api/attendees/${item.entityId}/checkin`);
        } else if (item.entity === 'session') {
          await apiRequest('POST', `/api/sessions/${item.entityId}/checkin`, {
            attendeeId: item.data.attendeeId,
            source: item.data.source || 'sync',
          });
        }
        break;
      
      case 'checkout':
        if (item.entity === 'session') {
          await apiRequest('POST', `/api/sessions/${item.entityId}/checkout`, {
            attendeeId: item.data.attendeeId,
            source: item.data.source || 'sync',
          });
        }
        break;
      
      case 'print':
        if (item.entity === 'badge') {
          await apiRequest('POST', `/api/attendees/${item.entityId}/badge-printed`);
        }
        break;
      
      case 'update':
        if (item.entity === 'attendee') {
          await apiRequest('PATCH', `/api/attendees/${item.entityId}`, item.data);
        }
        break;
      
      case 'create':
        if (item.entity === 'attendee') {
          await apiRequest('POST', '/api/attendees', item.data);
        }
        break;
      
      case 'delete':
        if (item.entity === 'attendee') {
          await apiRequest('DELETE', `/api/attendees/${item.entityId}`);
        }
        break;
      
      default:
        console.warn('[ApiFramework] Unknown sync action:', item.action);
    }
  }

  async getSyncStatus(): Promise<{ pending: number; lastSync: string | null }> {
    const pending = await offlineDB.getPendingSyncCount();
    const lastSync = await offlineDB.getAppState('lastSyncTime');
    return { pending, lastSync };
  }

  async createMacro(name: string, steps: Array<{
    configId: string;
    endpointName: string;
    data?: any;
    variables?: Record<string, string>;
  }>) {
    return async (context?: Record<string, any>) => {
      const results = [];
      for (const step of steps) {
        const variables = { ...step.variables, ...context };
        const result = await this.callEndpoint(
          step.configId,
          step.endpointName,
          step.data,
          variables
        );
        results.push(result);
      }
      return results;
    };
  }
}

export const apiFramework = new ApiFramework();
