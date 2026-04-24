import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Plus,
  RefreshCw,
  AlertTriangle,
  Copy,
  Loader2,
  Lock,
  ChevronDown,
  ChevronRight,
  Calendar,
  Users,
  Layers,
  FileText,
  Shield,
} from "lucide-react";
import type { IntegrationProvider, Customer } from "@shared/schema";
import type { RealtimeSyncConfig, SyncTemplates, DefaultSyncSettings } from "./types";
import { INTEGRATION_PROVIDERS } from "@shared/integration-providers";

interface IntegrationConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEditMode: boolean;
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
  selectedProvider: IntegrationProvider | null;
  providers: IntegrationProvider[];
  customer: Customer | undefined;
  canEditSettings: boolean;
  isSuperAdmin: boolean;
  syncSettingsEditable: boolean;
  onSyncSettingsEditableChange: (editable: boolean) => void;
  integrationName: string;
  onIntegrationNameChange: (value: string) => void;
  baseUrl: string;
  onBaseUrlChange: (value: string) => void;
  accountCode: string;
  onAccountCodeChange: (value: string) => void;
  testEndpointPath: string;
  onTestEndpointPathChange: (value: string) => void;
  eventListEndpointPath: string;
  onEventListEndpointPathChange: (value: string) => void;
  authMethod: string;
  apiKeyValue: string;
  onApiKeyValueChange: (value: string) => void;
  basicUsername: string;
  onBasicUsernameChange: (value: string) => void;
  clientId: string;
  onClientIdChange: (value: string) => void;
  clientSecret: string;
  onClientSecretChange: (value: string) => void;
  scope: string;
  onScopeChange: (value: string) => void;
  onAuthMethodChange: (value: string) => void;
  syncTemplates: SyncTemplates;
  onSyncTemplatesChange: (templates: SyncTemplates) => void;
  defaultSyncSettings: DefaultSyncSettings;
  onDefaultSyncSettingsChange: (settings: DefaultSyncSettings) => void;
  realtimeSyncConfig: RealtimeSyncConfig;
  onRealtimeSyncConfigChange: (config: RealtimeSyncConfig) => void;
  eventSearchQuery: string;
  onEventSearchQueryChange: (value: string) => void;
  eventCode: string;
  eventName: string;
  externalEventId: string;
  fieldMappings: Record<string, string>;
  onFieldMappingsChange: (mappings: Record<string, string>) => void;
  onProviderChange: (providerId: string) => void;
  onSearchEvents: () => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  onResetAndOpen: () => void;
  copyToClipboard: (text: string, label: string) => void;
}

