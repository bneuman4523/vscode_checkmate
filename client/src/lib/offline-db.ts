import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface OfflineAttendee {
  id: string;
  eventId: string;
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  title?: string;
  participantType: string;
  checkedIn: boolean;
  checkedInAt?: string;
  badgePrinted: boolean;
  badgePrintedAt?: string;
  qrCode: string;
  externalId?: string;
  orderCode?: string;
  customFields?: Record<string, any>;
  syncStatus: 'synced' | 'pending' | 'conflict';
  lastModified: string;
}

export interface OfflineEvent {
  id: string;
  name: string;
  date: string;
  customerId: string;
  defaultBadgeTemplateId?: string;
  selectedTemplates: string[];
  settings: Record<string, any>;
  syncStatus: 'synced' | 'pending' | 'conflict';
  lastModified: string;
}

export interface OfflineBadgeTemplate {
  id: string;
  customerId: string;
  name: string;
  participantType: string;
  width: number;
  height: number;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  includeQR: boolean;
  qrPosition?: string;
  mergeFields?: any[];
  customFields?: string[];
  syncStatus: 'synced' | 'pending' | 'conflict';
  lastModified: string;
}

export interface PrintQueueItem {
  id: string;
  attendeeId: string;
  attendeeName: string;
  eventId: string;
  badgeHtml: string;
  badgeData?: {
    firstName: string;
    lastName: string;
    company?: string;
    title?: string;
    participantType: string;
    externalId?: string;
    customFields?: Record<string, string>;
    qrCode?: string;
  };
  templateConfig: any;
  status: 'pending' | 'printing' | 'completed' | 'failed';
  createdAt: string;
  attempts: number;
  error?: string;
}

export interface SyncQueueItem {
  id?: number;
  action: 'create' | 'update' | 'delete' | 'checkin' | 'checkout' | 'print' | 'walkin';
  entity: 'attendee' | 'event' | 'checkin' | 'badge' | 'session';
  entityId: string;
  data: any;
  timestamp: string;
  retryCount: number;
  maxRetries?: number;
}

interface EventFlowDB extends DBSchema {
  attendees: {
    key: string;
    value: OfflineAttendee;
    indexes: { 'by-event': string; 'by-email': string; 'by-sync-status': string };
  };
  events: {
    key: string;
    value: OfflineEvent;
  };
  badgeTemplates: {
    key: string;
    value: OfflineBadgeTemplate;
  };
  printQueue: {
    key: string;
    value: PrintQueueItem;
    indexes: { 'by-status': string; 'by-event': string };
  };
  syncQueue: {
    key: number;
    value: SyncQueueItem;
    autoIncrement: true;
  };
  apiConfig: {
    key: string;
    value: {
      id: string;
      name: string;
      baseUrl: string;
      authType: 'bearer' | 'apikey' | 'basic' | 'oauth2';
      credentials: Record<string, string>;
      endpoints: {
        name: string;
        path: string;
        method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
        headers?: Record<string, string>;
        transformations?: {
          request?: string;
          response?: string;
        };
        variables?: Record<string, string>;
      }[];
      lastSync?: string;
    };
  };
  appState: {
    key: string;
    value: {
      key: string;
      value: any;
      lastModified: string;
    };
  };
}

class OfflineDatabase {
  private db: IDBPDatabase<EventFlowDB> | null = null;
  private readonly DB_NAME = 'eventflow-offline';
  private readonly DB_VERSION = 2;

