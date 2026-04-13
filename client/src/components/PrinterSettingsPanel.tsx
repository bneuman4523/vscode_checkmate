import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Printer, Wifi, WifiOff, RefreshCw, Settings, CheckCircle, XCircle, Info, Trash2 } from 'lucide-react';
import { useNetworkPrint } from '@/hooks/use-network-print';

interface PrinterSettingsPanelProps {
  compact?: boolean;
  onClose?: () => void;
}

export default function PrinterSettingsPanel({ compact = false, onClose }: PrinterSettingsPanelProps) {
  const networkPrint = useNetworkPrint();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [ipInput, setIpInput] = useState(networkPrint.settings.printerIp);

  const handleTestConnection = async () => {
    await networkPrint.testConnection(ipInput, networkPrint.settings.port);
  };

  const handleReset = () => {
    networkPrint.resetConnection();
    setIpInput('');
    setShowResetConfirm(false);
  };

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Printer className="h-4 w-4" />
            <span className="text-sm font-medium">Network Printer</span>
          </div>
          {networkPrint.isConnected ? (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          ) : networkPrint.isConfigured ? (
            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
              <WifiOff className="h-3 w-3 mr-1" />
              Not Tested
            </Badge>
          ) : (
            <Badge variant="secondary">Not Configured</Badge>
          )}
        </div>

        {networkPrint.isConfigured && (
          <div className="text-xs text-muted-foreground">
            IP: {networkPrint.settings.printerIp}:{networkPrint.settings.port} | DPI: {networkPrint.settings.dpi}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleTestConnection}
            disabled={networkPrint.isLoading || !ipInput}
            className="flex-1"
          >
            {networkPrint.isLoading ? (
              <RefreshCw className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Wifi className="h-3 w-3 mr-1" />
            )}
            Test
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowResetConfirm(true)}
            disabled={!networkPrint.isConfigured}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>

        <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Printer Settings?</DialogTitle>
              <DialogDescription>
                This will clear the saved printer IP address and settings. You'll need to reconfigure the printer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowResetConfirm(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleReset}>Reset</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <CardTitle className="text-lg">Printer Settings</CardTitle>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
        <CardDescription>
          Configure your network-connected Zebra printer for badge printing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Network printing</strong> sends badges directly to your Zebra printer over WiFi/Ethernet. 
            This works on all devices including iPhone and iPad without requiring any apps.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="printerIp">Printer IP Address</Label>
            <Input
              id="printerIp"
              placeholder="192.168.1.100"
              value={ipInput}
              onChange={(e) => setIpInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Find this on your printer's network config printout
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="printerPort">Port</Label>
            <Input
              id="printerPort"
              type="number"
              value={networkPrint.settings.port}
              onChange={(e) => networkPrint.setPort(parseInt(e.target.value) || 9100)}
            />
            <p className="text-xs text-muted-foreground">
              Default is 9100 for Zebra printers
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Printer DPI</Label>
          <Select
            value={networkPrint.settings.dpi.toString()}
            onValueChange={(v) => networkPrint.setDpi(parseInt(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="203">203 DPI (Standard)</SelectItem>
              <SelectItem value="300">300 DPI (High Resolution)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Match this to your Zebra ZD621 print head resolution
          </p>
        </div>

        {networkPrint.error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{networkPrint.error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <div className="flex items-center gap-2">
            {networkPrint.isConnected ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <div className="text-sm font-medium text-green-700">Connected</div>
                  {networkPrint.settings.lastTested && (
                    <div className="text-xs text-muted-foreground">
                      Last tested: {new Date(networkPrint.settings.lastTested).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <WifiOff className="h-5 w-5 text-muted-foreground" />
                <div className="text-sm text-muted-foreground">
                  {networkPrint.isConfigured ? 'Not connected' : 'Enter printer IP to connect'}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleTestConnection}
            disabled={networkPrint.isLoading || !ipInput}
            className="flex-1"
          >
            {networkPrint.isLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Wifi className="h-4 w-4 mr-2" />
            )}
            Test Connection
          </Button>
          {networkPrint.isConfigured && (
            <Button variant="outline" onClick={() => setShowResetConfirm(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Reset
            </Button>
          )}
        </div>

        <div className="border-t pt-4 mt-4">
          <h4 className="text-sm font-medium mb-2">Setup Instructions</h4>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Connect your Zebra ZD621 to the same WiFi/network as this device</li>
            <li>On the printer, press and hold Feed + Cancel buttons to print network info</li>
            <li>Enter the printer's IP address above (e.g., 192.168.1.100)</li>
            <li>Click "Test Connection" to verify connectivity</li>
            <li>Select matching DPI (check your printer's specifications)</li>
          </ol>
        </div>

        <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Printer Settings?</DialogTitle>
              <DialogDescription>
                This will clear the saved printer IP address and all settings. You'll need to reconfigure the printer connection.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowResetConfirm(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleReset}>Reset Settings</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
