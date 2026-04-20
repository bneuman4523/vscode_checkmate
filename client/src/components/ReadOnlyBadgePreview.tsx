import { useRef, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { BadgeTemplate } from '@shared/schema';

interface MergeField {
  field: string;
  label: string;
  fontSize: number;
  position: { x: number; y: number };
  align: 'left' | 'center' | 'right';
  fontWeight?: string;
  fontStyle?: 'normal' | 'italic';
  horizontalPadding?: number;
  horizontalAlign?: 'left' | 'center' | 'right' | 'custom';
  color?: string;
}

interface ImageElement {
  id: string;
  type: 'logo' | 'banner' | 'image';
  url: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
}

interface ReadOnlyBadgePreviewProps {
  template: BadgeTemplate;
  maxWidth?: number;
  showDimensions?: boolean;
  className?: string;
  renderSide?: 'front' | 'back';
}

const SAMPLE_DATA: Record<string, string> = {
  firstName: "John",
  lastName: "Doe",
  fullName: "John Doe",
  company: "Acme Corp",
  title: "Software Engineer",
  email: "john@example.com",
  participantType: "Attendee",
  registrationId: "REG-12345",
  eventName: "Sample Event",
  eventDate: "Jan 29, 2026",
  eventLocation: "San Francisco, CA",
};

export default function ReadOnlyBadgePreview({ 
  template, 
  maxWidth = 200,
  showDimensions = false,
  className = "",
  renderSide,
}: ReadOnlyBadgePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(maxWidth);
  
  const pixelsPerInch = 96;
  const badgeWidthPx = template.width * pixelsPerInch;
  const badgeHeightPx = template.height * pixelsPerInch;
  
  const availableWidth = Math.max(containerWidth, 100);
  const previewScale = Math.min(1, availableWidth / badgeWidthPx);
  
  const mergeFields: MergeField[] = Array.isArray(template.mergeFields) 
    ? template.mergeFields as MergeField[] 
    : [];
  const imageElements: ImageElement[] = Array.isArray(template.imageElements) 
    ? template.imageElements as ImageElement[] 
    : [];

  const qrSize = Math.min(badgeWidthPx, badgeHeightPx) * 0.3;
  const qrMargin = 10;
  const qrPositions: Record<string, { x: number; y: number }> = {
    'top-left': { x: qrMargin, y: qrMargin },
    'top-center': { x: (badgeWidthPx - qrSize) / 2, y: qrMargin },
    'top-right': { x: badgeWidthPx - qrSize - qrMargin, y: qrMargin },
    'bottom-left': { x: qrMargin, y: badgeHeightPx - qrSize - qrMargin },
    'bottom-center': { x: (badgeWidthPx - qrSize) / 2, y: badgeHeightPx - qrSize - qrMargin },
    'bottom-right': { x: badgeWidthPx - qrSize - qrMargin, y: badgeHeightPx - qrSize - qrMargin },
  };
  const qrCodePos = template.qrPosition === 'custom' && template.customQrPosition
    ? { x: template.customQrPosition.x, y: template.customQrPosition.y, size: qrSize }
    : { ...(qrPositions[template.qrPosition || 'bottom-right'] || qrPositions['bottom-right']), size: qrSize };

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(Math.min(containerRef.current.offsetWidth, maxWidth));
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [maxWidth]);

  const getSampleValue = (field: string): string => {
    if (field === 'participantType') {
      return template.participantType || SAMPLE_DATA.participantType;
    }
    return SAMPLE_DATA[field] || field;
  };

  const isFoldable = template.layoutMode === 'foldable';
  const showFront = renderSide !== 'back';
  const showBack = renderSide === 'back' || (!renderSide && isFoldable);

  return (
    <div ref={containerRef} className={`w-full ${className}`}>
      {showFront && <div
        className="relative rounded-lg shadow-sm border overflow-hidden mx-auto"
        style={{
          width: `${badgeWidthPx * previewScale}px`,
          height: `${badgeHeightPx * previewScale}px`,
          backgroundColor: template.backgroundColor,
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
        >
          {imageElements
            .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
            .map((img) => (
              <div
                key={img.id}
                className="absolute pointer-events-none"
                style={{
                  left: `${img.position.x * previewScale}px`,
                  top: `${img.position.y * previewScale}px`,
                  width: `${img.size.width * previewScale}px`,
                  height: `${img.size.height * previewScale}px`,
                }}
              >
                <img
                  src={img.url}
                  alt={img.type}
                  className="w-full h-full object-contain"
                  draggable={false}
                />
              </div>
            ))}

          {mergeFields.map((field, index) => {
            const edgePadding = field.horizontalPadding || 10;
            const isCustomPosition = field.horizontalAlign === 'custom';
            
            return (
              <div
                key={index}
                className="absolute pointer-events-none"
                style={isCustomPosition ? {
                  left: `${field.position.x * previewScale}px`,
                  top: `${field.position.y * previewScale}px`,
                  fontSize: `${field.fontSize * previewScale}pt`,
                  fontFamily: template.fontFamily || 'Inter, sans-serif',
                  fontWeight: field.fontWeight || '400',
                  fontStyle: field.fontStyle || 'normal',
                  color: field.color || template.textColor,
                  textAlign: field.align,
                  whiteSpace: 'nowrap',
                  overflow: 'visible',
                  userSelect: 'none',
                } : {
                  left: field.align === 'center' 
                    ? `${edgePadding * previewScale}px`
                    : field.align === 'left'
                    ? `${edgePadding * previewScale}px`
                    : 'auto',
                  right: field.align === 'right' 
                    ? `${edgePadding * previewScale}px` 
                    : field.align === 'center'
                    ? `${edgePadding * previewScale}px`
                    : 'auto',
                  top: `${field.position.y * previewScale}px`,
                  width: 'auto',
                  maxWidth: `calc(100% - ${edgePadding * 2 * previewScale}px)`,
                  fontSize: `${field.fontSize * previewScale}pt`,
                  fontFamily: template.fontFamily || 'Inter, sans-serif',
                  fontWeight: field.fontWeight || '400',
                  fontStyle: field.fontStyle || 'normal',
                  color: field.color || template.textColor,
                  textAlign: field.align,
                  whiteSpace: 'nowrap',
                  overflow: 'visible',
                  userSelect: 'none',
                }}
              >
                {getSampleValue(field.field)}
              </div>
            );
          })}

          {template.includeQR && (
            <div
              className="absolute bg-white border-2 flex items-center justify-center pointer-events-none"
              style={{
                left: `${qrCodePos.x * previewScale}px`,
                top: `${qrCodePos.y * previewScale}px`,
                width: `${qrCodePos.size * previewScale}px`,
                height: `${qrCodePos.size * previewScale}px`,
                borderColor: template.textColor,
              }}
            >
              <svg 
                viewBox="0 0 24 24" 
                style={{ 
                  width: `${32 * previewScale}px`, 
                  height: `${32 * previewScale}px` 
                }}
              >
                <rect x="3" y="3" width="7" height="7" fill="#000" />
                <rect x="14" y="3" width="7" height="7" fill="#000" />
                <rect x="3" y="14" width="7" height="7" fill="#000" />
                <rect x="14" y="14" width="3" height="3" fill="#000" />
                <rect x="18" y="14" width="3" height="3" fill="#000" />
                <rect x="14" y="18" width="3" height="3" fill="#000" />
                <rect x="18" y="18" width="3" height="3" fill="#000" />
                <rect x="5" y="5" width="3" height="3" fill="#fff" />
                <rect x="16" y="5" width="3" height="3" fill="#fff" />
                <rect x="5" y="16" width="3" height="3" fill="#fff" />
              </svg>
            </div>
          )}
        </div>
      </div>}
      {showBack && (
        <>
          {showFront && (
            <div className="flex items-center gap-1 my-1">
              <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
              <span className="text-[8px] text-muted-foreground px-1">fold</span>
              <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
            </div>
          )}
          <div
            className="relative rounded-lg shadow-sm border overflow-hidden mx-auto"
            style={{
              width: `${badgeWidthPx * previewScale}px`,
              height: `${badgeHeightPx * previewScale}px`,
              backgroundColor: template.backSideBackgroundColor || template.backgroundColor,
            }}
          >
            {template.backSideMode === 'duplicate-rotate' ? (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  position: 'relative',
                  transform: 'rotate(180deg)',
                }}
              >
                {imageElements
                  .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
                  .map((img) => (
                    <div
                      key={`back-${img.id}`}
                      className="absolute pointer-events-none"
                      style={{
                        left: `${img.position.x * previewScale}px`,
                        top: `${img.position.y * previewScale}px`,
                        width: `${img.size.width * previewScale}px`,
                        height: `${img.size.height * previewScale}px`,
                      }}
                    >
                      <img src={img.url} alt={img.type} className="w-full h-full object-contain" draggable={false} />
                    </div>
                  ))}
                {mergeFields.map((field, index) => {
                  const edgePadding = field.horizontalPadding || 10;
                  const isCustomPosition = field.horizontalAlign === 'custom';
                  return (
                    <div
                      key={`back-${index}`}
                      className="absolute pointer-events-none"
                      style={isCustomPosition ? {
                        left: `${field.position.x * previewScale}px`,
                        top: `${field.position.y * previewScale}px`,
                        fontSize: `${field.fontSize * previewScale}pt`,
                        fontFamily: template.fontFamily || 'Inter, sans-serif',
                        fontWeight: field.fontWeight || '400',
                        fontStyle: field.fontStyle || 'normal',
                        color: field.color || template.textColor,
                        whiteSpace: 'nowrap',
                        userSelect: 'none',
                      } : {
                        left: field.align === 'right' ? 'auto' : `${edgePadding * previewScale}px`,
                        right: field.align === 'right' ? `${edgePadding * previewScale}px` : field.align === 'center' ? `${edgePadding * previewScale}px` : 'auto',
                        top: `${field.position.y * previewScale}px`,
                        fontSize: `${field.fontSize * previewScale}pt`,
                        fontFamily: template.fontFamily || 'Inter, sans-serif',
                        fontWeight: field.fontWeight || '400',
                        fontStyle: field.fontStyle || 'normal',
                        color: field.color || template.textColor,
                        textAlign: field.align,
                        whiteSpace: 'nowrap',
                        userSelect: 'none',
                      }}
                    >
                      {getSampleValue(field.field)}
                    </div>
                  );
                })}
                {template.includeQR && (() => {
                  const qrSize = Math.min(badgeWidthPx, badgeHeightPx) * 0.3;
                  const pos = template.qrPosition || 'bottom-right';
                  const style: React.CSSProperties = {
                    position: 'absolute',
                    width: `${qrSize * previewScale}px`,
                    height: `${qrSize * previewScale}px`,
                    backgroundColor: '#f0f0f0',
                    border: '1px solid #ccc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  };
                  if (pos === 'top-left') { style.top = '4px'; style.left = '4px'; }
                  else if (pos === 'top-center') { style.top = '4px'; style.left = '50%'; style.transform = 'translateX(-50%)'; }
                  else if (pos === 'top-right') { style.top = '4px'; style.right = '4px'; }
                  else if (pos === 'bottom-left') { style.bottom = '4px'; style.left = '4px'; }
                  else if (pos === 'bottom-center') { style.bottom = '4px'; style.left = '50%'; style.transform = 'translateX(-50%)'; }
                  else if (pos === 'custom' && template.customQrPosition) {
                    const cp = template.customQrPosition as { x: number; y: number };
                    style.left = `${cp.x * previewScale}px`;
                    style.top = `${cp.y * previewScale}px`;
                  }
                  else { style.bottom = '4px'; style.right = '4px'; }
                  return <div style={style}><span className="text-[6px] text-muted-foreground">QR</span></div>;
                })()}
              </div>
            ) : template.backSideMode === 'custom' ? (
              <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                {((template.backSideImageElements as ImageElement[]) || [])
                  .sort((a: ImageElement, b: ImageElement) => (a.zIndex || 0) - (b.zIndex || 0))
                  .map((img: ImageElement) => (
                    <div
                      key={img.id}
                      className="absolute pointer-events-none"
                      style={{
                        left: `${img.position.x * previewScale}px`,
                        top: `${img.position.y * previewScale}px`,
                        width: `${img.size.width * previewScale}px`,
                        height: `${img.size.height * previewScale}px`,
                      }}
                    >
                      <img src={img.url} alt={img.type} className="w-full h-full object-contain" draggable={false} />
                    </div>
                  ))}
                {((template.backSideMergeFields as MergeField[]) || []).map((field: MergeField, index: number) => {
                  const isCustomPosition = field.horizontalAlign === 'custom';
                  const edgePadding = field.horizontalPadding || 10;
                  return (
                    <div
                      key={index}
                      className="absolute pointer-events-none"
                      style={isCustomPosition ? {
                        left: `${field.position.x * previewScale}px`,
                        top: `${field.position.y * previewScale}px`,
                        fontSize: `${field.fontSize * previewScale}pt`,
                        fontFamily: template.fontFamily || 'Inter, sans-serif',
                        fontWeight: field.fontWeight || '400',
                        fontStyle: field.fontStyle || 'normal',
                        color: field.color || template.textColor,
                        whiteSpace: 'nowrap',
                        userSelect: 'none',
                      } : {
                        left: field.align === 'right' ? 'auto' : `${edgePadding * previewScale}px`,
                        right: field.align === 'right' ? `${edgePadding * previewScale}px` : field.align === 'center' ? `${edgePadding * previewScale}px` : 'auto',
                        top: `${field.position.y * previewScale}px`,
                        fontSize: `${field.fontSize * previewScale}pt`,
                        fontFamily: template.fontFamily || 'Inter, sans-serif',
                        fontWeight: field.fontWeight || '400',
                        fontStyle: field.fontStyle || 'normal',
                        color: field.color || template.textColor,
                        textAlign: field.align,
                        whiteSpace: 'nowrap',
                        userSelect: 'none',
                      }}
                    >
                      {getSampleValue(field.field)}
                    </div>
                  );
                })}
                {template.backSideIncludeQR && (() => {
                  const qrSize = Math.min(badgeWidthPx, badgeHeightPx) * 0.3;
                  const pos = template.backSideQrPosition || 'bottom-right';
                  const style: React.CSSProperties = {
                    position: 'absolute',
                    width: `${qrSize * previewScale}px`,
                    height: `${qrSize * previewScale}px`,
                    backgroundColor: '#f0f0f0',
                    border: '1px solid #ccc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  };
                  if (pos === 'top-left') { style.top = '4px'; style.left = '4px'; }
                  else if (pos === 'top-center') { style.top = '4px'; style.left = '50%'; style.transform = 'translateX(-50%)'; }
                  else if (pos === 'top-right') { style.top = '4px'; style.right = '4px'; }
                  else if (pos === 'bottom-left') { style.bottom = '4px'; style.left = '4px'; }
                  else if (pos === 'bottom-center') { style.bottom = '4px'; style.left = '50%'; style.transform = 'translateX(-50%)'; }
                  else if (pos === 'custom' && template.backSideCustomQrPosition) {
                    const cp = template.backSideCustomQrPosition as { x: number; y: number };
                    style.left = `${cp.x * previewScale}px`;
                    style.top = `${cp.y * previewScale}px`;
                  }
                  else { style.bottom = '4px'; style.right = '4px'; }
                  return <div style={style}><span className="text-[6px] text-muted-foreground">QR</span></div>;
                })()}
                {(() => {
                  const agenda = template.backSideAgenda as {
                    enabled: boolean;
                    title: string;
                    titleFontSize: number;
                    itemFontSize: number;
                    textColor?: string;
                    items: Array<{ time: string; label: string }>;
                    position: { x: number; y: number };
                  } | null | undefined;
                  if (!agenda?.enabled || !agenda.items?.length) return null;
                  const agendaColor = agenda.textColor || template.textColor;
                  return (
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: `${(agenda.position?.x || 15) * previewScale}px`,
                        top: `${(agenda.position?.y || 15) * previewScale}px`,
                      }}
                    >
                      {agenda.title && (
                        <div style={{
                          fontSize: `${(agenda.titleFontSize || 10) * previewScale}pt`,
                          fontFamily: template.fontFamily || 'Inter, sans-serif',
                          fontWeight: 'bold',
                          color: agendaColor,
                          marginBottom: `${2 * previewScale}px`,
                          whiteSpace: 'nowrap',
                        }}>
                          {agenda.title}
                        </div>
                      )}
                      <table style={{ borderCollapse: 'collapse', border: 'none' }}>
                        <tbody>
                          {agenda.items.map((item, i) => (
                            <tr key={i}>
                              <td style={{
                                fontSize: `${(agenda.itemFontSize || 7) * previewScale}pt`,
                                fontFamily: template.fontFamily || 'Inter, sans-serif',
                                fontWeight: 'bold',
                                color: agendaColor,
                                padding: `${1 * previewScale}px ${4 * previewScale}px ${1 * previewScale}px 0`,
                                whiteSpace: 'nowrap',
                                verticalAlign: 'top',
                                border: 'none',
                              }}>
                                {item.time}
                              </td>
                              <td style={{
                                fontSize: `${(agenda.itemFontSize || 7) * previewScale}pt`,
                                fontFamily: template.fontFamily || 'Inter, sans-serif',
                                fontWeight: 'normal',
                                color: agendaColor,
                                padding: `${1 * previewScale}px 0`,
                                whiteSpace: 'nowrap',
                                verticalAlign: 'top',
                                border: 'none',
                              }}>
                                {item.label}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <span className="text-[8px] text-muted-foreground opacity-50">blank</span>
              </div>
            )}
          </div>
        </>
      )}
      {showDimensions && (
        <div className="mt-2 text-center">
          <Badge variant="outline" className="text-xs">
            {template.width}" × {template.height}"
            {template.layoutMode === 'foldable' && ` (prints ${template.width}" × ${(template.height * 2).toFixed(1)}", folds to ${template.width}" × ${template.height}")`}
          </Badge>
        </div>
      )}
    </div>
  );
}
