import { useState, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ConnectionStatus } from "./types";

interface UseIntegrationMutationsOptions {
  customerId: string | undefined;
  toast: (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;
}

export function useIntegrationMutations({ customerId, toast }: UseIntegrationMutationsOptions) {
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, ConnectionStatus>>({});
  const [testConnectionResult, setTestConnectionResult] = useState<Record<string, { success: boolean; message: string; latencyMs?: number } | null>>({});
  const [testingIntegrationId, setTestingIntegrationId] = useState<string | null>(null);
  const [discoveringIntegrationId, setDiscoveringIntegrationId] = useState<string | null>(null);
  const [syncingIntegrationId, setSyncingIntegrationId] = useState<string | null>(null);

  const refreshConnectionStatus = useCallback(async (integrationId: string) => {
    try {
      const response = await fetch(`/api/integrations/${integrationId}/connection`);
      if (response.ok) {
        const status = await response.json();
        setConnectionStatuses(prev => ({ ...prev, [integrationId]: status }));
      }
    } catch (error) {
      console.error(`Failed to refresh connection status for ${integrationId}:`, error);
    }
  }, []);

  const fetchAllConnectionStatuses = useCallback(async (integrations: { id: string }[]) => {
    if (!integrations.length) return;
    const statuses: Record<string, ConnectionStatus> = {};
    for (const integration of integrations) {
      try {
        const response = await fetch(`/api/integrations/${integration.id}/connection`);
        if (response.ok) {
          statuses[integration.id] = await response.json();
        }
      } catch (error) {
        console.error(`Failed to fetch connection status for ${integration.id}:`, error);
      }
    }
    setConnectionStatuses(statuses);
  }, []);

  const invalidateIntegrations = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [`/api/integrations?customerId=${customerId}`] });
  }, [customerId]);

  const createIntegrationMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/integrations", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidateIntegrations();
      if (data._credentialError) {
        toast({ title: "Integration created", description: data._credentialError });
      } else if (data._credentialsStored) {
        toast({ title: "Integration created", description: "Credentials saved. Click Test Connection to verify they work." });
      } else {
        toast({ title: "Integration created", description: "You can now add credentials and connect." });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create integration", description: error.message, variant: "destructive" });
    },
  });

  const updateIntegrationMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/integrations/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidateIntegrations();
      toast({ title: "Integration updated", description: "Configuration saved successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update integration", description: error.message, variant: "destructive" });
    },
  });

  const startOAuthMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const response = await apiRequest("POST", `/api/integrations/${integrationId}/oauth/start`, {
        redirectUri: `${window.location.origin}/api/integrations/oauth/callback`
      });
      return response.json() as Promise<{ authorizationUrl: string; state: string }>;
    },
    onSuccess: (data: { authorizationUrl: string; state: string }) => {
      const popup = window.open(data.authorizationUrl, "oauth", "width=600,height=700,popup=1");
      if (!popup) {
        toast({ title: "Popup blocked", description: "Please allow popups for this site", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to start authorization", description: error.message, variant: "destructive" });
    },
  });

  const submitCredentialsMutation = useMutation({
    mutationFn: async ({ integrationId, credentialType, value }: { integrationId: string; credentialType: string; value: string }) => {
      const res = await apiRequest("POST", `/api/integrations/${integrationId}/credentials`, { credentialType, value });
      return res.json();
    },
    onSuccess: (_, variables) => {
      invalidateIntegrations();
      refreshConnectionStatus(variables.integrationId);
      toast({ title: "Credentials saved", description: "Please click the Test button to verify your credentials work." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save credentials", description: error.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const res = await apiRequest("POST", `/api/integrations/${integrationId}/disconnect`);
      return res.json();
    },
    onSuccess: (_, integrationId) => {
      refreshConnectionStatus(integrationId);
      toast({ title: "Disconnected", description: "Integration has been disconnected." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to disconnect", description: error.message, variant: "destructive" });
    },
  });

  const validateConnectionMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const res = await apiRequest("POST", `/api/integrations/${integrationId}/validate`);
      return res.json();
    },
    onSuccess: (_, integrationId) => {
      refreshConnectionStatus(integrationId);
      toast({ title: "Connection valid", description: "API connection test successful." });
    },
    onError: (error: Error) => {
      toast({ title: "Connection test failed", description: error.message, variant: "destructive" });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      setTestingIntegrationId(integrationId);
      try {
        const res = await apiRequest("POST", `/api/integrations/${integrationId}/test-connection`);
        return res.json() as Promise<{ success: boolean; statusCode?: number; message: string; latencyMs?: number }>;
      } catch (error) {
        setTestingIntegrationId(null);
        throw error;
      }
    },
    onSuccess: (data, integrationId) => {
      setTestingIntegrationId(null);
      setTestConnectionResult(prev => ({ ...prev, [integrationId]: data }));
      refreshConnectionStatus(integrationId);
      if (data.success) {
        toast({ title: "Connection Test Passed", description: `${data.message} (${data.latencyMs}ms)` });
      } else {
        toast({ title: "Connection Test Failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (error: Error, integrationId) => {
      setTestingIntegrationId(null);
      setTestConnectionResult(prev => ({ ...prev, [integrationId]: { success: false, message: error.message } }));
      toast({ title: "Connection test failed", description: error.message, variant: "destructive" });
    },
  });

  const discoverEventsMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      setDiscoveringIntegrationId(integrationId);
      const res = await apiRequest("POST", `/api/integrations/${integrationId}/discover-events`);
      return res.json() as Promise<{
        success: boolean;
        message: string;
        processedCount?: number;
        createdCount?: number;
        skippedCount?: number;
        latencyMs?: number;
      }>;
    },
    onSuccess: (data) => {
      setDiscoveringIntegrationId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendees"] });
      if (data.success) {
        toast({ title: "Events Discovered", description: data.message });
      } else {
        toast({ title: "Event Discovery Issues", description: data.message, variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      setDiscoveringIntegrationId(null);
      toast({ title: "Event discovery failed", description: error.message, variant: "destructive" });
    },
  });

  const initialSyncMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      setSyncingIntegrationId(integrationId);
      const res = await apiRequest("POST", `/api/integrations/${integrationId}/initial-sync`, { delayBetweenStepsMs: 3000 });
      return res.json() as Promise<{
        success: boolean;
        message: string;
        steps?: {
          events: { success: boolean; count: number; error?: string };
          attendees: { success: boolean; count: number; error?: string };
          sessions: { success: boolean; count: number; error?: string };
          sessionRegistrations: { success: boolean; count: number; error?: string };
        };
        totalRecords?: number;
        durationMs?: number;
        latencyMs?: number;
      }>;
    },
    onSuccess: (data) => {
      setSyncingIntegrationId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendees"] });
      if (data.success) {
        const stepsSummary = data.steps
          ? `Events: ${data.steps.events.count}, Attendees: ${data.steps.attendees.count}, Sessions: ${data.steps.sessions.count}, Registrations: ${data.steps.sessionRegistrations.count}`
          : '';
        toast({ title: "Initial Sync Complete", description: `${data.message}${stepsSummary ? ` (${stepsSummary})` : ''}` });
      } else {
        toast({ title: "Initial Sync Issues", description: data.message, variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      setSyncingIntegrationId(null);
      toast({ title: "Initial sync failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteIntegrationMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const res = await apiRequest("DELETE", `/api/integrations/${integrationId}`);
      return res.json();
    },
    onSuccess: () => {
      invalidateIntegrations();
      toast({ title: "Integration deleted", description: "The integration has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete integration", description: error.message, variant: "destructive" });
    },
  });

  const duplicateIntegrationMutation = useMutation({
    mutationFn: async ({ id, name, accountCode, copyCredentials }: { id: string; name?: string; accountCode?: string; copyCredentials?: boolean }) => {
      const res = await apiRequest("POST", `/api/integrations/${id}/duplicate`, { name, accountCode, copyCredentials });
      return res.json();
    },
    onSuccess: (data) => {
      invalidateIntegrations();
      if (data._credentialsCopied) {
        toast({ title: "Integration duplicated", description: `Created "${data.name}" with credentials copied. Click "Test" to verify they work.` });
      } else {
        toast({ title: "Integration duplicated", description: `Created "${data.name}". Please configure credentials.` });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to duplicate integration", description: error.message, variant: "destructive" });
    },
  });

  return {
    connectionStatuses,
    fetchAllConnectionStatuses,
    refreshConnectionStatus,
    testConnectionResult,
    testingIntegrationId,
    discoveringIntegrationId,
    syncingIntegrationId,
    createIntegrationMutation,
    updateIntegrationMutation,
    startOAuthMutation,
    submitCredentialsMutation,
    disconnectMutation,
    validateConnectionMutation,
    testConnectionMutation,
    discoverEventsMutation,
    initialSyncMutation,
    deleteIntegrationMutation,
    duplicateIntegrationMutation,
  };
}