export function IntegrationConfigDialog({
  open,
  onOpenChange,
  isEditMode,
  activeTab,
  onActiveTabChange,
  selectedProvider,
  providers,
  customer,
  canEditSettings,
  isSuperAdmin,
  syncSettingsEditable,
  onSyncSettingsEditableChange,
  integrationName,
  onIntegrationNameChange,
  baseUrl,
  onBaseUrlChange,
  accountCode,
  onAccountCodeChange,
  testEndpointPath,
  onTestEndpointPathChange,
  eventListEndpointPath,
  onEventListEndpointPathChange,
  authMethod,
  apiKeyValue,
  onApiKeyValueChange,
  basicUsername,
  onBasicUsernameChange,
  clientId,
  onClientIdChange,
  clientSecret,
  onClientSecretChange,
  scope,
  onScopeChange,
  onAuthMethodChange,
  syncTemplates,
  onSyncTemplatesChange,
  defaultSyncSettings,
  onDefaultSyncSettingsChange,
  realtimeSyncConfig,
  onRealtimeSyncConfigChange,
  eventSearchQuery,
  onEventSearchQueryChange,
  eventCode,
  eventName,
  externalEventId,
  fieldMappings,
  onFieldMappingsChange,
  onProviderChange,
  onSearchEvents,
  onSave,
  onCancel,
  isSaving,
  onResetAndOpen,
  copyToClipboard,
}: IntegrationConfigDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          data-testid="button-add-integration"
          onClick={onResetAndOpen}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Integration
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Integration" : "Setup Integration"}</DialogTitle>
          <DialogDescription>
            {isEditMode ? "Update your integration configuration" : "Connect to your event registration platform"}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={onActiveTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="auth">Auth</TabsTrigger>
            <TabsTrigger value="sync">Sync</TabsTrigger>
            <TabsTrigger value="realtime">Realtime</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="mapping">Mapping</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4">
            <BasicTab
              isEditMode={isEditMode}
              selectedProvider={selectedProvider}
              providers={providers}
              customer={customer}
              integrationName={integrationName}
              onIntegrationNameChange={onIntegrationNameChange}
              baseUrl={baseUrl}
              onBaseUrlChange={onBaseUrlChange}
              accountCode={accountCode}
              onAccountCodeChange={onAccountCodeChange}
              testEndpointPath={testEndpointPath}
              onTestEndpointPathChange={onTestEndpointPathChange}
              authMethod={authMethod}
              onAuthMethodChange={onAuthMethodChange}
              onProviderChange={onProviderChange}
            />
          </TabsContent>

          <TabsContent value="auth" className="space-y-4">
            <AuthTab
              isEditMode={isEditMode}
              selectedProvider={selectedProvider}
              authMethod={authMethod}
              apiKeyValue={apiKeyValue}
              onApiKeyValueChange={onApiKeyValueChange}
              basicUsername={basicUsername}
              onBasicUsernameChange={onBasicUsernameChange}
              clientId={clientId}
              onClientIdChange={onClientIdChange}
              clientSecret={clientSecret}
              onClientSecretChange={onClientSecretChange}
              scope={scope}
              onScopeChange={onScopeChange}
            />
          </TabsContent>

          <TabsContent value="sync" className="space-y-4">
            <SyncTab
              canEditSettings={canEditSettings}
              isSuperAdmin={isSuperAdmin}
              syncSettingsEditable={syncSettingsEditable}
              onSyncSettingsEditableChange={onSyncSettingsEditableChange}
              selectedProvider={selectedProvider}
              accountCode={accountCode}
              eventListEndpointPath={eventListEndpointPath}
              onEventListEndpointPathChange={onEventListEndpointPathChange}
              syncTemplates={syncTemplates}
              onSyncTemplatesChange={onSyncTemplatesChange}
              defaultSyncSettings={defaultSyncSettings}
              onDefaultSyncSettingsChange={onDefaultSyncSettingsChange}
            />
          </TabsContent>

          <TabsContent value="realtime" className="space-y-4">
            <RealtimeTab
              canEditSettings={canEditSettings}
              syncSettingsEditable={syncSettingsEditable}
              onSyncSettingsEditableChange={onSyncSettingsEditableChange}
              realtimeSyncConfig={realtimeSyncConfig}
              onRealtimeSyncConfigChange={onRealtimeSyncConfigChange}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-4">
            <EventsTab
              eventSearchQuery={eventSearchQuery}
              onEventSearchQueryChange={onEventSearchQueryChange}
              eventCode={eventCode}
              eventName={eventName}
              externalEventId={externalEventId}
              onSearchEvents={onSearchEvents}
              copyToClipboard={copyToClipboard}
            />
          </TabsContent>

          <TabsContent value="mapping" className="space-y-4">
            <MappingTab
              fieldMappings={fieldMappings}
              onFieldMappingsChange={onFieldMappingsChange}
            />
          </TabsContent>
        </Tabs>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={isSaving}
            data-testid="button-save-integration"
          >
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {isEditMode ? "Update Integration" : "Save Integration"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BasicTab({
  isEditMode,
  selectedProvider,
  providers,
  customer,
  integrationName,
  onIntegrationNameChange,
  baseUrl,
  onBaseUrlChange,
  accountCode,
  onAccountCodeChange,
  testEndpointPath,
  onTestEndpointPathChange,
  authMethod,
  onAuthMethodChange,
  onProviderChange,
}: {
  isEditMode: boolean;
  selectedProvider: IntegrationProvider | null;
  providers: IntegrationProvider[];
  customer: Customer | undefined;
  integrationName: string;
  onIntegrationNameChange: (value: string) => void;
  baseUrl: string;
  onBaseUrlChange: (value: string) => void;
  accountCode: string;
  onAccountCodeChange: (value: string) => void;
  testEndpointPath: string;
  onTestEndpointPathChange: (value: string) => void;
  authMethod: string;
  onAuthMethodChange: (value: string) => void;
  onProviderChange: (providerId: string) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="provider">Platform</Label>
        {isEditMode ? (
          <div className="flex items-center gap-2 p-2 border rounded-md bg-muted">
            {selectedProvider?.logoUrl && (
              <img src={selectedProvider.logoUrl} alt={selectedProvider.name} className="w-4 h-4" />
            )}
            <span className="text-sm">{selectedProvider?.name || "Unknown Platform"}</span>
            <Badge variant="outline" className="ml-2 text-xs">
              {selectedProvider?.authType?.toUpperCase() || "N/A"}
            </Badge>
            <span className="ml-auto text-xs text-muted-foreground">(Read-only)</span>
          </div>
        ) : (
          <Select onValueChange={onProviderChange}>
            <SelectTrigger id="provider" data-testid="select-provider">
              <SelectValue placeholder="Select a platform" />
            </SelectTrigger>
            <SelectContent>
              {providers.map(provider => (
                <SelectItem key={provider.id} value={provider.id}>
                  <div className="flex items-center gap-2">
                    {provider.logoUrl && (
                      <img src={provider.logoUrl} alt={provider.name} className="w-4 h-4" />
                    )}
                    {provider.name}
                    <Badge variant="outline" className="ml-2 text-xs">
                      {provider.authType.toUpperCase()}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {isEditMode && (
          <p className="text-xs text-muted-foreground">
            Platform cannot be changed after creation. Create a new integration if you need a different platform.
          </p>
        )}
      </div>

      {selectedProvider && (
        <>
          <div className="space-y-2">
            <Label htmlFor="integration-name">Integration Name</Label>
            <Input
              id="integration-name"
              value={integrationName}
              onChange={(e) => onIntegrationNameChange(e.target.value)}
              placeholder={selectedProvider.id === "custom" ? "My Custom API" : `My ${selectedProvider.name} Account`}
              data-testid="input-integration-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="base-url">Base URL</Label>
            <Input
              id="base-url"
              value={baseUrl}
              onChange={(e) => onBaseUrlChange(e.target.value)}
              placeholder={(selectedProvider as any).defaultBaseUrl || "https://api.example.com/v1"}
              data-testid="input-base-url"
            />
            <p className="text-xs text-muted-foreground">
              {customer?.apiBaseUrl && baseUrl === customer.apiBaseUrl ? (
                <>Using account default base URL. <span className="text-primary">Can be overridden per integration.</span></>
              ) : (
                "API endpoint for this platform"
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-code">Account Code</Label>
            <Input
              id="account-code"
              value={accountCode}
              onChange={(e) => onAccountCodeChange(e.target.value)}
              placeholder="e.g., acme-corp"
              data-testid="input-account-code"
            />
            <p className="text-xs text-muted-foreground">
              Your organization's unique identifier on the external platform (used in API endpoint URLs)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="test-endpoint">Test Endpoint Path</Label>
            <Input
              id="test-endpoint"
              value={testEndpointPath}
              onChange={(e) => onTestEndpointPathChange(e.target.value)}
              placeholder="/certainExternal/service/v1/Event/{accountCode}"
              data-testid="input-test-endpoint"
            />
            <p className="text-xs text-muted-foreground">
              Use <code className="bg-muted px-1 rounded">{"{accountCode}"}</code> as a variable that will be replaced with the Account Code above.
              Example: <code className="bg-muted px-1 rounded">/certainExternal/service/v1/Event/{"{accountCode}"}</code>
            </p>
          </div>

          {selectedProvider.id === "custom" && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="auth-type">Authentication Type</Label>
                <Select value={authMethod} onValueChange={onAuthMethodChange}>
                  <SelectTrigger id="auth-type" data-testid="select-auth-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="apikey">API Key</SelectItem>
                    <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                    <SelectItem value="basic">Basic Auth</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="attendee-endpoint">Attendees Endpoint Path</Label>
                <Input
                  id="attendee-endpoint"
                  placeholder="/events/{eventId}/attendees"
                  data-testid="input-attendee-endpoint"
                />
                <p className="text-xs text-muted-foreground">
                  Path to fetch attendees. Use {'{eventId}'} as placeholder.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pagination-type">Pagination Type</Label>
                <Select defaultValue="offset">
                  <SelectTrigger id="pagination-type" data-testid="select-pagination-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="offset">Offset-based</SelectItem>
                    <SelectItem value="cursor">Cursor-based</SelectItem>
                    <SelectItem value="page">Page-based</SelectItem>
                    <SelectItem value="none">No pagination</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rate-limit">Rate Limit (req/min)</Label>
                  <Input
                    id="rate-limit"
                    type="number"
                    placeholder="60"
                    defaultValue="60"
                    data-testid="input-rate-limit"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeout-basic">Timeout (seconds)</Label>
                  <Input
                    id="timeout-basic"
                    type="number"
                    placeholder="30"
                    defaultValue="30"
                    data-testid="input-timeout"
                  />
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

function AuthTab({
  isEditMode,
  selectedProvider,
  authMethod,
  apiKeyValue,
  onApiKeyValueChange,
  basicUsername,
  onBasicUsernameChange,
  clientId,
  onClientIdChange,
  clientSecret,
  onClientSecretChange,
  scope,
  onScopeChange,
}: {
  isEditMode: boolean;
  selectedProvider: IntegrationProvider | null;
  authMethod: string;
  apiKeyValue: string;
  onApiKeyValueChange: (value: string) => void;
  basicUsername: string;
  onBasicUsernameChange: (value: string) => void;
  clientId: string;
  onClientIdChange: (value: string) => void;
  clientSecret: string;
  onClientSecretChange: (value: string) => void;
  scope: string;
  onScopeChange: (value: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Authentication</CardTitle>
        <CardDescription>
          {selectedProvider?.authType === "oauth2"
            ? "OAuth2 credentials for secure authorization"
            : selectedProvider?.authType === "basic"
            ? "Basic authentication credentials"
            : "API credentials for authentication"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditMode && (
          <div className="bg-muted p-3 rounded-md">
            <p className="text-sm text-muted-foreground">
              For security, existing credentials are not displayed. Use the credential management buttons on the integration card to update credentials.
            </p>
          </div>
        )}

        {(selectedProvider?.authType === "oauth2" || authMethod === "oauth2") && (
          <>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                OAuth 2.0 uses secure authorization flow. You'll be redirected to the provider to grant access.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-id">Client ID (Optional)</Label>
              <Input
                id="client-id"
                value={clientId}
                onChange={(e) => onClientIdChange(e.target.value)}
                placeholder="Your OAuth client ID"
                data-testid="input-client-id"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to use system-provided credentials
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-secret">Client Secret (Optional)</Label>
              <Input
                id="client-secret"
                type="password"
                value={clientSecret}
                onChange={(e) => onClientSecretChange(e.target.value)}
                placeholder="Your OAuth client secret"
                data-testid="input-client-secret"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="scope">Scopes</Label>
              <Input
                id="scope"
                value={scope}
                onChange={(e) => onScopeChange(e.target.value)}
                placeholder="read_events read_attendees"
                data-testid="input-scope"
              />
              <p className="text-xs text-muted-foreground">
                Space-separated list of OAuth scopes to request
              </p>
            </div>
          </>
        )}

        {(selectedProvider?.authType === "apikey" || authMethod === "apikey") && (
          <>
            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-md">
              <p className="text-sm text-green-700 dark:text-green-300">
                API key will be securely stored and encrypted.
              </p>
            </div>
            {!isEditMode && (
              <div className="space-y-2">
                <Label htmlFor="api-key-create">API Key</Label>
                <Input
                  id="api-key-create"
                  type="password"
                  value={apiKeyValue}
                  onChange={(e) => onApiKeyValueChange(e.target.value)}
                  placeholder="Enter your API key"
                  data-testid="input-api-key-create"
                />
                <p className="text-xs text-muted-foreground">
                  Your credentials will be encrypted and stored securely
                </p>
              </div>
            )}
          </>
        )}

        {(selectedProvider?.authType === "bearer" || authMethod === "bearer" || selectedProvider?.authType === "bearerToken" || authMethod === "bearerToken") && (
          <>
            <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-md">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Bearer token will be securely stored and encrypted.
              </p>
            </div>
            {!isEditMode && (
              <div className="space-y-2">
                <Label htmlFor="bearer-token-create">Bearer Token</Label>
                <Input
                  id="bearer-token-create"
                  type="password"
                  value={apiKeyValue}
                  onChange={(e) => onApiKeyValueChange(e.target.value)}
                  placeholder="Enter your bearer token"
                  data-testid="input-bearer-token-create"
                />
                <p className="text-xs text-muted-foreground">
                  Your credentials will be encrypted and stored securely
                </p>
              </div>
            )}
          </>
        )}

        {(selectedProvider?.authType === "basic" || authMethod === "basic") && (
          <>
            <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-md">
              <p className="text-sm text-purple-700 dark:text-purple-300">
                Basic authentication requires a username and password/API key. The Account Code (Settings tab) is used in endpoint URLs, not as the username.
              </p>
            </div>
            {!isEditMode && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="basic-username-create">Username</Label>
                  <Input
                    id="basic-username-create"
                    value={basicUsername}
                    onChange={(e) => onBasicUsernameChange(e.target.value)}
                    placeholder="Enter your username"
                    data-testid="input-basic-username-create"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="basic-password-create">Password / API Key</Label>
                  <Input
                    id="basic-password-create"
                    type="password"
                    value={apiKeyValue}
                    onChange={(e) => onApiKeyValueChange(e.target.value)}
                    placeholder="Enter your password or API key"
                    data-testid="input-basic-password-create"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Your credentials will be encrypted and stored securely
                </p>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function EditableSettingsLock({
  editable,
  onEditableChange,
  canEdit,
  labelId,
  warningText,
}: {
  editable: boolean;
  onEditableChange: (editable: boolean) => void;
  canEdit: boolean;
  labelId: string;
  warningText: string;
}) {
  if (!editable) {
    return (
      <div className="flex items-center gap-2 p-3 bg-muted rounded-md border">
        <Lock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          These settings are read-only to prevent accidental changes.
        </span>
        {canEdit && (
          <div className="ml-auto flex items-center gap-2">
            <Checkbox
              id={`unlock-${labelId}`}
              checked={editable}
              onCheckedChange={(checked) => onEditableChange(checked === true)}
            />
            <Label htmlFor={`unlock-${labelId}`} className="text-sm cursor-pointer">
              Enable editing
            </Label>
          </div>
        )}
      </div>
    );
  }

  if (canEdit) {
    return (
      <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950 rounded-md border border-yellow-200 dark:border-yellow-800">
        <AlertTriangle className="h-4 w-4 text-yellow-600" />
        <span className="text-sm text-yellow-700 dark:text-yellow-300">
          {warningText}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Checkbox
            id={`unlock-${labelId}-editing`}
            checked={editable}
            onCheckedChange={(checked) => onEditableChange(checked === true)}
          />
          <Label htmlFor={`unlock-${labelId}-editing`} className="text-sm cursor-pointer">
            Enable editing
          </Label>
        </div>
      </div>
    );
  }

  return null;
}

function SyncTab({
  canEditSettings,
  isSuperAdmin,
  syncSettingsEditable,
  onSyncSettingsEditableChange,
  selectedProvider,
  accountCode,
  eventListEndpointPath,
  onEventListEndpointPathChange,
  syncTemplates,
  onSyncTemplatesChange,
  defaultSyncSettings,
  onDefaultSyncSettingsChange,
}: {
  canEditSettings: boolean;
  isSuperAdmin: boolean;
  syncSettingsEditable: boolean;
  onSyncSettingsEditableChange: (editable: boolean) => void;
  selectedProvider: IntegrationProvider | null;
  accountCode: string;
  eventListEndpointPath: string;
  onEventListEndpointPathChange: (value: string) => void;
  syncTemplates: SyncTemplates;
  onSyncTemplatesChange: (templates: SyncTemplates) => void;
  defaultSyncSettings: DefaultSyncSettings;
  onDefaultSyncSettingsChange: (settings: DefaultSyncSettings) => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Derive enabled states from whether sync templates have endpoint paths
  const eventsEnabled = !!eventListEndpointPath;
  const attendeesEnabled = !!syncTemplates.attendees?.endpointPath;
  const sessionsEnabled = !!syncTemplates.sessions?.endpointPath;
  const sessionRegsEnabled = !!syncTemplates.sessionRegistrations?.endpointPath;

  // Determine if adaptive schedule is in use
  const isAdaptive = defaultSyncSettings.duringEventIntervalMinutes <= 1
    && defaultSyncSettings.preEventIntervalMinutes >= 1440;

  // Look up the provider spec for resolved URLs in advanced view
  const providerSpec = selectedProvider?.id ? INTEGRATION_PROVIDERS[selectedProvider.id] : undefined;

  // Build a resolved URL by substituting accountCode
  const resolveUrl = (path: string) => {
    return path
      .replace(/\{accountCode\}/g, accountCode || "{accountCode}")
      .replace(/\{\{accountCode\}\}/g, accountCode || "{{accountCode}}");
  };

  // Toggle handler — when a data type is enabled, set a default endpoint path from the provider spec
  const handleToggleEvents = (enabled: boolean) => {
    if (enabled && !eventListEndpointPath && providerSpec?.dataTypes?.events) {
      onEventListEndpointPathChange(
        `/certainExternal/service/v1/Event/{{accountCode}}?isActive=true&includeList=tags`
      );
    } else if (!enabled) {
      onEventListEndpointPathChange("");
    }
  };

  const handleToggleAttendees = (enabled: boolean) => {
    if (enabled && !syncTemplates.attendees?.endpointPath) {
      const defaultPath = providerSpec?.dataTypes?.attendees
        ? `/certainExternal/service/v1/Registration/{{accountCode}}/{{eventCode}}?max_results=5000`
        : "/accounts/{{accountCode}}/events/{{eventCode}}/registrations";
      onSyncTemplatesChange({
        ...syncTemplates,
        attendees: { endpointPath: defaultPath },
      });
    } else if (!enabled) {
      onSyncTemplatesChange({
        ...syncTemplates,
        attendees: { endpointPath: "" },
      });
    }
  };

  const handleToggleSessions = (enabled: boolean) => {
    if (enabled && !syncTemplates.sessions?.endpointPath) {
      const defaultPath = providerSpec?.dataTypes?.sessions
        ? `/api/standard/2.0/accounts/{{accountCode}}/events/{{eventCode}}/sessions?dateModified_after={{lastSyncTimestamp}}`
        : "/accounts/{{accountCode}}/events/{{eventCode}}/sessions";
      onSyncTemplatesChange({
        ...syncTemplates,
        sessions: { endpointPath: defaultPath },
      });
    } else if (!enabled) {
      onSyncTemplatesChange({
        ...syncTemplates,
        sessions: { endpointPath: "" },
      });
    }
  };

  const handleToggleSessionRegs = (enabled: boolean) => {
    if (enabled && !syncTemplates.sessionRegistrations?.endpointPath) {
      const defaultPath = `/api/standard/2.0/accounts/{{accountCode}}/events/{{eventCode}}/registrations`;
      onSyncTemplatesChange({
        ...syncTemplates,
        sessionRegistrations: { endpointPath: defaultPath },
      });
    } else if (!enabled) {
      onSyncTemplatesChange({
        ...syncTemplates,
        sessionRegistrations: { endpointPath: "" },
      });
    }
  };

  const handleScheduleChange = (value: string) => {
    if (value === "adaptive") {
      onDefaultSyncSettingsChange({
        preEventIntervalMinutes: 1440,
        duringEventIntervalMinutes: 1,
      });
    }
    // "fixed" keeps current values but user can edit the interval
  };

  return (
    <div className="space-y-4">
      {/* What to Sync */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">What to Sync</CardTitle>
          <CardDescription>
            Choose which data types to synchronize from the external platform.
            Sync runs in order: Events, Attendees, Sessions, Session Registrations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-sm font-medium">Events</Label>
                <p className="text-xs text-muted-foreground">Auto-discover events from the external platform</p>
              </div>
            </div>
            <Switch
              checked={eventsEnabled}
              onCheckedChange={handleToggleEvents}
              data-testid="switch-sync-events"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-sm font-medium">Attendees</Label>
                <p className="text-xs text-muted-foreground">Sync registrations per event</p>
              </div>
            </div>
            <Switch
              checked={attendeesEnabled}
              onCheckedChange={handleToggleAttendees}
              data-testid="switch-sync-attendees"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
            <div className="flex items-center gap-3">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-sm font-medium">Sessions</Label>
                <p className="text-xs text-muted-foreground">Sync sessions per event</p>
              </div>
            </div>
            <Switch
              checked={sessionsEnabled}
              onCheckedChange={handleToggleSessions}
              data-testid="switch-sync-sessions"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-sm font-medium">Session Registrations</Label>
                <p className="text-xs text-muted-foreground">Sync attendee-to-session assignments</p>
              </div>
            </div>
            <Switch
              checked={sessionRegsEnabled}
              onCheckedChange={handleToggleSessionRegs}
              data-testid="switch-sync-session-regs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Sync Behavior */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sync Behavior</CardTitle>
          <CardDescription>
            Control how frequently data is pulled from the external platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={isAdaptive ? "adaptive" : "fixed"}
            onValueChange={handleScheduleChange}
          >
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
              <RadioGroupItem value="adaptive" id="schedule-adaptive" className="mt-0.5" />
              <div>
                <Label htmlFor="schedule-adaptive" className="text-sm font-medium cursor-pointer">
                  Adaptive (recommended)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Syncs more frequently as events approach. Daily before event, every minute during.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
              <RadioGroupItem value="fixed" id="schedule-fixed" className="mt-0.5" />
              <div className="flex-1">
                <Label htmlFor="schedule-fixed" className="text-sm font-medium cursor-pointer">
                  Fixed interval
                </Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Use the same sync interval regardless of event timing.
                </p>
                {!isAdaptive && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Before event (min)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={defaultSyncSettings.preEventIntervalMinutes}
                        onChange={(e) => onDefaultSyncSettingsChange({
                          ...defaultSyncSettings,
                          preEventIntervalMinutes: parseInt(e.target.value) || 60
                        })}
                        data-testid="input-pre-event-interval"
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">During event (min)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={defaultSyncSettings.duringEventIntervalMinutes}
                        onChange={(e) => onDefaultSyncSettingsChange({
                          ...defaultSyncSettings,
                          duringEventIntervalMinutes: parseInt(e.target.value) || 5
                        })}
                        data-testid="input-during-event-interval"
                        className="h-8"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </RadioGroup>

          {accountCode && (
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
              <Label className="text-xs text-muted-foreground">Account Code:</Label>
              <Badge variant="secondary" className="font-mono text-xs">{accountCode}</Badge>
              <span className="text-xs text-muted-foreground">(from integration config)</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Super Admin Advanced Settings */}
      {isSuperAdmin && (
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <Card>
            <CardHeader className="pb-0">
              <CollapsibleTrigger className="flex items-center justify-between w-full group">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Advanced Settings</CardTitle>
                  <Badge variant="outline" className="text-xs">Super Admin</Badge>
                </div>
                {advancedOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
                )}
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-4 space-y-4">
                {/* Resolved Endpoints (read-only) */}
                {providerSpec && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Resolved Endpoints (read-only)</Label>
                    <div className="bg-muted/50 border rounded-lg p-4 font-mono text-xs space-y-3">
                      {providerSpec.dataTypes.events && (
                        <div>
                          <span className="text-muted-foreground">Events:</span>
                          <div className="mt-1">
                            {providerSpec.dataTypes.events.endpoint.method}{" "}
                            {resolveUrl(providerSpec.dataTypes.events.endpoint.path)}
                          </div>
                          {providerSpec.dataTypes.events.endpoint.incrementalFilter && (
                            <div className="text-muted-foreground mt-0.5">
                              Incremental: ?{providerSpec.dataTypes.events.endpoint.incrementalFilter.paramName}={"{timestamp}"}
                            </div>
                          )}
                        </div>
                      )}
                      {providerSpec.dataTypes.attendees && (
                        <div>
                          <span className="text-muted-foreground">Attendees:</span>
                          <div className="mt-1">
                            {providerSpec.dataTypes.attendees.endpoint.method}{" "}
                            {resolveUrl(providerSpec.dataTypes.attendees.endpoint.path)}
                          </div>
                          {providerSpec.dataTypes.attendees.endpoint.incrementalFilter && (
                            <div className="text-muted-foreground mt-0.5">
                              Incremental: ?{providerSpec.dataTypes.attendees.endpoint.incrementalFilter.paramName}={"{timestamp}"}
                            </div>
                          )}
                        </div>
                      )}
                      {providerSpec.dataTypes.sessions && (
                        <div>
                          <span className="text-muted-foreground">Sessions:</span>
                          <div className="mt-1">
                            {providerSpec.dataTypes.sessions.endpoint.method}{" "}
                            {resolveUrl(providerSpec.dataTypes.sessions.endpoint.path)}
                          </div>
                          {providerSpec.dataTypes.sessions.endpoint.incrementalFilter && (
                            <div className="text-muted-foreground mt-0.5">
                              Incremental: ?{providerSpec.dataTypes.sessions.endpoint.incrementalFilter.paramName}={"{timestamp}"}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Editable endpoint templates (super admin only) */}
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Endpoint Template Overrides</Label>
                    <EditableSettingsLock
                      editable={syncSettingsEditable}
                      onEditableChange={onSyncSettingsEditableChange}
                      canEdit={canEditSettings}
                      labelId="sync-settings"
                      warningText="Changes affect data synchronization."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="event-list-endpoint-sync" className="text-xs text-muted-foreground">Events Endpoint</Label>
                    <Input
                      id="event-list-endpoint-sync"
                      value={eventListEndpointPath}
                      onChange={(e) => onEventListEndpointPathChange(e.target.value)}
                      placeholder="/certainExternal/service/v1/Event/{{accountCode}}"
                      data-testid="input-event-list-endpoint-sync"
                      disabled={!syncSettingsEditable}
                      className={`font-mono text-xs ${!syncSettingsEditable ? "bg-muted" : ""}`}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="attendees-endpoint" className="text-xs text-muted-foreground">Attendees Endpoint</Label>
                    <Input
                      id="attendees-endpoint"
                      value={syncTemplates.attendees?.endpointPath || ""}
                      onChange={(e) => onSyncTemplatesChange({
                        ...syncTemplates,
                        attendees: { endpointPath: e.target.value }
                      })}
                      placeholder="/accounts/{{accountCode}}/events/{{eventCode}}/registrations"
                      data-testid="input-sync-attendees-endpoint"
                      disabled={!syncSettingsEditable}
                      className={`font-mono text-xs ${!syncSettingsEditable ? "bg-muted" : ""}`}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sessions-endpoint" className="text-xs text-muted-foreground">Sessions Endpoint</Label>
                    <Input
                      id="sessions-endpoint"
                      value={syncTemplates.sessions?.endpointPath || ""}
                      onChange={(e) => onSyncTemplatesChange({
                        ...syncTemplates,
                        sessions: { endpointPath: e.target.value }
                      })}
                      placeholder="/accounts/{{accountCode}}/events/{{eventCode}}/functions"
                      data-testid="input-sync-sessions-endpoint"
                      disabled={!syncSettingsEditable}
                      className={`font-mono text-xs ${!syncSettingsEditable ? "bg-muted" : ""}`}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="session-registrations-endpoint" className="text-xs text-muted-foreground">Session Registrations Endpoint</Label>
                    <Input
                      id="session-registrations-endpoint"
                      value={syncTemplates.sessionRegistrations?.endpointPath || ""}
                      onChange={(e) => onSyncTemplatesChange({
                        ...syncTemplates,
                        sessionRegistrations: { endpointPath: e.target.value }
                      })}
                      placeholder="/accounts/{{accountCode}}/events/{{eventCode}}/functionRegistrations"
                      data-testid="input-sync-session-registrations-endpoint"
                      disabled={!syncSettingsEditable}
                      className={`font-mono text-xs ${!syncSettingsEditable ? "bg-muted" : ""}`}
                    />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Use {"{{accountCode}}"}, {"{{eventCode}}"}, {"{{lastSyncTimestamp}}"} as template variables.
                  </p>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}

function RealtimeTab({
  canEditSettings,
  syncSettingsEditable,
  onSyncSettingsEditableChange,
  realtimeSyncConfig,
  onRealtimeSyncConfigChange,
}: {
  canEditSettings: boolean;
  syncSettingsEditable: boolean;
  onSyncSettingsEditableChange: (editable: boolean) => void;
  realtimeSyncConfig: RealtimeSyncConfig;
  onRealtimeSyncConfigChange: (config: RealtimeSyncConfig) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Realtime Check-in Sync</CardTitle>
        <CardDescription>
          Send automatic notifications to the external registration system when attendees are checked in or when check-ins are reverted. Uses your configured credentials for authentication.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <EditableSettingsLock
          editable={syncSettingsEditable}
          onEditableChange={onSyncSettingsEditableChange}
          canEdit={canEditSettings}
          labelId="realtime-settings"
          warningText="Editing enabled. Changes may affect realtime check-in sync."
        />

        <div className="flex items-center space-x-2 bg-green-50 dark:bg-green-900/20 p-2 rounded-md">
          <Badge variant="outline" className="text-green-600 border-green-300">Enabled</Badge>
          <Label className="text-sm text-muted-foreground">Realtime sync is always active. Disable per event in Event Settings.</Label>
        </div>

        {(
          <>
            <div className="space-y-2">
              <Label htmlFor="realtime-endpoint-url">Registration Endpoint URL</Label>
              <Input
                id="realtime-endpoint-url"
                value={realtimeSyncConfig.endpointUrl}
                onChange={(e) => onRealtimeSyncConfigChange({
                  ...realtimeSyncConfig,
                  endpointUrl: e.target.value
                })}
                placeholder="/certainExternal/service/v1/Registration/{{accountCode}}/{{eventCode}}/{{externalId}}"
                data-testid="input-realtime-endpoint-url"
                disabled={!syncSettingsEditable}
                className={!syncSettingsEditable ? "bg-muted" : ""}
              />
              <p className="text-xs text-muted-foreground">
                Status update endpoint for existing registrations. Use {'{{accountCode}}'}, {'{{eventCode}}'}, and {'{{externalId}}'} as placeholders.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="walkin-endpoint-url">Walk-in Registration Endpoint URL</Label>
              <Input
                id="walkin-endpoint-url"
                value={realtimeSyncConfig.walkinEndpointUrl || ""}
                onChange={(e) => onRealtimeSyncConfigChange({
                  ...realtimeSyncConfig,
                  walkinEndpointUrl: e.target.value
                })}
                placeholder="/certainExternal/service/v1/Registration/{{accountCode}}/{{eventCode}}"
                data-testid="input-walkin-endpoint-url"
                disabled={!syncSettingsEditable}
                className={!syncSettingsEditable ? "bg-muted" : ""}
              />
              <p className="text-xs text-muted-foreground">
                Endpoint for creating new registrations from walk-ins. Only needs {'{{accountCode}}'} and {'{{eventCode}}'} — no registration ID required.
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md space-y-2">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">How it works</p>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                The system automatically detects whether an attendee already exists in the registration system:
              </p>
              <ul className="text-xs text-blue-600 dark:text-blue-400 list-disc pl-4 space-y-1">
                <li><span className="font-medium">Existing registrations</span> — sends a status update (PUT) to the registration endpoint</li>
                <li><span className="font-medium">Walk-in / new attendees</span> — creates a new registration (POST) with full attendee details, then stores the returned registration code for future syncs</li>
              </ul>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 font-medium">Sample endpoint:</p>
              <pre className="text-xs bg-blue-100 dark:bg-blue-800/30 p-2 rounded mt-1 font-mono whitespace-pre-wrap break-all">
{`/certainExternal/service/v1/Registration/{{accountCode}}/{{eventCode}}`}
              </pre>
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="text-sm font-medium">Status Values</h4>
              <p className="text-xs text-muted-foreground">
                Configure the registration status labels sent to the external system
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="checkin-status">Check-in Status</Label>
                  <Input
                    id="checkin-status"
                    value={realtimeSyncConfig.checkinStatus || ""}
                    onChange={(e) => onRealtimeSyncConfigChange({
                      ...realtimeSyncConfig,
                      checkinStatus: e.target.value
                    })}
                    placeholder="Checked In"
                    data-testid="input-checkin-status"
                    disabled={!syncSettingsEditable}
                    className={!syncSettingsEditable ? "bg-muted" : ""}
                  />
                  <p className="text-xs text-muted-foreground">
                    Status sent when attendee is checked in
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="revert-status">Revert Status</Label>
                  <Input
                    id="revert-status"
                    value={realtimeSyncConfig.revertStatus || ""}
                    onChange={(e) => onRealtimeSyncConfigChange({
                      ...realtimeSyncConfig,
                      revertStatus: e.target.value
                    })}
                    placeholder="Registered"
                    data-testid="input-revert-status"
                    disabled={!syncSettingsEditable}
                    className={!syncSettingsEditable ? "bg-muted" : ""}
                  />
                  <p className="text-xs text-muted-foreground">
                    Status sent when check-in is reverted
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="walkin-status">Walk-in Status</Label>
                  <Input
                    id="walkin-status"
                    value={realtimeSyncConfig.walkinStatus || ""}
                    onChange={(e) => onRealtimeSyncConfigChange({
                      ...realtimeSyncConfig,
                      walkinStatus: e.target.value
                    })}
                    placeholder="Checked In"
                    data-testid="input-walkin-status"
                    disabled={!syncSettingsEditable}
                    className={!syncSettingsEditable ? "bg-muted" : ""}
                  />
                  <p className="text-xs text-muted-foreground">
                    Status for new walk-in registrations (defaults to check-in status)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="walkin-source">Walk-in Source</Label>
                  <Input
                    id="walkin-source"
                    value={realtimeSyncConfig.walkinSource || ""}
                    onChange={(e) => onRealtimeSyncConfigChange({
                      ...realtimeSyncConfig,
                      walkinSource: e.target.value
                    })}
                    placeholder="Greet"
                    data-testid="input-walkin-source"
                    disabled={!syncSettingsEditable}
                    className={!syncSettingsEditable ? "bg-muted" : ""}
                  />
                  <p className="text-xs text-muted-foreground">
                    Source label for walk-in registrations in the external system
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="text-sm font-medium">Retry Settings</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max-retries">Max Retries</Label>
                  <Input
                    id="max-retries"
                    type="number"
                    min={0}
                    max={10}
                    value={realtimeSyncConfig.maxRetries || 3}
                    onChange={(e) => onRealtimeSyncConfigChange({
                      ...realtimeSyncConfig,
                      maxRetries: parseInt(e.target.value) || 3
                    })}
                    data-testid="input-max-retries"
                    disabled={!syncSettingsEditable}
                    className={!syncSettingsEditable ? "bg-muted" : ""}
                  />
                  <p className="text-xs text-muted-foreground">
                    Retry attempts for 429 errors
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retry-delay">Retry Delay (ms)</Label>
                  <Input
                    id="retry-delay"
                    type="number"
                    min={100}
                    max={30000}
                    value={realtimeSyncConfig.retryDelayMs || 1000}
                    onChange={(e) => onRealtimeSyncConfigChange({
                      ...realtimeSyncConfig,
                      retryDelayMs: parseInt(e.target.value) || 1000
                    })}
                    data-testid="input-retry-delay"
                    disabled={!syncSettingsEditable}
                    className={!syncSettingsEditable ? "bg-muted" : ""}
                  />
                  <p className="text-xs text-muted-foreground">
                    Base delay between retries
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeout">Timeout (ms)</Label>
                  <Input
                    id="timeout"
                    type="number"
                    min={1000}
                    max={120000}
                    value={realtimeSyncConfig.timeoutMs || 30000}
                    onChange={(e) => onRealtimeSyncConfigChange({
                      ...realtimeSyncConfig,
                      timeoutMs: parseInt(e.target.value) || 30000
                    })}
                    data-testid="input-timeout"
                    disabled={!syncSettingsEditable}
                    className={!syncSettingsEditable ? "bg-muted" : ""}
                  />
                  <p className="text-xs text-muted-foreground">
                    Request timeout
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md space-y-2">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Payload Format (Certain)</p>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                For existing registrations, sends a status update:
              </p>
              <pre className="text-xs bg-blue-100 dark:bg-blue-800/30 p-2 rounded mt-1 font-mono">
{`{"registrationStatusLabel": "${realtimeSyncConfig.checkinStatus || 'Checked In'}"}`}
              </pre>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                For walk-in registrations, creates a new registration with attendee details:
              </p>
              <pre className="text-xs bg-blue-100 dark:bg-blue-800/30 p-2 rounded mt-1 font-mono whitespace-pre-wrap">
{`{
  "profile": {
    "firstName": "...", "lastName": "...",
    "email": "...", "organization": "..."
  },
  "registrationStatusLabel": "${realtimeSyncConfig.walkinStatus || realtimeSyncConfig.checkinStatus || 'Checked In'}",
  "source": "${realtimeSyncConfig.walkinSource || 'Greet'}",
  "checkins": [{ ... }],
  "reg_categories": [{ "catCode": "..." }]
}`}
              </pre>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function EventsTab({
  eventSearchQuery,
  onEventSearchQueryChange,
  eventCode,
  eventName,
  externalEventId,
  onSearchEvents,
  copyToClipboard,
}: {
  eventSearchQuery: string;
  onEventSearchQueryChange: (value: string) => void;
  eventCode: string;
  eventName: string;
  externalEventId: string;
  onSearchEvents: () => void;
  copyToClipboard: (text: string, label: string) => void;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">External Event Lookup</CardTitle>
          <CardDescription>
            Search and map events from the external platform
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={eventSearchQuery}
              onChange={(e) => onEventSearchQueryChange(e.target.value)}
              placeholder="Search by event name or ID..."
              data-testid="input-event-search"
            />
            <Button onClick={onSearchEvents} data-testid="button-search-events">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {eventCode && (
            <div className="space-y-3">
              <Separator />
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Event ID</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted px-2 py-1 rounded text-xs font-mono">
                      {externalEventId}
                    </code>
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(externalEventId || "", "Event ID")}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Event Code</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted px-2 py-1 rounded text-xs font-mono">
                      {eventCode}
                    </code>
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(eventCode || "", "Event Code")}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Event Name</Label>
                  <p className="text-sm">{eventName}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="bg-muted p-3 rounded-md">
        <p className="text-xs text-muted-foreground">
          Event codes are used to sync attendees from external platforms to your local events.
          You can map multiple external events to different local events.
        </p>
      </div>
    </>
  );
}

function MappingTab({
  fieldMappings,
  onFieldMappingsChange,
}: {
  fieldMappings: Record<string, string>;
  onFieldMappingsChange: (mappings: Record<string, string>) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Field Mapping</CardTitle>
        <CardDescription>
          Map fields from external platform to your attendee database
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64">
          <div className="space-y-3">
            {Object.entries(fieldMappings).map(([target, source]) => (
              <div key={target} className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {target}
                  </Label>
                  <p className="text-sm font-medium capitalize">{target}</p>
                </div>
                <div>
                  <Input
                    value={source}
                    onChange={(e) =>
                      onFieldMappingsChange({
                        ...fieldMappings,
                        [target]: e.target.value,
                      })
                    }
                    placeholder="external.field.path"
                    className="font-mono text-xs"
                    data-testid={`input-mapping-${target}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <Separator className="my-4" />

        <div className="space-y-2">
          <Label>Response Transformation</Label>
          <Textarea
            placeholder={`pick("attendees") | rename({ "first_name": "firstName" })`}
            rows={4}
            className="font-mono text-xs"
            data-testid="input-transformation"
          />
          <p className="text-xs text-muted-foreground">
            Optional: Transform API response before field mapping. Use: pick, rename, map, wrap, unwrap.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
