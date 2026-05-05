/**
 * Print Orchestrator - Cross-platform badge printing service
 * 
 * Supports:
 * - iOS (Safari, AirPrint)
 * - Android (Chrome, Mopria/IPP)
 * - Windows (all browsers)
 * - Direct browser printing (window.print)
 * - PDF generation fallback
 * - WiFi/Bluetooth badge printers
 * - Offline print queue
 * - High-DPI canvas rendering (300/600 DPI)
 */

import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

interface PrintCapabilities {
  canPrint: boolean;
  supportsWindowPrint: boolean;
  supportsAirPrint: boolean;
  supportsMopria: boolean;
  supportsWebUSB: boolean;
  supportsWebBluetooth: boolean;
  supportsPageSize: boolean; // @page size CSS support
  recommendedStrategy: 'native' | 'pdf' | 'vendor';
  platform: 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'unknown';
  browser: 'safari' | 'chrome' | 'firefox' | 'edge' | 'unknown';
}

interface PrintJob {
  id: string;
  badgeHtml: string;
  attendeeId: string;
  attendeeName: string;
  status: 'pending' | 'printing' | 'completed' | 'failed';
  createdAt: Date;
  attempts: number;
  error?: string;
}

interface BadgeData {
  firstName: string;
  lastName: string;
  company?: string;
  title?: string;
  participantType: string;
  externalId?: string;
  customFields?: Record<string, string>;
  qrCode?: string;
}

class PrintOrchestrator {
  private capabilities: PrintCapabilities | null = null;

  /**
   * Detect device and browser printing capabilities
   */
  async detectCapabilities(): Promise<PrintCapabilities> {
    if (this.capabilities) {
      return this.capabilities;
    }

    const userAgent = navigator.userAgent.toLowerCase();
    const platform = this.detectPlatform(userAgent);
    const browser = this.detectBrowser(userAgent);

    // Check for print API support
    const supportsWindowPrint = typeof window.print === 'function';
    
    // iOS detection - Safari is the only browser that works well on iPad
    const supportsAirPrint = platform === 'ios' && browser === 'safari' && supportsWindowPrint;
    
    // Android detection (Mopria/IPP)
    const supportsMopria = platform === 'android' && supportsWindowPrint;
    
    // Check for WebUSB (Chrome/Edge on desktop)
    const supportsWebUSB = 'usb' in navigator;
    
    // Check for WebBluetooth (Chrome/Edge)
    const supportsWebBluetooth = 'bluetooth' in navigator;

    // @page size CSS support: Chrome/Edge best, Safari good, Firefox limited
    const supportsPageSize = browser === 'chrome' || browser === 'edge' || browser === 'safari';

    // Determine recommended strategy
    let recommendedStrategy: 'native' | 'pdf' | 'vendor' = 'native';
    
    if (platform === 'ios') {
      if (browser === 'safari') {
        // iOS Safari has good print support with AirPrint
        recommendedStrategy = 'native';
      } else {
        // Chrome/Firefox on iPad don't support window.print properly
        recommendedStrategy = 'pdf';
      }
    } else if (platform === 'android') {
      // Android Chrome works well with native print
      recommendedStrategy = 'native';
    } else if (browser === 'firefox') {
      // Firefox has limited @page size support - use PDF
      recommendedStrategy = 'pdf';
    } else if (supportsWebUSB || supportsWebBluetooth) {
      // Desktop with USB/Bluetooth support - can use vendor bridges
      recommendedStrategy = 'vendor';
    } else {
      // Default to native for desktop browsers
      recommendedStrategy = 'native';
    }

    this.capabilities = {
      canPrint: supportsWindowPrint,
      supportsWindowPrint,
      supportsAirPrint,
      supportsMopria,
      supportsWebUSB,
      supportsWebBluetooth,
      supportsPageSize,
      recommendedStrategy,
      platform,
      browser,
    };

    
    return this.capabilities;
  }

  /**
   * Detect platform from user agent
   */
  private detectPlatform(userAgent: string): 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'unknown' {
    if (/iphone|ipad|ipod/.test(userAgent)) {
      return 'ios';
    } else if (/android/.test(userAgent)) {
      return 'android';
    } else if (/windows/.test(userAgent)) {
      return 'windows';
    } else if (/macintosh|mac os/.test(userAgent)) {
      return 'macos';
    } else if (/linux/.test(userAgent)) {
      return 'linux';
    }
    return 'unknown';
  }

  /**
   * Detect browser from user agent
   */
  private detectBrowser(userAgent: string): 'safari' | 'chrome' | 'firefox' | 'edge' | 'unknown' {
    // Edge must be checked before Chrome (Edge includes "Chrome" in UA)
    if (/edg\//.test(userAgent)) {
      return 'edge';
    } else if (/chrome/.test(userAgent) && !/edg\//.test(userAgent)) {
      return 'chrome';
    } else if (/firefox/.test(userAgent)) {
      return 'firefox';
    } else if (/safari/.test(userAgent) && !/chrome/.test(userAgent)) {
      return 'safari';
    }
    return 'unknown';
  }

  /**
   * Rotate a canvas by the given degrees (90, 180, 270).
   * Returns a new canvas with the rotated content.
   */
  private rotateCanvas(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
    const rotated = document.createElement('canvas');
    const ctx = rotated.getContext('2d')!;
    const swap = degrees === 90 || degrees === 270;

    rotated.width = swap ? source.height : source.width;
    rotated.height = swap ? source.width : source.height;

    ctx.translate(rotated.width / 2, rotated.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);

    return rotated;
  }

