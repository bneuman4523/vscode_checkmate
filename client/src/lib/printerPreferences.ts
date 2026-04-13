export interface PrintNodePrinterInfo {
  id: number;
  name: string;
  description?: string;
  computerName?: string;
  state?: string;
}

export interface SelectedPrinterPrintNode {
  type: 'printnode';
  printNodeId: number;
  printerName: string;
}

export interface SelectedPrinterLocal {
  type: 'local';
  printerId: string;
  printerName: string;
  ipAddress?: string;
  port?: number;
  dpi?: number;
}

export interface SelectedPrinterCustom {
  type: 'custom';
  customIp: string;
  customPort: number;
  customDpi: number;
}

export interface SelectedPrinterBrowser {
  type: 'browser';
}

export type SelectedPrinter =
  | SelectedPrinterPrintNode
  | SelectedPrinterLocal
  | SelectedPrinterCustom
  | SelectedPrinterBrowser;

const STORAGE_KEY_PREFIX = 'checkmate_printer_';
const LEGACY_ADMIN_KEY = 'adminSelectedPrinter';
const LEGACY_STAFF_KEY = 'staffSelectedPrinter';
const MIGRATION_DONE_KEY_PREFIX = 'checkmate_printer_migrated_';

function storageKey(eventId: string): string {
  return `${STORAGE_KEY_PREFIX}${eventId}`;
}

function isValidSelectedPrinter(obj: unknown): obj is SelectedPrinter {
  if (!obj || typeof obj !== 'object') return false;
  const p = obj as Record<string, unknown>;
  switch (p.type) {
    case 'printnode':
      return typeof p.printNodeId === 'number' && typeof p.printerName === 'string';
    case 'local':
      return typeof p.printerId === 'string' && typeof p.printerName === 'string';
    case 'custom':
      return typeof p.customIp === 'string' && typeof p.customPort === 'number' && typeof p.customDpi === 'number';
    case 'browser':
      return true;
    default:
      return false;
  }
}

export function getSavedPrinter(eventId: string): SelectedPrinter | null {
  try {
    const raw = localStorage.getItem(storageKey(eventId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (isValidSelectedPrinter(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function savePrinter(eventId: string, printer: SelectedPrinter): void {
  localStorage.setItem(storageKey(eventId), JSON.stringify(printer));
}

export function clearPrinter(eventId: string): void {
  localStorage.removeItem(storageKey(eventId));
}

export function migrateLegacyPreferences(eventId: string): SelectedPrinter | null {
  const migrationKey = `${MIGRATION_DONE_KEY_PREFIX}${eventId}`;
  if (localStorage.getItem(migrationKey)) return null;
  if (getSavedPrinter(eventId)) {
    localStorage.setItem(migrationKey, 'true');
    return null;
  }

  let migrated: SelectedPrinter | null = null;

  try {
    const adminRaw = localStorage.getItem(LEGACY_ADMIN_KEY);
    if (adminRaw) {
      const admin = JSON.parse(adminRaw);
      if (admin.method === 'printnode' && admin.printNodePrinterId) {
        migrated = {
          type: 'printnode',
          printNodeId: admin.printNodePrinterId,
          printerName: 'PrintNode Printer',
        };
      } else {
        migrated = { type: 'browser' };
      }
    }
  } catch {}

  try {
    const staffRaw = localStorage.getItem(LEGACY_STAFF_KEY);
    if (staffRaw) {
      const staff = JSON.parse(staffRaw);
      if (staff.type === 'printnode' && staff.printNodeId) {
        migrated = {
          type: 'printnode',
          printNodeId: staff.printNodeId,
          printerName: staff.printerName || 'PrintNode Printer',
        };
      } else if (staff.type === 'custom') {
        migrated = {
          type: 'custom',
          customIp: staff.customIp || '',
          customPort: staff.customPort || 9100,
          customDpi: staff.customDpi || 203,
        };
      } else if (staff.type === 'local' && staff.printerId) {
        migrated = {
          type: 'local',
          printerId: staff.printerId,
          printerName: staff.printerName || 'Local Printer',
        };
      }
    }
  } catch {}

  if (migrated) {
    savePrinter(eventId, migrated);
  }

  try { localStorage.removeItem(LEGACY_ADMIN_KEY); } catch {}
  try { localStorage.removeItem(LEGACY_STAFF_KEY); } catch {}

  localStorage.setItem(migrationKey, 'true');

  return migrated;
}

export function getPrinterDisplayName(printer: SelectedPrinter | null): string {
  if (!printer) return 'No printer selected';
  switch (printer.type) {
    case 'printnode': return printer.printerName || 'Cloud Printer';
    case 'local': return printer.printerName || 'Local Printer';
    case 'custom': return `Zebra @ ${printer.customIp}:${printer.customPort}`;
    case 'browser': return 'Browser Print';
    default: return 'Unknown';
  }
}
