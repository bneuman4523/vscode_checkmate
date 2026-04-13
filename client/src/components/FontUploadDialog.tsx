import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, FileType, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface FontUploadDialogProps {
  customerId: string;
  onSuccess?: () => void;
}

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

const ALLOWED_MIME_TYPES = [
  "font/woff",
  "font/woff2", 
  "font/ttf",
  "font/otf",
  "application/font-woff",
  "application/font-woff2",
  "application/x-font-ttf",
  "application/x-font-opentype",
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default function FontUploadDialog({ customerId, onSuccess }: FontUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [fontFamily, setFontFamily] = useState("");
  const [fontWeight, setFontWeight] = useState("400");
  const [fontStyle, setFontStyle] = useState<"normal" | "italic">("normal");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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
        description: `"${displayName}" is now available in the font list.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "fonts"] });
      resetForm();
      setOpen(false);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload font. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setDisplayName("");
    setFontFamily("");
    setFontWeight("400");
    setFontStyle("normal");
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      setError("Font file is too large. Maximum size is 5MB.");
      setSelectedFile(null);
      return;
    }

    // Derive font family name from filename
    const baseName = file.name.replace(/\.(woff2?|ttf|otf)$/i, "");
    const cleanName = baseName
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    
    setSelectedFile(file);
    if (!displayName) {
      setDisplayName(cleanName);
    }
    if (!fontFamily) {
      // Convert to valid CSS font-family name
      setFontFamily(cleanName.replace(/\s+/g, ""));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !displayName || !fontFamily) {
      setError("Please fill in all required fields and select a font file.");
      return;
    }

    setError(null);

    try {
      // Read file as base64
      const reader = new FileReader();
      
      reader.onload = async () => {
        const result = reader.result as string;
        // Extract base64 data (remove data:mime;base64, prefix)
        const base64Data = result.split(",")[1];
        
        // Determine MIME type
        let mimeType = selectedFile.type;
        if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType)) {
          // Infer from extension
          const ext = selectedFile.name.split(".").pop()?.toLowerCase();
          switch (ext) {
            case "woff":
              mimeType = "font/woff";
              break;
            case "woff2":
              mimeType = "font/woff2";
              break;
            case "ttf":
              mimeType = "font/ttf";
              break;
            case "otf":
              mimeType = "font/otf";
              break;
            default:
              setError("Unsupported font format. Please use WOFF, WOFF2, TTF, or OTF.");
              return;
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
        setError("Failed to read font file. Please try again.");
      };

      reader.readAsDataURL(selectedFile);
    } catch (err) {
      setError("Failed to process font file. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetForm();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-upload-font">
          <Upload className="h-4 w-4 mr-2" />
          Upload Font
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Custom Font</DialogTitle>
          <DialogDescription>
            Upload a font file (WOFF, WOFF2, TTF, or OTF) to use in your badge designs.
            Maximum file size: 5MB.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="font-file">Font File</Label>
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
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <FileType className="h-4 w-4" />
                {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="display-name">Display Name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g., My Custom Font"
              data-testid="input-display-name"
            />
            <p className="text-xs text-muted-foreground">
              The name shown in the font selector
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="font-family-name">Font Family Name</Label>
            <Input
              id="font-family-name"
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              placeholder="e.g., MyCustomFont"
              data-testid="input-font-family"
            />
            <p className="text-xs text-muted-foreground">
              CSS font-family name (no spaces recommended)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Weight</Label>
              <Select value={fontWeight} onValueChange={setFontWeight}>
                <SelectTrigger data-testid="select-font-weight">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_WEIGHTS.map((weight) => (
                    <SelectItem key={weight.value} value={weight.value}>
                      {weight.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Style</Label>
              <Select value={fontStyle} onValueChange={(v: "normal" | "italic") => setFontStyle(v)}>
                <SelectTrigger data-testid="select-font-style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="italic">Italic</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            data-testid="button-cancel-upload"
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || !displayName || !fontFamily || uploadMutation.isPending}
            data-testid="button-submit-upload"
          >
            {uploadMutation.isPending ? "Uploading..." : "Upload Font"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
