import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Check,
  AlertTriangle,
  Unlink,
  Loader2,
  Key,
  Shield,
  Clock,
} from "lucide-react";
import type { CustomerIntegration, IntegrationProvider } from "@shared/schema";
import type { ConnectionStatus } from "./types";

interface ConnectionStatusBadgeProps {
  integration: CustomerIntegration;
  connectionStatuses: Record<string, ConnectionStatus>;
}

export function ConnectionStatusBadge({ integration, connectionStatuses }: ConnectionStatusBadgeProps) {
  const status = connectionStatuses[integration.id];
  if (!status) {
    return <Badge variant="outline" className="text-xs"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Loading</Badge>;
  }

  switch (status.connectionStatus) {
    case "connected":
      return <Badge className="text-xs bg-green-600"><Check className="h-3 w-3 mr-1" />Connected</Badge>;
    case "pending_validation":
      return <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300"><AlertTriangle className="h-3 w-3 mr-1" />Test Required</Badge>;
    case "connecting":
      return <Badge variant="outline" className="text-xs"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Connecting</Badge>;
    case "disconnected":
      return <Badge variant="secondary" className="text-xs"><Unlink className="h-3 w-3 mr-1" />Disconnected</Badge>;
    case "error":
      return <Badge variant="destructive" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Error</Badge>;
    case "expired":
      return <Badge variant="destructive" className="text-xs"><Clock className="h-3 w-3 mr-1" />Expired</Badge>;
    case "not_configured":
      return <Badge variant="outline" className="text-xs"><Key className="h-3 w-3 mr-1" />Not Configured</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status.connectionStatus}</Badge>;
  }
}

interface ConnectButtonProps {
  integration: CustomerIntegration;
  connectionStatuses: Record<string, ConnectionStatus>;
  providers: IntegrationProvider[];
  onStartOAuth: (integrationId: string) => void;
  onOpenCredentials: (integration: CustomerIntegration) => void;
  onDisconnect: (integrationId: string) => void;
  isOAuthPending: boolean;
  isDisconnectPending: boolean;
}

export function ConnectButton({
  integration,
  connectionStatuses,
  providers,
  onStartOAuth,
  onOpenCredentials,
  onDisconnect,
  isOAuthPending,
  isDisconnectPending,
}: ConnectButtonProps) {
  const status = connectionStatuses[integration.id];
  const isConnected = status?.connectionStatus === "connected";

  if (isConnected) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={() => onDisconnect(integration.id)}
        disabled={isDisconnectPending}
        data-testid={`button-disconnect-${integration.id}`}
      >
        {isDisconnectPending ? (
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        ) : (
          <Unlink className="h-3 w-3 mr-1" />
        )}
        Disconnect
      </Button>
    );
  }

  if (integration.authType === "oauth2") {
    return (
      <Button
        variant="default"
        size="sm"
        className="flex-1"
        onClick={() => onStartOAuth(integration.id)}
        disabled={isOAuthPending}
        data-testid={`button-connect-oauth-${integration.id}`}
      >
        {isOAuthPending ? (
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        ) : (
          <Shield className="h-3 w-3 mr-1" />
        )}
        Connect
      </Button>
    );
  }

  return (
    <Button
      variant="default"
      size="sm"
      className="flex-1"
      onClick={() => onOpenCredentials(integration)}
      data-testid={`button-enter-credentials-${integration.id}`}
    >
      <Key className="h-3 w-3 mr-1" />
      Enter Key
    </Button>
  );
}