  async init() {
    if (this.db) return this.db;

    this.db = await openDB<EventFlowDB>(this.DB_NAME, this.DB_VERSION, {
      upgrade(db, oldVersion) {
        // Attendees store
        if (!db.objectStoreNames.contains('attendees')) {
          const attendeeStore = db.createObjectStore('attendees', { keyPath: 'id' });
          attendeeStore.createIndex('by-event', 'eventId');
          attendeeStore.createIndex('by-email', 'email');
          attendeeStore.createIndex('by-sync-status', 'syncStatus');
        }

        // Events store
        if (!db.objectStoreNames.contains('events')) {
          db.createObjectStore('events', { keyPath: 'id' });
        }

        // Badge Templates store
        if (!db.objectStoreNames.contains('badgeTemplates')) {
          db.createObjectStore('badgeTemplates', { keyPath: 'id' });
        }

        // Sync Queue store
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        }

        // API Config store
        if (!db.objectStoreNames.contains('apiConfig')) {
          db.createObjectStore('apiConfig', { keyPath: 'id' });
        }

        // App State store
        if (!db.objectStoreNames.contains('appState')) {
          db.createObjectStore('appState', { keyPath: 'key' });
        }

        // Print Queue store (added in v2)
        if (!db.objectStoreNames.contains('printQueue')) {
          const printStore = db.createObjectStore('printQueue', { keyPath: 'id' });
          printStore.createIndex('by-status', 'status');
          printStore.createIndex('by-event', 'eventId');
        }
      },
    });

