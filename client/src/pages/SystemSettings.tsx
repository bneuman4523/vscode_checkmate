import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Image, Trash2, Upload, Palette, Sparkles, RotateCcw, Check, ImagePlus, X, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LibraryImage {
  url: string;
  name: string;
  uploadedAt: string;
}

interface SystemSetting {
  id: string;
  key: string;
  value: string | null;
  jsonValue: object | null;
  description: string | null;
  updatedAt: string;
}

export default function SystemSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState("#1a1a2e");
  const [deleteTarget, setDeleteTarget] = useState<LibraryImage | null>(null);

  const { data: settings, isLoading } = useQuery<SystemSetting[]>({
    queryKey: ["/api/admin/settings"],
    queryFn: async () => {
      const response = await fetch("/api/admin/settings", { credentials: "include" });
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("Super admin access required");
        }
        throw new Error("Failed to load settings");
      }
      return response.json();
    },
  });

  const loginBackgroundSetting = settings?.find(s => s.key === "login_background_image");
  const loginBackgroundColorSetting = settings?.find(s => s.key === "login_background_color");
  const loginBackgroundLibrarySetting = settings?.find(s => s.key === "login_background_library");
  const badgeFlipSetting = settings?.find(s => s.key === "feature_badge_flip_preview");
  const betaFeedbackSetting = settings?.find(s => s.key === "feature_beta_feedback");

  const libraryImages: LibraryImage[] = loginBackgroundLibrarySetting?.jsonValue
    ? (loginBackgroundLibrarySetting.jsonValue as LibraryImage[])
    : [];
  const activeImageUrl = loginBackgroundSetting?.value || null;

  useEffect(() => {
    if (loginBackgroundColorSetting?.value) {
      setBackgroundColor(loginBackgroundColorSetting.value);
    }
  }, [loginBackgroundColorSetting?.value]);

  useEffect(() => {
    if (activeImageUrl && libraryImages.length === 0 && settings && !loginBackgroundLibrarySetting) {
      const seedImage: LibraryImage = {
        url: activeImageUrl,
        name: "Background",
        uploadedAt: new Date().toISOString(),
      };
      fetch("/api/admin/settings/login_background_library", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value: null, jsonValue: [seedImage] }),
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      });
    }
  }, [activeImageUrl, libraryImages.length, settings, loginBackgroundLibrarySetting]);

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value, jsonValue }: { key: string; value?: string | null; jsonValue?: any }) => {
      const response = await fetch(`/api/admin/settings/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value: value ?? null, ...(jsonValue !== undefined ? { jsonValue } : {}) }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update setting");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save setting",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteSettingMutation = useMutation({
    mutationFn: async (key: string) => {
      const response = await fetch(`/api/admin/settings/${key}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete setting");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({
        title: "Setting removed",
        description: "The setting has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove setting",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file (JPG, PNG, WebP).",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 10MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const urlRes = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });

      if (!urlRes.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadURL, objectPath } = await urlRes.json();

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload file");
      }

      const newImage: LibraryImage = {
        url: objectPath,
        name: file.name,
        uploadedAt: new Date().toISOString(),
      };
      const updatedLibrary = [...libraryImages, newImage];

      await updateSettingMutation.mutateAsync({
        key: "login_background_library",
        value: null,
        jsonValue: updatedLibrary,
      });

      await updateSettingMutation.mutateAsync({
        key: "login_background_image",
        value: objectPath,
      });

      toast({
        title: "Background uploaded",
        description: "Image added to library and set as active background.",
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload image",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSelectBackground = (url: string) => {
    updateSettingMutation.mutate({
      key: "login_background_image",
      value: url,
    }, {
      onSuccess: () => {
        toast({
          title: "Background updated",
          description: "The login background has been changed.",
        });
      }
    });
  };

  const handleRemoveBackground = () => {
    deleteSettingMutation.mutate("login_background_image");
  };

  const handleDeleteFromLibrary = (image: LibraryImage) => {
    const updatedLibrary = libraryImages.filter(i => i.url !== image.url);
    const wasActive = activeImageUrl === image.url;

    updateSettingMutation.mutate({
      key: "login_background_library",
      value: null,
      jsonValue: updatedLibrary.length > 0 ? updatedLibrary : [],
    }, {
      onSuccess: () => {
        if (wasActive) {
          deleteSettingMutation.mutate("login_background_image");
        }
        toast({
          title: "Image removed",
          description: "The image has been removed from the library.",
        });
        setDeleteTarget(null);
      }
    });
  };

  const handleSaveBackgroundColor = () => {
    updateSettingMutation.mutate({
      key: "login_background_color",
      value: backgroundColor,
    }, {
      onSuccess: () => {
        toast({
          title: "Color saved",
          description: "The background color has been updated.",
        });
      }
    });
  };

  const handleRemoveBackgroundColor = () => {
    deleteSettingMutation.mutate("login_background_color");
    setBackgroundColor("#1a1a2e");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">System Settings</h1>
        <p className="text-muted-foreground">
          Configure global application settings
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Login Background Color
          </CardTitle>
          <CardDescription>
            Set a background color for all login pages. This will be visible if no image is set, or as a fallback.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="space-y-2">
              <Label htmlFor="bgColor">Background Color</Label>
              <div className="flex gap-2">
                <Input
                  id="bgColor"
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  type="text"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  placeholder="#1a1a2e"
                  className="w-28 font-mono"
                />
              </div>
            </div>
            <div
              className="h-20 w-32 rounded-md border"
              style={{ backgroundColor }}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSaveBackgroundColor}
              disabled={updateSettingMutation.isPending}
            >
              {updateSettingMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Palette className="h-4 w-4 mr-2" />
              )}
              Save Color
            </Button>
            {loginBackgroundColorSetting?.value && (
              <Button
                variant="outline"
                onClick={handleRemoveBackgroundColor}
                disabled={deleteSettingMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Reset to Default
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Login Background Library
          </CardTitle>
          <CardDescription>
            Upload and manage background images for login pages. Select which image to use as the active background, or upload a new one. The image overlays the background color.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {libraryImages.map((image) => {
              const isActive = activeImageUrl === image.url;
              return (
                <div
                  key={image.url}
                  className={`group relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all hover:shadow-md ${
                    isActive
                      ? "border-[#2FB36D] ring-2 ring-[#2FB36D]/20"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                  onClick={() => handleSelectBackground(image.url)}
                >
                  <div className="aspect-video">
                    <img
                      src={image.url}
                      alt={image.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                      }}
                    />
                  </div>
                  {isActive && (
                    <div className="absolute top-2 left-2">
                      <Badge className="bg-[#2FB36D] text-white text-xs gap-1">
                        <Check className="h-3 w-3" />
                        Active
                      </Badge>
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(image); }}
                    className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="p-2 bg-background">
                    <p className="text-xs truncate" title={image.name}>{image.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(image.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              );
            })}

            <div
              className="relative rounded-lg border-2 border-dashed border-muted-foreground/20 hover:border-muted-foreground/40 cursor-pointer transition-all flex flex-col items-center justify-center aspect-video min-h-[120px]"
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <ImagePlus className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <span className="text-xs text-muted-foreground font-medium">Upload Image</span>
                </>
              )}
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileUpload}
            className="hidden"
          />

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Supported: JPG, PNG, WebP (max 10MB). Recommended 1920x1080 or larger.
            </p>
            {activeImageUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemoveBackground}
                disabled={deleteSettingMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Clear Active
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from library?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{deleteTarget?.name}" from the background library.
              {activeImageUrl === deleteTarget?.url && " Since this is the currently active background, the login page will show only the background color."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDeleteFromLibrary(deleteTarget)}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Premium Features
          </CardTitle>
          <CardDescription>
            Enable or disable premium features across the platform. These toggles control feature availability for all users.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <RotateCcw className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Label className="text-sm font-medium">Badge Flip Preview</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Animated 3D flip effect on badge previews showing template details on the back
                </p>
              </div>
            </div>
            <Switch
              checked={badgeFlipSetting?.value === "true"}
              onCheckedChange={(checked) => {
                updateSettingMutation.mutate({
                  key: "feature_badge_flip_preview",
                  value: checked ? "true" : "false",
                }, {
                  onSuccess: () => {
                    queryClient.invalidateQueries({ queryKey: ["/api/settings/feature-flags"] });
                    toast({
                      title: checked ? "Badge flip enabled" : "Badge flip disabled",
                      description: checked
                        ? "Badge preview flip animation is now active for all users."
                        : "Badge preview flip animation has been turned off.",
                    });
                  }
                });
              }}
              disabled={updateSettingMutation.isPending}
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Label className="text-sm font-medium">Beta Feedback Widget</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Floating feedback button for collecting user feedback, bug reports, and feature requests
                </p>
              </div>
            </div>
            <Switch
              checked={betaFeedbackSetting?.value === "true"}
              onCheckedChange={(checked) => {
                updateSettingMutation.mutate({
                  key: "feature_beta_feedback",
                  value: checked ? "true" : "false",
                }, {
                  onSuccess: () => {
                    queryClient.invalidateQueries({ queryKey: ["/api/settings/feature-flags"] });
                    toast({
                      title: checked ? "Feedback widget enabled" : "Feedback widget disabled",
                      description: checked
                        ? "The feedback widget is now visible for all authenticated users."
                        : "The feedback widget has been hidden.",
                    });
                  }
                });
              }}
              disabled={updateSettingMutation.isPending}
            />
          </div>
        </CardContent>
      </Card>

      <Alert>
        <AlertDescription>
          These settings apply to all login pages including the admin login and staff check-in portal login.
          The background color is shown first, then the image (if set) overlays it.
        </AlertDescription>
      </Alert>
    </div>
  );
}
