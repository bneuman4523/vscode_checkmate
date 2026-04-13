import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Wifi, Bluetooth, Printer as PrinterIcon, Trash2, Edit2, CheckCircle, Cloud, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useNavigation } from '@/contexts/NavigationContext';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MapPin } from 'lucide-react';
import type { Printer, Location } from '@shared/schema';

interface PrintNodePrinter {
  id: number;
  name: string;
  description: string;
  computerName: string;
  state: string;
}

interface PrintNodeStatus {
  configured: boolean;
  printers: PrintNodePrinter[];
  message?: string;
}

const printerFormSchema = z.object({
  name: z.string().min(1, 'Printer name is required'),
  locationId: z.string().nullable().optional(),
  connectionType: z.enum(['wifi', 'bluetooth', 'airprint', 'usb']),
  ipAddress: z.string().optional(),
  port: z.coerce.number().optional(),
  bluetoothDeviceId: z.string().optional(),
  bluetoothName: z.string().optional(),
  maxWidth: z.coerce.number().min(2).max(12).optional(),
  maxHeight: z.coerce.number().min(2).max(12).optional(),
  dpi: z.coerce.number().min(72).max(600).optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
}).superRefine((data, ctx) => {
  // WiFi printers require IP address and port
  if (data.connectionType === 'wifi') {
    if (!data.ipAddress || data.ipAddress.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'IP address is required for WiFi printers',
        path: ['ipAddress'],
      });
    }
    if (!data.port) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Port is required for WiFi printers',
        path: ['port'],
      });
    }
  }
  
  // Bluetooth printers require device name
  if (data.connectionType === 'bluetooth') {
    if (!data.bluetoothName || data.bluetoothName.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Bluetooth device name is required',
        path: ['bluetoothName'],
      });
    }
  }
});

type PrinterFormValues = z.infer<typeof printerFormSchema>;

