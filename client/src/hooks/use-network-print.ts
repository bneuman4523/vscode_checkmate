import { useState, useEffect, useCallback } from 'react';

interface NetworkPrinterSettings {
  printerIp: string;
  port: number;
  dpi: number;
  connected: boolean;
  lastTested: string | null;
}

interface NetworkPrintResult {
  success: boolean;
  error?: string;
}

const STORAGE_KEY = 'networkPrinterSettings';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('staffToken');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

export function useNetworkPrint() {
  const [settings, setSettings] = useState<NetworkPrinterSettings>({
    printerIp: '',
    port: 9100,
    dpi: 203,
    connected: false,
    lastTested: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch {
      }
    }
  }, []);

  const saveSettings = useCallback((newSettings: Partial<NetworkPrinterSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const testConnection = useCallback(async (overrideIp?: string, overridePort?: number): Promise<boolean> => {
    const testIp = overrideIp || settings.printerIp;
    const testPort = overridePort || settings.port;
    
    if (!testIp) {
      setError('Please enter a printer IP address');
      return false;
    }

    if (overrideIp && overrideIp !== settings.printerIp) {
      saveSettings({ printerIp: overrideIp });
    }
    if (overridePort && overridePort !== settings.port) {
      saveSettings({ port: overridePort });
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/staff/test-printer', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          printerIp: testIp,
          port: testPort,
        }),
      });

      const result = await response.json();

      if (result.connected) {
        saveSettings({
          printerIp: testIp,
          port: testPort,
          connected: true,
          lastTested: new Date().toISOString(),
        });
        return true;
      } else {
        setError(result.error || 'Connection failed');
        saveSettings({ connected: false });
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection test failed');
      saveSettings({ connected: false });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [settings.printerIp, settings.port, saveSettings]);

  const printZpl = useCallback(async (zplData: string): Promise<NetworkPrintResult> => {
    if (!settings.printerIp) {
      return { success: false, error: 'No printer IP configured' };
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/staff/network-print', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          printerIp: settings.printerIp,
          port: settings.port,
          zplData,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        return { success: true };
      } else {
        const errorMsg = result.details || result.error || 'Print failed';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Print failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsLoading(false);
    }
  }, [settings.printerIp, settings.port]);

  const resetConnection = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSettings({
      printerIp: '',
      port: 9100,
      dpi: 203,
      connected: false,
      lastTested: null,
    });
    setError(null);
  }, []);

  const generateBadgeZpl = useCallback((
    attendee: {
      firstName: string;
      lastName: string;
      title?: string;
      company?: string;
      externalId?: string;
    },
    template: {
      width: number;
      height: number;
      includeQR?: boolean;
      qrData?: string;
    }
  ): string => {
    const dpi = settings.dpi;
    const widthDots = Math.round(template.width * dpi);
    const heightDots = Math.round(template.height * dpi);
    
    const margin = 20;
    const nameY = Math.round(heightDots * 0.15);
    const titleY = Math.round(heightDots * 0.30);
    const companyY = Math.round(heightDots * 0.42);
    const qrY = Math.round(heightDots * 0.55);

    let zpl = `^XA`;
    zpl += `^MMT`;
    zpl += `^PW${widthDots}`;
    zpl += `^LL${heightDots}`;
    zpl += `^LS0`;
    zpl += `^POI`;
    zpl += `^CI28`;

    const fullName = `${attendee.firstName} ${attendee.lastName}`;
    const nameSize = dpi === 300 ? 60 : 40;
    zpl += `^FO${margin},${nameY}^A0N,${nameSize},${nameSize}^FB${widthDots - margin * 2},1,0,C,0^FD${fullName}^FS`;

    if (attendee.title) {
      const titleSize = dpi === 300 ? 36 : 24;
      zpl += `^FO${margin},${titleY}^A0N,${titleSize},${titleSize}^FB${widthDots - margin * 2},1,0,C,0^FD${attendee.title}^FS`;
    }

    if (attendee.company) {
      const compSize = dpi === 300 ? 32 : 22;
      zpl += `^FO${margin},${companyY}^A0N,${compSize},${compSize}^FB${widthDots - margin * 2},1,0,C,0^FD${attendee.company}^FS`;
    }

    if (template.includeQR !== false) {
      const qrData = template.qrData || attendee.externalId || `${attendee.firstName}-${attendee.lastName}`;
      const mag = dpi === 300 ? 6 : 4;
      const qrPixelSize = mag * 25;
      const qrX = Math.round((widthDots - qrPixelSize) / 2);
      zpl += `^FO${qrX},${qrY}^BQN,2,${mag}^FDQA,${qrData}^FS`;
    }

    zpl += `^XZ`;

    return zpl;
  }, [settings.dpi]);

  return {
    settings,
    isLoading,
    error,
    isConfigured: !!settings.printerIp,
    isConnected: settings.connected,
    setIp: (ip: string) => saveSettings({ printerIp: ip }),
    setPort: (port: number) => saveSettings({ port }),
    setDpi: (dpi: number) => saveSettings({ dpi }),
    testConnection,
    printZpl,
    generateBadgeZpl,
    resetConnection,
  };
}
