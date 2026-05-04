import { useState, useEffect } from "react";
import type { BadgeTemplate } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useBehaviorTracking } from "@/hooks/useBehaviorTracking";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TouchNumberInput } from "@/components/ui/touch-number-input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Type, ChevronDown, ChevronRight, X, QrCode, ImageIcon, Trash2, FlipVertical, Copy, Minus, AlertTriangle } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import DraggableBadgeCanvas from "@/components/DraggableBadgeCanvas";
import FontUploadDialog from "@/components/FontUploadDialog";
import { FontProvider, useFontsOptional, useFonts } from "@/contexts/FontContext";
import { WEB_SAFE_FONTS, GOOGLE_FONTS } from "@shared/schema";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";


type HorizontalAlignment = 'left' | 'center' | 'right' | 'custom';
type VerticalAlignment = 'top' | 'middle' | 'bottom' | 'custom';

interface MergeField {
  field: string;
  label: string;
  fontSize: number;
  position: { x: number; y: number };
  align: 'left' | 'center' | 'right';
  fontWeight?: string;
  fontStyle?: 'normal' | 'italic';
  horizontalAlign?: HorizontalAlignment;
  verticalAlign?: VerticalAlignment;
}

interface ImageElement {
  id: string;
  type: 'logo' | 'banner' | 'image';
  url: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
}

interface BadgeDesignerProps {
  templateId?: string;
  customerId?: string;
  onSave?: (template: Partial<BadgeTemplate>) => void;
  onCancel?: () => void;
  initialData?: any;
  isSaving?: boolean;
}

const FONT_WEIGHTS = [
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semi Bold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extra Bold" },
  { value: "900", label: "Black" },
];

const QUICK_START_PRESETS = [
  { value: "standard", label: 'Standard (4" × 3")', description: "Most common badge size", width: 4, height: 3 },
  { value: "landscape", label: 'Landscape (5" × 3")', description: "Wider format for more content", width: 5, height: 3 },
  { value: "nametag", label: 'Name Tag (3.5" × 2.25")', description: "Compact adhesive name tag", width: 3.5, height: 2.25 },
  { value: "large", label: 'Large (4" × 6")', description: "Full-size conference badge", width: 4, height: 6 },
  { value: "cr80", label: 'ID Card — CR-80 (3.375" × 2.125")', description: "Standard PVC ID card (credit card size)", width: 3.375, height: 2.125 },
];

