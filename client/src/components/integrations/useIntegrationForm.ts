import { useState } from "react";
import type { IntegrationProvider, CustomerIntegration, Customer } from "@shared/schema";
import type { RealtimeSyncConfig, SyncTemplates, DefaultSyncSettings } from "./types";

const DEFAULT_REALTIME_CONFIG: RealtimeSyncConfig = {
  enabled: false,
  endpointUrl: "",
  checkinStatus: "Checked In",
  revertStatus: "Registered",
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 30000,
};

const CERTAIN_REALTIME_CONFIG: RealtimeSyncConfig = {
  enabled: true,
  endpointUrl: "/certainExternal/service/v1/Registration/{{accountCode}}/{{eventCode}}/{{externalId}}",
  walkinEndpointUrl: "/certainExternal/service/v1/Registration/{{accountCode}}/{{eventCode}}",
  walkinStatus: "Attended",
  walkinSource: "Greet",
  checkinStatus: "Attended",
  revertStatus: "Registered",
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 30000,
};

const CERTAIN_SYNC_TEMPLATES: SyncTemplates = {
  attendees: { endpointPath: "/certainExternal/service/v1/Registration/{{accountCode}}/{{eventCode}}?max_results=5000" },
  sessions: { endpointPath: "/api/standard/2.0/accounts/{{accountCode}}/events/{{eventCode}}/sessions?dateModified_after={{lastSyncTimestamp}}" },
  sessionRegistrations: { endpointPath: "/api/standard/2.0/accounts/{{accountCode}}/events/{{eventCode}}/registrations" },
};

const DEFAULT_SYNC_SETTINGS: DefaultSyncSettings = {
  preEventIntervalMinutes: 1440,
  duringEventIntervalMinutes: 1,
};

const DEFAULT_FIELD_MAPPINGS: Record<string, string> = {
  firstName: "profile.first_name",
  lastName: "profile.last_name",
  email: "profile.email",
  company: "profile.company",
  title: "profile.job_title",
};

