/**
 * Zebra Print Service - Silent printing via Zebra Browser Print
 * 
 * Requires Zebra Browser Print to be installed on the client machine:
 * https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html
 * 
 * Supports:
 * - Windows (USB & Network)
 * - macOS (USB & Network)
 * - Silent printing (no dialog)
 * - Printer status checks
 * - ZPL command generation
 */

export interface ZebraPrinter {
  name: string;
  uid: string;
  connection: string;
  deviceType: string;
  version: number;
  provider: string;
  manufacturer: string;
}

export interface ZebraPrinterStatus {
  isReadyToPrint: boolean;
  isPaused: boolean;
  isReceiveBufferFull: boolean;
  isRibbonOut: boolean;
  isPaperOut: boolean;
  isHeadTooHot: boolean;
  isHeadOpen: boolean;
  isHeadCold: boolean;
  isPartialFormatInProgress: boolean;
  errors: string[];
}

export interface BadgeData {
  firstName: string;
  lastName: string;
  company?: string;
  title?: string;
  participantType: string;
  externalId?: string;
  customFields?: Record<string, string>;
}

export interface BadgeTemplate {
  width: number; // inches
  height: number; // inches
  dpi: number; // 203 or 300
  includeQR: boolean;
  qrData?: string;
}

class ZebraPrintService {
  private isAvailable: boolean | null = null;
  private availablePrinters: ZebraPrinter[] = [];
  private selectedPrinter: ZebraPrinter | null = null;
  private browserPrint: any = null;

