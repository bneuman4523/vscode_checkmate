import { useRef, useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface MergeFieldConfig {
  field: string;
  label: string;
  fontSize: number;
  position: { x: number; y: number };
  align: 'left' | 'center' | 'right';
  fontWeight?: string;
  fontStyle?: 'normal' | 'italic';
  horizontalPadding?: number;
  horizontalAlign?: 'left' | 'center' | 'right' | 'custom';
}

// Helper function to calculate font size that fits text within available width
function calculateFitFontSize(
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
  
  // Set up font and measure
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${fontFamily}", sans-serif`;
  let textWidth = ctx.measureText(text).width;
  
  // If text fits, return original size
  if (textWidth <= availableWidth) {
    return fontSize;
  }
  
  // Calculate the scale factor needed
  const scaleFactor = availableWidth / textWidth;
  fontSize = Math.max(minFontSize, Math.floor(maxFontSize * scaleFactor));
  
  return fontSize;
}

interface QRCodeConfig {
  embedType: 'externalId' | 'simple' | 'json' | 'custom';
  fields: string[];
  separator: string;
  includeLabel: boolean;
}

interface ImageElementConfig {
  id?: string;
  url: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  type?: string;
  zIndex?: number;
}

interface BadgeRenderSurfaceProps {
  firstName: string;
  lastName: string;
  email?: string;
  company?: string;
  title?: string;
  participantType: string;
  externalId?: string;
  orderCode?: string;
  customFields?: Record<string, string>;
  templateConfig: {
    width: number; // inches
    height: number; // inches
    backgroundColor: string;
    textColor: string;
    accentColor: string;
    fontFamily: string; // Template-level font family for all text
    includeQR: boolean;
    qrPosition: string;
    customQrPosition?: { x: number; y: number };
    qrCodeConfig?: QRCodeConfig;
    mergeFields: MergeFieldConfig[];
    imageElements?: ImageElementConfig[];
    layoutMode?: 'single' | 'foldable';
    backSideMode?: 'duplicate-rotate' | 'custom' | 'blank';
    backSideMergeFields?: MergeFieldConfig[];
    backSideImageElements?: ImageElementConfig[];
    backSideIncludeQR?: boolean;
    backSideQrPosition?: string;
    backSideCustomQrPosition?: { x: number; y: number };
    backSideQrCodeConfig?: QRCodeConfig;
    backSideBackgroundColor?: string;
    backSideAgenda?: {
      enabled: boolean;
      title?: string;
      titleFontSize?: number;
      itemFontSize?: number;
      textColor?: string;
      items?: Array<{ time: string; label: string }>;
      position?: { x: number; y: number };
    };
  };
  scale?: number; // For preview (default 0.5)
  printMode?: boolean; // High DPI mode for printing
  dpi?: number; // Custom DPI (300, 600, etc.) - overrides printMode default
  onLoadFont?: (family: string) => Promise<boolean>; // Font loader function from context
  renderSide?: 'front' | 'back';
}

export default function BadgeRenderSurface({
  firstName,
  lastName,
  email,
  company,
  title,
  participantType,
  externalId,
  orderCode,
  customFields,
  templateConfig,
  scale = 0.5,
  printMode = false,
  dpi: customDpi,
  onLoadFont,
  renderSide,
}: BadgeRenderSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const qrCodeRef = useRef<string>('');
  const backSideQrCodeRef = useRef<string>('');
  const [fontsLoaded, setFontsLoaded] = useState(false);

  // Proactively load template font, then wait for document.fonts.ready
  useEffect(() => {
    async function loadRequiredFonts() {
      // Load the template-level font family (if not a web-safe font)
      if (onLoadFont && templateConfig.fontFamily && templateConfig.fontFamily !== 'Arial') {
        await onLoadFont(templateConfig.fontFamily);
      }
      
      await document.fonts.ready;
      setFontsLoaded(true);
    }
    
    loadRequiredFonts();
  }, [templateConfig.fontFamily, onLoadFont]);

  // Generate QR code based on configuration
  useEffect(() => {
    const generateQR = async () => {
      try {
        const config = templateConfig.qrCodeConfig || {
          embedType: 'externalId' as const,
          fields: ['externalId'],
          separator: '|',
          includeLabel: false,
        };

        // Helper to get field value by name
        const getFieldValue = (fieldName: string): string => {
          switch (fieldName) {
            case 'externalId': return externalId || '';
            case 'firstName': return firstName;
            case 'lastName': return lastName;
            case 'email': return email || '';
            case 'company': return company || '';
            case 'title': return title || '';
            case 'participantType': return participantType;
            default:
              // Check custom fields
              if (customFields && fieldName.startsWith('customField_')) {
                const key = fieldName.replace('customField_', '');
                return customFields[key] || '';
              }
              return customFields?.[fieldName] || '';
          }
        };

        // Generate QR data based on embed type
        let qrData: string;
        
        
        switch (config.embedType) {
          case 'externalId':
            // Simple external ID only - most common for check-in scanning
            qrData = externalId || `${firstName}-${lastName}-${Date.now()}`;
            break;
            
          case 'simple':
            // Multiple fields with separator (e.g., "EXT-001|John|Doe")
            if (config.includeLabel) {
              qrData = config.fields
                .map(f => `${f}:${getFieldValue(f)}`)
                .filter(v => v.split(':')[1]) // Filter out empty values
                .join(config.separator);
            } else {
              qrData = config.fields
                .map(f => getFieldValue(f))
                .filter(Boolean)
                .join(config.separator);
            }
            break;
            
          case 'json':
            // JSON format with selected fields
            const jsonObj: Record<string, string> = {};
            config.fields.forEach(f => {
              const value = getFieldValue(f);
              if (value) jsonObj[f] = value;
            });
            qrData = JSON.stringify(jsonObj);
            break;
            
          case 'custom':
            // Custom fields with optional labels
            qrData = config.fields
              .map(f => {
                const value = getFieldValue(f);
                return config.includeLabel ? `${f}=${value}` : value;
              })
              .filter(v => config.includeLabel ? !v.endsWith('=') : Boolean(v))
              .join(config.separator);
            break;
            
          default:
            qrData = externalId || `${firstName}-${lastName}`;
        }
        
        // Use higher resolution for print mode (600 DPI for ultra-sharp QR codes)
        const qrSize = printMode ? 900 : 300;
        
        const qrCodeUrl = await QRCode.toDataURL(qrData, {
          width: qrSize,
          margin: 2,
          errorCorrectionLevel: 'H', // High error correction for better scanning
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        });
        
        qrCodeRef.current = qrCodeUrl;
      } catch (error) {
        console.error('QR code generation failed:', error);
      }
    };

    generateQR();
  }, [firstName, lastName, email, company, title, participantType, externalId, customFields, templateConfig.qrCodeConfig, printMode]);

  useEffect(() => {
    if (!templateConfig.backSideIncludeQR) {
      backSideQrCodeRef.current = '';
      return;
    }
    const generateBackQR = async () => {
      try {
        const config = templateConfig.backSideQrCodeConfig || templateConfig.qrCodeConfig || {
          embedType: 'externalId' as const,
          fields: ['externalId'],
          separator: '|',
          includeLabel: false,
        };
        const getFieldValue = (fieldName: string): string => {
          switch (fieldName) {
            case 'firstName': return firstName || '';
            case 'lastName': return lastName || '';
            case 'email': return email || '';
            case 'company': return company || '';
            case 'title': return title || '';
            case 'participantType': return participantType || '';
            case 'externalId': return externalId || '';
            default: return customFields?.[fieldName] || '';
          }
        };
        let qrData: string;
        switch (config.embedType) {
          case 'externalId': qrData = externalId || `${firstName}-${lastName}`; break;
          case 'simple': qrData = config.fields.map(f => getFieldValue(f)).filter(Boolean).join(config.separator); break;
          case 'json': {
            const obj: Record<string, string> = {};
            config.fields.forEach(f => { const v = getFieldValue(f); if (v) obj[f] = v; });
            qrData = JSON.stringify(obj);
            break;
          }
          case 'custom': qrData = config.fields
            .map(f => { const v = getFieldValue(f); return config.includeLabel ? `${f}=${v}` : v; })
            .filter(v => config.includeLabel ? !v.endsWith('=') : Boolean(v))
            .join(config.separator);
            break;
          default: qrData = externalId || `${firstName}-${lastName}`;
        }
        const qrSize = printMode ? 900 : 300;
        const url = await QRCode.toDataURL(qrData, { width: qrSize, margin: 2, errorCorrectionLevel: 'H', color: { dark: '#000000', light: '#FFFFFF' } });
        backSideQrCodeRef.current = url;
      } catch (error) {
        console.error('Back-side QR code generation failed:', error);
      }
    };
    generateBackQR();
  }, [firstName, lastName, email, company, title, participantType, externalId, customFields, templateConfig.backSideQrCodeConfig, templateConfig.backSideIncludeQR, printMode]);

  // Render badge
  useEffect(() => {
    if (!fontsLoaded) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpi = customDpi || (printMode ? 300 : 96);
    const widthPx = templateConfig.width * dpi;
    const panelHeightPx = templateConfig.height * dpi;
    const isFoldable = templateConfig.layoutMode === 'foldable';
    const isBackOnly = renderSide === 'back' && isFoldable;
    const isFrontOnly = renderSide === 'front' && isFoldable;
    const showBothPanels = isFoldable && !isBackOnly && !isFrontOnly;
    const heightPx = showBothPanels ? panelHeightPx * 2 : panelHeightPx;

    canvas.width = widthPx;
    canvas.height = heightPx;

    canvas.style.width = `${widthPx * scale}px`;
    canvas.style.height = `${heightPx * scale}px`;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.clearRect(0, 0, widthPx, heightPx);

    if (isBackOnly) {
      ctx.fillStyle = templateConfig.backSideBackgroundColor || templateConfig.backgroundColor;
      ctx.fillRect(0, 0, widthPx, panelHeightPx);
    } else {
      ctx.fillStyle = templateConfig.backgroundColor;
      ctx.fillRect(0, 0, widthPx, showBothPanels ? panelHeightPx : heightPx);

      if (showBothPanels) {
        ctx.fillStyle = templateConfig.backSideBackgroundColor || templateConfig.backgroundColor;
        ctx.fillRect(0, panelHeightPx, widthPx, panelHeightPx);

        ctx.save();
        ctx.strokeStyle = '#cccccc';
        ctx.setLineDash([10, 5]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, panelHeightPx);
        ctx.lineTo(widthPx, panelHeightPx);
        ctx.stroke();
        ctx.restore();
      }
    }

    const imageElements = templateConfig.imageElements || [];
    const dpiScale = dpi / 96;

    const drawBackSide = () => {
      if (isFrontOnly) return;
      if (!isFoldable && !isBackOnly) return;

      const backSideMode = templateConfig.backSideMode || 'blank';
      const backPanelOffset = isBackOnly ? 0 : panelHeightPx;
      const effectiveHeightPx = isBackOnly ? panelHeightPx : heightPx;

      if (backSideMode === 'duplicate-rotate') {
        const applyRotatedTransform = () => {
          ctx.save();
          ctx.translate(widthPx, effectiveHeightPx);
          ctx.rotate(Math.PI);
        };

        applyRotatedTransform();
        ctx.fillStyle = templateConfig.backgroundColor;
        ctx.fillRect(0, 0, widthPx, panelHeightPx);
        ctx.restore();

        const frontImages = templateConfig.imageElements || [];

        const drawBackTextRotated = () => {
          applyRotatedTransform();
          ctx.fillStyle = templateConfig.textColor;
          ctx.textBaseline = 'top';
          templateConfig.mergeFields.forEach((field) => {
            let value = getFieldValue(field.field);
            if (!value) return;
            const configuredFontSize = field.fontSize * (dpi / 72);
            const fontStyle = field.fontStyle || 'normal';
            const fontWeight = field.fontWeight || '400';
            ctx.font = `${fontStyle} ${fontWeight} ${configuredFontSize}px "${templateConfig.fontFamily}", sans-serif`;
            ctx.textAlign = field.horizontalAlign === 'custom' ? 'left' : field.align;
            const horizontalPadding = (field.horizontalPadding || 10) * dpiScale;
            let xPos = field.position.x * dpiScale;
            if (field.horizontalAlign !== 'custom') {
              if (field.align === 'center') xPos = widthPx / 2;
              else if (field.align === 'right') xPos = widthPx - horizontalPadding;
              else xPos = horizontalPadding;
            }
            ctx.fillText(value, xPos, field.position.y * dpiScale);
          });
          ctx.restore();

          if (templateConfig.includeQR && qrCodeRef.current) {
            const qrSize = Math.min(widthPx, panelHeightPx) * 0.3;
            let qrLeft = 0, qrTop = 0;
            switch (templateConfig.qrPosition) {
              case 'top-left': qrLeft = 10 * dpiScale; qrTop = 10 * dpiScale; break;
              case 'top-center': qrLeft = (widthPx - qrSize) / 2; qrTop = 10 * dpiScale; break;
              case 'top-right': qrLeft = widthPx - qrSize - 10 * dpiScale; qrTop = 10 * dpiScale; break;
              case 'bottom-left': qrLeft = 10 * dpiScale; qrTop = panelHeightPx - qrSize - 10 * dpiScale; break;
              case 'bottom-center': qrLeft = (widthPx - qrSize) / 2; qrTop = panelHeightPx - qrSize - 10 * dpiScale; break;
              case 'bottom-right': qrLeft = widthPx - qrSize - 10 * dpiScale; qrTop = panelHeightPx - qrSize - 10 * dpiScale; break;
              case 'custom':
                if (templateConfig.customQrPosition) {
                  qrLeft = templateConfig.customQrPosition.x * dpiScale;
                  qrTop = templateConfig.customQrPosition.y * dpiScale;
                }
                break;
            }
            const qrImg = new Image();
            qrImg.onload = () => {
              applyRotatedTransform();
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(qrLeft - 5, qrTop - 5, qrSize + 10, qrSize + 10);
              ctx.drawImage(qrImg, qrLeft, qrTop, qrSize, qrSize);
              ctx.restore();
            };
            qrImg.src = qrCodeRef.current;
          }
        };

        const drawBackImagesAndText = () => {
          if (frontImages.length > 0) {
            const sorted = [...frontImages].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
            let loaded = 0;
            sorted.forEach((imgEl) => {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => {
                applyRotatedTransform();
                ctx.drawImage(img, imgEl.position.x * dpiScale, imgEl.position.y * dpiScale, imgEl.size.width * dpiScale, imgEl.size.height * dpiScale);
                ctx.restore();
                loaded++;
                if (loaded === sorted.length) drawBackTextRotated();
              };
              img.onerror = () => {
                loaded++;
                if (loaded === sorted.length) drawBackTextRotated();
              };
              img.src = imgEl.url;
            });
          } else {
            drawBackTextRotated();
          }
        };

        drawBackImagesAndText();
      } else if (backSideMode === 'custom') {
        const backFields = templateConfig.backSideMergeFields || [];
        const backImages = templateConfig.backSideImageElements || [];

        const applyBackRotation = () => {
          ctx.save();
          ctx.translate(widthPx, effectiveHeightPx);
          ctx.rotate(Math.PI);
        };

        const drawBackCustomText = () => {
          applyBackRotation();
          ctx.fillStyle = templateConfig.textColor;
          ctx.textBaseline = 'top';

          backFields.forEach((field) => {
            let value = getFieldValue(field.field);
            if (!value) return;
            const configuredFontSize = field.fontSize * (dpi / 72);
            const fontStyle = field.fontStyle || 'normal';
            const fontWeight = field.fontWeight || '400';
            ctx.font = `${fontStyle} ${fontWeight} ${configuredFontSize}px "${templateConfig.fontFamily}", sans-serif`;
            ctx.textAlign = field.horizontalAlign === 'custom' ? 'left' : field.align;
            const horizontalPadding = (field.horizontalPadding || 10) * dpiScale;
            let xPos = field.position.x * dpiScale;
            if (field.horizontalAlign !== 'custom') {
              if (field.align === 'center') xPos = widthPx / 2;
              else if (field.align === 'right') xPos = widthPx - horizontalPadding;
              else xPos = horizontalPadding;
            }
            ctx.fillText(value, xPos, field.position.y * dpiScale);
          });

          const agenda = templateConfig.backSideAgenda;
          if (agenda?.enabled && agenda.items?.length > 0) {
            const agendaX = (agenda.position?.x || 15) * dpiScale;
            let agendaY = (agenda.position?.y || 15) * dpiScale;
            const agendaColor = agenda.textColor || templateConfig.textColor;
            const timeColWidth = 75 * dpiScale;

            if (agenda.title) {
              const titleSize = (agenda.titleFontSize || 10) * (dpi / 72);
              ctx.font = `bold ${titleSize}px "${templateConfig.fontFamily}", sans-serif`;
              ctx.fillStyle = agendaColor;
              ctx.textAlign = 'left';
              ctx.fillText(agenda.title, agendaX, agendaY);
              agendaY += titleSize * 1.6;
            }

            const itemSize = (agenda.itemFontSize || 7) * (dpi / 72);
            const lineHeight = itemSize * 1.5;

            agenda.items.forEach((item) => {
              ctx.fillStyle = agendaColor;
              ctx.font = `bold ${itemSize}px "${templateConfig.fontFamily}", sans-serif`;
              ctx.textAlign = 'left';
              ctx.fillText(item.time, agendaX, agendaY);

              ctx.font = `normal ${itemSize}px "${templateConfig.fontFamily}", sans-serif`;
              ctx.fillText(item.label, agendaX + timeColWidth, agendaY);

              agendaY += lineHeight;
            });
          }

          ctx.restore();

          if (templateConfig.backSideIncludeQR && backSideQrCodeRef.current) {
            const qrSize = Math.min(widthPx, panelHeightPx) * 0.3;
            const backQrPos = templateConfig.backSideQrPosition || 'bottom-right';
            let qrLeft = 0, qrTop = 0;
            switch (backQrPos) {
              case 'top-left': qrLeft = 10 * dpiScale; qrTop = 10 * dpiScale; break;
              case 'top-center': qrLeft = (widthPx - qrSize) / 2; qrTop = 10 * dpiScale; break;
              case 'top-right': qrLeft = widthPx - qrSize - 10 * dpiScale; qrTop = 10 * dpiScale; break;
              case 'bottom-left': qrLeft = 10 * dpiScale; qrTop = panelHeightPx - qrSize - 10 * dpiScale; break;
              case 'bottom-center': qrLeft = (widthPx - qrSize) / 2; qrTop = panelHeightPx - qrSize - 10 * dpiScale; break;
              case 'bottom-right': qrLeft = widthPx - qrSize - 10 * dpiScale; qrTop = panelHeightPx - qrSize - 10 * dpiScale; break;
              case 'custom':
                if (templateConfig.backSideCustomQrPosition) {
                  qrLeft = templateConfig.backSideCustomQrPosition.x * dpiScale;
                  qrTop = templateConfig.backSideCustomQrPosition.y * dpiScale;
                }
                break;
            }
            const qrImg = new Image();
            qrImg.onload = () => {
              applyBackRotation();
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(qrLeft - 5, qrTop - 5, qrSize + 10, qrSize + 10);
              ctx.drawImage(qrImg, qrLeft, qrTop, qrSize, qrSize);
              ctx.restore();
            };
            qrImg.src = backSideQrCodeRef.current;
          }
        };

        if (backImages.length > 0) {
          const sorted = [...backImages].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
          let loaded = 0;
          sorted.forEach((imgEl) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              applyBackRotation();
              ctx.drawImage(img, imgEl.position.x * dpiScale, imgEl.position.y * dpiScale, imgEl.size.width * dpiScale, imgEl.size.height * dpiScale);
              ctx.restore();
              loaded++;
              if (loaded === sorted.length) drawBackCustomText();
            };
            img.onerror = () => {
              loaded++;
              if (loaded === sorted.length) drawBackCustomText();
            };
            img.src = imgEl.url;
          });
        } else {
          drawBackCustomText();
        }
      }
    };

    const getFieldValue = (fieldName: string): string => {
      switch (fieldName) {
        case 'firstName': return firstName;
        case 'lastName': return lastName;
        case 'fullName': return `${firstName} ${lastName}`.trim();
        case 'email': return email || '';
        case 'company': return company || '';
        case 'title': return title || '';
        case 'participantType': return participantType;
        case 'externalId': return externalId || '';
        case 'orderCode': return orderCode || '';
        default:
          if (fieldName.startsWith('customField_')) {
            const key = fieldName.replace('customField_', '');
            return customFields?.[key] || '';
          }
          return '';
      }
    };

    const drawTextAndQR = () => {
      ctx.fillStyle = templateConfig.textColor;
      ctx.textBaseline = 'top';

      templateConfig.mergeFields.forEach((field) => {
        let value = '';

        switch (field.field) {
          case 'firstName':
            value = firstName;
            break;
          case 'lastName':
            value = lastName;
            break;
          case 'fullName':
            value = `${firstName} ${lastName}`.trim();
            break;
          case 'email':
            value = email || '';
            break;
          case 'company':
            value = company || '';
            break;
          case 'title':
            value = title || '';
            break;
          case 'participantType':
            value = participantType;
            break;
          case 'externalId':
            value = externalId || '';
            break;
          case 'orderCode':
            value = orderCode || '';
            break;
          default:
            if (field.field.startsWith('customField_')) {
              const customFieldKey = field.field.replace('customField_', '');
              value = customFields?.[customFieldKey] || '';
            }
        }

        if (!value) return;

        const configuredFontSize = field.fontSize * (dpi / 72);
        const fontStyle = field.fontStyle || 'normal';
        const fontWeight = field.fontWeight || '400';
        const horizontalPadding = (field.horizontalPadding || 10) * dpiScale;
        const availableWidth = widthPx - (horizontalPadding * 2);
        const minFontSize = Math.max(8 * (dpi / 72), configuredFontSize * 0.4);
        const actualFontSize = calculateFitFontSize(
          ctx,
          value,
          configuredFontSize,
          availableWidth,
          templateConfig.fontFamily,
          fontWeight,
          fontStyle,
          minFontSize
        );

        ctx.font = `${fontStyle} ${fontWeight} ${actualFontSize}px "${templateConfig.fontFamily}", sans-serif`;
        ctx.textAlign = field.horizontalAlign === 'custom' ? 'left' : field.align;

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

      if (templateConfig.includeQR && qrCodeRef.current) {
        const frontPanelH = panelHeightPx;
        const qrSize = Math.min(widthPx, frontPanelH) * 0.3;
        let qrLeft = 0, qrTop = 0;

        switch (templateConfig.qrPosition) {
          case 'top-left':
            qrLeft = 10 * dpiScale;
            qrTop = 10 * dpiScale;
            break;
          case 'top-center':
            qrLeft = (widthPx - qrSize) / 2;
            qrTop = 10 * dpiScale;
            break;
          case 'top-right':
            qrLeft = widthPx - qrSize - 10 * dpiScale;
            qrTop = 10 * dpiScale;
            break;
          case 'bottom-left':
            qrLeft = 10 * dpiScale;
            qrTop = frontPanelH - qrSize - 10 * dpiScale;
            break;
          case 'bottom-center':
            qrLeft = (widthPx - qrSize) / 2;
            qrTop = frontPanelH - qrSize - 10 * dpiScale;
            break;
          case 'bottom-right':
            qrLeft = widthPx - qrSize - 10 * dpiScale;
            qrTop = frontPanelH - qrSize - 10 * dpiScale;
            break;
          case 'custom':
            if (templateConfig.customQrPosition) {
              qrLeft = templateConfig.customQrPosition.x * dpiScale;
              qrTop = templateConfig.customQrPosition.y * dpiScale;
            }
            break;
        }

        const qrImage = new Image();
        qrImage.onload = () => {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(qrLeft - 5, qrTop - 5, qrSize + 10, qrSize + 10);
          ctx.drawImage(qrImage, qrLeft, qrTop, qrSize, qrSize);
          drawBackSide();
        };
        qrImage.onerror = () => {
          drawBackSide();
        };
        qrImage.src = qrCodeRef.current;
      } else {
        drawBackSide();
      }
    };

    if (isBackOnly) {
      drawBackSide();
    } else if (imageElements.length > 0) {
      const sortedImages = [...imageElements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
      let loadedCount = 0;

      sortedImages.forEach((imgEl) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const dx = imgEl.position.x * dpiScale;
          const dy = imgEl.position.y * dpiScale;
          const dw = imgEl.size.width * dpiScale;
          const dh = imgEl.size.height * dpiScale;
          ctx.drawImage(img, dx, dy, dw, dh);

          loadedCount++;
          if (loadedCount === sortedImages.length) {
            drawTextAndQR();
          }
        };
        img.onerror = () => {
          console.warn('[BadgeRenderSurface] Failed to load image element:', imgEl.id || imgEl.url?.substring(0, 50));
          loadedCount++;
          if (loadedCount === sortedImages.length) {
            drawTextAndQR();
          }
        };
        img.src = imgEl.url;
      });
    } else {
      drawTextAndQR();
    }
  }, [
    firstName,
    lastName,
    email,
    company,
    title,
    participantType,
    externalId,
    orderCode,
    customFields,
    templateConfig,
    scale,
    printMode,
    customDpi,
    fontsLoaded,
    renderSide,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="border border-border rounded"
    />
  );
}
