import { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TouchNumberInput } from '@/components/ui/touch-number-input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Upload, Maximize2, Settings2, X, AlignLeft, AlignCenter, AlignRight, Move, Type, Plus, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const FONT_WEIGHTS = [
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semi Bold" },
  { value: "700", label: "Bold" },
];
import { nanoid } from 'nanoid';

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
}

interface ImageElement {
  id: string;
  type: 'logo' | 'banner' | 'image';
  url: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
}

interface AvailableField {
  value: string;
  label: string;
}

interface DraggableBadgeCanvasProps {
  width: number;
  height: number;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
  mergeFields: MergeField[];
  imageElements: ImageElement[];
  includeQR: boolean;
  qrPosition: string;
  customQrPosition?: { x: number; y: number };
  onUpdateQrPosition?: (pos: { x: number; y: number }) => void;
  onUpdateMergeField: (index: number, updates: Partial<MergeField>) => void;
  onUpdateImageElement: (id: string, updates: Partial<ImageElement>) => void;
  onRemoveImageElement: (id: string) => void;
  onAddImageElement: (element: ImageElement) => void;
  onAddMergeField?: (field: MergeField) => void;
  onRemoveMergeField?: (index: number) => void;
  availableFields?: AvailableField[];
  onPreviewFullSize?: () => void;
  designWatermark?: string | null;
  watermarkOpacity?: number;
  watermarkPosition?: { x: number; y: number; width: number; height: number; fit: 'cover' | 'contain' | 'stretch' };
  panelLabel?: string;
}

interface AlignmentGuide {
  type: 'horizontal' | 'vertical';
  position: number;
  isCenter?: boolean;
  isBadgeCenter?: boolean;
}

const SNAP_THRESHOLD = 8; // pixels

