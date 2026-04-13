import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  ArrowLeft, 
  Upload, 
  Trash2, 
  Type, 
  FileType,
  AlertCircle,
  Eye,
  Plus,
  Calendar,
  HardDrive
} from "lucide-react";
import type { Customer, CustomFont } from "@shared/schema";
import { useRef } from "react";

const FONT_WEIGHTS = [
  { value: "100", label: "Thin" },
  { value: "200", label: "Extra Light" },
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semi Bold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extra Bold" },
  { value: "900", label: "Black" },
];

const ALLOWED_EXTENSIONS = ["woff", "woff2", "ttf", "otf"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(dateValue: string | Date): string {
  const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getWeightLabel(weight: string): string {
  return FONT_WEIGHTS.find(w => w.value === weight)?.label || weight;
}

interface FontPreviewProps {
  font: CustomFont;
}

function FontPreview({ font }: FontPreviewProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  useState(() => {
    const loadFont = async () => {
      try {
        const fontFace = new FontFace(
          font.fontFamily,
          `url(data:${font.mimeType};base64,${font.fontData})`,
          {
            weight: font.fontWeight,
            style: font.fontStyle,
          }
        );
        await fontFace.load();
        document.fonts.add(fontFace);
        setIsLoaded(true);
      } catch (error) {
        console.error("Failed to load font for preview:", error);
      }
    };
    loadFont();
  });

  return (
    <div 
      className="p-4 rounded-lg border bg-muted/30"
      style={{ 
        fontFamily: isLoaded ? font.fontFamily : "inherit",
        fontWeight: font.fontWeight,
        fontStyle: font.fontStyle,
      }}
    >
      <p className="text-2xl mb-2">The quick brown fox jumps over the lazy dog</p>
      <p className="text-lg">ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>
      <p className="text-lg">abcdefghijklmnopqrstuvwxyz</p>
      <p className="text-lg">0123456789 !@#$%^&*()</p>
    </div>
  );
}

export default function CustomerFonts() {
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId || "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewFont, setPreviewFont] = useState<CustomFont | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [fontFamily, setFontFamily] = useState("");
  const [fontWeight, setFontWeight] = useState("400");
  const [fontStyle, setFontStyle] = useState<"normal" | "italic">("normal");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: customer, isLoading: customerLoading } = useQuery<Customer>({
    queryKey: [`/api/customers/${customerId}`],
    enabled: !!customerId,
  });

  const { data: fonts = [], isLoading: fontsLoading } = useQuery<CustomFont[]>({
    queryKey: ["/api/customers", customerId, "fonts"],
    enabled: !!customerId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (formData: {
      displayName: string;
      fontFamily: string;
      fontWeight: string;
      fontStyle: string;
      mimeType: string;
      fileSize: number;
      fontData: string;
    }) => {
      return await apiRequest("POST", `/api/customers/${customerId}/fonts`, formData);
    },
    onSuccess: () => {
      toast({
        title: "Font uploaded successfully",
        description: `"${displayName}" is now available for all events in this account.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "fonts"] });
      resetUploadForm();
      setUploadDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload font. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (fontId: string) => {
      return await apiRequest("DELETE", `/api/fonts/${fontId}`);
    },
    onSuccess: () => {
      toast({
        title: "Font deleted",
        description: "The font has been removed from your account.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "fonts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete font. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetUploadForm = () => {
    setDisplayName("");
    setFontFamily("");
    setFontWeight("400");
    setFontStyle("normal");
    setSelectedFile(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setUploadError(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setUploadError("Font file is too large. Maximum size is 5MB.");
      setSelectedFile(null);
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      setUploadError("Invalid file type. Allowed: WOFF, WOFF2, TTF, OTF");
      setSelectedFile(null);
      return;
    }

    const baseName = file.name.replace(/\.(woff2?|ttf|otf)$/i, "");
    const cleanName = baseName.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
    
    setSelectedFile(file);
    if (!displayName) {
      setDisplayName(cleanName);
    }
    if (!fontFamily) {
      setFontFamily(cleanName.replace(/\s+/g, ""));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !displayName || !fontFamily) {
      setUploadError("Please fill in all required fields and select a font file.");
      return;
    }

    setUploadError(null);

    try {
      const reader = new FileReader();
      
      reader.onload = async () => {
        const result = reader.result as string;
        const base64Data = result.split(",")[1];
        
        let mimeType = selectedFile.type;
        if (!mimeType) {
          const ext = selectedFile.name.split(".").pop()?.toLowerCase();
          switch (ext) {
            case "woff": mimeType = "font/woff"; break;
            case "woff2": mimeType = "font/woff2"; break;
            case "ttf": mimeType = "font/ttf"; break;
            case "otf": mimeType = "application/x-font-opentype"; break;
          }
        }
        
        uploadMutation.mutate({
          displayName,
          fontFamily,
          fontWeight,
          fontStyle,
          mimeType,
          fileSize: selectedFile.size,
          fontData: base64Data,
        });
      };
      
      reader.onerror = () => {
        setUploadError("Failed to read font file. Please try again.");
      };
      
      reader.readAsDataURL(selectedFile);
    } catch {
      setUploadError("Failed to process font file. Please try again.");
    }
  };

  if (customerLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <p className="text-muted-foreground">Customer not found</p>
        <Button variant="outline" onClick={() => setLocation("/customers")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Customers
        </Button>
      </div>
    );
  }

  const totalSize = fonts.reduce((sum, f) => sum + f.fileSize, 0);

  return (
    <div className="space-y-6" data-testid="page-customer-fonts">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation(`/customers/${customerId}`)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Type className="h-6 w-6" />
              Custom Fonts
            </h1>
            <p className="text-muted-foreground">{customer.name}</p>
          </div>
        </div>
        
        <Dialog open={uploadDialogOpen} onOpenChange={(open) => {
          setUploadDialogOpen(open);
          if (!open) resetUploadForm();
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-upload-font">
              <Plus className="h-4 w-4 mr-2" />
              Upload Font
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Upload Custom Font</DialogTitle>
              <DialogDescription>
                Upload a font file to use in badge designs. Supported formats: WOFF, WOFF2, TTF, OTF (max 5MB).
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="font-file">Font File *</Label>
                <div className="flex gap-2">
                  <Input
                    ref={fileInputRef}
                    id="font-file"
                    type="file"
                    accept=".woff,.woff2,.ttf,.otf"
                    onChange={handleFileSelect}
                    className="flex-1"
                    data-testid="input-font-file"
                  />
                </div>
                {selectedFile && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <FileType className="h-3 w-3" />
                    {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="display-name">Display Name *</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g., Roboto Bold"
                  data-testid="input-display-name"
                />
                <p className="text-xs text-muted-foreground">
                  The name shown in the font selector
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="font-family">CSS Font Family *</Label>
                <Input
                  id="font-family"
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  placeholder="e.g., RobotoBold"
                  data-testid="input-font-family"
                />
                <p className="text-xs text-muted-foreground">
                  The CSS font-family name (no spaces recommended)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="font-weight">Font Weight</Label>
                  <Select value={fontWeight} onValueChange={setFontWeight}>
                    <SelectTrigger id="font-weight" data-testid="select-font-weight">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_WEIGHTS.map((w) => (
                        <SelectItem key={w.value} value={w.value}>
                          {w.label} ({w.value})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="font-style">Font Style</Label>
                  <Select value={fontStyle} onValueChange={(v) => setFontStyle(v as "normal" | "italic")}>
                    <SelectTrigger id="font-style" data-testid="select-font-style">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="italic">Italic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {uploadError && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {uploadError}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleUpload} 
                disabled={uploadMutation.isPending || !selectedFile}
                data-testid="button-confirm-upload"
              >
                {uploadMutation.isPending ? (
                  <>
                    <Upload className="h-4 w-4 mr-2 animate-pulse" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Font
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Fonts</CardDescription>
            <CardTitle className="text-3xl">{fonts.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Storage Used</CardDescription>
            <CardTitle className="text-3xl">{formatFileSize(totalSize)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Available Everywhere</CardDescription>
            <CardTitle className="text-lg mt-1">All events in this account can use these fonts</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Font Library</CardTitle>
          <CardDescription>
            Custom fonts uploaded to this account. These fonts are available in the badge designer for all events.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {fontsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : fonts.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <Type className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <h3 className="font-medium">No custom fonts yet</h3>
                <p className="text-sm text-muted-foreground">
                  Upload a custom font to use in your badge designs
                </p>
              </div>
              <Button onClick={() => setUploadDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload Your First Font
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Font Name</TableHead>
                    <TableHead>Family</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead>Style</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fonts.map((font) => (
                    <TableRow key={font.id} data-testid={`row-font-${font.id}`}>
                      <TableCell className="font-medium">{font.displayName}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">
                          {font.fontFamily}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{getWeightLabel(font.fontWeight)}</Badge>
                      </TableCell>
                      <TableCell className="capitalize">{font.fontStyle}</TableCell>
                      <TableCell>{formatFileSize(font.fileSize)}</TableCell>
                      <TableCell>{formatDate(font.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => setPreviewFont(font)}
                                data-testid={`button-preview-font-${font.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[600px]">
                              <DialogHeader>
                                <DialogTitle>{font.displayName}</DialogTitle>
                                <DialogDescription>
                                  Font preview - {font.fontFamily} ({getWeightLabel(font.fontWeight)}, {font.fontStyle})
                                </DialogDescription>
                              </DialogHeader>
                              <FontPreview font={font} />
                            </DialogContent>
                          </Dialog>
                          
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                data-testid={`button-delete-font-${font.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Font</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{font.displayName}"? This action cannot be undone.
                                  Badge templates using this font will fall back to a default font.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(font.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  data-testid={`button-confirm-delete-font-${font.id}`}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How to Use Custom Fonts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong>1. Upload a font</strong> - Click "Upload Font" and select a WOFF, WOFF2, TTF, or OTF file.
          </p>
          <p>
            <strong>2. Open Badge Designer</strong> - Go to any event and open the badge template editor.
          </p>
          <p>
            <strong>3. Select your font</strong> - In the font dropdown, look for "Custom Fonts" section at the bottom.
          </p>
          <Separator className="my-4" />
          <p className="text-xs">
            Tip: For best print quality, use fonts with clear licensing for commercial use. 
            Recommended formats: WOFF2 (smallest), WOFF, or TTF.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