  /**
   * Generate QR code data URL for badge
   */
  private async generateQRCode(badgeData: BadgeData, templateConfig: any, overrideConfig?: any): Promise<string | undefined> {
    if (!templateConfig.includeQR && !overrideConfig) {
      return undefined;
    }

    try {
      const qrCodeConfig = overrideConfig || templateConfig.qrCodeConfig || {
        embedType: 'externalId',
        fields: ['externalId'],
        separator: '|',
        includeLabel: false,
      };

      const getFieldValue = (fieldName: string): string => {
        switch (fieldName) {
          case 'externalId': return badgeData.externalId || badgeData.customFields?.externalId || '';
          case 'externalProfileId': return badgeData.customFields?.externalProfileId || '';
          case 'firstName': return badgeData.firstName;
          case 'lastName': return badgeData.lastName;
          case 'email': return badgeData.customFields?.email || '';
          case 'company': return badgeData.company || '';
          case 'title': return badgeData.title || '';
          case 'participantType': return badgeData.participantType;
          default:
            if (badgeData.customFields?.[fieldName]) return badgeData.customFields[fieldName];
            if (fieldName.startsWith('customField_')) {
              const key = fieldName.replace('customField_', '');
              return badgeData.customFields?.[key] || '';
            }
            return '';
        }
      };

      let qrData: string;

      switch (qrCodeConfig.embedType) {
        case 'externalId':
          qrData = badgeData.externalId || badgeData.customFields?.externalId || `${badgeData.firstName}-${badgeData.lastName}-${Date.now()}`;
          break;
        case 'externalProfileId':
          qrData = badgeData.customFields?.externalProfileId || badgeData.externalId || `${badgeData.firstName}-${badgeData.lastName}-${Date.now()}`;
          break;
        case 'simple':
          if (qrCodeConfig.includeLabel) {
            qrData = qrCodeConfig.fields
              .map((f: string) => `${f}:${getFieldValue(f)}`)
              .filter((v: string) => v.split(':')[1])
              .join(qrCodeConfig.separator);
          } else {
            qrData = qrCodeConfig.fields
              .map((f: string) => getFieldValue(f))
              .filter(Boolean)
              .join(qrCodeConfig.separator);
          }
          break;
        case 'json':
          const jsonObj: Record<string, string> = {};
          qrCodeConfig.fields.forEach((f: string) => {
            const value = getFieldValue(f);
            if (value) jsonObj[f] = value;
          });
          qrData = JSON.stringify(jsonObj);
          break;
        case 'custom':
          qrData = qrCodeConfig.fields
            .map((f: string) => {
              const value = getFieldValue(f);
              return qrCodeConfig.includeLabel ? `${f}=${value}` : value;
            })
            .filter((v: string) => qrCodeConfig.includeLabel ? !v.endsWith('=') : Boolean(v))
            .join(qrCodeConfig.separator);
          break;
        default:
          qrData = badgeData.customFields?.externalId || `${badgeData.firstName}-${badgeData.lastName}`;
      }

      return await QRCode.toDataURL(qrData, {
        width: 300,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: { dark: '#000000', light: '#FFFFFF' },
      });
    } catch (error) {
      console.error('[PrintOrchestrator] QR code generation failed:', error);
      return undefined;
    }
  }

  /**
   * Print badge using best available method
   */
  async printBadge(
    badgeData: BadgeData,
    templateConfig: {
      width: number; // inches
      height: number; // inches
      backgroundColor: string;
      textColor: string;
      accentColor: string;
      includeQR: boolean;
      qrPosition: string;
      mergeFields: any[];
    },
    labelRotation: 0 | 90 | 180 | 270 = 0
  ): Promise<void> {
    const capabilities = await this.detectCapabilities();

    if (labelRotation) {
    }

    if (templateConfig.includeQR && !badgeData.qrCode) {
      badgeData.qrCode = await this.generateQRCode(badgeData, templateConfig);
    }

    await this.printPDFInBrowser(badgeData, templateConfig, labelRotation);
  }

