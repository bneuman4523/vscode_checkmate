import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Plus,
  Settings,
  RefreshCw,
  Check,
  AlertTriangle,
  Trash2,
  Copy,
  Loader2,
} from "lucide-react";
import type { CustomerIntegration, IntegrationProvider } from "@shared/schema";
import type { ConnectionStatus } from "./types";
import { ConnectionStatusBadge, ConnectButton } from "./connection-helpers";
import SyncHistory from "../SyncHistory";

interface IntegrationCardProps {
  integration: CustomerIntegration;
  providers: IntegrationProvider[];
  connectionStatuses: Record<string, ConnectionStatus>;
  testingIntegrationId: string | null;
  discoveringIntegrationId: string | null;
  syncingIntegrationId: string | null;
  onEdit: (integration: CustomerIntegration) => void;
  onDelete: (integration: CustomerIntegration) => void;
  onDuplicate: (integration: CustomerIntegration) => void;
  onStartOAuth: (integrationId: string) => void;
  onOpenCredentials: (integration: CustomerIntegration) => void;
  onDisconnect: (integrationId: string) => void;
  onTestConnection: (integrationId: string) => void;
  onDiscoverEvents: (integrationId: string) => void;
  onInitialSync: (integrationId: string) => void;
  onValidateConnection: (integrationId: string) => void;
  isOAuthPending: boolean;
  isDisconnectPending: boolean;
  isValidatePending: boolean;
  isDuplicatePending: boolean;
}

export function IntegrationCard({
  integration,
  providers,
  connectionStatuses,
  testingIntegrationId,
  discoveringIntegrationId,
  syncingIntegrationId,
  onEdit,
  onDelete,
  onDuplicate,
  onStartOAuth,
  onOpenCredentials,
  onDisconnect,
  onTestConnection,
  onDiscoverEvents,
  onInitialSync,
  onValidateConnection,
  isOAuthPending,
  isDisconnectPending,
  isValidatePending,
  isDuplicatePending,
}: IntegrationCardProps) {
  const provider = providers.find(p => p.id === integration.providerId);
  const status = connectionStatuses[integration.id];

  return (
    <Card data-testid={`integration-${integration.id}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              {provider?.logoUrl && (
                <img
                  src={provider.logoUrl}
                  alt={provider.name}
                  className="w-5 h-5 flex-shrink-0"
                />
              )}
              <span className="truncate">{integration.name}</span>
            </CardTitle>
            <CardDescription className="text-xs">
              {provider?.name} - {integration.authType.toUpperCase()}
            </CardDescription>
          </div>
          <ConnectionStatusBadge integration={integration} connectionStatuses={connectionStatuses} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {status?.connectedAt && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Connected</div>
            <div className="text-sm">
              {new Date(status.connectedAt).toLocaleString()}
            </div>
          </div>
        )}

        {status?.lastValidatedAt && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Last Validated</div>
            <div className="text-sm">
              {new Date(status.lastValidatedAt).toLocaleString()}
            </div>
          </div>
        )}

        {status?.lastErrorMessage && (
          <div className="bg-destructive/10 text-destructive p-2 rounded text-xs flex items-start gap-2">
            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2">{status.lastErrorMessage}</span>
          </div>
        )}

        {status?.grantedScopes && status.grantedScopes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {status.grantedScopes.slice(0, 3).map((scope) => (
              <Badge key={scope} variant="outline" className="text-xs">
                {scope}
              </Badge>
            ))}
            {status.grantedScopes.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{status.grantedScopes.length - 3} more
              </Badge>
            )}
          </div>
        )}

        {status?.connectionStatus === "pending_validation" && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-2 rounded text-xs flex items-start gap-2">
            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span>Credentials saved. Click "Test" to verify they work with the API.</span>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <ConnectButton
            integration={integration}
            connectionStatuses={connectionStatuses}
            providers={providers}
            onStartOAuth={onStartOAuth}
            onOpenCredentials={onOpenCredentials}
            onDisconnect={onDisconnect}
            isOAuthPending={isOAuthPending}
            isDisconnectPending={isDisconnectPending}
          />
          {(status?.connectionStatus === "connected" || status?.connectionStatus === "pending_validation") && integration.testEndpointPath && (
            <Button
              variant={status?.connectionStatus === "pending_validation" ? "default" : "outline"}
              size="sm"
              onClick={() => onTestConnection(integration.id)}
              disabled={testingIntegrationId !== null}
              data-testid={`button-test-${integration.id}`}
              title="Test API connection"
            >
              {testingIntegrationId === integration.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Test
                </>
              )}
            </Button>
          )}
          {status?.connectionStatus === "connected" &&
           integration.providerId.startsWith('certain') &&
           integration.eventListEndpointPath && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onDiscoverEvents(integration.id)}
              disabled={discoveringIntegrationId === integration.id}
              data-testid={`button-discover-${integration.id}`}
              title="Discover and create events from Certain"
            >
              {discoveringIntegrationId === integration.id ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Plus className="h-3 w-3 mr-1" />
              )}
              Discover Events
            </Button>
          )}
          {status?.connectionStatus === "connected" &&
           integration.providerId.startsWith('certain') && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onInitialSync(integration.id)}
              disabled={syncingIntegrationId === integration.id}
              data-testid={`button-initial-sync-${integration.id}`}
              title={integration.initialSyncCompletedAt
                ? "Run manual sync: Events → Attendees → Sessions → Registrations"
                : "Run full initial sync: Events → Attendees → Sessions → Registrations"}
            >
              {syncingIntegrationId === integration.id ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              {integration.initialSyncCompletedAt ? "Sync Now" : "Initial Sync"}
            </Button>
          )}
          {status?.connectionStatus === "connected" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onValidateConnection(integration.id)}
              disabled={isValidatePending}
              data-testid={`button-validate-${integration.id}`}
              title="Refresh connection status"
            >
              {isValidatePending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          )}
          <SyncHistory integrationId={integration.id} integrationName={integration.name} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(integration)}
            data-testid={`button-settings-${integration.id}`}
            title="Settings"
          >
            <Settings className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDuplicate(integration)}
            disabled={isDuplicatePending}
            data-testid={`button-duplicate-${integration.id}`}
            title="Duplicate integration (copy to new account)"
          >
            <Copy className="h-3 w-3" />
          </Button>
          {!integration.initialSyncCompletedAt && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDelete(integration)}
              data-testid={`button-delete-${integration.id}`}
              title="Delete integration"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
