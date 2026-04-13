import { useState, useEffect, useCallback } from 'react';
import zebraPrintService, { 
  ZebraPrinter, 
  ZebraPrinterStatus, 
  BadgeData, 
  BadgeTemplate 
} from '../services/zebra-print-service';

export interface UseZebraPrintResult {
  isAvailable: boolean;
  isLoading: boolean;
  printers: ZebraPrinter[];
  selectedPrinter: ZebraPrinter | null;
  printerStatus: ZebraPrinterStatus | null;
  error: string | null;
  selectPrinter: (printer: ZebraPrinter) => void;
  refreshPrinters: () => Promise<void>;
  checkStatus: () => Promise<ZebraPrinterStatus | null>;
  printBadge: (badgeData: BadgeData, template: BadgeTemplate) => Promise<{ success: boolean; error?: string }>;
  printTestLabel: () => Promise<{ success: boolean; error?: string }>;
}

export function useZebraPrint(): UseZebraPrintResult {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [printers, setPrinters] = useState<ZebraPrinter[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<ZebraPrinter | null>(null);
  const [printerStatus, setPrinterStatus] = useState<ZebraPrinterStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const available = await zebraPrintService.checkAvailability();
        setIsAvailable(available);
        
        if (available) {
          const availablePrinters = await zebraPrintService.getAvailablePrinters();
          setPrinters(availablePrinters);
          
          if (availablePrinters.length > 0) {
            const defaultPrinter = await zebraPrintService.getDefaultPrinter();
            if (defaultPrinter) {
              zebraPrintService.setPrinter(defaultPrinter);
              setSelectedPrinter(defaultPrinter);
            } else {
              zebraPrintService.setPrinter(availablePrinters[0]);
              setSelectedPrinter(availablePrinters[0]);
            }
          }
        }
      } catch (err) {
        setIsAvailable(false);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  const selectPrinter = useCallback((printer: ZebraPrinter) => {
    zebraPrintService.setPrinter(printer);
    setSelectedPrinter(printer);
    setPrinterStatus(null);
  }, []);

  const refreshPrinters = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      zebraPrintService.reset();
      const available = await zebraPrintService.checkAvailability();
      setIsAvailable(available);
      
      if (available) {
        const availablePrinters = await zebraPrintService.getAvailablePrinters();
        setPrinters(availablePrinters);
        
        if (availablePrinters.length > 0 && !selectedPrinter) {
          const defaultPrinter = await zebraPrintService.getDefaultPrinter();
          if (defaultPrinter) {
            zebraPrintService.setPrinter(defaultPrinter);
            setSelectedPrinter(defaultPrinter);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh printers');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPrinter]);

  const checkStatus = useCallback(async (): Promise<ZebraPrinterStatus | null> => {
    if (!selectedPrinter) {
      setError('No printer selected');
      return null;
    }

    try {
      const status = await zebraPrintService.checkPrinterStatus();
      setPrinterStatus(status);
      
      if (!status.isReadyToPrint && status.errors.length > 0) {
        setError(status.errors.join(', '));
      } else {
        setError(null);
      }
      
      return status;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Status check failed';
      setError(errorMsg);
      return null;
    }
  }, [selectedPrinter]);

  const printBadge = useCallback(async (
    badgeData: BadgeData, 
    template: BadgeTemplate
  ): Promise<{ success: boolean; error?: string }> => {
    setError(null);
    
    const result = await zebraPrintService.printBadge(badgeData, template);
    
    if (!result.success && result.error) {
      setError(result.error);
    }
    
    return result;
  }, []);

  const printTestLabel = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setError(null);
    
    const result = await zebraPrintService.printTestLabel();
    
    if (!result.success && result.error) {
      setError(result.error);
    }
    
    return result;
  }, []);

  return {
    isAvailable,
    isLoading,
    printers,
    selectedPrinter,
    printerStatus,
    error,
    selectPrinter,
    refreshPrinters,
    checkStatus,
    printBadge,
    printTestLabel,
  };
}

export default useZebraPrint;
