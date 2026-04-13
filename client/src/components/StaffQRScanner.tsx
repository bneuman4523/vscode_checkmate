import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { 
  Camera, 
  CameraOff, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  AlertCircle,
  UserCheck,
  Printer,
  ScanLine,
  Settings,
  RefreshCw,
  ShieldAlert,
  Monitor,
  Smartphone,
  SwitchCamera
} from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats, CameraDevice } from "html5-qrcode";
import "./StaffQRScanner.css";
import { useToast } from "@/hooks/use-toast";
import { parseQrCode } from "@/lib/qr-parser";

type CameraErrorType = 'permission_denied' | 'no_camera' | 'in_use' | 'other';
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

interface CameraInstructions {
  title: string;
  steps: string[];
  icon: 'monitor' | 'smartphone';
}

function getCameraInstructions(platform: Platform, browser: Browser, errorType: CameraErrorType): CameraInstructions {
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
  
  if (errorType === 'in_use') {
    const commonApps = platform === 'windows' ? 'Teams, Zoom, Skype' : 
                       platform === 'mac' ? 'FaceTime, Zoom, Teams, Photo Booth' : 
                       'FaceTime, Zoom, Teams';
    return {
      title: 'Camera In Use',
      steps: [
        `Close apps that might be using the camera (${commonApps})`,
        'Check for video calls or recordings in other browser tabs',
        'Restart your browser if the issue persists',
        'Restart your device as a last resort'
      ],
      icon: platform === 'ios' || platform === 'android' ? 'smartphone' : 'monitor'
    };
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

interface Attendee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  title?: string;
  participantType: string;
  registrationStatus?: string;
  checkedIn: boolean;
  checkedInAt?: string;
  badgePrinted: boolean;
  badgePrintedAt?: string;
  externalId?: string;
  customFields?: Record<string, string>;
}

interface StaffQRScannerProps {
  attendees: Attendee[];
  onAttendeeFound: (attendee: Attendee) => void;
  onCheckIn: (attendee: Attendee) => void;
  onRevertCheckIn?: (attendee: Attendee) => void;
  isCheckingIn: boolean;
  isReverting?: boolean;
  allowRevert?: boolean;
  autoCheckIn?: boolean;
}

import type { QrMatchResult } from "@/lib/qr-parser";

type ScanResult = QrMatchResult | null;

export default function StaffQRScanner({
  attendees,
  onAttendeeFound,
  onCheckIn,
  onRevertCheckIn,
  isCheckingIn,
  isReverting = false,
  allowRevert = false,
  autoCheckIn = false,
}: StaffQRScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult>(null);
  const [cameraError, setCameraError] = useState<{ type: CameraErrorType; message: string } | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<'success' | 'error' | null>(null);
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const { toast } = useToast();
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScanTimeRef = useRef<number>(0);
  
  const platform = useMemo(() => detectPlatform(), []);
  const browser = useMemo(() => detectBrowser(), []);

  const SCAN_COOLDOWN = 2000; // 2 seconds between scans

  const findAttendeeByQRData = useCallback((qrData: string): ScanResult => {
    return parseQrCode(qrData, attendees);
  }, [attendees]);

  const handleScanSuccess = useCallback((decodedText: string) => {
    const now = Date.now();
    if (now - lastScanTimeRef.current < SCAN_COOLDOWN) {
      return; // Ignore rapid successive scans
    }
    lastScanTimeRef.current = now;

    const result = findAttendeeByQRData(decodedText);
    setScanResult(result);

    if (result?.type === 'found') {
      setScanFeedback('success');
      toast({
        title: "Attendee Found",
        description: `${result.attendee.firstName} ${result.attendee.lastName}`,
      });
      onAttendeeFound(result.attendee);
      
      if (autoCheckIn && !result.attendee.checkedIn) {
        onCheckIn(result.attendee);
      }
    } else {
      setScanFeedback('error');
      toast({
        title: "No Match Found",
        description: "QR code does not match any attendee.",
        variant: "destructive",
      });
    }
    
    // Clear feedback after animation
    setTimeout(() => setScanFeedback(null), 1500);
  }, [findAttendeeByQRData, onAttendeeFound, onCheckIn, autoCheckIn, toast]);

  const startScanning = async (overrideDeviceId?: string) => {
    if (!containerRef.current || isStarting) return;
    
    setCameraError(null);
    setScanResult(null);
    setIsStarting(true);

    let scanner: Html5Qrcode | null = null;
    
    try {
      const devices = await Html5Qrcode.getCameras();
      
      if (!devices || devices.length === 0) {
        setCameraError({ type: 'no_camera', message: "No camera found" });
        setIsStarting(false);
        return;
      }

      setAvailableCameras(devices);

      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
          scannerRef.current.clear();
        } catch { /* ignore */ }
        scannerRef.current = null;
      }

      scanner = new Html5Qrcode("staff-qr-reader", {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const preferredMode: string = isMobile ? 'environment' : 'user';
      const useDeviceId = overrideDeviceId || selectedCameraId;

      const scanConfig: any = {
        fps: 10,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minDimension = Math.min(viewfinderWidth, viewfinderHeight);
          const scanSize = Math.floor(minDimension * (isMobile ? 0.85 : 0.75));
          return { width: scanSize, height: scanSize };
        },
        aspectRatio: isMobile ? undefined : 1.0,
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

      if (useDeviceId) {
        await scanner.start(
          useDeviceId,
          scanConfig,
          handleScanSuccess,
          () => {}
        );
      } else {
        const cameraConfig = scanConfig.videoConstraints
          ? { videoConstraints: scanConfig.videoConstraints }
          : { facingMode: preferredMode };

        try {
          await scanner.start(
            cameraConfig as any,
            scanConfig,
            handleScanSuccess,
            () => {}
          );
        } catch (firstErr) {
          console.warn("[StaffQRScanner] Primary camera config failed, trying fallback:", firstErr);
          try { scanner.clear(); } catch { /* ignore */ }
          scanner = new Html5Qrcode("staff-qr-reader", {
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
            verbose: false,
          });
          try {
            await scanner.start(
              { facingMode: preferredMode },
              scanConfig,
              handleScanSuccess,
              () => {}
            );
          } catch (secondErr) {
            console.warn("[StaffQRScanner] FacingMode failed, trying fallback mode:", secondErr);
            try { scanner.clear(); } catch { /* ignore */ }
            scanner = new Html5Qrcode("staff-qr-reader", {
              formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
              verbose: false,
            });
            const fallbackMode = preferredMode === 'environment' ? 'user' : 'environment';
            try {
              await scanner.start(
                { facingMode: fallbackMode },
                scanConfig,
                handleScanSuccess,
                () => {}
              );
            } catch (thirdErr) {
              console.warn("[StaffQRScanner] All facingModes failed, trying device ID:", thirdErr);
              try { scanner.clear(); } catch { /* ignore */ }
              scanner = new Html5Qrcode("staff-qr-reader", {
                formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
                verbose: false,
              });
              await scanner.start(
                devices[0].id,
                scanConfig,
                handleScanSuccess,
                () => {}
              );
            }
          }
        }
      }

      scannerRef.current = scanner;
      setScanning(true);
    } catch (err) {
      console.error("Failed to start scanner:", err);
      
      if (scanner) {
        try {
          scanner.clear();
        } catch {
          // Ignore cleanup errors
        }
      }
      scannerRef.current = null;
      
      if (err instanceof Error) {
        const errorMsg = err.message.toLowerCase();
        if (errorMsg.includes("notallowederror") || errorMsg.includes("permission") || errorMsg.includes("denied") || errorMsg.includes("blocked")) {
          setCameraError({ type: 'permission_denied', message: "Camera access denied" });
        } else if (errorMsg.includes("notfounderror") || errorMsg.includes("no camera") || errorMsg.includes("requested device not found")) {
          setCameraError({ type: 'no_camera', message: "No camera found" });
        } else if (errorMsg.includes("notreadableerror") || errorMsg.includes("in use") || errorMsg.includes("could not start")) {
          setCameraError({ type: 'in_use', message: "Camera is in use" });
        } else {
          setCameraError({ type: 'other', message: err.message });
        }
      } else {
        setCameraError({ type: 'other', message: "Failed to start scanner" });
      }
    } finally {
      setIsStarting(false);
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const clearResult = () => {
    setScanResult(null);
    lastScanTimeRef.current = 0; // Allow immediate next scan
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="space-y-4">
      <div 
        ref={containerRef}
        className="scanner-container"
      >
        <div id="staff-qr-reader" className="w-full h-full" />
        
        {!scanning && !isStarting && (
          <div className="scanner-placeholder">
            <Camera className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-2 text-center px-4">
              Scan attendee badge QR codes for quick check-in
            </p>
            <Button
              onClick={() => startScanning()}
              size="lg"
              data-testid="button-start-qr-scan"
            >
              <Camera className="h-5 w-5 mr-2" />
              Start Camera
            </Button>
          </div>
        )}
        
        {isStarting && (
          <div className="scanner-placeholder">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-sm text-muted-foreground">Starting camera...</p>
          </div>
        )}
        
        {scanning && (
          <div className="scanner-overlay">
            <div className="scanner-vignette" />
            <div className="scanner-frame">
              <div className={`corner corner-tl ${scanFeedback || ''}`} />
              <div className={`corner corner-tr ${scanFeedback || ''}`} />
              <div className={`corner corner-bl ${scanFeedback || ''}`} />
              <div className={`corner corner-br ${scanFeedback || ''}`} />
              
              {!scanFeedback && (
                <div className="scan-line-wrapper">
                  <div className="scan-line" />
                </div>
              )}
              
              {scanFeedback === 'success' && (
                <div className="feedback-icon">
                  <div className="bg-green-500 rounded-full p-4">
                    <CheckCircle2 className="h-12 w-12 text-white" />
                  </div>
                </div>
              )}
              {scanFeedback === 'error' && (
                <div className="feedback-icon">
                  <div className="bg-red-500 rounded-full p-4">
                    <XCircle className="h-12 w-12 text-white" />
                  </div>
                </div>
              )}
            </div>
            
            {!scanFeedback && !scanResult && (
              <div className="scanner-hint">
                Position QR code in frame
              </div>
            )}
          </div>
        )}
      </div>

      {scanning && (
        <div className="space-y-2">
          <Button
            onClick={stopScanning}
            variant="outline"
            className="w-full"
            data-testid="button-stop-qr-scan"
          >
            <CameraOff className="h-4 w-4 mr-2" />
            Stop Scanning
          </Button>
          {availableCameras.length > 1 && (
            <div className="flex items-center gap-2">
              <SwitchCamera className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
              <Select
                value={selectedCameraId || "default"}
                onValueChange={(value) => {
                  const deviceId = value === "default" ? availableCameras[0].id : value;
                  setSelectedCameraId(deviceId);
                  startScanning(deviceId);
                }}
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

      {cameraError && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="p-4">
            {(() => {
              const instructions = getCameraInstructions(platform, browser, cameraError.type);
              return (
                <div className="text-center">
                  <div className="flex justify-center mb-3">
                    {cameraError.type === 'permission_denied' ? (
                      <ShieldAlert className="h-10 w-10 text-amber-500" />
                    ) : instructions.icon === 'smartphone' ? (
                      <Smartphone className="h-10 w-10 text-muted-foreground" />
                    ) : (
                      <Monitor className="h-10 w-10 text-muted-foreground" />
                    )}
                  </div>
                  <p className="font-medium text-foreground mb-2">{instructions.title}</p>
                  {cameraError.type === 'other' && (
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
                    onClick={() => startScanning()} 
                    variant={cameraError.type === 'permission_denied' ? 'default' : 'outline'} 
                    size="sm"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {scanResult?.type === 'found' && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-700 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold" data-testid="text-scanned-attendee-name">
                    {scanResult.attendee.firstName} {scanResult.attendee.lastName}
                  </span>
                  <Badge variant="outline">{scanResult.attendee.participantType}</Badge>
                  {scanResult.attendee.registrationStatus && (
                    <Badge 
                      variant={scanResult.attendee.registrationStatus === 'Attended' ? 'default' : 'secondary'}
                      data-testid="text-scanned-registration-status"
                    >
                      {scanResult.attendee.registrationStatus}
                    </Badge>
                  )}
                </div>
                {scanResult.attendee.company && (
                  <p className="text-sm text-muted-foreground">{scanResult.attendee.company}</p>
                )}
                {scanResult.attendee.title && (
                  <p className="text-sm text-muted-foreground">{scanResult.attendee.title}</p>
                )}
                {scanResult.attendee.externalId && (
                  <p className="text-xs text-muted-foreground mt-1 font-mono" data-testid="text-scanned-external-id">
                    Reg Code: {scanResult.attendee.externalId}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Matched by: {scanResult.matchedBy}
                </p>
                
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {scanResult.attendee.checkedIn ? (
                    <>
                      <Badge variant="default" className="bg-green-700">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Checked In
                      </Badge>
                      {allowRevert && onRevertCheckIn && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onRevertCheckIn(scanResult.attendee)}
                          disabled={isReverting}
                          data-testid="button-qr-revert"
                        >
                          {isReverting ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4 mr-2" />
                          )}
                          Undo Check-In
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => onCheckIn(scanResult.attendee)}
                      disabled={isCheckingIn}
                      data-testid="button-qr-checkin"
                    >
                      {isCheckingIn ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <UserCheck className="h-4 w-4 mr-2" />
                      )}
                      Check In Now
                    </Button>
                  )}
                  {scanResult.attendee.badgePrinted && (
                    <Badge variant="outline">
                      <Printer className="h-3 w-3 mr-1" />
                      Badge Printed
                    </Badge>
                  )}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearResult}
                  className="mt-3"
                  data-testid="button-scan-another"
                >
                  <ScanLine className="h-4 w-4 mr-2" />
                  Scan Another
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {scanResult?.type === 'not_found' && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <XCircle className="h-6 w-6 text-red-600 dark:text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Attendee Not Found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  No matching attendee for scanned code:
                </p>
                <code className="text-xs bg-muted px-2 py-1 rounded block mt-2 break-all">
                  {scanResult.scannedValue.length > 100 
                    ? scanResult.scannedValue.substring(0, 100) + '...' 
                    : scanResult.scannedValue}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearResult}
                  className="mt-3"
                  data-testid="button-try-again"
                >
                  <ScanLine className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