function BadgeDesignerInner({ templateId, customerId, onSave, onCancel, initialData, isSaving }: BadgeDesignerProps) {
  const fontContext = useFontsOptional();
  const { trackStart, trackComplete, trackAbandon } = useBehaviorTracking();
  const [name, setName] = useState(initialData?.name || "VIP Badge");
  const [participantTypes, setParticipantTypes] = useState<string[]>(() => {
    if (initialData?.participantTypes?.length > 0) {
      return initialData.participantTypes;
    }
    if (initialData?.participantType) {
      return [initialData.participantType];
    }
    return ["VIP"];
  });
  const [backgroundColor, setBackgroundColor] = useState(initialData?.backgroundColor || "#1a1a1a");
  const [textColor, setTextColor] = useState(initialData?.textColor || "#ffffff");
  const [accentColor, setAccentColor] = useState(initialData?.accentColor || "#3b82f6");
  const [width, setWidth] = useState(initialData?.width || 4);
  const [height, setHeight] = useState(initialData?.height || 3);
  const [labelRotation, setLabelRotation] = useState<0 | 90 | 180 | 270>(initialData?.labelRotation || 0);
  const [includeQR, setIncludeQR] = useState(initialData?.includeQR ?? true);
  const [qrPosition, setQrPosition] = useState(initialData?.qrPosition || "bottom-right");
  const [customQrPosition, setCustomQrPosition] = useState<{ x: number; y: number }>(
    initialData?.customQrPosition || { x: 50, y: 50 }
  );
  const [qrCodeConfig, setQrCodeConfig] = useState<{
    embedType: 'externalId' | 'simple' | 'json' | 'custom';
    fields: string[];
    separator: string;
    includeLabel: boolean;
  }>(initialData?.qrCodeConfig || {
    embedType: 'externalId',
    fields: ['externalId'],
    separator: '|',
    includeLabel: false,
  });
  const [fontFamily, setFontFamily] = useState(initialData?.fontFamily || "Arial");
  const [mergeFields, setMergeFields] = useState<MergeField[]>(initialData?.mergeFields || [
    { field: "firstName", label: "First Name", fontSize: 24, position: { x: 20, y: 40 }, align: "left", fontWeight: "700" },
    { field: "lastName", label: "Last Name", fontSize: 24, position: { x: 20, y: 70 }, align: "left", fontWeight: "700" },
    { field: "company", label: "Company", fontSize: 14, position: { x: 20, y: 110 }, align: "left", fontWeight: "400" },
  ]);
  const [imageElements, setImageElements] = useState<ImageElement[]>(initialData?.imageElements || []);
  const [layoutMode, setLayoutMode] = useState<'single' | 'foldable' | 'dual_side_card'>(initialData?.layoutMode || 'single');
  const [backSideMode, setBackSideMode] = useState<'duplicate-rotate' | 'custom' | 'blank'>(initialData?.backSideMode || 'blank');
  const [backSideMergeFields, setBackSideMergeFields] = useState<MergeField[]>(initialData?.backSideMergeFields || []);
  const [backSideImageElements, setBackSideImageElements] = useState<ImageElement[]>(initialData?.backSideImageElements || []);
  const [backSideIncludeQR, setBackSideIncludeQR] = useState(initialData?.backSideIncludeQR ?? false);
  const [backSideQrPosition, setBackSideQrPosition] = useState(initialData?.backSideQrPosition || "bottom-right");
  const [backSideCustomQrPosition, setBackSideCustomQrPosition] = useState<{ x: number; y: number }>(
    initialData?.backSideCustomQrPosition || { x: 50, y: 50 }
  );
  const [backSideQrCodeConfig, setBackSideQrCodeConfig] = useState<{
    embedType: 'externalId' | 'simple' | 'json' | 'custom';
    fields: string[];
    separator: string;
    includeLabel: boolean;
  }>(initialData?.backSideQrCodeConfig || {
    embedType: 'externalId',
    fields: ['externalId'],
    separator: '|',
    includeLabel: false,
  });
  const [backSideBackgroundColor, setBackSideBackgroundColor] = useState(initialData?.backSideBackgroundColor || backgroundColor);
  const [backSideAgenda, setBackSideAgenda] = useState<{
    enabled: boolean;
    title: string;
    titleFontSize: number;
    itemFontSize: number;
    textColor?: string;
    items: Array<{ time: string; label: string }>;
    position: { x: number; y: number };
  }>(initialData?.backSideAgenda || {
    enabled: false,
    title: 'Event Schedule',
    titleFontSize: 10,
    itemFontSize: 7,
    items: [
      { time: '8:00 AM', label: 'Registration & Breakfast' },
      { time: '9:00 AM', label: 'Opening Keynote' },
      { time: '10:15 AM', label: 'Breakout Sessions' },
      { time: '11:30 AM', label: 'Panel Discussion' },
      { time: '12:30 PM', label: 'Networking Lunch' },
      { time: '1:45 PM', label: 'Workshops' },
      { time: '3:00 PM', label: 'Afternoon Break' },
      { time: '3:30 PM', label: 'Closing Remarks' },
      { time: '4:00 PM', label: 'Reception & Mixer' },
    ],
    position: { x: 15, y: 15 },
  });
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [designWatermark, setDesignWatermark] = useState<string | null>(initialData?.designWatermark || null);
  const [watermarkOpacity, setWatermarkOpacity] = useState(initialData?.watermarkOpacity || 30);
  const [watermarkPosition, setWatermarkPosition] = useState<{
    x: number; y: number; width: number; height: number; fit: 'cover' | 'contain' | 'stretch';
  }>(initialData?.watermarkPosition || { x: 0, y: 0, width: 100, height: 100, fit: 'cover' });
  const [showWatermark, setShowWatermark] = useState(true);
  const [watermarkOpen, setWatermarkOpen] = useState(true);
  
  const fontsReady = fontContext ? !fontContext.isLoading : true;
  const allFonts = fontContext?.allFonts || [];

  const loadFont = async (family: string) => {
    if (fontContext) {
      await fontContext.loadFont(family);
    }
  };

  const availableFields = [
    { value: "fullName", label: "Full Name" },
    { value: "firstName", label: "First Name" },
    { value: "lastName", label: "Last Name" },
    { value: "email", label: "Email" },
    { value: "company", label: "Company" },
    { value: "title", label: "Job Title" },
    { value: "participantType", label: "Attendee Type" },
    { value: "externalId", label: "Reg Code" },
    { value: "orderCode", label: "Order Code" },
    { value: "customField_1", label: "Custom Field 1" },
    { value: "customField_2", label: "Custom Field 2" },
    { value: "customField_3", label: "Custom Field 3" },
  ];

  const qrEmbedFields = [
    { value: "externalId", label: "Registration Code" },
    { value: "externalProfileId", label: "External Profile ID" },
    { value: "firstName", label: "First Name" },
    { value: "lastName", label: "Last Name" },
    { value: "email", label: "Email" },
    { value: "company", label: "Company" },
    { value: "title", label: "Job Title" },
    { value: "participantType", label: "Attendee Type" },
  ];

  const qrEmbedTypes = [
    { value: "externalId", label: "Registration Code", description: "Registration code for quick scanning (default)" },
    { value: "externalProfileId", label: "External Profile ID", description: "Certain's external profile ID for third-party integrations" },
    { value: "simple", label: "Simple (with separator)", description: "Multiple fields joined by separator" },
    { value: "json", label: "JSON Format", description: "Structured JSON with field names" },
    { value: "custom", label: "Custom", description: "Custom field mapping with labels" },
  ];

  const updateMergeField = (index: number, updates: Partial<MergeField>) => {
    const updated = [...mergeFields];
    updated[index] = { ...updated[index], ...updates };
    setMergeFields(updated);
  };

  const removeMergeField = (index: number) => {
    setMergeFields(mergeFields.filter((_, i) => i !== index));
  };

  const updateImageElement = (id: string, updates: Partial<ImageElement>) => {
    setImageElements(imageElements.map(img => 
      img.id === id ? { ...img, ...updates } : img
    ));
  };

  const removeImageElement = (id: string) => {
    setImageElements(imageElements.filter(img => img.id !== id));
  };

  const addImageElement = (element: ImageElement) => {
    setImageElements([...imageElements, element]);
  };

  const updateBackSideMergeField = (index: number, updates: Partial<MergeField>) => {
    const updated = [...backSideMergeFields];
    updated[index] = { ...updated[index], ...updates };
    setBackSideMergeFields(updated);
  };

  const removeBackSideMergeField = (index: number) => {
    setBackSideMergeFields(backSideMergeFields.filter((_, i) => i !== index));
  };

  const updateBackSideImageElement = (id: string, updates: Partial<ImageElement>) => {
    setBackSideImageElements(backSideImageElements.map(img =>
      img.id === id ? { ...img, ...updates } : img
    ));
  };

  const removeBackSideImageElement = (id: string) => {
    setBackSideImageElements(backSideImageElements.filter(img => img.id !== id));
  };

  const addBackSideImageElement = (element: ImageElement) => {
    setBackSideImageElements([...backSideImageElements, element]);
  };

  const pixelsPerInch = 96;
  const badgeWidthPx = width * pixelsPerInch;
  const badgeHeightPx = height * pixelsPerInch;

  useEffect(() => {
    trackStart("badge_designer", "open");
  }, [trackStart]);

  const handleSave = () => {
    if (!name.trim()) return;
    const template: Partial<BadgeTemplate> = {
      name: name.trim(),
      participantType: participantTypes[0] || "General",
      participantTypes,
      backgroundColor,
      textColor,
      accentColor,
      width,
      height,
      labelRotation,
      includeQR,
      qrPosition,
      customQrPosition: qrPosition === 'custom' ? customQrPosition : undefined,
      qrCodeConfig,
      fontFamily,
      mergeFields,
      imageElements,
      designWatermark,
      watermarkOpacity,
      watermarkPosition,
      layoutMode,
      backSideMode: (layoutMode === 'foldable' || layoutMode === 'dual_side_card') ? backSideMode : 'blank',
      backSideMergeFields: (layoutMode === 'foldable' || layoutMode === 'dual_side_card') && backSideMode === 'custom' ? backSideMergeFields : [],
      backSideImageElements: (layoutMode === 'foldable' || layoutMode === 'dual_side_card') && backSideMode === 'custom' ? backSideImageElements : [],
      backSideIncludeQR: (layoutMode === 'foldable' || layoutMode === 'dual_side_card') && backSideMode === 'custom' ? backSideIncludeQR : false,
      backSideQrPosition: (layoutMode === 'foldable' || layoutMode === 'dual_side_card') && backSideMode === 'custom' ? backSideQrPosition : 'bottom-right',
      backSideCustomQrPosition: (layoutMode === 'foldable' || layoutMode === 'dual_side_card') && backSideMode === 'custom' && backSideQrPosition === 'custom' ? backSideCustomQrPosition : undefined,
      backSideQrCodeConfig: (layoutMode === 'foldable' || layoutMode === 'dual_side_card') && backSideMode === 'custom' && backSideIncludeQR ? backSideQrCodeConfig : undefined,
      backSideBackgroundColor: (layoutMode === 'foldable' || layoutMode === 'dual_side_card') ? backSideBackgroundColor : undefined,
      backSideAgenda: (layoutMode === 'foldable' || layoutMode === 'dual_side_card') && backSideMode === 'custom' ? backSideAgenda : undefined,
    };
    trackComplete("badge_designer", "save");
    onSave?.(template);
  };

  const applyPreset = (presetValue: string) => {
    const preset = QUICK_START_PRESETS.find(p => p.value === presetValue);
    if (preset) {
      setWidth(preset.width);
      setHeight(preset.height);
    }
  };

  const currentPreset = QUICK_START_PRESETS.find(p => p.width === width && p.height === height);

  if (!fontsReady && fontContext) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">Loading fonts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Tabbed Settings Panel */}
        <div className="lg:w-[480px] lg:shrink-0">
          <Tabs defaultValue="basic">
            <TabsList className="w-full justify-start mb-4">
              <TabsTrigger value="basic" className="uppercase font-semibold text-xs tracking-wide">Basic</TabsTrigger>
              <TabsTrigger value="design" className="uppercase font-semibold text-xs tracking-wide">Design</TabsTrigger>
              <TabsTrigger value="qr" className="uppercase font-semibold text-xs tracking-wide">QR</TabsTrigger>
              <TabsTrigger value="advanced" className="uppercase font-semibold text-xs tracking-wide">Advanced</TabsTrigger>
            </TabsList>

            {/* ─── BASIC TAB ─── */}
            <TabsContent value="basic" className="space-y-6 mt-0">
              <div className="space-y-3 p-4 bg-muted/40 rounded-lg border">
                <Label className="font-semibold">Quick Start</Label>
                <Select
                  value={currentPreset?.value || "custom"}
                  onValueChange={applyPreset}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a preset..." />
                  </SelectTrigger>
                  <SelectContent>
                    {QUICK_START_PRESETS.map((preset) => (
                      <SelectItem key={preset.value} value={preset.value}>
                        {preset.label}
                      </SelectItem>
                    ))}
                    {!currentPreset && (
                      <SelectItem value="custom" disabled>
                        Custom ({width}" × {height}")
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {currentPreset?.description || "Custom dimensions"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-name">
                  Template Name ({name.length}/50)
                </Label>
                <Input
                  id="template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 50))}
                  maxLength={50}
                  data-testid="input-template-name"
                />
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="badge-width">Width</Label>
                    <TouchNumberInput
                      value={width}
                      onChange={setWidth}
                      min={2}
                      max={8}
                      step={0.5}
                      suffix="in"
                      data-testid="input-badge-width"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="badge-height">Height</Label>
                    <TouchNumberInput
                      value={height}
                      onChange={setHeight}
                      min={2}
                      max={8}
                      step={0.5}
                      suffix="in"
                      data-testid="input-badge-height"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FlipVertical className="h-4 w-4" />
                  Layout Mode
                </Label>
                <Select
                  value={layoutMode}
                  onValueChange={(v: 'single' | 'foldable' | 'dual_side_card') => setLayoutMode(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single-sided</SelectItem>
                    <SelectItem value="foldable">Two-sided foldable</SelectItem>
                    <SelectItem value="dual_side_card">Dual-sided ID card</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {layoutMode === 'foldable'
                    ? `Prints at ${width}" × ${(height * 2).toFixed(1)}" with a fold line. Top half is the front, bottom half folds behind.`
                    : layoutMode === 'dual_side_card'
                    ? `Generates a 2-page PDF (front + back) for dual-sided card printers like the Zebra ZC300. Each side is ${width}" × ${height}".`
                    : 'Standard single-sided badge.'}
                </p>
                {(layoutMode === 'foldable' || layoutMode === 'dual_side_card') && (
                  <div className="space-y-2 mt-2">
                    <Label className="text-sm">Back Side Content</Label>
                    <Select
                      value={backSideMode}
                      onValueChange={(v: 'duplicate-rotate' | 'custom' | 'blank') => setBackSideMode(v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="duplicate-rotate">
                          <div className="flex items-center gap-2">
                            <Copy className="h-3 w-3" />
                            Duplicate & Rotate
                          </div>
                        </SelectItem>
                        <SelectItem value="custom">
                          <div className="flex items-center gap-2">
                            <Type className="h-3 w-3" />
                            Custom Design
                          </div>
                        </SelectItem>
                        <SelectItem value="blank">
                          <div className="flex items-center gap-2">
                            <Minus className="h-3 w-3" />
                            Blank
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {backSideMode === 'duplicate-rotate' && 'Front design is mirrored upside-down so both sides read correctly when folded.'}
                      {backSideMode === 'custom' && 'Design the back side independently with its own fields and images.'}
                      {backSideMode === 'blank' && 'Back side is left blank.'}
                    </p>
                    {backSideMode === 'custom' && (
                      <div className="space-y-4 pt-2 border-t">
                        <div className="space-y-2">
                          <Label className="text-xs">Back Side Background</Label>
                          <div className="flex gap-2">
                            <Input
                              type="color"
                              value={backSideBackgroundColor}
                              onChange={(e) => setBackSideBackgroundColor(e.target.value)}
                              className="w-12 h-9 p-1"
                            />
                            <Input
                              value={backSideBackgroundColor}
                              onChange={(e) => setBackSideBackgroundColor(e.target.value)}
                              className="flex-1 font-mono text-xs"
                            />
                          </div>
                        </div>

                        <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Back Side QR Code</div>
                          <div className="flex items-center justify-between">
                            <Label htmlFor="back-include-qr" className="text-xs">Include QR Code</Label>
                            <Button
                              variant={backSideIncludeQR ? "default" : "outline"}
                              size="sm"
                              onClick={() => setBackSideIncludeQR(!backSideIncludeQR)}
                            >
                              {backSideIncludeQR ? "Enabled" : "Disabled"}
                            </Button>
                          </div>
                          {backSideIncludeQR && (
                            <>
                              <div className="space-y-2">
                                <Label htmlFor="back-qr-position" className="text-xs">QR Position</Label>
                                <Select value={backSideQrPosition} onValueChange={setBackSideQrPosition}>
                                  <SelectTrigger id="back-qr-position">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="top-left">Top Left</SelectItem>
                                    <SelectItem value="top-center">Top Center</SelectItem>
                                    <SelectItem value="top-right">Top Right</SelectItem>
                                    <SelectItem value="bottom-left">Bottom Left</SelectItem>
                                    <SelectItem value="bottom-center">Bottom Center</SelectItem>
                                    <SelectItem value="bottom-right">Bottom Right</SelectItem>
                                    <SelectItem value="custom">Custom Position (Drag)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="back-qr-embed-type" className="text-xs">Embed Type</Label>
                                <Select
                                  value={backSideQrCodeConfig.embedType}
                                  onValueChange={(value: 'externalId' | 'externalProfileId' | 'simple' | 'json' | 'custom') => {
                                    const newFields = value === 'externalId' ? ['externalId'] : value === 'externalProfileId' ? ['externalProfileId'] : backSideQrCodeConfig.fields;
                                    setBackSideQrCodeConfig({ ...backSideQrCodeConfig, embedType: value, fields: newFields });
                                  }}
                                >
                                  <SelectTrigger id="back-qr-embed-type">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {qrEmbedTypes.map((type) => (
                                      <SelectItem key={type.value} value={type.value}>
                                        <div className="flex flex-col">
                                          <span>{type.label}</span>
                                          <span className="text-xs text-muted-foreground">{type.description}</span>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              {backSideQrCodeConfig.embedType !== 'externalId' && (
                                <div className="space-y-2">
                                  <Label className="text-xs">Fields to Include</Label>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="outline" className="w-full justify-between">
                                        <span className="truncate">
                                          {backSideQrCodeConfig.fields.length === 0
                                            ? "Select fields..."
                                            : backSideQrCodeConfig.fields.length === 1
                                            ? qrEmbedFields.find(f => f.value === backSideQrCodeConfig.fields[0])?.label
                                            : `${backSideQrCodeConfig.fields.length} fields selected`}
                                        </span>
                                        <ChevronDown className="h-4 w-4 opacity-50" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-56">
                                      <DropdownMenuLabel>Select QR embed fields</DropdownMenuLabel>
                                      <DropdownMenuSeparator />
                                      {qrEmbedFields.map((field) => (
                                        <DropdownMenuCheckboxItem
                                          key={field.value}
                                          checked={backSideQrCodeConfig.fields.includes(field.value)}
                                          onCheckedChange={(checked) => {
                                            const newFields = checked
                                              ? [...backSideQrCodeConfig.fields, field.value]
                                              : backSideQrCodeConfig.fields.filter(f => f !== field.value);
                                            setBackSideQrCodeConfig({ ...backSideQrCodeConfig, fields: newFields });
                                          }}
                                        >
                                          {field.label}
                                        </DropdownMenuCheckboxItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Back Side Agenda</div>
                          <div className="flex items-center justify-between">
                            <Label htmlFor="back-agenda-enabled" className="text-xs">Show Agenda</Label>
                            <Button
                              variant={backSideAgenda.enabled ? "default" : "outline"}
                              size="sm"
                              onClick={() => setBackSideAgenda({ ...backSideAgenda, enabled: !backSideAgenda.enabled })}
                            >
                              {backSideAgenda.enabled ? "Enabled" : "Disabled"}
                            </Button>
                          </div>
                          {backSideAgenda.enabled && (
                            <>
                              <div className="space-y-2">
                                <Label className="text-xs">Title</Label>
                                <Input
                                  value={backSideAgenda.title}
                                  onChange={(e) => setBackSideAgenda({ ...backSideAgenda, title: e.target.value })}
                                  placeholder="Event Schedule"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">Title Size (pt)</Label>
                                  <Input
                                    type="number"
                                    min={6}
                                    max={18}
                                    value={backSideAgenda.titleFontSize}
                                    onChange={(e) => setBackSideAgenda({ ...backSideAgenda, titleFontSize: parseInt(e.target.value) || 10 })}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Item Size (pt)</Label>
                                  <Input
                                    type="number"
                                    min={5}
                                    max={14}
                                    value={backSideAgenda.itemFontSize}
                                    onChange={(e) => setBackSideAgenda({ ...backSideAgenda, itemFontSize: parseInt(e.target.value) || 7 })}
                                  />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs">Schedule Items</Label>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setBackSideAgenda({
                                      ...backSideAgenda,
                                      items: [...backSideAgenda.items, { time: '', label: '' }],
                                    })}
                                  >
                                    Add Row
                                  </Button>
                                </div>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                  {backSideAgenda.items.map((item, idx) => (
                                    <div key={idx} className="flex gap-1 items-center">
                                      <Input
                                        className="w-24 text-xs h-7"
                                        value={item.time}
                                        placeholder="Time"
                                        onChange={(e) => {
                                          const updated = [...backSideAgenda.items];
                                          updated[idx] = { ...updated[idx], time: e.target.value };
                                          setBackSideAgenda({ ...backSideAgenda, items: updated });
                                        }}
                                      />
                                      <Input
                                        className="flex-1 text-xs h-7"
                                        value={item.label}
                                        placeholder="Session name"
                                        onChange={(e) => {
                                          const updated = [...backSideAgenda.items];
                                          updated[idx] = { ...updated[idx], label: e.target.value };
                                          setBackSideAgenda({ ...backSideAgenda, items: updated });
                                        }}
                                      />
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 shrink-0"
                                        onClick={() => {
                                          const updated = backSideAgenda.items.filter((_, i) => i !== idx);
                                          setBackSideAgenda({ ...backSideAgenda, items: updated });
                                        }}
                                      >
                                        ×
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ─── DESIGN TAB ─── */}
            <TabsContent value="design" className="space-y-6 mt-0">
              <div className="space-y-4">
                <Label className="font-semibold text-base">Colors</Label>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="bg-color">Background</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        id="bg-color"
                        type="color"
                        value={backgroundColor}
                        onChange={(e) => setBackgroundColor(e.target.value)}
                        className="w-10 h-9 p-1 shrink-0"
                        data-testid="input-bg-color"
                      />
                      <Input
                        value={backgroundColor}
                        onChange={(e) => setBackgroundColor(e.target.value)}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="text-color">Text</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        id="text-color"
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="w-10 h-9 p-1 shrink-0"
                        data-testid="input-text-color"
                      />
                      <Input
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="accent-color">Accent</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        id="accent-color"
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="w-10 h-9 p-1 shrink-0"
                        data-testid="input-accent-color"
                      />
                      <Input
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <Label className="font-semibold text-base">Typography</Label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="font-family">Font</Label>
                    {customerId && (
                      <FontUploadDialog
                        customerId={customerId}
                        onSuccess={() => fontContext?.refreshFonts?.()}
                      />
                    )}
                  </div>
                  <Select
                    value={fontFamily}
                    onValueChange={(value) => {
                      loadFont(value);
                      setFontFamily(value);
                    }}
                  >
                    <SelectTrigger id="font-family" data-testid="select-font-family">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fontContext?.fonts.webSafe && fontContext.fonts.webSafe.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Web Safe Fonts</SelectLabel>
                          {fontContext.fonts.webSafe.map((font) => (
                            <SelectItem 
                              key={font.family} 
                              value={font.family}
                              style={{ fontFamily: font.family }}
                            >
                              {font.displayName}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {fontContext?.fonts.google && fontContext.fonts.google.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Google Fonts</SelectLabel>
                          {fontContext.fonts.google.map((font) => (
                            <SelectItem 
                              key={font.family} 
                              value={font.family}
                              style={{ fontFamily: font.family }}
                            >
                              {font.displayName}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {fontContext?.fonts.custom && fontContext.fonts.custom.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Custom Fonts</SelectLabel>
                          {fontContext.fonts.custom.map((font) => (
                            <SelectItem 
                              key={font.family} 
                              value={font.family}
                              style={{ fontFamily: font.family }}
                            >
                              {font.displayName}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {!fontContext && (
                        <>
                          <SelectGroup>
                            <SelectLabel>Web Safe Fonts</SelectLabel>
                            {WEB_SAFE_FONTS.map((font) => (
                              <SelectItem 
                                key={font.family} 
                                value={font.family}
                                style={{ fontFamily: font.family }}
                              >
                                {font.displayName}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel>Google Fonts</SelectLabel>
                            {GOOGLE_FONTS.map((font) => (
                              <SelectItem 
                                key={font.family} 
                                value={font.family}
                                style={{ fontFamily: font.family }}
                              >
                                {font.displayName}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="label-rotation">Label Rotation</Label>
                <Select
                  value={labelRotation.toString()}
                  onValueChange={(v) => setLabelRotation(parseInt(v) as 0 | 90 | 180 | 270)}
                >
                  <SelectTrigger id="label-rotation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0° — No rotation</SelectItem>
                    <SelectItem value="90">90° — Rotate clockwise</SelectItem>
                    <SelectItem value="180">180° — Upside down</SelectItem>
                    <SelectItem value="270">270° — Counter-clockwise</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  For printers that feed sideways (e.g., Brother QL via AirPrint)
                </p>
              </div>
            </TabsContent>

            {/* ─── QR TAB ─── */}
            <TabsContent value="qr" className="space-y-6 mt-0">
              <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg border">
                <Checkbox
                  id="include-qr"
                  checked={includeQR}
                  onCheckedChange={(checked) => setIncludeQR(checked === true)}
                  data-testid="button-toggle-qr"
                />
                <Label htmlFor="include-qr" className="font-semibold cursor-pointer">
                  Include QR Code
                </Label>
              </div>

              {includeQR && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="qr-position">QR Position</Label>
                    <Select value={qrPosition} onValueChange={setQrPosition}>
                      <SelectTrigger id="qr-position" data-testid="select-qr-position">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="top-left">Top Left</SelectItem>
                        <SelectItem value="top-center">Top Center</SelectItem>
                        <SelectItem value="top-right">Top Right</SelectItem>
                        <SelectItem value="bottom-left">Bottom Left</SelectItem>
                        <SelectItem value="bottom-center">Bottom Center</SelectItem>
                        <SelectItem value="bottom-right">Bottom Right</SelectItem>
                        <SelectItem value="custom">Custom Position (Drag)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="qr-embed-type">Embed Type</Label>
                    <Select 
                      value={qrCodeConfig.embedType} 
                      onValueChange={(value: 'externalId' | 'externalProfileId' | 'simple' | 'json' | 'custom') => {
                        const newFields = value === 'externalId' ? ['externalId'] : value === 'externalProfileId' ? ['externalProfileId'] : qrCodeConfig.fields;
                        setQrCodeConfig({ ...qrCodeConfig, embedType: value, fields: newFields });
                      }}
                    >
                      <SelectTrigger id="qr-embed-type" data-testid="select-qr-embed-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {qrEmbedTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex flex-col">
                              <span>{type.label}</span>
                              <span className="text-xs text-muted-foreground">{type.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {qrEmbedTypes.find(t => t.value === qrCodeConfig.embedType)?.description}
                    </p>
                  </div>

                  {qrCodeConfig.embedType !== 'externalId' && (
                    <>
                      <div className="space-y-2">
                        <Label>Fields to Include</Label>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="w-full justify-between" data-testid="select-qr-fields">
                              <span className="truncate">
                                {qrCodeConfig.fields.length === 0
                                  ? "Select fields..."
                                  : qrCodeConfig.fields.length === 1
                                  ? qrEmbedFields.find(f => f.value === qrCodeConfig.fields[0])?.label
                                  : `${qrCodeConfig.fields.length} fields selected`}
                              </span>
                              <ChevronDown className="h-4 w-4 opacity-50" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-56">
                            <DropdownMenuLabel>Select QR embed fields</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {qrEmbedFields.map((field) => (
                              <DropdownMenuCheckboxItem
                                key={field.value}
                                checked={qrCodeConfig.fields.includes(field.value)}
                                onCheckedChange={(checked) => {
                                  const newFields = checked
                                    ? [...qrCodeConfig.fields, field.value]
                                    : qrCodeConfig.fields.filter(f => f !== field.value);
                                  setQrCodeConfig({ ...qrCodeConfig, fields: newFields });
                                }}
                                data-testid={`checkbox-qr-field-${field.value}`}
                              >
                                {field.label}
                              </DropdownMenuCheckboxItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {qrCodeConfig.fields.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {qrCodeConfig.fields.map((field) => (
                              <Badge key={field} variant="secondary" className="text-xs">
                                {qrEmbedFields.find(f => f.value === field)?.label || field}
                                <button
                                  type="button"
                                  className="ml-1 hover:text-destructive"
                                  onClick={() => setQrCodeConfig({
                                    ...qrCodeConfig,
                                    fields: qrCodeConfig.fields.filter(f => f !== field)
                                  })}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {(qrCodeConfig.embedType === 'simple' || qrCodeConfig.embedType === 'custom') && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label htmlFor="qr-separator">Separator</Label>
                            <Select 
                              value={qrCodeConfig.separator} 
                              onValueChange={(value) => setQrCodeConfig({ ...qrCodeConfig, separator: value })}
                            >
                              <SelectTrigger id="qr-separator" data-testid="select-qr-separator">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="|">Pipe ( | )</SelectItem>
                                <SelectItem value="-">Dash ( - )</SelectItem>
                                <SelectItem value=",">Comma ( , )</SelectItem>
                                <SelectItem value=";">Semicolon ( ; )</SelectItem>
                                <SelectItem value=":">Colon ( : )</SelectItem>
                                <SelectItem value="_">Underscore ( _ )</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="qr-include-label" className="text-xs">Include Field Labels</Label>
                            <Button
                              variant={qrCodeConfig.includeLabel ? "default" : "outline"}
                              size="sm"
                              className="w-full"
                              onClick={() => setQrCodeConfig({ ...qrCodeConfig, includeLabel: !qrCodeConfig.includeLabel })}
                              data-testid="button-toggle-qr-labels"
                            >
                              {qrCodeConfig.includeLabel ? "Yes" : "No"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="p-3 bg-muted rounded-lg">
                    <Label className="text-xs text-muted-foreground mb-1 block">QR Preview:</Label>
                    <code className="text-xs font-mono block break-all">
                      {qrCodeConfig.embedType === 'externalId' && 'EXT-VIP-2025-001'}
                      {qrCodeConfig.embedType === 'simple' && (
                        qrCodeConfig.includeLabel
                          ? qrCodeConfig.fields.map(f => `${f}:Sample`).join(qrCodeConfig.separator)
                          : qrCodeConfig.fields.map(() => 'Sample').join(qrCodeConfig.separator)
                      )}
                      {qrCodeConfig.embedType === 'json' && JSON.stringify(
                        Object.fromEntries(qrCodeConfig.fields.map(f => [f, 'Sample']))
                      )}
                      {qrCodeConfig.embedType === 'custom' && (
                        qrCodeConfig.includeLabel
                          ? qrCodeConfig.fields.map(f => `${f}=Sample`).join(qrCodeConfig.separator)
                          : qrCodeConfig.fields.map(() => 'Sample').join(qrCodeConfig.separator)
                      )}
                    </code>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ─── ADVANCED TAB ─── */}
            <TabsContent value="advanced" className="space-y-6 mt-0">
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">Advanced Settings</span> — Most users don't need these. Adjust only if you have specific requirements.
                </p>
              </div>

              <Collapsible open={watermarkOpen} onOpenChange={setWatermarkOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 font-semibold hover:text-primary transition-colors">
                  {watermarkOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <ImageIcon className="h-4 w-4" />
                  Design Watermark
                  {designWatermark && (
                    <Badge variant="secondary" className="ml-auto text-xs">Active</Badge>
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
                  <p className="text-xs text-muted-foreground">
                    Upload an image of your pre-printed badge stock to help align fields. This is for design only and won't print.
                  </p>
                  {!designWatermark ? (
                    <div className="flex gap-2">
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              setDesignWatermark(event.target?.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="text-xs"
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-16 h-12 border rounded overflow-hidden bg-muted">
                            <img 
                              src={designWatermark} 
                              alt="Watermark preview" 
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div className="flex-1 space-y-1">
                            <Label className="text-xs">Opacity: {watermarkOpacity}%</Label>
                            <Slider
                              value={[watermarkOpacity]}
                              onValueChange={([value]) => setWatermarkOpacity(value)}
                              min={10}
                              max={80}
                              step={5}
                              className="w-48"
                            />
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDesignWatermark(null)}
                          className="h-7 px-2 text-destructive hover:text-destructive shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Remove
                        </Button>
                      </div>

                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="show-watermark"
                          checked={showWatermark}
                          onCheckedChange={(checked) => setShowWatermark(checked === true)}
                        />
                        <Label htmlFor="show-watermark" className="text-xs cursor-pointer">
                          Show on canvas
                        </Label>
                      </div>

                      <p className="text-xs text-muted-foreground italic">
                        Position & Size controls available below
                      </p>

                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Position & Size</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">X Offset</Label>
                            <TouchNumberInput
                              value={watermarkPosition.x}
                              onChange={(v) => setWatermarkPosition({...watermarkPosition, x: v})}
                              min={-50}
                              max={50}
                              suffix="%"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Y Offset</Label>
                            <TouchNumberInput
                              value={watermarkPosition.y}
                              onChange={(v) => setWatermarkPosition({...watermarkPosition, y: v})}
                              min={-50}
                              max={50}
                              suffix="%"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Width</Label>
                            <TouchNumberInput
                              value={watermarkPosition.width}
                              onChange={(v) => setWatermarkPosition({...watermarkPosition, width: v})}
                              min={10}
                              max={200}
                              step={5}
                              suffix="%"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Height</Label>
                            <TouchNumberInput
                              value={watermarkPosition.height}
                              onChange={(v) => setWatermarkPosition({...watermarkPosition, height: v})}
                              min={10}
                              max={200}
                              step={5}
                              suffix="%"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Fit Mode</Label>
                          <Select
                            value={watermarkPosition.fit}
                            onValueChange={(value: 'cover' | 'contain' | 'stretch') => setWatermarkPosition({...watermarkPosition, fit: value})}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cover">Cover (fill, may crop)</SelectItem>
                              <SelectItem value="contain">Contain (fit inside)</SelectItem>
                              <SelectItem value="stretch">Stretch (exact size)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-7 text-xs"
                          onClick={() => setWatermarkPosition({ x: 0, y: 0, width: 100, height: 100, fit: 'cover' })}
                        >
                          Reset to Default
                        </Button>
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right: Live Preview */}
        <div className="flex-1 min-w-0">
          <Card className="sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Live Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DraggableBadgeCanvas
                width={width}
                height={height}
                backgroundColor={backgroundColor}
                textColor={textColor}
                accentColor={accentColor}
                fontFamily={fontFamily}
                mergeFields={mergeFields}
                panelLabel={(layoutMode === 'foldable' || layoutMode === 'dual_side_card') ? 'Front Side' : undefined}
                imageElements={imageElements}
                includeQR={includeQR}
                qrPosition={qrPosition}
                customQrPosition={customQrPosition}
                onUpdateQrPosition={(pos) => setCustomQrPosition(pos)}
                onUpdateMergeField={updateMergeField}
                onUpdateImageElement={updateImageElement}
                onRemoveImageElement={removeImageElement}
                onAddImageElement={addImageElement}
                onAddMergeField={(field) => {
                  setMergeFields([...mergeFields, field]);
                  trackComplete("badge_designer", "add_field", { fieldType: field.field });
                }}
                onRemoveMergeField={removeMergeField}
                availableFields={availableFields}
                onPreviewFullSize={() => {
                  trackComplete("badge_designer", "preview");
                  setShowPreviewModal(true);
                }}
                designWatermark={showWatermark ? designWatermark : null}
                watermarkOpacity={watermarkOpacity}
                watermarkPosition={watermarkPosition}
              />

              {(layoutMode === 'foldable' || layoutMode === 'dual_side_card') && (
                <div className="space-y-2">
                  {layoutMode === 'foldable' && (
                    <div className="flex items-center gap-2 py-1">
                      <div className="flex-1 border-t-2 border-dashed border-muted-foreground/40" />
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1 px-1">
                        <FlipVertical className="h-2.5 w-2.5" />
                        Fold
                      </span>
                      <div className="flex-1 border-t-2 border-dashed border-muted-foreground/40" />
                    </div>
                  )}
                  {layoutMode === 'dual_side_card' && (
                    <div className="flex items-center gap-2 py-1">
                      <div className="flex-1 border-t border-primary/40" />
                      <span className="text-[10px] text-primary flex items-center gap-1 px-1 font-medium">
                        Page 2 — Card Back
                      </span>
                      <div className="flex-1 border-t border-primary/40" />
                    </div>
                  )}
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Back Side {backSideMode === 'duplicate-rotate' && '(Duplicate & Rotate)'}
                    {backSideMode === 'blank' && '(Blank)'}
                  </div>
                  {backSideMode === 'duplicate-rotate' && (
                    <div
                      className="relative rounded-lg border overflow-hidden mx-auto opacity-60"
                      style={{
                        width: '100%',
                        aspectRatio: `${width} / ${height}`,
                        maxWidth: `${badgeWidthPx}px`,
                        backgroundColor,
                        transform: 'rotate(180deg)',
                      }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[10px] text-muted-foreground bg-background/80 px-2 py-1 rounded" style={{ transform: 'rotate(180deg)' }}>
                          Rotated copy of front
                        </span>
                      </div>
                    </div>
                  )}
                  {backSideMode === 'blank' && (
                    <div
                      className="relative rounded-lg border-2 border-dashed overflow-hidden mx-auto flex items-center justify-center"
                      style={{
                        width: '100%',
                        aspectRatio: `${width} / ${height}`,
                        maxWidth: `${badgeWidthPx}px`,
                        backgroundColor: backSideBackgroundColor || backgroundColor,
                      }}
                    >
                      <span className="text-[10px] text-muted-foreground">Blank back side</span>
                    </div>
                  )}
                  {backSideMode === 'custom' && (
                      <DraggableBadgeCanvas
                        width={width}
                        height={height}
                        backgroundColor={backSideBackgroundColor || backgroundColor}
                        textColor={textColor}
                        accentColor={accentColor}
                        fontFamily={fontFamily}
                        mergeFields={backSideMergeFields}
                        imageElements={backSideImageElements}
                        includeQR={backSideIncludeQR}
                        qrPosition={backSideQrPosition}
                        customQrPosition={backSideCustomQrPosition}
                        onUpdateQrPosition={(pos) => setBackSideCustomQrPosition(pos)}
                        onUpdateMergeField={updateBackSideMergeField}
                        onUpdateImageElement={updateBackSideImageElement}
                        onRemoveImageElement={removeBackSideImageElement}
                        onAddImageElement={addBackSideImageElement}
                        onAddMergeField={(field) => {
                          setBackSideMergeFields([...backSideMergeFields, field]);
                        }}
                        onRemoveMergeField={removeBackSideMergeField}
                        availableFields={availableFields}
                        panelLabel="Back Side (Custom)"
                      />
                  )}
                </div>
              )}

              <p className="text-[10px] text-muted-foreground text-center">
                Drag to move · Snap to guides
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          disabled={isSaving || !name.trim()}
          onClick={handleSave}
          data-testid="button-save-template"
        >
          {isSaving ? "Saving..." : (initialData ? "Update Template" : "Save Template")}
        </Button>
      </div>

      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Badge Preview - Full Size</DialogTitle>
            <DialogDescription>
              Actual size: {width}" × {height}" at 96 DPI ({badgeWidthPx}px × {badgeHeightPx}px)
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center p-4 overflow-auto">
            <div
              className="relative border-2 border-border rounded-lg overflow-hidden"
              style={{
                width: `${badgeWidthPx}px`,
                height: `${badgeHeightPx}px`,
                backgroundColor,
                minWidth: `${badgeWidthPx}px`,
              }}
              data-testid="preview-fullsize-canvas"
            >
              {imageElements
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((img) => (
                  <div
                    key={img.id}
                    className="absolute"
                    style={{
                      left: `${img.position.x}px`,
                      top: `${img.position.y}px`,
                      width: `${img.size.width}px`,
                      height: `${img.size.height}px`,
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

              {mergeFields.map((field, index) => (
                <div
                  key={index}
                  className="absolute"
                  style={{
                    left: `${field.position.x}px`,
                    top: `${field.position.y}px`,
                    color: textColor,
                    fontSize: `${field.fontSize}pt`,
                    fontFamily: fontFamily,
                    fontWeight: field.fontWeight || '400',
                    fontStyle: field.fontStyle || 'normal',
                    textAlign: field.align,
                  }}
                >
                  {field.label}
                </div>
              ))}

              {includeQR && (() => {
                const qrSize = Math.min(badgeWidthPx, badgeHeightPx) * 0.3;
                const positions: Record<string, { x: number; y: number }> = {
                  'top-left': { x: 10, y: 10 },
                  'top-center': { x: (badgeWidthPx - qrSize) / 2, y: 10 },
                  'top-right': { x: badgeWidthPx - qrSize - 10, y: 10 },
                  'bottom-left': { x: 10, y: badgeHeightPx - qrSize - 10 },
                  'bottom-center': { x: (badgeWidthPx - qrSize) / 2, y: badgeHeightPx - qrSize - 10 },
                  'bottom-right': { x: badgeWidthPx - qrSize - 10, y: badgeHeightPx - qrSize - 10 },
                  'custom': customQrPosition,
                };
                const pos = positions[qrPosition];
                return (
                  <div
                    className="absolute bg-white border-2 flex items-center justify-center text-xs font-mono"
                    style={{
                      left: `${pos.x}px`,
                      top: `${pos.y}px`,
                      width: `${qrSize}px`,
                      height: `${qrSize}px`,
                      borderColor: textColor,
                    }}
                  >
                    QR
                  </div>
                );
              })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function BadgeDesigner(props: BadgeDesignerProps) {
  if (props.customerId) {
    return (
      <FontProvider customerId={props.customerId}>
        <BadgeDesignerInner {...props} />
      </FontProvider>
    );
  }
  return <BadgeDesignerInner {...props} />;
}
