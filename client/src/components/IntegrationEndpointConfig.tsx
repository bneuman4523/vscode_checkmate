import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Settings, Users, Calendar, Layers, Code, RefreshCw, CheckCircle2, AlertCircle, Info } from "lucide-react";
import type { CustomerIntegration, IntegrationEndpointConfig as EndpointConfigType } from "@shared/schema";

interface IntegrationProviderSpec {
  id: string;
  name: string;
  description: string;
  authType: string;
  baseUrlTemplate: string;
  dataTypes: {
    events?: DataTypeSpec;
    attendees?: DataTypeSpec;
    sessions?: DataTypeSpec;
  };
  variableDescriptions: Record<string, string>;
}

interface DataTypeSpec {
  endpoint: {
    path: string;
    method: string;
    description: string;
    variables: string[];
    filters?: string[];
    pagination?: {
      type: string;
      limitParam?: string;
      limitDefault?: number;
      cursorParam?: string;
    };
  };
  fieldMappings: Record<string, {
    sourcePath: string;
    description: string;
    example?: string;
  }>;
}

interface IntegrationEndpointConfigProps {
  integration: CustomerIntegration;
  onClose?: () => void;
}

export function IntegrationEndpointConfig({ integration, onClose }: IntegrationEndpointConfigProps) {
  const { toast } = useToast();
  const [activeDataType, setActiveDataType] = useState<"events" | "attendees" | "sessions" | null>(null);

  const { data: providerSpec, isLoading: specLoading } = useQuery<IntegrationProviderSpec>({
    queryKey: ["/api/provider-catalog", integration.providerId],
    queryFn: async () => {
      const res = await fetch(`/api/provider-catalog/${integration.providerId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch provider spec");
      }
      return res.json();
    },
  });

  const { data: endpointConfigs = [], isLoading: configsLoading } = useQuery<EndpointConfigType[]>({
    queryKey: ["/api/integrations", integration.id, "endpoints"],
    queryFn: async () => {
      const res = await fetch(`/api/integrations/${integration.id}/endpoints`);
      if (!res.ok) {
        throw new Error("Failed to fetch endpoint configs");
      }
      return res.json();
    },
  });

  const dataTypeIcons = {
    events: Calendar,
    attendees: Users,
    sessions: Layers,
  };

  const dataTypeLabels = {
    events: "Events",
    attendees: "Attendees",
    sessions: "Sessions",
  };

  if (specLoading || configsLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading configuration...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!providerSpec || !providerSpec.dataTypes) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center text-destructive">
            <AlertCircle className="h-6 w-6 mr-2" />
            <span>Provider specification not found for {integration.providerId}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const availableDataTypes = useMemo(() => 
    Object.keys(providerSpec.dataTypes).filter(
      (dt): dt is "events" | "attendees" | "sessions" => 
        dt === "events" || dt === "attendees" || dt === "sessions"
    ),
    [providerSpec.dataTypes]
  );

  useEffect(() => {
    if (availableDataTypes.length > 0 && activeDataType === null) {
      setActiveDataType(availableDataTypes[0]);
    }
  }, [availableDataTypes, activeDataType]);

  if (activeDataType === null) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Endpoint Configuration
              </CardTitle>
              <CardDescription>
                Configure API endpoints for {providerSpec.name} integration
              </CardDescription>
            </div>
            <Badge variant="outline">{providerSpec.authType.toUpperCase()}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Base URL</Label>
                <Input 
                  value={integration.baseUrl || providerSpec.baseUrlTemplate} 
                  disabled 
                  className="font-mono text-sm"
                  data-testid="input-base-url"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Default: {providerSpec.baseUrlTemplate}
                </p>
              </div>
              <div>
                <Label>Provider</Label>
                <Input value={providerSpec.name} disabled data-testid="input-provider" />
                <p className="text-xs text-muted-foreground mt-1">
                  {providerSpec.description}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Data Type Endpoints
          </CardTitle>
          <CardDescription>
            Configure paths and field mappings for each data type
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeDataType} onValueChange={(v) => setActiveDataType(v as typeof activeDataType)}>
            <TabsList className="grid w-full grid-cols-3">
              {availableDataTypes.map((dataType) => {
                const Icon = dataTypeIcons[dataType];
                const config = endpointConfigs.find(c => c.dataType === dataType);
                return (
                  <TabsTrigger 
                    key={dataType} 
                    value={dataType}
                    className="flex items-center gap-2"
                    data-testid={`tab-${dataType}`}
                  >
                    <Icon className="h-4 w-4" />
                    {dataTypeLabels[dataType]}
                    {config?.enabled && (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {availableDataTypes.map((dataType) => (
              <TabsContent key={dataType} value={dataType} className="mt-4">
                <EndpointDataTypeConfig
                  integration={integration}
                  dataType={dataType}
                  spec={providerSpec.dataTypes[dataType]!}
                  config={endpointConfigs.find(c => c.dataType === dataType)}
                  variableDescriptions={providerSpec.variableDescriptions}
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {onClose && (
        <div className="flex justify-end">
          <Button onClick={onClose} variant="outline" data-testid="button-close">
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

interface EndpointDataTypeConfigProps {
  integration: CustomerIntegration;
  dataType: "events" | "attendees" | "sessions";
  spec: DataTypeSpec;
  config?: EndpointConfigType;
  variableDescriptions: Record<string, string>;
}

function EndpointDataTypeConfig({ integration, dataType, spec, config, variableDescriptions }: EndpointDataTypeConfigProps) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [pathOverride, setPathOverride] = useState(config?.pathOverride ?? "");
  const [syncInterval, setSyncInterval] = useState(config?.syncInterval ?? 60);
  const [variableOverrides, setVariableOverrides] = useState<Record<string, string>>(
    (config?.variableOverrides as Record<string, string>) ?? {}
  );
  const [fieldMappingOverrides, setFieldMappingOverrides] = useState<Record<string, { sourcePath: string; transform?: string }>>(
    (config?.fieldMappingOverrides as Record<string, { sourcePath: string; transform?: string }>) ?? {}
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data = {
        dataType,
        enabled,
        pathOverride: pathOverride || null,
        syncInterval,
        variableOverrides: Object.keys(variableOverrides).length > 0 ? variableOverrides : null,
        fieldMappingOverrides: Object.keys(fieldMappingOverrides).length > 0 ? fieldMappingOverrides : null,
      };

      if (config) {
        return apiRequest("PATCH", `/api/integrations/${integration.id}/endpoints/${config.id}`, data);
      } else {
        return apiRequest("POST", `/api/integrations/${integration.id}/endpoints`, data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations", integration.id, "endpoints"] });
      toast({ title: "Configuration saved", description: `${dataType} endpoint configuration has been saved.` });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const handleVariableChange = (key: string, value: string) => {
    setVariableOverrides(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleFieldMappingChange = (field: string, sourcePath: string) => {
    setFieldMappingOverrides(prev => ({
      ...prev,
      [field]: { sourcePath },
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-3">
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            data-testid={`switch-${dataType}-enabled`}
          />
          <div>
            <Label className="text-base">Enable {dataType} sync</Label>
            <p className="text-sm text-muted-foreground">
              {spec.endpoint.description}
            </p>
          </div>
        </div>
        <Button 
          onClick={() => saveMutation.mutate()} 
          disabled={saveMutation.isPending}
          data-testid={`button-save-${dataType}`}
        >
          {saveMutation.isPending ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Configuration"
          )}
        </Button>
      </div>

      <Accordion type="single" collapsible defaultValue="endpoint" className="w-full">
        <AccordionItem value="endpoint">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <Code className="h-4 w-4" />
              Endpoint Path
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            <div>
              <Label>Default Path</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-muted rounded-md font-mono text-sm">
                  {spec.endpoint.method} {spec.endpoint.path}
                </code>
              </div>
            </div>

            <div>
              <Label>Path Override (optional)</Label>
              <Input
                value={pathOverride}
                onChange={(e) => setPathOverride(e.target.value)}
                placeholder={spec.endpoint.path}
                className="font-mono"
                data-testid={`input-${dataType}-path-override`}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty to use the default path. Use {"{variable}"} placeholders for dynamic values.
              </p>
            </div>

            {spec.endpoint.pagination && (
              <div className="p-3 bg-muted/50 rounded-md">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Pagination</span>
                </div>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <Badge variant="secondary">{spec.endpoint.pagination.type}</Badge>
                  </div>
                  {spec.endpoint.pagination.limitParam && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Limit param:</span>
                      <code>{spec.endpoint.pagination.limitParam}</code>
                    </div>
                  )}
                  {spec.endpoint.pagination.limitDefault && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Default limit:</span>
                      <span>{spec.endpoint.pagination.limitDefault}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {spec.endpoint.variables.length > 0 && (
          <AccordionItem value="variables">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Variables ({spec.endpoint.variables.length})
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              {spec.endpoint.variables.map((variable) => (
                <div key={variable}>
                  <Label>{variable}</Label>
                  <Input
                    value={variableOverrides[variable] ?? ""}
                    onChange={(e) => handleVariableChange(variable, e.target.value)}
                    placeholder={`Enter ${variable}`}
                    data-testid={`input-variable-${variable}`}
                  />
                  {variableDescriptions[variable] && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {variableDescriptions[variable]}
                    </p>
                  )}
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        )}

        <AccordionItem value="field-mappings">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Field Mappings ({Object.keys(spec.fieldMappings).length})
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground mb-4">
              Map API response fields to your application fields. Use dot notation for nested values (e.g., "profile.email").
            </p>
            <div className="grid gap-3">
              {Object.entries(spec.fieldMappings).map(([field, mapping]) => (
                <div key={field} className="grid grid-cols-2 gap-2 items-start">
                  <div>
                    <Label className="text-xs font-medium">{field}</Label>
                    <p className="text-xs text-muted-foreground">{mapping.description}</p>
                  </div>
                  <Input
                    value={fieldMappingOverrides[field]?.sourcePath ?? mapping.sourcePath}
                    onChange={(e) => handleFieldMappingChange(field, e.target.value)}
                    placeholder={mapping.sourcePath}
                    className="font-mono text-sm"
                    data-testid={`input-mapping-${field}`}
                  />
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {spec.endpoint.filters && spec.endpoint.filters.length > 0 && (
          <AccordionItem value="filters">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Available Filters ({spec.endpoint.filters.length})
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="flex flex-wrap gap-2">
                {spec.endpoint.filters.map((filter) => (
                  <Badge key={filter} variant="secondary" className="font-mono">
                    {filter}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                These filters can be applied when querying this endpoint.
              </p>
            </AccordionContent>
          </AccordionItem>
        )}

        <AccordionItem value="sync">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Sync Settings
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            <div>
              <Label>Sync Interval (minutes)</Label>
              <Input
                type="number"
                min={5}
                max={1440}
                value={syncInterval}
                onChange={(e) => setSyncInterval(parseInt(e.target.value) || 60)}
                data-testid={`input-${dataType}-sync-interval`}
              />
              <p className="text-xs text-muted-foreground mt-1">
                How often to automatically sync data from the external system (5-1440 minutes).
              </p>
            </div>

            {config?.lastSyncAt && (
              <div className="p-3 bg-muted/50 rounded-md">
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last sync:</span>
                    <span>{new Date(config.lastSyncAt).toLocaleString()}</span>
                  </div>
                  {config.lastSyncStatus && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge 
                        variant={config.lastSyncStatus === "success" ? "default" : "destructive"}
                      >
                        {config.lastSyncStatus}
                      </Badge>
                    </div>
                  )}
                  {config.lastSyncError && (
                    <div className="mt-2">
                      <span className="text-muted-foreground text-xs">Last error:</span>
                      <p className="text-xs text-destructive mt-1">{config.lastSyncError}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

export default IntegrationEndpointConfig;
