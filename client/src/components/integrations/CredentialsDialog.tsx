import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import type { CustomerIntegration } from "@shared/schema";

interface CredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: CustomerIntegration | null;
  basicUsername: string;
  onBasicUsernameChange: (value: string) => void;
  apiKeyValue: string;
  onApiKeyValueChange: (value: string) => void;
  onSubmit: () => void;
  isPending: boolean;
  onCancel: () => void;
}

export function CredentialsDialog({
  open,
  onOpenChange,
  integration,
  basicUsername,
  onBasicUsernameChange,
  apiKeyValue,
  onApiKeyValueChange,
  onSubmit,
  isPending,
  onCancel,
}: CredentialsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enter Credentials</DialogTitle>
          <DialogDescription>
            {integration?.authType === "apikey"
              ? "Enter your API key to connect"
              : integration?.authType === "basic"
              ? "Enter your username and password for Basic authentication"
              : "Enter your bearer token to connect"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {integration?.authType === "basic" ? (
            <>
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={basicUsername}
                  onChange={(e) => onBasicUsernameChange(e.target.value)}
                  placeholder="Enter your username"
                  data-testid="input-basic-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="basic-password">Password / API Key</Label>
                <Input
                  id="basic-password"
                  type="password"
                  value={apiKeyValue}
                  onChange={(e) => onApiKeyValueChange(e.target.value)}
                  placeholder="Enter your password or API key"
                  data-testid="input-basic-password"
                />
              </div>
              {integration?.accountCode && (
                <p className="text-xs text-muted-foreground">
                  Account Code "{integration.accountCode}" is used in endpoint URLs — it is separate from the username.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Your credentials will be securely encrypted and stored
              </p>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="credential-value">
                {integration?.authType === "apikey" ? "API Key" : "Bearer Token"}
              </Label>
              <Input
                id="credential-value"
                type="password"
                value={apiKeyValue}
                onChange={(e) => onApiKeyValueChange(e.target.value)}
                placeholder={integration?.authType === "apikey" ? "Enter your API key" : "Enter your bearer token"}
                data-testid="input-credential-value"
              />
              <p className="text-xs text-muted-foreground">
                Your credentials will be securely encrypted and stored
              </p>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              onClick={onSubmit}
              disabled={isPending || !apiKeyValue || (integration?.authType === "basic" && !basicUsername)}
              data-testid="button-submit-credentials"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Connect
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