  /**
   * Print a PDF blob via the browser's print dialog.
   * 
   * Desktop browsers: Opens the PDF in a hidden iframe and calls print() —
   * this eliminates browser-injected headers/footers completely.
   * 
   * iOS Safari: Opens the PDF in a new tab using Safari's native PDF viewer.
   * Hidden iframes don't render PDFs properly on iOS, resulting in blank prints.
   * The user taps the Share button → Print from Safari's PDF viewer.
   */
  private async printPDFInBrowser(badgeData: BadgeData, templateConfig: any, labelRotation: 0 | 90 | 180 | 270 = 0): Promise<void> {
    const pdfBlob = await this.generatePDFBlob(badgeData, templateConfig, labelRotation);
    const pdfUrl = URL.createObjectURL(pdfBlob);

    const caps = await this.detectCapabilities();

    if (caps.platform === 'ios') {
      const newWindow = window.open(pdfUrl, '_blank');
      if (!newWindow) {
        const link = document.createElement('a');
        link.href = pdfUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
      return;
    }

    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.style.visibility = 'hidden';
      iframe.src = pdfUrl;

      document.body.appendChild(iframe);

      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();

            setTimeout(() => {
              document.body.removeChild(iframe);
              URL.revokeObjectURL(pdfUrl);
              resolve();
            }, 1000);
          } catch (error) {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(pdfUrl);
            reject(error);
          }
        }, 500);
      };
    });
  }

  /**
   * Generate PDF and trigger download
   * Uses high-DPI canvas rendering for quality output
   */
  private async printPDF(badgeData: BadgeData, templateConfig: any, labelRotation: 0 | 90 | 180 | 270 = 0): Promise<void> {
    
    const pdfBlob = await this.generatePDFBlob(badgeData, templateConfig, labelRotation);
    const pdfUrl = URL.createObjectURL(pdfBlob);

    try {
      const filename = `badge_${badgeData.firstName}_${badgeData.lastName}.pdf`.replace(/\s+/g, '_');
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } finally {
      URL.revokeObjectURL(pdfUrl);
    }
  }

  /**
   * Generate PDF as blob (for preview or custom handling)
   * @param labelRotation - Rotation in degrees (0, 90, 180, 270) for label printers
   *   that feed sideways (e.g., Brother QL series). When set to 90, the badge
   *   content is rotated so it prints correctly on sideways-feeding printers.
   */
  async generatePDFBlob(badgeData: BadgeData, templateConfig: any, labelRotation: 0 | 90 | 180 | 270 = 0): Promise<Blob> {
    const { width, height } = templateConfig;
    const isFoldable = templateConfig.layoutMode === 'foldable';
    const isDualSideCard = templateConfig.layoutMode === 'dual_side_card';
    const totalHeight = isFoldable ? height * 2 : height;

    if (templateConfig.includeQR && !badgeData.qrCode) {
      badgeData.qrCode = await this.generateQRCode(badgeData, templateConfig);
    }

    const dpi = 300;

    if (isDualSideCard) {
      // Dual-sided card: 2-page PDF, one page per side
      // Card printer drivers (Zebra ZC300, etc.) treat page 1 as front, page 2 as back
      const frontCanvas = await this.renderBadgePanelToCanvas(badgeData, templateConfig, dpi);
      const frontImg = frontCanvas.toDataURL('image/png', 1.0);

      const pdf = new jsPDF({
        orientation: width > height ? 'landscape' : 'portrait',
        unit: 'in',
        format: [width, height],
      });

      // Page 1: Front
      pdf.addImage(frontImg, 'PNG', 0, 0, width, height);

      // Page 2: Back
      const backSideMode = templateConfig.backSideMode || 'blank';
      if (backSideMode !== 'blank') {
        pdf.addPage([width, height], width > height ? 'landscape' : 'portrait');

        if (backSideMode === 'duplicate-rotate') {
          // Same as front, rotated 180°
          const backCanvas = document.createElement('canvas');
          backCanvas.width = frontCanvas.width;
          backCanvas.height = frontCanvas.height;
          const ctx = backCanvas.getContext('2d')!;
          ctx.translate(backCanvas.width, backCanvas.height);
          ctx.rotate(Math.PI);
          ctx.drawImage(frontCanvas, 0, 0);
          const backImg = backCanvas.toDataURL('image/png', 1.0);
          pdf.addImage(backImg, 'PNG', 0, 0, width, height);
        } else if (backSideMode === 'custom') {
          // Custom back side design
          const backConfig = {
            ...templateConfig,
            backgroundColor: templateConfig.backSideBackgroundColor || templateConfig.backgroundColor,
            mergeFields: templateConfig.backSideMergeFields || [],
            imageElements: templateConfig.backSideImageElements || [],
            includeQR: templateConfig.backSideIncludeQR || false,
            qrPosition: templateConfig.backSideQrPosition || 'bottom-right',
            customQrPosition: templateConfig.backSideCustomQrPosition,
            qrCodeConfig: templateConfig.backSideQrCodeConfig || templateConfig.qrCodeConfig,
          };
          let backBadgeData = { ...badgeData };
          if (backConfig.includeQR) {
            const backQrConfig = templateConfig.backSideQrCodeConfig || templateConfig.qrCodeConfig;
            backBadgeData.qrCode = await this.generateQRCode(backBadgeData, { ...templateConfig, includeQR: true }, backQrConfig) || '';
          }
          const backCanvas = await this.renderBadgePanelToCanvas(backBadgeData, backConfig, dpi);
          const backImg = backCanvas.toDataURL('image/png', 1.0);
          pdf.addImage(backImg, 'PNG', 0, 0, width, height);
        }
      }

      return pdf.output('blob');
    }

    // Foldable or single-sided
    let compositeCanvas: HTMLCanvasElement;

    if (isFoldable) {
      compositeCanvas = await this.renderFoldableToCanvas(badgeData, templateConfig, dpi);
    } else {
      compositeCanvas = await this.renderBadgePanelToCanvas(badgeData, templateConfig, dpi);
    }

    const finalCanvas = labelRotation ? this.rotateCanvas(compositeCanvas, labelRotation) : compositeCanvas;
    const imgData = finalCanvas.toDataURL('image/png', 1.0);

    const swapDimensions = labelRotation === 90 || labelRotation === 270;
    const pageW = swapDimensions ? totalHeight : width;
    const pageH = swapDimensions ? width : totalHeight;

    const pdf = new jsPDF({
      orientation: pageW > pageH ? 'landscape' : 'portrait',
      unit: 'in',
      format: [pageW, pageH],
    });

    pdf.addImage(imgData, 'PNG', 0, 0, pageW, pageH);

    return pdf.output('blob');
  }

  /**
   * Get browser compatibility info for UI display
   */
  async getBrowserCompatibilityInfo(): Promise<{
    platform: string;
    browser: string;
    printSupport: 'full' | 'limited' | 'none';
    pageSizeSupport: 'full' | 'limited' | 'none';
    recommendedAction: string;
    tips: string[];
  }> {
    const caps = await this.detectCapabilities();
    
    let printSupport: 'full' | 'limited' | 'none' = 'full';
    let pageSizeSupport: 'full' | 'limited' | 'none' = 'full';
    let recommendedAction = 'Use the Print button for best results';
    const tips: string[] = [];

    // Determine print support level
    if (caps.platform === 'ios') {
      if (caps.browser === 'safari') {
        printSupport = 'full';
        pageSizeSupport = 'limited';
        recommendedAction = 'Tap Print, then use the Share button (↑) → Print in the PDF viewer';
        tips.push('Badge opens as a PDF — tap Share (↑) then Print to use AirPrint');
        tips.push('Select matching paper size in print dialog');
      } else {
        printSupport = 'none';
        pageSizeSupport = 'none';
        recommendedAction = 'Download PDF and print from Files app';
        tips.push('Chrome and Firefox on iOS cannot print directly');
        tips.push('Use Safari for best results, or download PDF');
      }
    } else if (caps.browser === 'firefox') {
      printSupport = 'full';
      pageSizeSupport = 'limited';
      tips.push('Firefox has limited custom page size support');
      tips.push('Consider downloading PDF for exact sizing');
    } else if (caps.browser === 'chrome' || caps.browser === 'edge') {
      printSupport = 'full';
      pageSizeSupport = 'full';
      tips.push('Chrome/Edge has excellent print support');
      tips.push('Custom badge sizes work automatically');
    } else if (caps.browser === 'safari' && caps.platform === 'macos') {
      printSupport = 'full';
      pageSizeSupport = 'full';
      tips.push('Safari on Mac supports AirPrint and custom sizes');
    }

    if (printSupport !== 'none') {
      tips.push('Badges print as PDF — no browser headers or footers will appear');
    }

    return {
      platform: caps.platform,
      browser: caps.browser,
      printSupport,
      pageSizeSupport,
      recommendedAction,
      tips,
    };
  }

  /**
   * Generate badge HTML from template and data
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  private generateBadgeHTML(badgeData: BadgeData, templateConfig: any): string {
    const { width, height, backgroundColor, textColor, accentColor, includeQR, qrPosition, mergeFields, imageElements = [] } = templateConfig;

    // Convert inches to pixels for rendering (assuming 96 DPI for screen, will scale for print)
    const widthPx = width * 96;
    const heightPx = height * 96;

    // Build image elements HTML (sorted by zIndex)
    const imageElementsHTML = imageElements
      .sort((a: any, b: any) => a.zIndex - b.zIndex)
      .map((img: any) => {
        return `
          <div style="
            position: absolute;
            left: ${img.position.x}px;
            top: ${img.position.y}px;
            width: ${img.size.width}px;
            height: ${img.size.height}px;
          ">
            <img src="${img.url}" alt="${img.type}" style="
              width: 100%;
              height: 100%;
              object-fit: contain;
            " />
          </div>
        `;
      }).join('');

    // Build merge field HTML
    const mergeFieldsHTML = mergeFields.map((field: any) => {
      let value = '';
      
      switch (field.field) {
        case 'fullName':
          value = this.escapeHtml(`${badgeData.firstName} ${badgeData.lastName}`.trim());
          break;
        case 'firstName':
          value = this.escapeHtml(badgeData.firstName);
          break;
        case 'lastName':
          value = this.escapeHtml(badgeData.lastName);
          break;
        case 'company':
          value = this.escapeHtml(badgeData.company || '');
          break;
        case 'title':
          value = this.escapeHtml(badgeData.title || '');
          break;
        case 'participantType':
          value = this.escapeHtml(badgeData.participantType);
          break;
        default:
          // Direct key lookup (cq_ prefixed synced question fields)
          if (badgeData.customFields?.[field.field]) {
            value = this.escapeHtml(badgeData.customFields[field.field]);
          } else if (field.field.startsWith('customField_')) {
            const customFieldKey = field.field.replace('customField_', '');
            value = this.escapeHtml(badgeData.customFields?.[customFieldKey] || '');
          }
      }

      if (!value) return '';

      // Calculate positioning based on alignment
      // For center: position element to span from left edge to right edge at the Y position
      // For left: position at the X coordinate
      // For right: position from the right edge
      let positionStyle = '';
      const align = field.align || 'left';
      const isFreePosition = field.horizontalAlign === 'custom';
      
      if (isFreePosition) {
        positionStyle = `
          left: ${field.position.x}px;
          top: ${field.position.y}px;
        `;
      } else if (align === 'center') {
        positionStyle = `
          left: 0;
          right: 0;
          top: ${field.position.y}px;
          width: 100%;
        `;
      } else if (align === 'right') {
        positionStyle = `
          right: ${widthPx - field.position.x}px;
          top: ${field.position.y}px;
        `;
      } else {
        positionStyle = `
          left: ${field.position.x}px;
          top: ${field.position.y}px;
        `;
      }

      const padding = field.horizontalPadding || 10;
      let maxFieldWidth: number;
      if (isFreePosition) {
        maxFieldWidth = widthPx - field.position.x - padding;
      } else {
        maxFieldWidth = widthPx - (padding * 2);
      }

      return `
        <div data-autosize-field="true" data-max-font="${field.fontSize}" style="
          position: absolute;
          ${positionStyle}
          font-size: ${field.fontSize}pt;
          text-align: ${isFreePosition ? 'left' : align};
          color: ${textColor};
          font-weight: ${field.fontWeight || 'normal'};
          font-style: ${field.fontStyle || 'normal'};
          white-space: nowrap;
          max-width: ${maxFieldWidth}px;
        ">
          ${value}
        </div>
      `;
    }).join('');

    // Add QR code if enabled
    let qrCodeHTML = '';
    if (includeQR && badgeData.qrCode) {
      const qrSize = Math.min(widthPx, heightPx) * 0.3; // 30% of smallest dimension for reliable scanning
      let qrLeft = 0, qrTop = 0;
      
      switch (qrPosition) {
        case 'top-left':
          qrLeft = 10;
          qrTop = 10;
          break;
        case 'top-center':
          qrLeft = (widthPx - qrSize) / 2;
          qrTop = 10;
          break;
        case 'top-right':
          qrLeft = widthPx - qrSize - 10;
          qrTop = 10;
          break;
        case 'bottom-left':
          qrLeft = 10;
          qrTop = heightPx - qrSize - 10;
          break;
        case 'bottom-center':
          qrLeft = (widthPx - qrSize) / 2;
          qrTop = heightPx - qrSize - 10;
          break;
        case 'bottom-right':
          qrLeft = widthPx - qrSize - 10;
          qrTop = heightPx - qrSize - 10;
          break;
        case 'custom':
          if (templateConfig.customQrPosition) {
            qrLeft = templateConfig.customQrPosition.x;
            qrTop = templateConfig.customQrPosition.y;
          }
          break;
      }

      qrCodeHTML = `
        <div style="
          position: absolute;
          left: ${qrLeft}px;
          top: ${qrTop}px;
          width: ${qrSize}px;
          height: ${qrSize}px;
          background: white;
          padding: 5px;
          border-radius: 4px;
        ">
          <img 
            src="${badgeData.qrCode}" 
            style="width: 100%; height: 100%; display: block;" 
            alt="QR Code"
          />
        </div>
      `;
    }

    let agendaHTML = '';
    const agenda = templateConfig.backSideAgenda;
    if (agenda?.enabled && agenda.items?.length > 0) {
      const agendaX = agenda.position?.x || 15;
      const agendaY = agenda.position?.y || 15;
      const agendaColor = agenda.textColor || templateConfig.textColor || '#000000';
      const fontFamily = templateConfig.fontFamily || 'Arial';
      const titleSize = agenda.titleFontSize || 10;
      const itemSize = agenda.itemFontSize || 7;

      let agendaRows = '';
      agenda.items.forEach((item: { time: string; label: string }) => {
        agendaRows += `
          <tr>
            <td style="font-size:${itemSize}pt; font-weight:bold; color:${agendaColor}; font-family:'${fontFamily}',sans-serif; padding:1px 6px 1px 0; white-space:nowrap; vertical-align:top; border:none;">${item.time}</td>
            <td style="font-size:${itemSize}pt; font-weight:normal; color:${agendaColor}; font-family:'${fontFamily}',sans-serif; padding:1px 0; white-space:nowrap; vertical-align:top; border:none;">${item.label}</td>
          </tr>`;
      });

      agendaHTML = `
        <div style="position:absolute; left:${agendaX}px; top:${agendaY}px;">
          ${agenda.title ? `<div style="font-size:${titleSize}pt; font-weight:bold; color:${agendaColor}; font-family:'${fontFamily}',sans-serif; margin-bottom:4px;">${agenda.title}</div>` : ''}
          <table style="border-collapse:collapse; border:none;">
            <tbody>${agendaRows}</tbody>
          </table>
        </div>`;
    }

    return `
      <div class="badge-container" style="
        width: ${widthPx}px;
        height: ${heightPx}px;
        position: relative;
        background: ${backgroundColor};
        overflow: hidden;
      ">
        ${imageElementsHTML}
        ${mergeFieldsHTML}
        ${qrCodeHTML}
        ${agendaHTML}
      </div>
    `;
  }

  private calculateFitFontSize(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxFontSize: number,
    availableWidth: number,
    fontFamily: string,
    fontWeight: string,
    fontStyle: string,
    minFontSize: number = 8
  ): number {
    let fontSize = maxFontSize;
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${fontFamily}", sans-serif`;
    const textWidth = ctx.measureText(text).width;
    if (textWidth <= availableWidth) return fontSize;
    const scaleFactor = availableWidth / textWidth;
    return Math.max(minFontSize, Math.floor(maxFontSize * scaleFactor));
  }

  private getFieldValue(badgeData: BadgeData, fieldName: string): string {
    switch (fieldName) {
      case 'firstName': return badgeData.firstName;
      case 'lastName': return badgeData.lastName;
      case 'fullName': return `${badgeData.firstName} ${badgeData.lastName}`.trim();
      case 'email': return badgeData.email || badgeData.customFields?.email || '';
      case 'company': return badgeData.company || '';
      case 'title': return badgeData.title || '';
      case 'participantType': return badgeData.participantType;
      case 'externalId': return badgeData.externalId || '';
      case 'externalProfileId': return badgeData.customFields?.externalProfileId || '';
      case 'orderCode': return badgeData.orderCode || badgeData.customFields?.orderCode || '';
      default:
        // Direct key lookup (for cq_ prefixed synced question fields)
        if (badgeData.customFields?.[fieldName]) return badgeData.customFields[fieldName];
        // Legacy: strip customField_ prefix for backward compatibility
        if (fieldName.startsWith('customField_')) {
          const key = fieldName.replace('customField_', '');
          return badgeData.customFields?.[key] || '';
        }
        return '';
    }
  }

  private renderFieldsToCanvas(
    ctx: CanvasRenderingContext2D,
    badgeData: BadgeData,
    mergeFields: any[],
    templateConfig: any,
    widthPx: number,
    dpi: number,
    dpiScale: number
  ): void {
    ctx.fillStyle = templateConfig.textColor;
    ctx.textBaseline = 'top';

    mergeFields.forEach((field: any) => {
      const value = this.getFieldValue(badgeData, field.field);
      if (!value) return;

      const configuredFontSize = field.fontSize * (dpi / 72);
      const fontStyle = field.fontStyle || 'normal';
      const fontWeight = field.fontWeight || '400';
      const horizontalPadding = (field.horizontalPadding || 10) * dpiScale;
      const availableWidth = widthPx - (horizontalPadding * 2);
      const minFontSize = Math.max(8 * (dpi / 72), configuredFontSize * 0.4);
      const actualFontSize = this.calculateFitFontSize(
        ctx, value, configuredFontSize, availableWidth,
        templateConfig.fontFamily || 'Arial', fontWeight, fontStyle, minFontSize
      );

      ctx.font = `${fontStyle} ${fontWeight} ${actualFontSize}px "${templateConfig.fontFamily || 'Arial'}", sans-serif`;
      ctx.textAlign = field.horizontalAlign === 'custom' ? 'left' : (field.align || 'left');

      let xPos = field.position.x * dpiScale;
      if (field.horizontalAlign === 'custom') {
        xPos = field.position.x * dpiScale;
      } else if (field.align === 'center') {
        xPos = widthPx / 2;
      } else if (field.align === 'right') {
        xPos = widthPx - horizontalPadding;
      } else {
        xPos = horizontalPadding;
      }

      ctx.fillText(value, xPos, field.position.y * dpiScale);
    });
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src.substring(0, 50)}`));
      img.src = src;
    });
  }

  private drawQRCode(
    ctx: CanvasRenderingContext2D,
    qrCodeSrc: string,
    qrPosition: string,
    customQrPosition: { x: number; y: number } | undefined,
    widthPx: number,
    panelHeightPx: number,
    dpiScale: number
  ): Promise<void> {
    return new Promise((resolve) => {
      const qrSize = Math.min(widthPx, panelHeightPx) * 0.3;
      let qrLeft = 0, qrTop = 0;

      switch (qrPosition) {
        case 'top-left': qrLeft = 10 * dpiScale; qrTop = 10 * dpiScale; break;
        case 'top-center': qrLeft = (widthPx - qrSize) / 2; qrTop = 10 * dpiScale; break;
        case 'top-right': qrLeft = widthPx - qrSize - 10 * dpiScale; qrTop = 10 * dpiScale; break;
        case 'bottom-left': qrLeft = 10 * dpiScale; qrTop = panelHeightPx - qrSize - 10 * dpiScale; break;
        case 'bottom-center': qrLeft = (widthPx - qrSize) / 2; qrTop = panelHeightPx - qrSize - 10 * dpiScale; break;
        case 'bottom-right': qrLeft = widthPx - qrSize - 10 * dpiScale; qrTop = panelHeightPx - qrSize - 10 * dpiScale; break;
        case 'custom':
          if (customQrPosition) {
            qrLeft = customQrPosition.x * dpiScale;
            qrTop = customQrPosition.y * dpiScale;
          }
          break;
      }

      const qrImg = new Image();
      qrImg.onload = () => {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(qrLeft - 5, qrTop - 5, qrSize + 10, qrSize + 10);
        ctx.drawImage(qrImg, qrLeft, qrTop, qrSize, qrSize);
        resolve();
      };
      qrImg.onerror = () => resolve();
      qrImg.src = qrCodeSrc;
    });
  }

  private async renderBadgePanelToCanvas(
    badgeData: BadgeData,
    templateConfig: any,
    dpi: number = 300
  ): Promise<HTMLCanvasElement> {
    const widthPx = templateConfig.width * dpi;
    const panelHeightPx = templateConfig.height * dpi;
    const dpiScale = dpi / 96;

    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = panelHeightPx;

    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.fillStyle = templateConfig.backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, widthPx, panelHeightPx);

    const imageElements = templateConfig.imageElements || [];
    if (imageElements.length > 0) {
      const sorted = [...imageElements].sort((a: any, b: any) => (a.zIndex || 0) - (b.zIndex || 0));
      for (const imgEl of sorted) {
        try {
          const img = await this.loadImage(imgEl.url);
          ctx.drawImage(
            img,
            imgEl.position.x * dpiScale,
            imgEl.position.y * dpiScale,
            imgEl.size.width * dpiScale,
            imgEl.size.height * dpiScale
          );
        } catch (e) {
          console.warn('[PrintOrchestrator] Failed to load image element:', (e as Error).message);
        }
      }
    }

    const mergeFields = templateConfig.mergeFields || [];
    this.renderFieldsToCanvas(ctx, badgeData, mergeFields, templateConfig, widthPx, dpi, dpiScale);

    if (templateConfig.includeQR && badgeData.qrCode) {
      await this.drawQRCode(
        ctx, badgeData.qrCode,
        templateConfig.qrPosition || 'bottom-right',
        templateConfig.customQrPosition,
        widthPx, panelHeightPx, dpiScale
      );
    }

    return canvas;
  }

  private async renderFoldableToCanvas(
    badgeData: BadgeData,
    templateConfig: any,
    dpi: number = 300
  ): Promise<HTMLCanvasElement> {
    const widthPx = templateConfig.width * dpi;
    const panelHeightPx = templateConfig.height * dpi;
    const dpiScale = dpi / 96;

    const frontCanvas = await this.renderBadgePanelToCanvas(badgeData, templateConfig, dpi);

    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = widthPx;
    compositeCanvas.height = panelHeightPx * 2;
    const ctx = compositeCanvas.getContext('2d')!;

    ctx.drawImage(frontCanvas, 0, 0);

    const backSideMode = templateConfig.backSideMode || 'blank';

    if (backSideMode === 'duplicate-rotate') {
      ctx.save();
      ctx.translate(widthPx, panelHeightPx * 2);
      ctx.rotate(Math.PI);
      ctx.drawImage(frontCanvas, 0, 0);
      ctx.restore();
    } else if (backSideMode === 'custom') {
      const backConfig = {
        ...templateConfig,
        backgroundColor: templateConfig.backSideBackgroundColor || templateConfig.backgroundColor,
        mergeFields: templateConfig.backSideMergeFields || [],
        imageElements: templateConfig.backSideImageElements || [],
        includeQR: templateConfig.backSideIncludeQR || false,
        qrPosition: templateConfig.backSideQrPosition || 'bottom-right',
        customQrPosition: templateConfig.backSideCustomQrPosition,
        qrCodeConfig: templateConfig.backSideQrCodeConfig || templateConfig.qrCodeConfig,
      };
      let backBadgeData = { ...badgeData };
      if (backConfig.includeQR) {
        const backQrConfig = templateConfig.backSideQrCodeConfig || templateConfig.qrCodeConfig;
        backBadgeData.qrCode = await this.generateQRCode(backBadgeData, { ...templateConfig, includeQR: true }, backQrConfig) || '';
      }
      const backCanvas = await this.renderBadgePanelToCanvas(backBadgeData, backConfig, dpi);

      const backSideAgenda = templateConfig.backSideAgenda;
      if (backSideAgenda?.enabled && backSideAgenda.items?.length > 0) {
        const backCtx = backCanvas.getContext('2d')!;
        const agendaX = (backSideAgenda.position?.x || 15) * dpiScale;
        let agendaY = (backSideAgenda.position?.y || 15) * dpiScale;
        const agendaColor = backSideAgenda.textColor || templateConfig.textColor;
        const fontFamily = templateConfig.fontFamily || 'Arial';
        const timeColWidth = 75 * dpiScale;

        if (backSideAgenda.title) {
          const titleSize = (backSideAgenda.titleFontSize || 10) * (dpi / 72);
          backCtx.font = `bold ${titleSize}px "${fontFamily}", sans-serif`;
          backCtx.fillStyle = agendaColor;
          backCtx.textAlign = 'left';
          backCtx.textBaseline = 'top';
          backCtx.fillText(backSideAgenda.title, agendaX, agendaY);
          agendaY += titleSize * 1.6;
        }

        const itemSize = (backSideAgenda.itemFontSize || 7) * (dpi / 72);
        const lineHeight = itemSize * 1.5;
        backSideAgenda.items.forEach((item: { time: string; label: string }) => {
          backCtx.fillStyle = agendaColor;
          backCtx.font = `bold ${itemSize}px "${fontFamily}", sans-serif`;
          backCtx.textAlign = 'left';
          backCtx.textBaseline = 'top';
          backCtx.fillText(item.time, agendaX, agendaY);
          backCtx.font = `normal ${itemSize}px "${fontFamily}", sans-serif`;
          backCtx.fillText(item.label, agendaX + timeColWidth, agendaY);
          agendaY += lineHeight;
        });
      }

      ctx.save();
      ctx.translate(widthPx, panelHeightPx * 2);
      ctx.rotate(Math.PI);
      ctx.drawImage(backCanvas, 0, 0);
      ctx.restore();
    } else {
      ctx.fillStyle = templateConfig.backSideBackgroundColor || templateConfig.backgroundColor;
      ctx.fillRect(0, panelHeightPx, widthPx, panelHeightPx);
    }

    return compositeCanvas;
  }

  private autoSizeFields(container: HTMLElement): void {
    const fields = container.querySelectorAll('[data-autosize-field]');
    fields.forEach((el) => {
      const field = el as HTMLElement;
      const maxFontSize = parseFloat(field.dataset.maxFont || '18');
      const maxWidth = parseFloat(field.style.maxWidth);
      if (!maxWidth || maxWidth <= 0) return;

      let currentSize = maxFontSize;
      const minSize = 6;
      const step = 0.5;

      while (currentSize > minSize) {
        field.style.fontSize = `${currentSize}pt`;
        if (field.scrollWidth <= maxWidth) break;
        currentSize -= step;
      }
    });
  }

  /**
   * Queue print job for offline printing
   */
  async queuePrintJob(badgeData: BadgeData, templateConfig: any): Promise<string> {
    const { offlineDB } = await import('@/lib/offline-db');
    
    const jobId = `print_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job = {
      id: jobId,
      badgeHtml: this.generateBadgeHTML(badgeData, templateConfig),
      badgeData,
      attendeeId: badgeData.customFields?.id || '',
      attendeeName: `${badgeData.firstName} ${badgeData.lastName}`,
      eventId: badgeData.customFields?.eventId || '',
      templateConfig,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };

    await offlineDB.addToPrintQueue(job);

    return jobId;
  }

  /**
   * Process pending print jobs from the queue
   */
  async processPrintQueue(): Promise<{ processed: number; failed: number }> {
    const { offlineDB } = await import('@/lib/offline-db');
    
    const pendingJobs = await offlineDB.getPendingPrintJobs();
    let processed = 0;
    let failed = 0;


    for (const job of pendingJobs) {
      try {
        await offlineDB.updatePrintJob(job.id, { status: 'printing' });
        
        if (job.badgeData) {
          await this.printPDFInBrowser(job.badgeData, job.templateConfig);
        } else {
          const fallbackData: BadgeData = {
            firstName: job.attendeeName?.split(' ')[0] || '',
            lastName: job.attendeeName?.split(' ').slice(1).join(' ') || '',
            participantType: 'Attendee',
          };
          await this.printPDFInBrowser(fallbackData, job.templateConfig);
        }
        
        await offlineDB.updatePrintJob(job.id, { status: 'completed' });
        processed++;
      } catch (error) {
        console.error('[PrintOrchestrator] Failed to print job:', job.id, error);
        
        const attempts = job.attempts + 1;
        await offlineDB.updatePrintJob(job.id, {
          status: attempts >= 3 ? 'failed' : 'pending',
          attempts,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        
        if (attempts >= 3) failed++;
      }
    }

    return { processed, failed };
  }

  /**
   * Get count of pending print jobs
   */
  async getPendingJobCount(): Promise<number> {
    const { offlineDB } = await import('@/lib/offline-db');
    const pending = await offlineDB.getPendingPrintJobs();
    return pending.length;
  }

  /**
   * Batch print multiple badges
   */
  async batchPrint(badges: Array<{ data: BadgeData; template: any }>): Promise<void> {

    for (const { data, template } of badges) {
      await this.printBadge(data, template);
      // Small delay between prints to avoid overwhelming the print queue
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  /**
   * Force download badge as PDF (bypass native print)
   * Use this when native printing isn't available or reliable
   */
  async downloadPDF(badgeData: BadgeData, templateConfig: any, labelRotation: 0 | 90 | 180 | 270 = 0): Promise<void> {
    await this.printPDF(badgeData, templateConfig, labelRotation);
  }

  /**
   * Generate batch PDF with all badges in one document
   * Useful for printing multiple badges at once
   */
  async generateBatchPDF(
    badges: Array<{ data: BadgeData; template: any }>,
    filename: string = 'badges.pdf'
  ): Promise<void> {

    if (badges.length === 0) {
      throw new Error('No badges to generate');
    }

    const firstBadge = badges[0];
    const firstIsFoldable = firstBadge.template.layoutMode === 'foldable';
    const firstW = firstBadge.template.width;
    const firstH = firstIsFoldable ? firstBadge.template.height * 2 : firstBadge.template.height;

    const pdf = new jsPDF({
      orientation: firstW > firstH ? 'landscape' : 'portrait',
      unit: 'in',
      format: [firstW, firstH],
    });

    const dpi = 300;

    for (let i = 0; i < badges.length; i++) {
      const { data, template } = badges[i];
      const isFoldablePage = template.layoutMode === 'foldable';
      const pageW = template.width;
      const pageH = isFoldablePage ? template.height * 2 : template.height;

      if (i > 0) {
        pdf.addPage([pageW, pageH], pageW > pageH ? 'landscape' : 'portrait');
      }

      if (template.includeQR && !data.qrCode) {
        data.qrCode = await this.generateQRCode(data, template);
      }

      let badgeCanvas: HTMLCanvasElement;
      if (isFoldablePage) {
        badgeCanvas = await this.renderFoldableToCanvas(data, template, dpi);
      } else {
        badgeCanvas = await this.renderBadgePanelToCanvas(data, template, dpi);
      }

      const imgData = badgeCanvas.toDataURL('image/png', 1.0);
      pdf.addImage(imgData, 'PNG', 0, 0, pageW, pageH);
    }

    pdf.save(filename);
  }

  /**
   * Print badge using canvas-based high-DPI rendering
   * This ensures pixel-perfect output regardless of browser
   */
  async printHighDPI(
    badgeData: BadgeData,
    templateConfig: any,
    dpi: number = 300,
    labelRotation: 0 | 90 | 180 | 270 = 0
  ): Promise<void> {
    await this.printPDFInBrowser(badgeData, templateConfig, labelRotation);
  }

  /**
   * Get current capabilities (cached)
   */
  getCapabilities(): PrintCapabilities | null {
    return this.capabilities;
  }

  /**
   * Reset cached capabilities (useful for testing)
   */
  resetCapabilities(): void {
    this.capabilities = null;
  }
}

// Singleton instance
export const printOrchestrator = new PrintOrchestrator();

// Export types for external use
export type { PrintCapabilities, BadgeData, PrintJob };