export default function PrinterSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedCustomer } = useNavigation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<Printer | null>(null);

  const customerId = selectedCustomer?.id;

  const { data: printers = [], isLoading } = useQuery<Printer[]>({
    queryKey: ['/api/printers', customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const res = await fetch(`/api/printers?customerId=${customerId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch printers');
      return res.json();
    },
    enabled: !!customerId,
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ['/api/locations', customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const res = await fetch(`/api/locations?customerId=${customerId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!customerId,
  });

  const { data: printNodeStatus, isLoading: printNodeLoading, error: printNodeError } = useQuery<PrintNodeStatus>({
    queryKey: ['/api/printnode/printers', customerId],
    queryFn: async () => {
      const res = await fetch('/api/printnode/printers', { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Authentication required');
        }
        throw new Error('Failed to fetch PrintNode status');
      }
      return res.json();
    },
    enabled: !!customerId,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      if (error.message === 'Authentication required') return false;
      return failureCount < 2;
    },
  });

  const form = useForm<PrinterFormValues>({
    resolver: zodResolver(printerFormSchema),
    defaultValues: {
      name: '',
      locationId: null,
      connectionType: 'wifi',
      isDefault: false,
      isActive: true,
      dpi: 300,
    },
  });

  const connectionType = form.watch('connectionType');

  const savePrinterMutation = useMutation({
    mutationFn: async (values: PrinterFormValues) => {
      if (editingPrinter) {
        const res = await apiRequest('PATCH', `/api/printers/${editingPrinter.id}`, values);
        return res.json();
      } else {
        const res = await apiRequest('POST', '/api/printers', { ...values, customerId });
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/printers', customerId] });
      toast({
        title: editingPrinter ? 'Printer updated' : 'Printer added',
        description: editingPrinter 
          ? 'Printer configuration has been updated successfully.'
          : 'New printer has been added successfully.',
      });
      setDialogOpen(false);
      setEditingPrinter(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deletePrinterMutation = useMutation({
    mutationFn: async (printerId: string) => {
      const res = await apiRequest('DELETE', `/api/printers/${printerId}?customerId=${customerId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/printers', customerId] });
      toast({
        title: 'Printer deleted',
        description: 'Printer has been removed successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleEdit = (printer: Printer) => {
    setEditingPrinter(printer);
    form.reset({
      name: printer.name,
      locationId: printer.locationId || null,
      connectionType: printer.connectionType as any,
      ipAddress: printer.ipAddress || '',
      port: printer.port || undefined,
      bluetoothDeviceId: printer.bluetoothDeviceId || '',
      bluetoothName: printer.bluetoothName || '',
      maxWidth: printer.maxWidth || undefined,
      maxHeight: printer.maxHeight || undefined,
      dpi: printer.dpi || 300,
      isDefault: printer.isDefault,
      isActive: printer.isActive,
    });
    setDialogOpen(true);
  };

  const handleDelete = (printerId: string) => {
    if (confirm('Are you sure you want to delete this printer?')) {
      deletePrinterMutation.mutate(printerId);
    }
  };

  const onSubmit = (values: PrinterFormValues) => {
    savePrinterMutation.mutate({
      ...values,
      locationId: values.locationId || null,
    });
  };

  const getConnectionIcon = (type: string) => {
    switch (type) {
      case 'wifi':
        return <Wifi className="h-4 w-4" />;
      case 'bluetooth':
        return <Bluetooth className="h-4 w-4" />;
      default:
        return <PrinterIcon className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="space-y-4">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-4 w-96 bg-muted animate-pulse rounded" />
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-printer-settings">Printer Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage badge printers for WiFi, Bluetooth, AirPrint, and USB connections
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingPrinter(null);
            form.reset();
          }
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-printer">
              <Plus className="h-4 w-4 mr-2" />
              Add Printer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPrinter ? 'Edit Printer' : 'Add New Printer'}</DialogTitle>
              <DialogDescription>
                Configure a badge printer for your events. Choose the connection type and enter the details.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Printer Name <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Badge Printer - Main Desk" data-testid="input-printer-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {locations.length > 0 && (
                  <FormField
                    control={form.control}
                    name="locationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location</FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(val === '__none__' ? null : val)}
                          value={field.value || '__none__'}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="No location assigned" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">No location assigned</SelectItem>
                            {locations.filter(l => l.isActive).map((loc) => (
                              <SelectItem key={loc.id} value={loc.id}>
                                <span className="flex items-center gap-1.5">
                                  <MapPin className="h-3 w-3 text-muted-foreground" />
                                  {loc.name}
                                  {loc.city && <span className="text-muted-foreground">— {loc.city}{loc.state ? `, ${loc.state}` : ''}</span>}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Assign this printer to a specific venue or location
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="connectionType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Connection Type <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-connection-type">
                            <SelectValue placeholder="Select connection type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="wifi">WiFi Network Printer</SelectItem>
                          <SelectItem value="bluetooth">Bluetooth Printer</SelectItem>
                          <SelectItem value="airprint">AirPrint (iOS)</SelectItem>
                          <SelectItem value="usb">USB Printer</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {connectionType === 'wifi' && 'Connect to a network printer via IP address'}
                        {connectionType === 'bluetooth' && 'Pair with a Bluetooth badge printer'}
                        {connectionType === 'airprint' && 'Use Apple AirPrint for iOS devices'}
                        {connectionType === 'usb' && 'Connect via USB cable'}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {connectionType === 'wifi' && (
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="ipAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>IP Address <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="192.168.1.100" data-testid="input-ip-address" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="port"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Port <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="9100" data-testid="input-port" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {connectionType === 'bluetooth' && (
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="bluetoothName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bluetooth Device Name <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Badge Printer BT-500" data-testid="input-bluetooth-name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bluetoothDeviceId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Device ID (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="AA:BB:CC:DD:EE:FF" data-testid="input-bluetooth-id" {...field} />
                          </FormControl>
                          <FormDescription>
                            Leave blank to pair manually during first use
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="maxWidth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Width (inches)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="4" min="2" max="12" data-testid="input-max-width" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="maxHeight"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Height (inches)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="6" min="2" max="12" data-testid="input-max-height" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dpi"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>DPI</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="300" min="72" max="600" data-testid="input-dpi" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="isDefault"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Default Printer</FormLabel>
                          <FormDescription>
                            Use this printer as the default for new events
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-is-default"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Active</FormLabel>
                          <FormDescription>
                            Make this printer available for selection
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-is-active"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDialogOpen(false);
                      setEditingPrinter(null);
                      form.reset();
                    }}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={savePrinterMutation.isPending} data-testid="button-save-printer">
                    {savePrinterMutation.isPending ? 'Saving...' : editingPrinter ? 'Update Printer' : 'Add Printer'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {printers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <PrinterIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No printers configured</h3>
            <p className="text-muted-foreground text-center mb-4">
              Add your first badge printer to start printing at events
            </p>
            <Button onClick={() => setDialogOpen(true)} data-testid="button-add-first-printer">
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Printer
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {printers.map((printer) => (
            <Card key={printer.id} className="hover-elevate" data-testid={`card-printer-${printer.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getConnectionIcon(printer.connectionType)}
                    <CardTitle className="text-lg">{printer.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleEdit(printer)}
                      data-testid={`button-edit-${printer.id}`}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(printer.id)}
                      data-testid={`button-delete-${printer.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <CardDescription className="capitalize">{printer.connectionType} Connection</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  {printer.locationId && (() => {
                    const loc = locations.find(l => l.id === printer.locationId);
                    return loc ? (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Location:</span>
                        <span>{loc.name}{loc.city ? ` — ${loc.city}` : ''}</span>
                      </div>
                    ) : null;
                  })()}
                  {printer.connectionType === 'wifi' && printer.ipAddress && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IP Address:</span>
                      <span className="font-mono">{printer.ipAddress}:{printer.port || 9100}</span>
                    </div>
                  )}
                  {printer.connectionType === 'bluetooth' && printer.bluetoothName && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Device:</span>
                      <span>{printer.bluetoothName}</span>
                    </div>
                  )}
                  {printer.maxWidth && printer.maxHeight && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Max Size:</span>
                      <span>{printer.maxWidth}" × {printer.maxHeight}"</span>
                    </div>
                  )}
                  {printer.dpi && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Resolution:</span>
                      <span>{printer.dpi} DPI</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap">
                  {printer.isDefault && (
                    <Badge variant="default" className="text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Default
                    </Badge>
                  )}
                  {printer.isActive ? (
                    <Badge variant="outline" className="text-xs">Active</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">Inactive</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Separator className="my-8" />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Cloud className="h-6 w-6" />
              PrintNode Cloud Printing
            </h2>
            <p className="text-muted-foreground mt-1">
              Print badges remotely via PrintNode cloud service
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={async () => {
              await queryClient.invalidateQueries({ queryKey: ['/api/printnode/printers', customerId] });
              toast({
                title: "Printers refreshed",
                description: "PrintNode printer list has been updated.",
              });
            }}
            disabled={printNodeLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${printNodeLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {printNodeLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading PrintNode status...</span>
          </div>
        ) : printNodeError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Loading PrintNode</AlertTitle>
            <AlertDescription>
              {printNodeError.message || 'Failed to fetch PrintNode status. Please try refreshing.'}
            </AlertDescription>
          </Alert>
        ) : !printNodeStatus?.configured ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>PrintNode Not Configured</AlertTitle>
            <AlertDescription className="mt-2 space-y-3">
              <p>
                To enable cloud printing, you need to add your PrintNode API key to the environment secrets.
              </p>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>Create a free account at <a href="https://www.printnode.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">printnode.com</a></li>
                <li>Install the PrintNode client on your computer with the printer</li>
                <li>Get your API key from the PrintNode dashboard (Account &rarr; API Keys)</li>
                <li>Add <code className="bg-muted px-1 py-0.5 rounded">PRINTNODE_API_KEY</code> to this app's Secrets</li>
              </ol>
            </AlertDescription>
          </Alert>
        ) : printNodeStatus.printers.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No PrintNode Printers Found</AlertTitle>
            <AlertDescription>
              PrintNode is configured but no printers were detected. Make sure the PrintNode client is running on your computer and your printer is connected.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {printNodeStatus.printers.map((printer) => (
              <Card key={printer.id} className="hover-elevate">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Cloud className="h-4 w-4" />
                      <CardTitle className="text-lg">{printer.name}</CardTitle>
                    </div>
                    <Badge variant={printer.state === 'online' ? 'default' : 'secondary'} className="text-xs">
                      {printer.state === 'online' ? (
                        <><CheckCircle2 className="h-3 w-3 mr-1" /> Online</>
                      ) : (
                        printer.state
                      )}
                    </Badge>
                  </div>
                  <CardDescription>{printer.description || 'PrintNode Cloud Printer'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Computer:</span>
                    <span>{printer.computerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Printer ID:</span>
                    <span className="font-mono">{printer.id}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
