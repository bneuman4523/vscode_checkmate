import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSavedPrinter,
  savePrinter as persistPrinter,
  clearPrinter as removePrinter,
  migrateLegacyPreferences,
  getPrinterDisplayName,
} from '@/lib/printerPreferences';
import type { SelectedPrinter, PrintNodePrinterInfo } from '@/lib/printerPreferences';

interface UsePrinterOptions {
  eventId: string;
  mode?: 'admin' | 'staff' | 'kiosk';
  pollIntervalMs?: number;
}

export function usePrinter({ eventId, mode = 'admin', pollIntervalMs = 30000 }: UsePrinterOptions) {
  const [savedPrinter, setSavedPrinter] = useState<SelectedPrinter | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [offlineDismissed, setOfflineDismissed] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [printNodePrinters, setPrintNodePrinters] = useState<PrintNodePrinterInfo[]>([]);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const migrationDone = useRef(false);

  useEffect(() => {
    if (!eventId) return;

    if (!migrationDone.current) {
      migrateLegacyPreferences(eventId);
      migrationDone.current = true;
    }

    const existing = getSavedPrinter(eventId);
    setSavedPrinter(existing);
  }, [eventId]);

  const fetchPrintNodeStatus = useCallback(async () => {
    if (!savedPrinter || savedPrinter.type !== 'printnode') return;

    try {
      let response: Response;
      if (mode === 'staff') {
        const token = localStorage.getItem('staffToken');
        response = await fetch('/api/staff/printnode/printers', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
      } else {
        response = await fetch('/api/printnode/printers', { credentials: 'include' });
      }

      if (response.ok) {
        const data = await response.json();
        const printers: PrintNodePrinterInfo[] = data.printers || (Array.isArray(data) ? data : []);
        setPrintNodePrinters(printers);

        const match = printers.find(p => p.id === savedPrinter.printNodeId);
        setIsOffline(match ? match.state !== 'online' : true);

        if (match && savedPrinter.printerName !== match.name) {
          const updated: SelectedPrinter = { ...savedPrinter, printerName: match.name };
          persistPrinter(eventId, updated);
          setSavedPrinter(updated);
        }
      }
    } catch (error) {
      console.error('[usePrinter] Failed to fetch PrintNode status:', error);
    }
  }, [savedPrinter, eventId, mode]);

  const printNodeId = savedPrinter?.type === 'printnode' ? savedPrinter.printNodeId : null;

  useEffect(() => {
    if (savedPrinter?.type === 'printnode') {
      fetchPrintNodeStatus();
      pollRef.current = setInterval(fetchPrintNodeStatus, pollIntervalMs);
    } else {
      setIsOffline(false);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [savedPrinter?.type, printNodeId, fetchPrintNodeStatus, pollIntervalMs]);

  const handleSelect = useCallback((printer: SelectedPrinter) => {
    persistPrinter(eventId, printer);
    setSavedPrinter(printer);
    setShowSelector(false);
    setIsOffline(false);
    setOfflineDismissed(false);
  }, [eventId]);

  const openSelector = useCallback(() => {
    setShowSelector(true);
  }, []);

  const clearPreference = useCallback(() => {
    removePrinter(eventId);
    setSavedPrinter(null);
    setIsOffline(false);
  }, [eventId]);

  const retryConnection = useCallback(() => {
    setOfflineDismissed(false);
    fetchPrintNodeStatus();
  }, [fetchPrintNodeStatus]);

  const dismissOfflineAlert = useCallback(() => {
    setOfflineDismissed(true);
  }, []);

  const displayName = getPrinterDisplayName(savedPrinter);

  return {
    savedPrinter,
    isOffline,
    offlineDismissed,
    showSelector,
    setShowSelector,
    openSelector,
    handleSelect,
    clearPreference,
    retryConnection,
    dismissOfflineAlert,
    displayName,
    printNodePrinters,
  };
}
