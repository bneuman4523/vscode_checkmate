import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, CameraOff, CheckCircle2, RefreshCw, ShieldAlert, Settings, Monitor, Smartphone, SwitchCamera } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Html5Qrcode, Html5QrcodeScannerState, CameraDevice } from "html5-qrcode";

type CameraErrorType = 'permission_denied' | 'no_camera' | 'other';

type Platform = 'windows' | 'mac' | 'ios' | 'android' | 'other';
type Browser = 'chrome' | 'safari' | 'edge' | 'firefox' | 'other';

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/macintosh|mac os x/.test(ua)) return 'mac';
  if (/windows/.test(ua)) return 'windows';
  return 'other';
}

function detectBrowser(): Browser {
  const ua = navigator.userAgent.toLowerCase();
  if (/edg\//.test(ua)) return 'edge';
  if (/chrome/.test(ua) && !/edg\//.test(ua)) return 'chrome';
  if (/safari/.test(ua) && !/chrome/.test(ua)) return 'safari';
  if (/firefox/.test(ua)) return 'firefox';
  return 'other';
}

interface PlatformInstructions {
  title: string;
  steps: string[];
  icon: 'monitor' | 'smartphone';
}

function getCameraInstructions(platform: Platform, browser: Browser, errorType: CameraErrorType): PlatformInstructions {
  if (errorType === 'permission_denied') {
    switch (platform) {
      case 'ios':
        return {
          title: 'Enable Camera on iOS',
          steps: [
            'Open Settings app on your device',
            `Scroll down and tap "${browser === 'safari' ? 'Safari' : 'Chrome'}"`,
            'Tap "Camera" and select "Allow"',
            'Return here and tap "Try Again"'
          ],
          icon: 'smartphone'
        };
      case 'android':
        return {
          title: 'Enable Camera on Android',
          steps: [
            'Tap the lock icon in the address bar',
            'Tap "Permissions" or "Site settings"',
            'Set Camera to "Allow"',
            'Or: Settings → Apps → Browser → Permissions → Camera'
          ],
          icon: 'smartphone'
        };
      case 'mac':
        return {
          title: 'Enable Camera on Mac',
          steps: [
            'Click the camera/lock icon in the address bar',
            'Select "Allow" for camera access',
            `Or: System Settings → Privacy & Security → Camera → Enable for ${browser === 'safari' ? 'Safari' : browser === 'chrome' ? 'Chrome' : 'your browser'}`,
            'Restart browser if needed'
          ],
          icon: 'monitor'
        };
      case 'windows':
        if (browser === 'edge') {
          return {
            title: 'Enable Camera in Edge',
            steps: [
              'Click the lock icon in the address bar',
              'Set Camera to "Allow"',
              'Or: Edge Settings → Cookies and site permissions → Camera',
              'Also check: Windows Settings → Privacy → Camera → Allow apps to access camera'
            ],
            icon: 'monitor'
          };
        }
        return {
          title: 'Enable Camera on Windows',
          steps: [
            'Click the camera/lock icon in the address bar',
            'Select "Allow" for camera access',
            'Check Windows Settings → Privacy & Security → Camera',
            'Ensure "Camera access" and "Let apps access your camera" are ON'
          ],
          icon: 'monitor'
        };
      default:
        return {
          title: 'Enable Camera Access',
          steps: [
            'Click the camera/lock icon in the address bar',
            'Select "Allow" for camera access',
            'Check your device settings for camera permissions',
            'Restart browser if needed'
          ],
          icon: 'monitor'
        };
    }
  }
  
  // No camera found
  switch (platform) {
    case 'ios':
      return {
        title: 'Camera Not Detected on iOS',
        steps: [
          'Make sure no other app is using the camera',
          'Close apps like FaceTime, Zoom, or Teams',
          'Force close this browser and reopen it',
          'Restart your device if the issue persists'
        ],
        icon: 'smartphone'
      };
    case 'android':
      return {
        title: 'Camera Not Detected on Android',
        steps: [
          'Close other apps using the camera (Zoom, Teams, etc.)',
          'Go to Settings → Apps → Browser → Force Stop, then reopen',
          'Clear browser cache: Settings → Apps → Browser → Storage → Clear Cache',
          'Restart your device if the issue persists'
        ],
        icon: 'smartphone'
      };
    case 'mac':
      return {
        title: 'Camera Not Detected on Mac',
        steps: [
          'Close apps using the camera (FaceTime, Zoom, Teams, Photo Booth)',
          'Check System Settings → Privacy & Security → Camera',
          `Ensure your browser (${browser === 'safari' ? 'Safari' : browser === 'chrome' ? 'Chrome' : 'browser'}) is enabled`,
          'Try quitting and reopening the browser',
          'Restart your Mac if the issue persists'
        ],
        icon: 'monitor'
      };
    case 'windows':
      if (browser === 'edge') {
        return {
          title: 'Camera Not Detected in Edge',
          steps: [
            'Close other apps using the camera (Teams, Zoom, Skype)',
            'Windows Settings → Privacy & Security → Camera',
            'Ensure "Camera access" is ON and Edge is allowed',
            'Try: edge://settings/content/camera to check site permissions',
            'Restart Edge or your PC if needed'
          ],
          icon: 'monitor'
        };
      }
      return {
        title: 'Camera Not Detected on Windows',
        steps: [
          'Close apps using the camera (Teams, Zoom, Skype)',
          'Windows Settings → Privacy & Security → Camera',
          'Ensure "Camera access" and "Let apps access camera" are ON',
          'Check Device Manager for camera driver issues',
          'Restart your browser or PC'
        ],
        icon: 'monitor'
      };
    default:
      return {
        title: 'Camera Not Detected',
        steps: [
          'Ensure your device has a camera',
          'Close other apps that might be using the camera',
          'Check your device settings for camera permissions',
          'Try restarting your browser or device'
        ],
        icon: 'monitor'
      };
  }
}

type CameraFacingMode = 'user' | 'environment';

interface QRScannerProps {
  onScan?: (code: string) => void;
  autoStart?: boolean;
  showHeader?: boolean;
  compact?: boolean;
  facingMode?: CameraFacingMode;
}

export default function QRScanner({ 
  onScan, 
  autoStart = false,
  showHeader = true,
  compact = false,
  facingMode = 'environment'
}: QRScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<{ type: CameraErrorType; message: string } | null>(null);
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerIdRef = useRef(`qr-reader-${Math.random().toString(36).substring(7)}`);
  
  const platform = useMemo(() => detectPlatform(), []);
  const browser = useMemo(() => detectBrowser(), []);

  const stopScanning = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === Html5QrcodeScannerState.SCANNING) {
          await scannerRef.current.stop();
        }
      } catch (e) {
        console.warn("[QRScanner] Error stopping scanner:", e);
      }
    }
    setScanning(false);
  }, []);

  const startScanning = useCallback(async (overrideDeviceId?: string) => {
    setCameraError(null);
    
    try {
      const devices = await Html5Qrcode.getCameras();
      
      if (!devices || devices.length === 0) {
        setCameraError({ type: 'no_camera', message: "No camera found on this device" });
        return;
      }

      setAvailableCameras(devices);

      if (scannerRef.current) {
        try {
          const state = scannerRef.current.getState();
          if (state === Html5QrcodeScannerState.SCANNING) {
            await scannerRef.current.stop();
          }
          scannerRef.current.clear();
        } catch { /* ignore */ }
      }
      scannerRef.current = new Html5Qrcode(containerIdRef.current, { verbose: false });

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const preferredMode = isMobile ? facingMode : 'user';
      const useDeviceId = overrideDeviceId || selectedCameraId;

      const scanConfig: any = {
        fps: 10,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minDimension = Math.min(viewfinderWidth, viewfinderHeight);
          const scanSize = Math.floor(minDimension * (isMobile ? 0.85 : 0.75));
          return { width: scanSize, height: scanSize };
        },
        aspectRatio: isMobile ? undefined : 1,
        disableFlip: preferredMode === 'environment',
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
      };

      if (!useDeviceId && isMobile && preferredMode === 'environment') {
        scanConfig.videoConstraints = {
          facingMode: { exact: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          ...(isIOS ? {} : { focusMode: { ideal: "continuous" } }),
        };
      }

      const onSuccess = (decodedText: string) => {
        if (lastScannedRef.current === decodedText) {
          return;
        }
        lastScannedRef.current = decodedText;
        setLastScan(decodedText);
        
        if (scanTimeoutRef.current) {
          clearTimeout(scanTimeoutRef.current);
        }
        scanTimeoutRef.current = setTimeout(() => {
          lastScannedRef.current = null;
        }, 3000);
        
        if (onScan) {
          onScan(decodedText);
        }
      };

      if (useDeviceId) {
        await scannerRef.current.start(
          useDeviceId,
          scanConfig,
          onSuccess,
          () => {}
        );
      } else {
        const cameraConfig = scanConfig.videoConstraints
          ? { videoConstraints: scanConfig.videoConstraints }
          : { facingMode: preferredMode };

        try {
          await scannerRef.current.start(
            cameraConfig as any,
            scanConfig,
            onSuccess,
            () => {}
          );
        } catch (firstErr) {
          console.warn("[QRScanner] Primary camera config failed, trying fallback:", firstErr);
          try { scannerRef.current.clear(); } catch { /* ignore */ }
          scannerRef.current = new Html5Qrcode(containerIdRef.current, { verbose: false });
          try {
            await scannerRef.current.start(
              { facingMode: preferredMode },
              scanConfig,
              onSuccess,
              () => {}
            );
          } catch (secondErr) {
            console.warn("[QRScanner] FacingMode failed, trying fallback mode:", secondErr);
            try { scannerRef.current.clear(); } catch { /* ignore */ }
            scannerRef.current = new Html5Qrcode(containerIdRef.current, { verbose: false });
            const fallbackMode = preferredMode === 'environment' ? 'user' : 'environment';
            try {
              await scannerRef.current.start(
                { facingMode: fallbackMode },
                scanConfig,
                onSuccess,
                () => {}
              );
            } catch (thirdErr) {
              console.warn("[QRScanner] All facingModes failed, trying device ID:", thirdErr);
              try { scannerRef.current.clear(); } catch { /* ignore */ }
              scannerRef.current = new Html5Qrcode(containerIdRef.current, { verbose: false });
              await scannerRef.current.start(
                devices[0].id,
                scanConfig,
                onSuccess,
                () => {}
              );
            }
          }
        }
      }

      setScanning(true);
    } catch (error) {
      console.error("[QRScanner] Camera error:", error);
      const errorMsg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      
      const isPermissionDenied = 
        errorMsg.includes('permission') || 
        errorMsg.includes('denied') || 
        errorMsg.includes('notallowederror') ||
        errorMsg.includes('not allowed') ||
        errorMsg.includes('blocked');
      
      if (isPermissionDenied) {
        setCameraError({ 
          type: 'permission_denied', 
          message: "Camera access was denied" 
        });
      } else {
        setCameraError({ 
          type: 'other', 
          message: error instanceof Error ? error.message : "Unable to access camera" 
        });
      }
    }
  }, [compact, facingMode, onScan, selectedCameraId]);

  useEffect(() => {
    if (autoStart) {
      startScanning();
    }

    return () => {
      stopScanning();
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, [autoStart, startScanning, stopScanning]);

  const handleRetry = () => {
    setCameraError(null);
    startScanning();
  };

  const handleCameraSwitch = async (deviceId: string) => {
    setSelectedCameraId(deviceId);
    if (scanning) {
      await startScanning(deviceId);
    }
  };

  const instructions = cameraError 
    ? getCameraInstructions(platform, browser, cameraError.type)
    : null;

  const content = (
    <CardContent className={`space-y-4 ${!showHeader ? 'pt-4' : ''}`}>
      <div className={`${compact ? 'aspect-square' : 'aspect-video'} bg-muted rounded-md flex items-center justify-center relative overflow-hidden`}>
        <div 
          id={containerIdRef.current} 
          className={`absolute inset-0 w-full h-full ${scanning && !cameraError ? '' : 'invisible'}`}
          data-testid="qr-scanner-viewport"
        />
        {cameraError && instructions ? (
          <div className="text-center p-4 max-w-sm mx-auto">
            {cameraError.type === 'permission_denied' ? (
              <ShieldAlert className="h-10 w-10 mx-auto text-amber-500 mb-3" aria-hidden="true" />
            ) : (
              instructions.icon === 'smartphone' ? (
                <Smartphone className="h-10 w-10 mx-auto text-muted-foreground mb-3" aria-hidden="true" />
              ) : (
                <Monitor className="h-10 w-10 mx-auto text-muted-foreground mb-3" aria-hidden="true" />
              )
            )}
            <p className="font-medium text-foreground mb-2">{instructions.title}</p>
            {cameraError.type !== 'permission_denied' && cameraError.type !== 'no_camera' && (
              <p className="text-sm text-muted-foreground mb-3">{cameraError.message}</p>
            )}
            <div className="text-xs text-muted-foreground bg-background/50 rounded-md p-3 mb-4 text-left space-y-1.5">
              <p className="font-medium flex items-center gap-1 mb-2">
                <Settings className="h-3 w-3" /> Steps to fix:
              </p>
              {instructions.steps.map((step, index) => (
                <p key={index}>• {step}</p>
              ))}
            </div>
            <Button 
              onClick={handleRetry} 
              variant={cameraError.type === 'permission_denied' ? 'default' : 'outline'} 
              size="sm" 
              data-testid="button-retry-camera"
            >
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
              Try Again
            </Button>
          </div>
        ) : scanning ? (
          <div className="absolute bottom-2 left-2 right-2 text-center pointer-events-none">
            <p className="text-xs text-muted-foreground bg-background/80 py-1 px-2 rounded inline-block">
              Position QR code within the frame
            </p>
          </div>
        ) : (
          <div className="text-center">
            <Camera className="h-16 w-16 mx-auto text-muted-foreground mb-2" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Camera inactive</p>
          </div>
        )}
      </div>

      {!compact && (
        <div className="space-y-2">
          <div className="flex gap-2">
            {!scanning ? (
              <Button
                onClick={() => startScanning()}
                className="flex-1"
                data-testid="button-start-scanning"
              >
                <Camera className="h-4 w-4 mr-2" aria-hidden="true" />
                Start Scanning
              </Button>
            ) : (
              <Button
                onClick={stopScanning}
                variant="destructive"
                className="flex-1"
                data-testid="button-stop-scanning"
              >
                <CameraOff className="h-4 w-4 mr-2" aria-hidden="true" />
                Stop Scanning
              </Button>
            )}
          </div>
          {availableCameras.length > 1 && (
            <div className="flex items-center gap-2">
              <SwitchCamera className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
              <Select
                value={selectedCameraId || "default"}
                onValueChange={(value) => handleCameraSwitch(value === "default" ? availableCameras[0].id : value)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Switch camera" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default camera</SelectItem>
                  {availableCameras.map((cam) => (
                    <SelectItem key={cam.id} value={cam.id}>
                      {cam.label || `Camera ${cam.id.slice(0, 8)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {lastScan && !compact && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-md">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-500 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-medium text-sm">Successfully scanned</p>
              <p className="text-sm text-muted-foreground mt-1">Code: {lastScan}</p>
              <Badge className="mt-2 bg-green-500/10 text-green-700 dark:text-green-400">
                Ready to check-in
              </Badge>
            </div>
          </div>
        </div>
      )}
    </CardContent>
  );

  if (!showHeader) {
    return <Card className="overflow-hidden">{content}</Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>QR Code Scanner</CardTitle>
          <CardDescription>
            Scan attendee QR codes to check them in
          </CardDescription>
        </CardHeader>
        {content}
      </Card>
    </div>
  );
}
