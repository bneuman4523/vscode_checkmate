import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Palette, Upload, Trash2, Save, Sun, Moon, ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { KioskBrandingConfig } from "@shared/schema";

interface Customer {
  id: string;
  name: string;
  kioskBranding?: KioskBrandingConfig | null;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AccountBranding() {
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId || "";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [kioskTheme, setKioskTheme] = useState<"light" | "dark">("light");
  const [hasInitialized, setHasInitialized] = useState(false);

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: [`/api/customers/${customerId}`],
    enabled: !!customerId,
  });

  useEffect(() => {
    if (customer && !hasInitialized) {
      const branding = customer.kioskBranding;
      setLogoUrl(branding?.logoUrl ?? null);
      setBannerUrl(branding?.bannerUrl ?? null);
      setKioskTheme(branding?.kioskTheme ?? "light");
      setHasInitialized(true);
    }
  }, [customer, hasInitialized]);

  const saveMutation = useMutation({
    mutationFn: async (branding: KioskBrandingConfig) => {
      const response = await apiRequest("PATCH", `/api/customers/${customerId}/branding`, {
        kioskBranding: branding,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${customerId}`] });
      toast({ title: "Branding saved", description: "Kiosk branding has been updated." });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Save failed", description: error.message });
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      logoUrl: logoUrl || null,
      bannerUrl: bannerUrl || null,
      kioskTheme,
    });
  };

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (url: string | null) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ variant: "destructive", title: "Invalid file", description: "Please select an image file." });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({ variant: "destructive", title: "File too large", description: "Maximum file size is 2MB." });
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setter(dataUrl);
    } catch {
      toast({ variant: "destructive", title: "Upload failed", description: "Could not read the image file." });
    }

    // Reset input so the same file can be re-selected
    e.target.value = "";
  };

  const hasChanges = () => {
    if (!customer) return false;
    const branding = customer.kioskBranding;
    return (
      (logoUrl ?? null) !== (branding?.logoUrl ?? null) ||
      (bannerUrl ?? null) !== (branding?.bannerUrl ?? null) ||
      kioskTheme !== (branding?.kioskTheme ?? "light")
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Kiosk Branding</h1>
          <p className="text-muted-foreground">
            Configure logo, banner, and theme for kiosk check-in screens
          </p>
        </div>
        {hasChanges() && (
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="gap-1.5"
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Settings column */}
        <div className="space-y-6">
          {/* Logo upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ImageIcon className="h-5 w-5" />
                Logo
              </CardTitle>
              <CardDescription>
                Square or horizontal logo displayed on the kiosk header. Recommended: 200x60px or similar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {logoUrl ? (
                <div className="space-y-3">
                  <div className="rounded-lg border bg-muted/30 p-4 flex items-center justify-center">
                    <img
                      src={logoUrl}
                      alt="Logo preview"
                      className="max-h-16 max-w-full object-contain"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => logoInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      Replace
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLogoUrl(null)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-lg border-2 border-dashed border-muted-foreground/20 hover:border-muted-foreground/40 cursor-pointer transition-colors flex flex-col items-center justify-center py-8"
                  onClick={() => logoInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <span className="text-sm text-muted-foreground">Click to upload logo</span>
                  <span className="text-xs text-muted-foreground/60 mt-1">PNG, JPG, or SVG up to 2MB</span>
                </div>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleImageUpload(e, setLogoUrl)}
                className="hidden"
              />
            </CardContent>
          </Card>

          {/* Banner upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ImageIcon className="h-5 w-5" />
                Banner
              </CardTitle>
              <CardDescription>
                Wide banner displayed at the top of the kiosk screen. Recommended: 800x200px or similar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {bannerUrl ? (
                <div className="space-y-3">
                  <div className="rounded-lg border bg-muted/30 p-4 flex items-center justify-center">
                    <img
                      src={bannerUrl}
                      alt="Banner preview"
                      className="max-h-24 max-w-full object-contain"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => bannerInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      Replace
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setBannerUrl(null)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-lg border-2 border-dashed border-muted-foreground/20 hover:border-muted-foreground/40 cursor-pointer transition-colors flex flex-col items-center justify-center py-8"
                  onClick={() => bannerInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <span className="text-sm text-muted-foreground">Click to upload banner</span>
                  <span className="text-xs text-muted-foreground/60 mt-1">PNG, JPG, or SVG up to 2MB</span>
                </div>
              )}
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleImageUpload(e, setBannerUrl)}
                className="hidden"
              />
            </CardContent>
          </Card>

          {/* Theme toggle */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Palette className="h-5 w-5" />
                Kiosk Theme
              </CardTitle>
              <CardDescription>
                Choose light or dark mode for the kiosk check-in screens.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={kioskTheme}
                onValueChange={(value) => setKioskTheme(value as "light" | "dark")}
                className="grid grid-cols-2 gap-3"
              >
                <Label
                  htmlFor="theme-light"
                  className={`flex items-center gap-3 rounded-lg border-2 p-4 cursor-pointer transition-colors ${
                    kioskTheme === "light"
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/30"
                  }`}
                >
                  <RadioGroupItem value="light" id="theme-light" />
                  <Sun className="h-5 w-5" />
                  <span className="font-medium">Light</span>
                </Label>
                <Label
                  htmlFor="theme-dark"
                  className={`flex items-center gap-3 rounded-lg border-2 p-4 cursor-pointer transition-colors ${
                    kioskTheme === "dark"
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/30"
                  }`}
                >
                  <RadioGroupItem value="dark" id="theme-dark" />
                  <Moon className="h-5 w-5" />
                  <span className="font-medium">Dark</span>
                </Label>
              </RadioGroup>
            </CardContent>
          </Card>
        </div>

        {/* Preview column */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Kiosk Preview</CardTitle>
              <CardDescription>
                Approximate preview of how branding will appear on the kiosk screen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`rounded-lg border overflow-hidden ${
                  kioskTheme === "dark" ? "bg-gray-900 text-white" : "bg-white text-gray-900"
                }`}
              >
                {/* Banner area */}
                <div
                  className={`w-full flex items-center justify-center ${
                    bannerUrl ? "" : kioskTheme === "dark" ? "bg-gray-800" : "bg-gray-100"
                  }`}
                  style={{ minHeight: "80px" }}
                >
                  {bannerUrl ? (
                    <img
                      src={bannerUrl}
                      alt="Banner"
                      className="w-full max-h-24 object-cover"
                    />
                  ) : (
                    <span className={`text-xs ${kioskTheme === "dark" ? "text-gray-500" : "text-gray-400"}`}>
                      Banner area
                    </span>
                  )}
                </div>

                {/* Header with logo */}
                <div
                  className={`px-4 py-3 flex items-center justify-between border-b ${
                    kioskTheme === "dark" ? "border-gray-700" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt="Logo"
                        className="max-h-8 max-w-[120px] object-contain"
                      />
                    ) : (
                      <div
                        className={`h-8 w-20 rounded flex items-center justify-center text-xs ${
                          kioskTheme === "dark" ? "bg-gray-700 text-gray-400" : "bg-gray-200 text-gray-500"
                        }`}
                      >
                        Logo
                      </div>
                    )}
                  </div>
                  <span className={`text-xs ${kioskTheme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                    Event Name
                  </span>
                </div>

                {/* Body mockup */}
                <div className="p-6 space-y-4">
                  <div className="text-center space-y-2">
                    <h3 className="text-lg font-semibold">Welcome</h3>
                    <p className={`text-sm ${kioskTheme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                      Scan your badge or search by name
                    </p>
                  </div>
                  <div
                    className={`mx-auto max-w-[200px] rounded-lg p-4 text-center text-xs ${
                      kioskTheme === "dark"
                        ? "bg-gray-800 text-gray-500 border border-gray-700"
                        : "bg-gray-50 text-gray-400 border border-gray-200"
                    }`}
                  >
                    QR Scanner Area
                  </div>
                  <div className="flex justify-center">
                    <div
                      className={`rounded-md px-6 py-2 text-sm font-medium ${
                        kioskTheme === "dark"
                          ? "bg-white text-gray-900"
                          : "bg-gray-900 text-white"
                      }`}
                    >
                      Search by Name
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sticky save bar */}
      {hasChanges() && (
        <div className="sticky bottom-4 flex justify-end">
          <div className="flex items-center gap-2 rounded-lg border bg-background p-3 shadow-lg">
            <span className="text-sm text-muted-foreground">You have unsaved changes</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const branding = customer?.kioskBranding;
                setLogoUrl(branding?.logoUrl ?? null);
                setBannerUrl(branding?.bannerUrl ?? null);
                setKioskTheme(branding?.kioskTheme ?? "light");
              }}
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="gap-1.5"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
