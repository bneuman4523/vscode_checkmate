import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Link as LinkIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { IntegrationProvider, CustomerIntegration, Customer } from "@shared/schema";
import {
  useIntegrationForm,
  useIntegrationMutations,
  IntegrationCard,
  IntegrationConfigDialog,
  CredentialsDialog,
  DeleteIntegrationDialog,
  DuplicateIntegrationDialog,
} from "./integrations";

export default function IntegrationSetup() {
  const { customerId } = useParams<{ customerId: string }>();
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const isAdmin = user?.role === "admin";
  const canEditSettings = isSuperAdmin || isAdmin;

  const { data: providers = [] } = useQuery<IntegrationProvider[]>({
    queryKey: ["/api/integration-providers"],
  });

  const { data: customer } = useQuery<Customer>({
    queryKey: ["/api/customers", customerId],
    enabled: !!customerId,
  });

  const { data: integrations = [], isLoading: integrationsLoading } = useQuery<CustomerIntegration[]>({
    queryKey: [`/api/integrations?customerId=${customerId}`],
    enabled: !!customerId,
  });

  const mutations = useIntegrationMutations({ customerId, toast });
  const form = useIntegrationForm(providers, customer, toast);

  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false);
  const [selectedIntegrationForCredentials, setSelectedIntegrationForCredentials] = useState<CustomerIntegration | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [integrationToDelete, setIntegrationToDelete] = useState<CustomerIntegration | null>(null);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [integrationToDuplicate, setIntegrationToDuplicate] = useState<CustomerIntegration | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicateAccountCode, setDuplicateAccountCode] = useState("");
  const [duplicateCopyCredentials, setDuplicateCopyCredentials] = useState(true);

  useEffect(() => {
    mutations.fetchAllConnectionStatuses(integrations);
  }, [integrations]);

  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === "oauth_success") {
        mutations.refreshConnectionStatus(event.data.integrationId);
        toast({ title: "Connected", description: "OAuth authorization successful!" });
      } else if (event.data?.type === "oauth_error") {
        toast({ title: "Authorization failed", description: event.data.error, variant: "destructive" });
      }
    };
    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, [mutations.refreshConnectionStatus, toast]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      toast({ title: "Copied", description: `${label} copied to clipboard` });
    } catch (err) {
      toast({ title: "Copy failed", description: "Please select and copy manually", variant: "destructive" });
    }
  };

  const handleSaveIntegration = () => {
    const payload = form.buildSavePayload(customerId);
    if (!payload) return;

    if (payload.type === "update") {
      mutations.updateIntegrationMutation.mutate({ id: payload.id, data: payload.data }, {
        onSuccess: () => {
          form.setDialogOpen(false);
          form.resetForm();
        },
      });
    } else {
      mutations.createIntegrationMutation.mutate(payload.data, {
        onSuccess: () => {
          form.setDialogOpen(false);
          form.resetForm();
        },
      });
    }
  };

  const handleOpenCredentials = (integration: CustomerIntegration) => {
    setSelectedIntegrationForCredentials(integration);
    form.setBasicUsername("");
    form.setApiKeyValue("");
    setCredentialDialogOpen(true);
  };

  const handleSubmitCredentials = async () => {
    if (!selectedIntegrationForCredentials || !form.apiKeyValue) return;

    if (selectedIntegrationForCredentials.authType === "basic") {
      const trimmedUsername = form.basicUsername.trim();
      const trimmedPassword = form.apiKeyValue.trim();
      if (!trimmedUsername) {
        toast({ title: "Username required", description: "Please enter a username for Basic authentication", variant: "destructive" });
        return;
      }
      if (!trimmedPassword) {
        toast({ title: "Password required", description: "Please enter a password or API key", variant: "destructive" });
        return;
      }
      try {
        await mutations.submitCredentialsMutation.mutateAsync({
          integrationId: selectedIntegrationForCredentials.id,
          credentialType: "basic_username",
          value: trimmedUsername,
        });
        await mutations.submitCredentialsMutation.mutateAsync({
          integrationId: selectedIntegrationForCredentials.id,
          credentialType: "basic_password",
          value: trimmedPassword,
        });
      } catch (error) {
      }
    } else {
      const credentialType = selectedIntegrationForCredentials.authType === "apikey"
        ? "api_key"
        : "bearer_token";
      mutations.submitCredentialsMutation.mutate({
        integrationId: selectedIntegrationForCredentials.id,
        credentialType,
        value: form.apiKeyValue,
      });
    }
    setCredentialDialogOpen(false);
    form.setApiKeyValue("");
    form.setBasicUsername("");
  };

  const handleOpenDuplicate = (integration: CustomerIntegration) => {
    setIntegrationToDuplicate(integration);
    setDuplicateName(`${integration.name} (Copy)`);
    setDuplicateAccountCode("");
    setDuplicateCopyCredentials(true);
    setDuplicateDialogOpen(true);
  };

  const handleDuplicate = () => {
    if (!integrationToDuplicate || !duplicateName.trim()) return;
    mutations.duplicateIntegrationMutation.mutate({
      id: integrationToDuplicate.id,
      name: duplicateName.trim(),
      accountCode: duplicateAccountCode.trim() || undefined,
      copyCredentials: duplicateCopyCredentials,
    }, {
      onSuccess: () => {
        setDuplicateDialogOpen(false);
        setIntegrationToDuplicate(null);
        setDuplicateName("");
        setDuplicateAccountCode("");
        setDuplicateCopyCredentials(true);
      },
    });
  };

  const handleDeleteConfirm = () => {
    if (!integrationToDelete) return;
    mutations.deleteIntegrationMutation.mutate(integrationToDelete.id, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        setIntegrationToDelete(null);
      },
    });
  };

  if (integrationsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Integrations</h1>
            <p className="text-muted-foreground">
              Connect to external event platforms and sync attendee data
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader><div className="h-6 bg-muted rounded w-1/2" /></CardHeader>
              <CardContent><div className="h-20 bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Integrations</h1>
          <p className="text-muted-foreground">
            Connect to external event platforms and sync attendee data
          </p>
        </div>
        <IntegrationConfigDialog
          open={form.dialogOpen}
          onOpenChange={form.setDialogOpen}
          isEditMode={form.isEditMode}
          activeTab={form.activeTab}
          onActiveTabChange={form.setActiveTab}
          selectedProvider={form.selectedProvider}
          providers={providers}
          customer={customer}
          canEditSettings={canEditSettings}
          syncSettingsEditable={form.syncSettingsEditable}
          onSyncSettingsEditableChange={form.setSyncSettingsEditable}
          integrationName={form.integrationName}
          onIntegrationNameChange={form.setIntegrationName}
          baseUrl={form.baseUrl}
          onBaseUrlChange={form.setBaseUrl}
          accountCode={form.accountCode}
          onAccountCodeChange={form.setAccountCode}
          testEndpointPath={form.testEndpointPath}
          onTestEndpointPathChange={form.setTestEndpointPath}
          eventListEndpointPath={form.eventListEndpointPath}
          onEventListEndpointPathChange={form.setEventListEndpointPath}
          authMethod={form.authMethod}
          onAuthMethodChange={form.setAuthMethod}
          apiKeyValue={form.apiKeyValue}
          onApiKeyValueChange={form.setApiKeyValue}
          basicUsername={form.basicUsername}
          onBasicUsernameChange={form.setBasicUsername}
          clientId={form.clientId}
          onClientIdChange={form.setClientId}
          clientSecret={form.clientSecret}
          onClientSecretChange={form.setClientSecret}
          scope={form.scope}
          onScopeChange={form.setScope}
          syncTemplates={form.syncTemplates}
          onSyncTemplatesChange={form.setSyncTemplates}
          defaultSyncSettings={form.defaultSyncSettings}
          onDefaultSyncSettingsChange={form.setDefaultSyncSettings}
          realtimeSyncConfig={form.realtimeSyncConfig}
          onRealtimeSyncConfigChange={form.setRealtimeSyncConfig}
          eventSearchQuery={form.eventSearchQuery}
          onEventSearchQueryChange={form.setEventSearchQuery}
          eventCode={form.eventCode}
          eventName={form.eventName}
          externalEventId={form.externalEventId}
          fieldMappings={form.fieldMappings}
          onFieldMappingsChange={form.setFieldMappings}
          onProviderChange={form.handleProviderChange}
          onSearchEvents={form.searchEvents}
          onSave={handleSaveIntegration}
          onCancel={() => { form.setDialogOpen(false); form.resetForm(); }}
          isSaving={mutations.createIntegrationMutation.isPending || mutations.updateIntegrationMutation.isPending}
          onResetAndOpen={() => form.resetForm()}
          copyToClipboard={copyToClipboard}
        />
      </div>

      <CredentialsDialog
        open={credentialDialogOpen}
        onOpenChange={setCredentialDialogOpen}
        integration={selectedIntegrationForCredentials}
        basicUsername={form.basicUsername}
        onBasicUsernameChange={form.setBasicUsername}
        apiKeyValue={form.apiKeyValue}
        onApiKeyValueChange={form.setApiKeyValue}
        onSubmit={handleSubmitCredentials}
        isPending={mutations.submitCredentialsMutation.isPending}
        onCancel={() => { setCredentialDialogOpen(false); form.setClientId(""); form.setBasicUsername(""); form.setApiKeyValue(""); }}
      />

      {integrations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <LinkIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Integrations</h3>
            <p className="text-muted-foreground mb-4 max-w-sm">
              Connect to external event platforms to sync attendee data automatically.
            </p>
            <Button onClick={() => form.setDialogOpen(true)} data-testid="button-add-first-integration">
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Integration
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              providers={providers}
              connectionStatuses={mutations.connectionStatuses}
              testingIntegrationId={mutations.testingIntegrationId}
              discoveringIntegrationId={mutations.discoveringIntegrationId}
              syncingIntegrationId={mutations.syncingIntegrationId}
              onEdit={form.openEditDialog}
              onDelete={(integration) => { setIntegrationToDelete(integration); setDeleteDialogOpen(true); }}
              onDuplicate={handleOpenDuplicate}
              onStartOAuth={(id) => mutations.startOAuthMutation.mutate(id)}
              onOpenCredentials={handleOpenCredentials}
              onDisconnect={(id) => mutations.disconnectMutation.mutate(id)}
              onTestConnection={(id) => mutations.testConnectionMutation.mutate(id)}
              onDiscoverEvents={(id) => mutations.discoverEventsMutation.mutate(id)}
              onInitialSync={(id) => mutations.initialSyncMutation.mutate(id)}
              onValidateConnection={(id) => mutations.validateConnectionMutation.mutate(id)}
              isOAuthPending={mutations.startOAuthMutation.isPending}
              isDisconnectPending={mutations.disconnectMutation.isPending}
              isValidatePending={mutations.validateConnectionMutation.isPending}
              isDuplicatePending={mutations.duplicateIntegrationMutation.isPending}
            />
          ))}
        </div>
      )}

      <DeleteIntegrationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        integration={integrationToDelete}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setIntegrationToDelete(null)}
        isPending={mutations.deleteIntegrationMutation.isPending}
      />

      <DuplicateIntegrationDialog
        open={duplicateDialogOpen}
        onOpenChange={setDuplicateDialogOpen}
        duplicateName={duplicateName}
        onDuplicateNameChange={setDuplicateName}
        duplicateAccountCode={duplicateAccountCode}
        onDuplicateAccountCodeChange={setDuplicateAccountCode}
        duplicateCopyCredentials={duplicateCopyCredentials}
        onDuplicateCopyCredentialsChange={setDuplicateCopyCredentials}
        onConfirm={handleDuplicate}
        isPending={mutations.duplicateIntegrationMutation.isPending}
      />
    </div>
  );
}