export function useIntegrationForm(
  providers: IntegrationProvider[],
  customer: Customer | undefined,
  toast: (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void,
) {
  const [selectedProvider, setSelectedProvider] = useState<IntegrationProvider | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const [editingIntegration, setEditingIntegration] = useState<CustomerIntegration | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [syncSettingsEditable, setSyncSettingsEditable] = useState(false);

  const [integrationName, setIntegrationName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [testEndpointPath, setTestEndpointPath] = useState("");
  const [eventListEndpointPath, setEventListEndpointPath] = useState("");
  const [authMethod, setAuthMethod] = useState<string>("oauth2");
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [basicUsername, setBasicUsername] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scope, setScope] = useState("");

  const [eventSearchQuery, setEventSearchQuery] = useState("");
  const [eventCode, setEventCode] = useState("");
  const [eventName, setEventName] = useState("");
  const [externalEventId, setExternalEventId] = useState("");

  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>(DEFAULT_FIELD_MAPPINGS);
  const [syncTemplates, setSyncTemplates] = useState<SyncTemplates>({});
  const [defaultSyncSettings, setDefaultSyncSettings] = useState<DefaultSyncSettings>(DEFAULT_SYNC_SETTINGS);
  const [realtimeSyncConfig, setRealtimeSyncConfig] = useState<RealtimeSyncConfig>(DEFAULT_REALTIME_CONFIG);

  const resetForm = () => {
    setSelectedProvider(null);
    setIntegrationName("");
    setBaseUrl("");
    setAccountCode("");
    setTestEndpointPath("");
    setEventListEndpointPath("");
    setAuthMethod("oauth2");
    setApiKeyValue("");
    setBasicUsername("");
    setClientId("");
    setClientSecret("");
    setScope("");
    setActiveTab("basic");
    setEditingIntegration(null);
    setIsEditMode(false);
    setSyncTemplates({});
    setDefaultSyncSettings(DEFAULT_SYNC_SETTINGS);
    setRealtimeSyncConfig(DEFAULT_REALTIME_CONFIG);
  };

  const openEditDialog = (integration: CustomerIntegration) => {
    const provider = providers.find(p => p.id === integration.providerId);
    setEditingIntegration(integration);
    setIsEditMode(true);
    setSelectedProvider(provider || null);
    setIntegrationName(integration.name);
    setBaseUrl(integration.baseUrl || "");
    setAccountCode(integration.accountCode || "");
    setTestEndpointPath(integration.testEndpointPath || "");
    setEventListEndpointPath(integration.eventListEndpointPath || "");
    setAuthMethod(integration.authType);
    setActiveTab("basic");
    const templates = integration.syncTemplates as any || {};
    setSyncTemplates({
      attendees: templates.attendees || undefined,
      sessions: templates.sessions || undefined,
      sessionRegistrations: templates.sessionRegistrations || undefined,
    });
    const settings = integration.defaultSyncSettings as any || {};
    setDefaultSyncSettings({
      preEventIntervalMinutes: settings.preEventIntervalMinutes || 1440,
      duringEventIntervalMinutes: settings.duringEventIntervalMinutes || 1,
    });
    const realtimeConfig = integration.realtimeSyncConfig as any || {};
    setRealtimeSyncConfig({
      enabled: realtimeConfig.enabled || false,
      endpointUrl: realtimeConfig.endpointUrl || "",
      walkinEndpointUrl: realtimeConfig.walkinEndpointUrl || "",
      walkinStatus: realtimeConfig.walkinStatus || "",
      walkinSource: realtimeConfig.walkinSource || "",
      checkinStatus: realtimeConfig.checkinStatus || "Checked In",
      revertStatus: realtimeConfig.revertStatus || "Registered",
      maxRetries: realtimeConfig.maxRetries || 3,
      retryDelayMs: realtimeConfig.retryDelayMs || 1000,
      timeoutMs: realtimeConfig.timeoutMs || 30000,
    });
    setDialogOpen(true);
  };

  const buildSavePayload = (customerId: string | undefined) => {
    if (!selectedProvider || !integrationName) {
      toast({ title: "Missing fields", description: "Please select a provider and enter a name", variant: "destructive" });
      return null;
    }

    const syncTemplatesData: Record<string, any> = {};
    if (syncTemplates.attendees?.endpointPath) syncTemplatesData.attendees = syncTemplates.attendees;
    if (syncTemplates.sessions?.endpointPath) syncTemplatesData.sessions = syncTemplates.sessions;
    if (syncTemplates.sessionRegistrations?.endpointPath) syncTemplatesData.sessionRegistrations = syncTemplates.sessionRegistrations;

    if (isEditMode && editingIntegration) {
      return {
        type: "update" as const,
        id: editingIntegration.id,
        data: {
          name: integrationName,
          baseUrl: baseUrl || (selectedProvider as any).defaultBaseUrl || "",
          ...(accountCode ? { accountCode } : { accountCode: null }),
          testEndpointPath: testEndpointPath || null,
          eventListEndpointPath: eventListEndpointPath || null,
          syncTemplates: Object.keys(syncTemplatesData).length > 0 ? syncTemplatesData : null,
          defaultSyncSettings: defaultSyncSettings,
          realtimeSyncConfig: { ...realtimeSyncConfig, enabled: true },
        },
      };
    }

    let credentials: { username?: string; password?: string; apiKey?: string } | undefined;
    if (authMethod === "basic" && basicUsername && apiKeyValue) {
      credentials = { username: basicUsername, password: apiKeyValue };
    } else if ((authMethod === "bearer" || authMethod === "apikey") && apiKeyValue) {
      credentials = { apiKey: apiKeyValue };
    }

    return {
      type: "create" as const,
      data: {
        customerId: customerId || "1",
        providerId: selectedProvider.id,
        name: integrationName,
        baseUrl: baseUrl || (selectedProvider as any).defaultBaseUrl || "",
        ...(accountCode ? { accountCode } : {}),
        testEndpointPath: testEndpointPath || null,
        eventListEndpointPath: eventListEndpointPath || null,
        syncTemplates: Object.keys(syncTemplatesData).length > 0 ? syncTemplatesData : null,
        defaultSyncSettings: defaultSyncSettings,
        realtimeSyncConfig: realtimeSyncConfig.enabled ? realtimeSyncConfig : null,
        authType: authMethod as any,
        status: "active" as const,
        ...(credentials && { credentials }),
      },
    };
  };

  const searchEvents = () => {
    setTimeout(() => {
      setEventCode("CONF2024");
      setEventName("Annual Conference 2024");
      setExternalEventId("123456789");
    }, 1000);
  };

  const handleProviderChange = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    setSelectedProvider(provider || null);
    setAuthMethod(provider?.authType || "bearer");
    if (provider) {
      const customerBaseUrl = customer?.apiBaseUrl;
      const providerDefaultUrl = (provider as any).defaultBaseUrl || "";
      setBaseUrl(customerBaseUrl || providerDefaultUrl);
      if (provider.id.startsWith('certain')) {
        setTestEndpointPath("/certainExternal/service/v1/Event/{accountCode}");
        setEventListEndpointPath("/certainExternal/service/v1/Event/{{accountCode}}?isActive=true&includeList=tags");
        setSyncTemplates(CERTAIN_SYNC_TEMPLATES);
        setRealtimeSyncConfig(CERTAIN_REALTIME_CONFIG);
        setDefaultSyncSettings(DEFAULT_SYNC_SETTINGS);
      } else {
        setTestEndpointPath("");
        setEventListEndpointPath("");
        setSyncTemplates({});
        setRealtimeSyncConfig(DEFAULT_REALTIME_CONFIG);
        setDefaultSyncSettings(DEFAULT_SYNC_SETTINGS);
      }
    }
  };

  return {
    selectedProvider,
    dialogOpen,
    setDialogOpen,
    activeTab,
    setActiveTab,
    editingIntegration,
    isEditMode,
    syncSettingsEditable,
    setSyncSettingsEditable,
    integrationName,
    setIntegrationName,
    baseUrl,
    setBaseUrl,
    accountCode,
    setAccountCode,
    testEndpointPath,
    setTestEndpointPath,
    eventListEndpointPath,
    setEventListEndpointPath,
    authMethod,
    setAuthMethod,
    apiKeyValue,
    setApiKeyValue,
    basicUsername,
    setBasicUsername,
    clientId,
    setClientId,
    clientSecret,
    setClientSecret,
    scope,
    setScope,
    eventSearchQuery,
    setEventSearchQuery,
    eventCode,
    eventName,
    externalEventId,
    fieldMappings,
    setFieldMappings,
    syncTemplates,
    setSyncTemplates,
    defaultSyncSettings,
    setDefaultSyncSettings,
    realtimeSyncConfig,
    setRealtimeSyncConfig,
    resetForm,
    openEditDialog,
    buildSavePayload,
    searchEvents,
    handleProviderChange,
  };
}