    return this.db;
  }

  async getAttendeesByEvent(eventId: string) {
    const db = await this.init();
    return db.getAllFromIndex('attendees', 'by-event', eventId);
  }

  async saveAttendee(attendee: EventFlowDB['attendees']['value']) {
    const db = await this.init();
    await db.put('attendees', {
      ...attendee,
      lastModified: new Date().toISOString(),
    });
  }

  async getAttendee(id: string) {
    const db = await this.init();
    return db.get('attendees', id);
  }

  async saveEvent(event: EventFlowDB['events']['value']) {
    const db = await this.init();
    await db.put('events', {
      ...event,
      lastModified: new Date().toISOString(),
    });
  }

  async getEvent(id: string) {
    const db = await this.init();
    return db.get('events', id);
  }

  async getAllEvents() {
    const db = await this.init();
    return db.getAll('events');
  }

  async saveBadgeTemplate(template: EventFlowDB['badgeTemplates']['value']) {
    const db = await this.init();
    await db.put('badgeTemplates', {
      ...template,
      lastModified: new Date().toISOString(),
    });
  }

  async getBadgeTemplates(customerId: string) {
    const db = await this.init();
    const all = await db.getAll('badgeTemplates');
    return all.filter(t => t.customerId === customerId);
  }

  async addToSyncQueue(item: Omit<SyncQueueItem, 'id'>) {
    const db = await this.init();
    await db.add('syncQueue', {
      ...item,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    } as SyncQueueItem);
  }

  async getSyncQueue() {
    const db = await this.init();
    return db.getAll('syncQueue');
  }

  async clearSyncQueueItem(id: number) {
    const db = await this.init();
    await db.delete('syncQueue', id);
  }

  async updateSyncQueueItem(id: number, updates: Partial<SyncQueueItem>) {
    const db = await this.init();
    const existing = await db.get('syncQueue', id);
    if (existing) {
      await db.put('syncQueue', { ...existing, ...updates });
    }
  }

  async getPendingSyncCount() {
    const db = await this.init();
    const queue = await db.getAll('syncQueue');
    return queue.length;
  }

  // Print Queue methods
  async addToPrintQueue(item: PrintQueueItem) {
    const db = await this.init();
    await db.put('printQueue', item);
  }

  async getPrintQueue() {
    const db = await this.init();
    return db.getAll('printQueue');
  }

  async getPendingPrintJobs() {
    const db = await this.init();
    return db.getAllFromIndex('printQueue', 'by-status', 'pending');
  }

  async getPrintJob(id: string) {
    const db = await this.init();
    return db.get('printQueue', id);
  }

  async updatePrintJob(id: string, updates: Partial<PrintQueueItem>) {
    const db = await this.init();
    const existing = await db.get('printQueue', id);
    if (existing) {
      await db.put('printQueue', { ...existing, ...updates });
    }
  }

  async deletePrintJob(id: string) {
    const db = await this.init();
    await db.delete('printQueue', id);
  }

  async clearCompletedPrintJobs() {
    const db = await this.init();
    const completed = await db.getAllFromIndex('printQueue', 'by-status', 'completed');
    for (const job of completed) {
      await db.delete('printQueue', job.id);
    }
  }

  // Bulk operations for pre-caching
  async bulkSaveAttendees(attendees: OfflineAttendee[]) {
    const db = await this.init();
    const tx = db.transaction('attendees', 'readwrite');
    for (const attendee of attendees) {
      await tx.store.put({
        ...attendee,
        syncStatus: 'synced',
        lastModified: new Date().toISOString(),
      });
    }
    await tx.done;
  }

  async bulkSaveTemplates(templates: OfflineBadgeTemplate[]) {
    const db = await this.init();
    const tx = db.transaction('badgeTemplates', 'readwrite');
    for (const template of templates) {
      await tx.store.put({
        ...template,
        syncStatus: 'synced',
        lastModified: new Date().toISOString(),
      });
    }
    await tx.done;
  }

  // Mark attendee as checked in locally
  async checkInAttendeeOffline(attendeeId: string) {
    const db = await this.init();
    const attendee = await db.get('attendees', attendeeId);
    if (attendee) {
      await db.put('attendees', {
        ...attendee,
        checkedIn: true,
        checkedInAt: new Date().toISOString(),
        syncStatus: 'pending',
        lastModified: new Date().toISOString(),
      });
      return true;
    }
    return false;
  }

  // Mark attendee badge as printed locally
  async markBadgePrintedOffline(attendeeId: string) {
    const db = await this.init();
    const attendee = await db.get('attendees', attendeeId);
    if (attendee) {
      await db.put('attendees', {
        ...attendee,
        badgePrinted: true,
        badgePrintedAt: new Date().toISOString(),
        syncStatus: 'pending',
        lastModified: new Date().toISOString(),
      });
      return true;
    }
    return false;
  }

  // Get pending changes for sync
  async getPendingAttendees() {
    const db = await this.init();
    return db.getAllFromIndex('attendees', 'by-sync-status', 'pending');
  }

  async saveApiConfig(config: EventFlowDB['apiConfig']['value']) {
    const db = await this.init();
    await db.put('apiConfig', config);
  }

  async getApiConfig(id: string) {
    const db = await this.init();
    return db.get('apiConfig', id);
  }

  async getAllApiConfigs() {
    const db = await this.init();
    return db.getAll('apiConfig');
  }

  async saveAppState(key: string, value: any) {
    const db = await this.init();
    await db.put('appState', {
      key,
      value,
      lastModified: new Date().toISOString(),
    });
  }

  async getAppState(key: string) {
    const db = await this.init();
    const result = await db.get('appState', key);
    return result?.value;
  }

  async clearAllData() {
    const db = await this.init();
    await db.clear('attendees');
    await db.clear('events');
    await db.clear('badgeTemplates');
    await db.clear('syncQueue');
    await db.clear('printQueue');
    await db.clear('apiConfig');
    await db.clear('appState');
  }

  // Remove item from sync queue
  async removeFromSyncQueue(id: number) {
    const db = await this.init();
    await db.delete('syncQueue', id);
  }

  // Get offline stats
  async getOfflineStats() {
    const db = await this.init();
    const pendingSync = await db.getAll('syncQueue');
    const pendingPrint = await db.getAllFromIndex('printQueue', 'by-status', 'pending');
    const pendingAttendees = await db.getAllFromIndex('attendees', 'by-sync-status', 'pending');
    
    return {
      pendingSyncActions: pendingSync.length,
      pendingPrintJobs: pendingPrint.length,
      pendingAttendeeUpdates: pendingAttendees.length,
    };
  }
}

export const offlineDB = new OfflineDatabase();