  /**
   * Check if Zebra Browser Print is installed and running
   */
  async checkAvailability(): Promise<boolean> {
    if (this.isAvailable !== null) {
      return this.isAvailable;
    }

    try {
      const ZebraBrowserPrintWrapper = (await import('zebra-browser-print-wrapper')).default;
      this.browserPrint = new ZebraBrowserPrintWrapper();
      
      const printers = await this.browserPrint.getAvailablePrinters();
      this.availablePrinters = printers || [];
      this.isAvailable = true;
      
      return true;
    } catch (error) {
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Get list of available Zebra printers
   */
  async getAvailablePrinters(): Promise<ZebraPrinter[]> {
    if (!this.isAvailable) {
      await this.checkAvailability();
    }

    if (!this.browserPrint) {
      return [];
    }

    try {
      const printers = await this.browserPrint.getAvailablePrinters();
      this.availablePrinters = printers || [];
      return this.availablePrinters;
    } catch (error) {
      console.error('[ZebraPrintService] Failed to get printers:', error);
      return [];
    }
  }

  /**
   * Get the default printer
   */
  async getDefaultPrinter(): Promise<ZebraPrinter | null> {
    if (!this.browserPrint) {
      await this.checkAvailability();
    }

    if (!this.browserPrint) {
      return null;
    }

    try {
      const printer = await this.browserPrint.getDefaultPrinter();
      return printer || null;
    } catch (error) {
      console.error('[ZebraPrintService] Failed to get default printer:', error);
      return null;
    }
  }

  /**
   * Set the printer to use for printing
   */
  setPrinter(printer: ZebraPrinter): void {
    this.selectedPrinter = printer;
    if (this.browserPrint) {
      this.browserPrint.setPrinter(printer);
    }
  }

  /**
   * Check printer status
   */
  async checkPrinterStatus(): Promise<ZebraPrinterStatus> {
    if (!this.browserPrint || !this.selectedPrinter) {
      return {
        isReadyToPrint: false,
        isPaused: false,
        isReceiveBufferFull: false,
        isRibbonOut: false,
        isPaperOut: false,
        isHeadTooHot: false,
        isHeadOpen: false,
        isHeadCold: false,
        isPartialFormatInProgress: false,
        errors: ['No printer selected'],
      };
    }

    try {
      const status = await this.browserPrint.checkPrinterStatus();
      return status;
    } catch (error) {
      console.error('[ZebraPrintService] Status check failed:', error);
      return {
        isReadyToPrint: false,
        isPaused: false,
        isReceiveBufferFull: false,
        isRibbonOut: false,
        isPaperOut: false,
        isHeadTooHot: false,
        isHeadOpen: false,
        isHeadCold: false,
        isPartialFormatInProgress: false,
        errors: [error instanceof Error ? error.message : 'Status check failed'],
      };
    }
  }

  /**
   * Generate ZPL commands for a badge
   */
  generateBadgeZPL(badgeData: BadgeData, template: BadgeTemplate): string {
    const dpi = template.dpi || 203;
    const dotsPerInch = dpi;
    
    const labelWidth = Math.round(template.width * dotsPerInch);
    const labelHeight = Math.round(template.height * dotsPerInch);
    
    const centerX = Math.round(labelWidth / 2);
    const margin = Math.round(0.25 * dotsPerInch);
    
    let zpl = '';
    
    zpl += '^XA\n';
    
    zpl += `^PW${labelWidth}\n`;
    zpl += `^LL${labelHeight}\n`;
    
    zpl += '^CI28\n';
    
    let yPos = margin;
    
    const fullName = `${badgeData.firstName} ${badgeData.lastName}`;
    const nameFontSize = Math.min(80, Math.round(labelWidth / (fullName.length * 0.6)));
    const nameWidth = fullName.length * nameFontSize * 0.6;
    const nameX = Math.max(margin, Math.round(centerX - nameWidth / 2));
    
    zpl += `^FO${nameX},${yPos}^A0N,${nameFontSize},${nameFontSize}^FD${this.escapeZPL(fullName)}^FS\n`;
    yPos += nameFontSize + 20;
    
    if (badgeData.title) {
      const titleFontSize = Math.round(nameFontSize * 0.5);
      const titleWidth = badgeData.title.length * titleFontSize * 0.6;
      const titleX = Math.max(margin, Math.round(centerX - titleWidth / 2));
      zpl += `^FO${titleX},${yPos}^A0N,${titleFontSize},${titleFontSize}^FD${this.escapeZPL(badgeData.title)}^FS\n`;
      yPos += titleFontSize + 15;
    }
    
    if (badgeData.company) {
      const companyFontSize = Math.round(nameFontSize * 0.5);
      const companyWidth = badgeData.company.length * companyFontSize * 0.6;
      const companyX = Math.max(margin, Math.round(centerX - companyWidth / 2));
      zpl += `^FO${companyX},${yPos}^A0N,${companyFontSize},${companyFontSize}^FD${this.escapeZPL(badgeData.company)}^FS\n`;
      yPos += companyFontSize + 15;
    }
    
    if (badgeData.participantType) {
      const typeFontSize = Math.round(nameFontSize * 0.4);
      const typeWidth = badgeData.participantType.length * typeFontSize * 0.6;
      const typeX = Math.max(margin, Math.round(centerX - typeWidth / 2));
      yPos += 10;
      zpl += `^FO${typeX},${yPos}^A0N,${typeFontSize},${typeFontSize}^FD${this.escapeZPL(badgeData.participantType)}^FS\n`;
      yPos += typeFontSize + 15;
    }
    
    if (template.includeQR && template.qrData) {
      const qrSize = Math.min(Math.round(labelWidth * 0.3), Math.round((labelHeight - yPos - margin) * 0.8));
      const qrMagnification = Math.max(2, Math.min(10, Math.round(qrSize / 50)));
      const qrX = Math.round(centerX - (qrMagnification * 25));
      const qrY = labelHeight - margin - (qrMagnification * 50);
      
      zpl += `^FO${qrX},${qrY}^BQN,2,${qrMagnification}^FDQA,${this.escapeZPL(template.qrData)}^FS\n`;
    }
    
    zpl += '^XZ\n';
    
    return zpl;
  }

  /**
   * Escape special characters for ZPL
   */
  private escapeZPL(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\^/g, '\\^')
      .replace(/~/g, '\\~');
  }

  /**
   * Print a badge silently (no dialog)
   */
  async printBadge(badgeData: BadgeData, template: BadgeTemplate): Promise<{ success: boolean; error?: string }> {
    if (!this.browserPrint) {
      return { success: false, error: 'Zebra Browser Print not available' };
    }

    if (!this.selectedPrinter) {
      const defaultPrinter = await this.getDefaultPrinter();
      if (!defaultPrinter) {
        return { success: false, error: 'No printer selected' };
      }
      this.setPrinter(defaultPrinter);
    }

    try {
      const status = await this.checkPrinterStatus();
      if (!status.isReadyToPrint) {
        const errorMsg = status.errors.length > 0 
          ? status.errors.join(', ') 
          : 'Printer not ready';
        return { success: false, error: errorMsg };
      }

      const zpl = this.generateBadgeZPL(badgeData, template);
      

      await this.browserPrint.print(zpl);
      
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Print failed';
      console.error('[ZebraPrintService] Print failed:', error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Send raw ZPL to printer
   */
  async sendRawZPL(zpl: string): Promise<{ success: boolean; error?: string }> {
    if (!this.browserPrint) {
      return { success: false, error: 'Zebra Browser Print not available' };
    }

    if (!this.selectedPrinter) {
      const defaultPrinter = await this.getDefaultPrinter();
      if (!defaultPrinter) {
        return { success: false, error: 'No printer selected' };
      }
      this.setPrinter(defaultPrinter);
    }

    try {
      await this.browserPrint.print(zpl);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Print failed';
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Print a test label
   */
  async printTestLabel(): Promise<{ success: boolean; error?: string }> {
    const testZPL = `^XA
^FO50,50^A0N,50,50^FDZebra Print Test^FS
^FO50,120^A0N,30,30^FD${new Date().toLocaleString()}^FS
^FO50,170^A0N,25,25^FDPrinter: ${this.selectedPrinter?.name || 'Unknown'}^FS
^XZ`;

    return this.sendRawZPL(testZPL);
  }

  /**
   * Get current selected printer
   */
  getSelectedPrinter(): ZebraPrinter | null {
    return this.selectedPrinter;
  }

  /**
   * Check if service is available
   */
  getIsAvailable(): boolean {
    return this.isAvailable === true;
  }

  /**
   * Reset service state
   */
  reset(): void {
    this.isAvailable = null;
    this.availablePrinters = [];
    this.selectedPrinter = null;
  }
}

export const zebraPrintService = new ZebraPrintService();
export default zebraPrintService;