export default function DraggableBadgeCanvas({
  width,
  height,
  backgroundColor,
  textColor,
  accentColor,
  fontFamily,
  mergeFields,
  imageElements,
  includeQR,
  qrPosition,
  customQrPosition,
  onUpdateQrPosition,
  onUpdateMergeField,
  onUpdateImageElement,
  onRemoveImageElement,
  onAddImageElement,
  onAddMergeField,
  onRemoveMergeField,
  availableFields = [],
  onPreviewFullSize,
  designWatermark,
  watermarkOpacity = 30,
  watermarkPosition,
  panelLabel,
}: DraggableBadgeCanvasProps) {
  const [draggingField, setDraggingField] = useState<number | null>(null);
  const [draggingImage, setDraggingImage] = useState<string | null>(null);
  const [draggingQR, setDraggingQR] = useState(false);
  const [resizingImage, setResizingImage] = useState<string | null>(null);
  const [openFieldPopover, setOpenFieldPopover] = useState<number | null>(null);
  const [openImagePopover, setOpenImagePopover] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const elementStartRef = useRef<{ x: number; y: number } | null>(null);
  const resizeStartRef = useRef<{ width: number; height: number; mouseX: number; mouseY: number; aspectRatio: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const pixelsPerInch = 96;
  const badgeWidthPx = width * pixelsPerInch;
  const badgeHeightPx = height * pixelsPerInch;
  
  const availableWidth = Math.max(containerWidth - 48, 280);
  const previewScale = containerWidth > 0 ? Math.min(1, availableWidth / badgeWidthPx) : 0.8;

  // Badge center lines for alignment
  const badgeCenterX = badgeWidthPx / 2;
  const badgeCenterY = badgeHeightPx / 2;


  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    
    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, []);

  // Calculate alignment guides for current element position
  const calculateAlignmentGuides = useCallback((
    currentX: number,
    currentY: number,
    currentWidth: number,
    currentHeight: number,
    excludeFieldIndex?: number,
    excludeImageId?: string
  ) => {
    const guides: AlignmentGuide[] = [];
    const currentCenterX = currentX + currentWidth / 2;
    const currentCenterY = currentY + currentHeight / 2;
    const currentRight = currentX + currentWidth;
    const currentBottom = currentY + currentHeight;

    // Badge center alignment
    if (Math.abs(currentCenterX - badgeCenterX) < SNAP_THRESHOLD) {
      guides.push({ type: 'vertical', position: badgeCenterX, isBadgeCenter: true });
    }
    if (Math.abs(currentCenterY - badgeCenterY) < SNAP_THRESHOLD) {
      guides.push({ type: 'horizontal', position: badgeCenterY, isBadgeCenter: true });
    }

    // Check alignment with other merge fields
    mergeFields.forEach((field, index) => {
      if (index === excludeFieldIndex) return;
      
      const fieldWidth = field.fontSize * 6; // Approximate width based on font size
      const fieldHeight = field.fontSize * 1.2;
      const fieldCenterX = field.position.x + fieldWidth / 2;
      const fieldCenterY = field.position.y + fieldHeight / 2;

      // Center-to-center alignment
      if (Math.abs(currentCenterX - fieldCenterX) < SNAP_THRESHOLD) {
        guides.push({ type: 'vertical', position: fieldCenterX, isCenter: true });
      }
      if (Math.abs(currentCenterY - fieldCenterY) < SNAP_THRESHOLD) {
        guides.push({ type: 'horizontal', position: fieldCenterY, isCenter: true });
      }

      // Left edge alignment
      if (Math.abs(currentX - field.position.x) < SNAP_THRESHOLD) {
        guides.push({ type: 'vertical', position: field.position.x });
      }

      // Top alignment
      if (Math.abs(currentY - field.position.y) < SNAP_THRESHOLD) {
        guides.push({ type: 'horizontal', position: field.position.y });
      }
    });

    // Check alignment with images
    imageElements.forEach((img) => {
      if (img.id === excludeImageId) return;

      const imgCenterX = img.position.x + img.size.width / 2;
      const imgCenterY = img.position.y + img.size.height / 2;

      if (Math.abs(currentCenterX - imgCenterX) < SNAP_THRESHOLD) {
        guides.push({ type: 'vertical', position: imgCenterX, isCenter: true });
      }
      if (Math.abs(currentCenterY - imgCenterY) < SNAP_THRESHOLD) {
        guides.push({ type: 'horizontal', position: imgCenterY, isCenter: true });
      }
      if (Math.abs(currentX - img.position.x) < SNAP_THRESHOLD) {
        guides.push({ type: 'vertical', position: img.position.x });
      }
      if (Math.abs(currentY - img.position.y) < SNAP_THRESHOLD) {
        guides.push({ type: 'horizontal', position: img.position.y });
      }
    });

    return guides;
  }, [mergeFields, imageElements, badgeCenterX, badgeCenterY]);

  // Snap position to nearest guide
  const snapToGuides = useCallback((
    x: number,
    y: number,
    elementWidth: number,
    elementHeight: number,
    excludeFieldIndex?: number,
    excludeImageId?: string
  ) => {
    let snappedX = x;
    let snappedY = y;
    const centerX = x + elementWidth / 2;
    const centerY = y + elementHeight / 2;

    // Snap to badge center
    if (Math.abs(centerX - badgeCenterX) < SNAP_THRESHOLD) {
      snappedX = badgeCenterX - elementWidth / 2;
    }
    if (Math.abs(centerY - badgeCenterY) < SNAP_THRESHOLD) {
      snappedY = badgeCenterY - elementHeight / 2;
    }

    // Snap to other elements
    mergeFields.forEach((field, index) => {
      if (index === excludeFieldIndex) return;
      
      const fieldWidth = field.fontSize * 6;
      const fieldCenterX = field.position.x + fieldWidth / 2;
      
      if (Math.abs(centerX - fieldCenterX) < SNAP_THRESHOLD) {
        snappedX = fieldCenterX - elementWidth / 2;
      }
      if (Math.abs(x - field.position.x) < SNAP_THRESHOLD) {
        snappedX = field.position.x;
      }
      if (Math.abs(y - field.position.y) < SNAP_THRESHOLD) {
        snappedY = field.position.y;
      }
    });

    imageElements.forEach((img) => {
      if (img.id === excludeImageId) return;
      
      const imgCenterX = img.position.x + img.size.width / 2;
      
      if (Math.abs(centerX - imgCenterX) < SNAP_THRESHOLD) {
        snappedX = imgCenterX - elementWidth / 2;
      }
      if (Math.abs(x - img.position.x) < SNAP_THRESHOLD) {
        snappedX = img.position.x;
      }
      if (Math.abs(y - img.position.y) < SNAP_THRESHOLD) {
        snappedY = img.position.y;
      }
    });

    return { x: snappedX, y: snappedY };
  }, [mergeFields, imageElements, badgeCenterX, badgeCenterY]);

  // Determine alignment based on position
  const determineAlignment = useCallback((x: number, elementWidth: number): 'left' | 'center' | 'right' => {
    const centerX = x + elementWidth / 2;
    const tolerance = SNAP_THRESHOLD;
    
    if (Math.abs(centerX - badgeCenterX) < tolerance) {
      return 'center';
    } else if (x < badgeWidthPx / 3) {
      return 'left';
    } else if (x > (badgeWidthPx * 2) / 3) {
      return 'right';
    }
    return 'left';
  }, [badgeCenterX, badgeWidthPx]);

  const handlePointerDown = (
    e: React.PointerEvent,
    type: 'field' | 'image' | 'qr',
    index: number | string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleRatio = rect.width / badgeWidthPx;
    
    dragStartRef.current = {
      x: (e.clientX - rect.left) / scaleRatio,
      y: (e.clientY - rect.top) / scaleRatio,
    };
    
    if (type === 'field') {
      const fieldIndex = index as number;
      setDraggingField(fieldIndex);
      setOpenImagePopover(null);
      elementStartRef.current = { ...mergeFields[fieldIndex].position };
    } else if (type === 'qr') {
      setDraggingQR(true);
      setOpenFieldPopover(null);
      setOpenImagePopover(null);
      elementStartRef.current = { ...(customQrPosition || { x: 50, y: 50 }) };
    } else {
      const imageId = index as string;
      setDraggingImage(imageId);
      setOpenFieldPopover(null);
      const img = imageElements.find(i => i.id === imageId);
      if (img) {
        elementStartRef.current = { ...img.position };
      }
    }
    
    setIsDragging(true);
  };

  const handleResizeStart = (e: React.PointerEvent, imageId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    
    const img = imageElements.find(i => i.id === imageId);
    if (!img) return;
    
    setResizingImage(imageId);
    setOpenImagePopover(null);
    resizeStartRef.current = {
      width: img.size.width,
      height: img.size.height,
      mouseX: e.clientX,
      mouseY: e.clientY,
      aspectRatio: img.size.width / img.size.height,
    };
  };

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Handle resize
    if (resizingImage !== null && resizeStartRef.current && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleRatio = rect.width / badgeWidthPx;
      
      const deltaX = (e.clientX - resizeStartRef.current.mouseX) / scaleRatio;
      const deltaY = (e.clientY - resizeStartRef.current.mouseY) / scaleRatio;
      
      // Use the larger delta to maintain aspect ratio
      const delta = Math.max(deltaX, deltaY);
      
      let newWidth = resizeStartRef.current.width + delta;
      let newHeight = newWidth / resizeStartRef.current.aspectRatio;
      
      // Minimum size constraints
      newWidth = Math.max(30, newWidth);
      newHeight = Math.max(30, newHeight);
      
      // Maximum size constraints (can't exceed badge bounds)
      const img = imageElements.find(i => i.id === resizingImage);
      if (img) {
        const maxWidth = badgeWidthPx - img.position.x;
        const maxHeight = badgeHeightPx - img.position.y;
        
        if (newWidth > maxWidth) {
          newWidth = maxWidth;
          newHeight = newWidth / resizeStartRef.current.aspectRatio;
        }
        if (newHeight > maxHeight) {
          newHeight = maxHeight;
          newWidth = newHeight * resizeStartRef.current.aspectRatio;
        }
        
        onUpdateImageElement(resizingImage, {
          size: { width: Math.round(newWidth), height: Math.round(newHeight) },
        });
      }
      return;
    }
    
    if (!canvasRef.current || !dragStartRef.current || !elementStartRef.current) return;
    if (draggingField === null && draggingImage === null && !draggingQR) return;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      if (!canvasRef.current || !dragStartRef.current || !elementStartRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const scaleRatio = rect.width / badgeWidthPx;
      
      const currentX = (e.clientX - rect.left) / scaleRatio;
      const currentY = (e.clientY - rect.top) / scaleRatio;
      
      const deltaX = currentX - dragStartRef.current.x;
      const deltaY = currentY - dragStartRef.current.y;
      
      let newX = elementStartRef.current.x + deltaX;
      let newY = elementStartRef.current.y + deltaY;

      if (draggingQR && onUpdateQrPosition) {
        const qrSize = Math.min(badgeWidthPx, badgeHeightPx) * 0.2;
        newX = Math.max(0, Math.min(badgeWidthPx - qrSize, newX));
        newY = Math.max(0, Math.min(badgeHeightPx - qrSize, newY));

        const guides = calculateAlignmentGuides(newX, newY, qrSize, qrSize);
        setAlignmentGuides(guides);
        const snapped = snapToGuides(newX, newY, qrSize, qrSize);
        onUpdateQrPosition({ x: Math.round(snapped.x), y: Math.round(snapped.y) });
      } else if (draggingField !== null) {
        const field = mergeFields[draggingField];
        if (!field) return;
        const fieldWidth = field.fontSize * 6;
        const fieldHeight = field.fontSize * 1.2;
        
        newY = Math.max(0, Math.min(badgeHeightPx - 20, newY));
        
        if (field.horizontalAlign === 'custom') {
          newX = Math.max(0, Math.min(badgeWidthPx - 20, newX));
          const guides = calculateAlignmentGuides(newX, newY, fieldWidth, fieldHeight, draggingField);
          setAlignmentGuides(guides);
          const snapped = snapToGuides(newX, newY, fieldWidth, fieldHeight, draggingField);
          onUpdateMergeField(draggingField, {
            position: { x: Math.round(snapped.x), y: Math.round(snapped.y) },
          });
        } else {
          let lockedX: number;
          if (field.align === 'center') {
            lockedX = badgeCenterX - fieldWidth / 2;
          } else if (field.align === 'right') {
            lockedX = badgeWidthPx - fieldWidth - 10;
          } else {
            lockedX = 10;
          }
          
          if (field.align === 'center') {
            setAlignmentGuides([{ type: 'vertical', position: badgeCenterX, isBadgeCenter: true }]);
          } else {
            setAlignmentGuides([]);
          }
          
          onUpdateMergeField(draggingField, {
            position: { x: Math.round(lockedX), y: Math.round(newY) },
          });
        }
      } else if (draggingImage !== null) {
        const img = imageElements.find(i => i.id === draggingImage);
        if (img) {
          newX = Math.max(0, Math.min(badgeWidthPx - img.size.width, newX));
          newY = Math.max(0, Math.min(badgeHeightPx - img.size.height, newY));
          
          const guides = calculateAlignmentGuides(newX, newY, img.size.width, img.size.height, undefined, draggingImage);
          setAlignmentGuides(guides);
          
          const snapped = snapToGuides(newX, newY, img.size.width, img.size.height, undefined, draggingImage);
          
          onUpdateImageElement(draggingImage, {
            position: { x: Math.round(snapped.x), y: Math.round(snapped.y) },
          });
        }
      }
    });
  }, [draggingField, draggingImage, draggingQR, resizingImage, badgeWidthPx, badgeHeightPx, mergeFields, imageElements, calculateAlignmentGuides, snapToGuides, onUpdateMergeField, onUpdateImageElement, onUpdateQrPosition, customQrPosition]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.releasePointerCapture(e.pointerId);
    
    setDraggingField(null);
    setDraggingImage(null);
    setDraggingQR(false);
    setResizingImage(null);
    setAlignmentGuides([]);
    setIsDragging(false);
    dragStartRef.current = null;
    elementStartRef.current = null;
    resizeStartRef.current = null;
    
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);
  
  // Update field position when alignment changes via button
  const handleAlignmentChange = useCallback((fieldIndex: number, newAlign: 'left' | 'center' | 'right') => {
    const field = mergeFields[fieldIndex];
    const fieldWidth = field.fontSize * 6;
    
    let newX: number;
    if (newAlign === 'center') {
      newX = badgeCenterX - fieldWidth / 2;
    } else if (newAlign === 'right') {
      newX = badgeWidthPx - fieldWidth - 10;
    } else {
      newX = 10;
    }
    
    onUpdateMergeField(fieldIndex, { 
      align: newAlign,
      horizontalAlign: undefined,
      position: { x: Math.round(newX), y: field.position.y }
    });
  }, [mergeFields, badgeCenterX, badgeWidthPx, onUpdateMergeField]);

  const handleElementClick = (e: React.MouseEvent, type: 'field' | 'image', index: number | string) => {
    e.stopPropagation();
    
    // Don't open popover if we just finished dragging
    if (isDragging) return;
    
    if (type === 'field') {
      setOpenFieldPopover(openFieldPopover === index ? null : (index as number));
      setOpenImagePopover(null);
    } else {
      setOpenImagePopover(openImagePopover === index ? null : (index as string));
      setOpenFieldPopover(null);
    }
  };

  const handleCanvasClick = () => {
    setOpenFieldPopover(null);
    setOpenImagePopover(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = badgeWidthPx * 0.4;
        const maxHeight = badgeHeightPx * 0.3;
        let newWidth = img.width;
        let newHeight = img.height;

        if (newWidth > maxWidth) {
          newHeight = (maxWidth / newWidth) * newHeight;
          newWidth = maxWidth;
        }
        if (newHeight > maxHeight) {
          newWidth = (maxHeight / newHeight) * newWidth;
          newHeight = maxHeight;
        }

        const newImage: ImageElement = {
          id: nanoid(),
          type: 'image',
          url: event.target?.result as string,
          position: { x: 20, y: 20 },
          size: { width: Math.round(newWidth), height: Math.round(newHeight) },
          zIndex: imageElements.length,
        };
        onAddImageElement(newImage);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const getQRCodePosition = () => {
    const qrSize = Math.min(badgeWidthPx, badgeHeightPx) * 0.2;
    if (qrPosition === 'custom' && customQrPosition) {
      return {
        x: Math.max(0, Math.min(badgeWidthPx - qrSize, customQrPosition.x)),
        y: Math.max(0, Math.min(badgeHeightPx - qrSize, customQrPosition.y)),
        size: qrSize,
      };
    }
    const positions: Record<string, { x: number; y: number }> = {
      'top-left': { x: 10, y: 10 },
      'top-center': { x: (badgeWidthPx - qrSize) / 2, y: 10 },
      'top-right': { x: badgeWidthPx - qrSize - 10, y: 10 },
      'bottom-left': { x: 10, y: badgeHeightPx - qrSize - 10 },
      'bottom-center': { x: (badgeWidthPx - qrSize) / 2, y: badgeHeightPx - qrSize - 10 },
      'bottom-right': { x: badgeWidthPx - qrSize - 10, y: badgeHeightPx - qrSize - 10 },
    };
    return { ...positions[qrPosition], size: qrSize };
  };

  const qrCodePos = getQRCodePosition();

  const AlignmentIndicator = ({ align }: { align: 'left' | 'center' | 'right' }) => {
    const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
    return (
      <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-primary text-primary-foreground px-1 py-0.5 rounded text-[9px] whitespace-nowrap">
        <Icon className="h-2.5 w-2.5" />
      </div>
    );
  };

  const FieldPropertiesContent = ({ fieldIndex }: { fieldIndex: number }) => {
    const field = mergeFields[fieldIndex];
    if (!field) return null;

    return (
      <div className="space-y-3 min-w-[260px]">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm">Field Properties</h4>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setOpenFieldPopover(null)}
            data-testid="button-close-field-popover"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        
        {/* Field Type Selector */}
        {availableFields.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs">Data Field</Label>
            <Select
              value={field.field}
              onValueChange={(value) => {
                const selectedField = availableFields.find(f => f.value === value);
                onUpdateMergeField(fieldIndex, {
                  field: value,
                  label: selectedField?.label || value
                });
              }}
            >
              <SelectTrigger className="h-8" data-testid="select-field-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableFields.map(f => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Move className="h-3 w-3" />
          <span>Position: ({field.position.x}, {field.position.y})</span>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs" data-testid="label-font-size">Font Size</Label>
            <TouchNumberInput
              value={field.fontSize}
              onChange={(v) => onUpdateMergeField(fieldIndex, { fontSize: v })}
              min={8}
              max={72}
              suffix="pt"
              data-testid="input-font-size"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs" data-testid="label-font-weight">Weight</Label>
            <Select
              value={field.fontWeight || '400'}
              onValueChange={(value) =>
                onUpdateMergeField(fieldIndex, { fontWeight: value })
              }
            >
              <SelectTrigger className="h-8" data-testid="select-font-weight">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_WEIGHTS.map(w => (
                  <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs" data-testid="label-font-style">Font Style</Label>
          <Select
            value={field.fontStyle || 'normal'}
            onValueChange={(value: 'normal' | 'italic') =>
              onUpdateMergeField(fieldIndex, { fontStyle: value })
            }
          >
            <SelectTrigger className="h-8" data-testid="select-font-style">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="italic">Italic</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs" data-testid="label-alignment">Alignment</Label>
          <div className="flex gap-1">
            {(['left', 'center', 'right'] as const).map((alignOption) => {
              const Icon = alignOption === 'left' ? AlignLeft : alignOption === 'center' ? AlignCenter : AlignRight;
              return (
                <Button
                  key={alignOption}
                  variant={field.align === alignOption && field.horizontalAlign !== 'custom' ? "default" : "outline"}
                  size="sm"
                  className="flex-1 h-8"
                  onClick={() => {
                    onUpdateMergeField(fieldIndex, { horizontalAlign: undefined });
                    handleAlignmentChange(fieldIndex, alignOption);
                  }}
                  data-testid={`button-align-${alignOption}`}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              );
            })}
            <Button
              variant={field.horizontalAlign === 'custom' ? "default" : "outline"}
              size="sm"
              className="flex-1 h-8"
              onClick={() => {
                onUpdateMergeField(fieldIndex, {
                  horizontalAlign: 'custom',
                  align: 'left',
                });
              }}
              data-testid="button-align-free"
              title="Free position - drag anywhere"
            >
              <Move className="h-4 w-4" />
            </Button>
          </div>
          {field.horizontalAlign === 'custom' && (
            <p className="text-xs text-muted-foreground">
              Free position — drag to place anywhere
            </p>
          )}
        </div>
        
        {field.horizontalAlign === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">X Position</Label>
              <TouchNumberInput
                value={field.position.x}
                onChange={(v) => onUpdateMergeField(fieldIndex, { position: { ...field.position, x: v } })}
                min={0}
                max={badgeWidthPx}
                suffix="px"
                data-testid="input-position-x"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Y Position</Label>
              <TouchNumberInput
                value={field.position.y}
                onChange={(v) => onUpdateMergeField(fieldIndex, { position: { ...field.position, y: v } })}
                min={0}
                max={badgeHeightPx}
                suffix="px"
                data-testid="input-position-y"
              />
            </div>
          </div>
        )}

        {(field.align === 'left' || field.align === 'right') && field.horizontalAlign !== 'custom' && (
          <div className="space-y-1">
            <Label className="text-xs" data-testid="label-padding">Edge Padding</Label>
            <TouchNumberInput
              value={field.horizontalPadding || 0}
              onChange={(v) => onUpdateMergeField(fieldIndex, { horizontalPadding: v })}
              min={0}
              max={100}
              suffix="px"
              data-testid="input-horizontal-padding"
            />
            <p className="text-xs text-muted-foreground">
              Distance from {field.align} edge
            </p>
          </div>
        )}
        
        {/* Delete Field Button */}
        {onRemoveMergeField && (
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => {
              onRemoveMergeField(fieldIndex);
              setOpenFieldPopover(null);
            }}
            data-testid="button-delete-field"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Delete Field
          </Button>
        )}
      </div>
    );
  };

  const ImagePropertiesContent = ({ imageId }: { imageId: string }) => {
    const img = imageElements.find(i => i.id === imageId);
    if (!img) return null;

    return (
      <div className="space-y-3 min-w-[260px]">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm">Image Properties</h4>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setOpenImagePopover(null)}
            data-testid="button-close-image-popover"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Move className="h-3 w-3" />
          Position: ({img.position.x}, {img.position.y})
        </div>
        
        <div className="space-y-1">
          <Label className="text-xs" data-testid="label-image-width">Width</Label>
          <TouchNumberInput
            value={img.size.width}
            onChange={(newWidth) => {
              const aspectRatio = img.size.height / img.size.width;
              onUpdateImageElement(imageId, {
                size: { width: newWidth, height: Math.round(newWidth * aspectRatio) },
              });
            }}
            min={20}
            step={5}
            suffix="px"
            data-testid="input-image-width"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs" data-testid="label-image-height">Height</Label>
          <TouchNumberInput
            value={img.size.height}
            onChange={(newHeight) => {
              const aspectRatio = img.size.width / img.size.height;
              onUpdateImageElement(imageId, {
                size: { height: newHeight, width: Math.round(newHeight * aspectRatio) },
              });
            }}
            min={20}
            step={5}
            suffix="px"
            data-testid="input-image-height"
          />
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={() => {
            onRemoveImageElement(imageId);
            setOpenImagePopover(null);
          }}
          data-testid="button-delete-image"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Remove Image
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-4" ref={containerRef}>
      {panelLabel && (
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{panelLabel}</div>
      )}
      <div className="flex gap-2 flex-wrap items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {/* Add Field Dropdown */}
          {onAddMergeField && availableFields.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="button-add-field"
                >
                  <Type className="h-4 w-4 mr-2" />
                  Add Field
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {availableFields.map((field) => (
                  <DropdownMenuItem
                    key={field.value}
                    onClick={() => {
                      const yOffset = 30 + (mergeFields.length * 35);
                      const newField: MergeField = {
                        field: field.value,
                        label: field.label,
                        fontSize: 18,
                        position: { x: 20, y: Math.min(yOffset, badgeHeightPx - 30) },
                        align: 'left',
                        fontWeight: '400',
                        fontStyle: 'normal',
                      };
                      onAddMergeField(newField);
                      setTimeout(() => {
                        setOpenFieldPopover(mergeFields.length);
                      }, 50);
                    }}
                    data-testid={`menu-item-add-${field.value}`}
                  >
                    {field.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-upload-image"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload Image
          </Button>
          {onPreviewFullSize && (
            <Button
              variant="outline"
              size="sm"
              onClick={onPreviewFullSize}
              data-testid="button-preview-fullsize"
            >
              <Maximize2 className="h-4 w-4 mr-2" />
              Preview Full Size
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            Drag to move • Snap to guides
          </Badge>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md text-xs text-blue-700 dark:text-blue-300">
          <Move className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Drag any field or image to reposition it. Click to edit properties.</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
          data-testid="input-image-upload"
        />
      </div>

      <Card className="p-4 w-full">
        <div
          ref={canvasRef}
          className="relative border-2 border-dashed border-border rounded-lg mx-auto select-none touch-none"
          style={{
            width: `${badgeWidthPx * previewScale}px`,
            height: `${badgeHeightPx * previewScale}px`,
            backgroundColor,
            cursor: isDragging ? 'grabbing' : 'crosshair',
          }}
          onClick={handleCanvasClick}
          data-testid="canvas-badge-preview"
        >
          {designWatermark && (
            <div
              className="absolute pointer-events-none z-0"
              style={{
                left: `${watermarkPosition?.x ?? 0}%`,
                top: `${watermarkPosition?.y ?? 0}%`,
                width: `${watermarkPosition?.width ?? 100}%`,
                height: `${watermarkPosition?.height ?? 100}%`,
                backgroundImage: `url(${designWatermark})`,
                backgroundSize: (watermarkPosition?.fit === 'stretch' ? '100% 100%' : watermarkPosition?.fit) || 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                opacity: watermarkOpacity / 100,
              }}
            />
          )}

          {/* Center alignment guides (always visible, subtle) */}
          <div
            className="absolute pointer-events-none opacity-20"
            style={{
              left: `${badgeCenterX * previewScale - 0.5}px`,
              top: 0,
              width: '1px',
              height: '100%',
              backgroundColor: accentColor,
              borderLeft: `1px dashed ${accentColor}`,
            }}
          />
          <div
            className="absolute pointer-events-none opacity-20"
            style={{
              left: 0,
              top: `${badgeCenterY * previewScale - 0.5}px`,
              width: '100%',
              height: '1px',
              backgroundColor: accentColor,
              borderTop: `1px dashed ${accentColor}`,
            }}
          />

          {/* Active alignment guides (shown during drag) */}
          {alignmentGuides.map((guide, index) => (
            <div
              key={index}
              className="absolute pointer-events-none z-50"
              style={guide.type === 'vertical' ? {
                left: `${guide.position * previewScale}px`,
                top: 0,
                width: guide.isBadgeCenter ? '2px' : '1px',
                height: '100%',
                backgroundColor: guide.isBadgeCenter ? '#22c55e' : guide.isCenter ? '#3b82f6' : '#f59e0b',
              } : {
                left: 0,
                top: `${guide.position * previewScale}px`,
                width: '100%',
                height: guide.isBadgeCenter ? '2px' : '1px',
                backgroundColor: guide.isBadgeCenter ? '#22c55e' : guide.isCenter ? '#3b82f6' : '#f59e0b',
              }}
            />
          ))}

          <div
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
            }}
          >
            {imageElements
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((img) => (
                <Popover 
                  key={img.id} 
                  open={openImagePopover === img.id}
                  onOpenChange={(open) => {
                    if (!open) setOpenImagePopover(null);
                  }}
                >
                  <PopoverTrigger asChild>
                    <div
                      className={`absolute touch-none ${
                        draggingImage === img.id 
                          ? 'ring-2 ring-primary shadow-xl cursor-grabbing z-40' 
                          : openImagePopover === img.id 
                          ? 'ring-2 ring-primary shadow-lg cursor-grab' 
                          : 'hover:ring-2 hover:ring-primary/50 cursor-grab'
                      }`}
                      style={{
                        left: `${(img.position.x * previewScale)}px`,
                        top: `${(img.position.y * previewScale)}px`,
                        width: `${(img.size.width * previewScale)}px`,
                        height: `${(img.size.height * previewScale)}px`,
                        transition: draggingImage === img.id ? 'none' : 'box-shadow 0.15s ease',
                      }}
                      onPointerDown={(e) => handlePointerDown(e, 'image', img.id)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onClick={(e) => handleElementClick(e, 'image', img.id)}
                      data-testid={`image-element-${img.id}`}
                    >
                      <img
                        src={img.url}
                        alt={img.type}
                        className="w-full h-full object-contain pointer-events-none"
                        draggable={false}
                      />
                      {openImagePopover === img.id && (
                        <div className="absolute -top-1 -right-1 bg-primary rounded-full p-0.5">
                          <Settings2 className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                      <div
                        className={`absolute -bottom-1 -right-1 w-4 h-4 bg-primary border-2 border-background rounded-sm cursor-se-resize touch-none ${
                          resizingImage === img.id ? 'scale-125' : 'hover:scale-110'
                        } transition-transform`}
                        onPointerDown={(e) => handleResizeStart(e, img.id)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        data-testid={`resize-handle-${img.id}`}
                        title="Drag to resize (aspect ratio locked)"
                      >
                        <svg 
                          className="w-full h-full text-primary-foreground p-0.5" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="3"
                        >
                          <path d="M21 15L15 21M21 8L8 21" />
                        </svg>
                      </div>
                    </div>
                  </PopoverTrigger>
                  <PopoverContent 
                    side="right" 
                    align="start" 
                    sideOffset={8}
                    className="w-auto p-3 z-50"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    data-testid="popover-image-properties"
                  >
                    <ImagePropertiesContent imageId={img.id} />
                  </PopoverContent>
                </Popover>
              ))}

            {mergeFields.map((field, index) => (
              <Popover 
                key={index} 
                open={openFieldPopover === index}
                onOpenChange={(open) => {
                  if (!open) setOpenFieldPopover(null);
                }}
              >
                <PopoverTrigger asChild>
                  <div
                    className={`absolute touch-none rounded group/field ${
                      draggingField === index 
                        ? 'ring-2 ring-primary bg-primary/20 shadow-xl z-40' 
                        : openFieldPopover === index 
                        ? 'ring-2 ring-primary bg-primary/10 shadow-lg' 
                        : 'hover:bg-primary/5 hover:ring-2 hover:ring-primary/50'
                    }`}
                    style={{
                      ...(field.horizontalAlign === 'custom' ? {
                        left: `${(field.position.x * previewScale)}px`,
                        right: 'auto',
                        width: 'auto',
                        maxWidth: `calc(100% - ${(field.position.x * previewScale)}px)`,
                      } : {
                        left: field.align === 'center' 
                          ? `${((field.horizontalPadding || 10) * previewScale)}px`
                          : field.align === 'left'
                          ? `${((field.horizontalPadding || 10) * previewScale)}px`
                          : 'auto',
                        right: field.align === 'right' 
                          ? `${((field.horizontalPadding || 10) * previewScale)}px` 
                          : field.align === 'center'
                          ? `${((field.horizontalPadding || 10) * previewScale)}px`
                          : 'auto',
                        width: 'auto',
                        maxWidth: `calc(100% - ${((field.horizontalPadding || 10) * 2 * previewScale)}px)`,
                      }),
                      top: `${(field.position.y * previewScale)}px`,
                      color: textColor,
                      fontSize: `${(field.fontSize * previewScale)}pt`,
                      fontFamily: fontFamily,
                      fontWeight: field.fontWeight || '400',
                      fontStyle: field.fontStyle || 'normal',
                      textAlign: field.align,
                      whiteSpace: 'nowrap',
                      overflow: 'visible',
                      userSelect: 'none',
                      cursor: draggingField === index ? 'grabbing' : 'grab',
                      transition: draggingField === index ? 'none' : 'box-shadow 0.15s ease, background 0.15s ease',
                    }}
                    onPointerDown={(e) => handlePointerDown(e, 'field', index)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onClick={(e) => handleElementClick(e, 'field', index)}
                    data-testid={`field-${field.field}-${index}`}
                  >
                    <Move className={`absolute -left-1 -top-1 h-3 w-3 text-primary ${
                      draggingField === index || openFieldPopover === index ? 'opacity-80' : 'opacity-0 group-hover/field:opacity-50'
                    } transition-opacity`} />
                    {field.label}
                    {(openFieldPopover === index || draggingField === index) && (
                      <>
                        <div className="absolute -top-1 -right-1 bg-primary rounded-full p-0.5">
                          <Settings2 className="h-3 w-3 text-primary-foreground" />
                        </div>
                        <AlignmentIndicator align={field.align} />
                      </>
                    )}
                  </div>
                </PopoverTrigger>
                <PopoverContent 
                  side="right" 
                  align="start" 
                  sideOffset={8}
                  className="w-auto p-3 z-50"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                  data-testid="popover-field-properties"
                >
                  <FieldPropertiesContent fieldIndex={index} />
                </PopoverContent>
              </Popover>
            ))}

            {includeQR && (
              <div
                className={`absolute bg-white border-2 flex items-center justify-center text-xs font-mono ${
                  qrPosition === 'custom'
                    ? draggingQR
                      ? 'ring-2 ring-primary shadow-xl cursor-grabbing z-40'
                      : 'hover:ring-2 hover:ring-primary/50 cursor-grab'
                    : ''
                }`}
                style={{
                  left: `${(qrCodePos.x * previewScale)}px`,
                  top: `${(qrCodePos.y * previewScale)}px`,
                  width: `${(qrCodePos.size * previewScale)}px`,
                  height: `${(qrCodePos.size * previewScale)}px`,
                  borderColor: textColor,
                  transition: draggingQR ? 'none' : 'box-shadow 0.15s ease',
                }}
                onPointerDown={qrPosition === 'custom' ? (e) => handlePointerDown(e, 'qr', 0) : undefined}
                onPointerMove={qrPosition === 'custom' ? handlePointerMove : undefined}
                onPointerUp={qrPosition === 'custom' ? handlePointerUp : undefined}
                data-testid="element-qr-code"
              >
                QR
                {qrPosition === 'custom' && (
                  <Move className={`absolute -left-1 -top-1 h-3 w-3 text-primary ${
                    draggingQR ? 'opacity-80' : 'opacity-0 hover:opacity-50'
                  } transition-opacity`} />
                )}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-green-500" />
            <span>Center</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-blue-500" />
            <span>Element center</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-amber-500" />
            <span>Edge</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
