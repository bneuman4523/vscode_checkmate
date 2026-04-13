export interface ConnectionStatus {
  id?: string;
  integrationId: string;
  connectionStatus: string;
  authMethod: string;
  grantedScopes?: string[] | null;
  lastValidatedAt?: string | null;
  lastSuccessfulCallAt?: string | null;
  consecutiveFailures?: number;
  lastErrorMessage?: string | null;
  connectedAt?: string | null;
}

export interface RealtimeSyncConfig {
  enabled: boolean;
  endpointUrl: string;
  walkinEndpointUrl?: string;
  walkinStatus?: string;
  walkinSource?: string;
  checkinStatus?: string;
  revertStatus?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

export interface SyncTemplates {
  attendees?: { endpointPath: string };
  sessions?: { endpointPath: string };
  sessionRegistrations?: { endpointPath: string };
}

export interface DefaultSyncSettings {
  preEventIntervalMinutes: number;
  duringEventIntervalMinutes: number;
}
