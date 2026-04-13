import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Loader2 } from "lucide-react";

interface DuplicateIntegrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicateName: string;
  onDuplicateNameChange: (value: string) => void;
  duplicateAccountCode: string;
  onDuplicateAccountCodeChange: (value: string) => void;
  duplicateCopyCredentials: boolean;
  onDuplicateCopyCredentialsChange: (value: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function DuplicateIntegrationDialog({
  open,
  onOpenChange,
  duplicateName,
  onDuplicateNameChange,
  duplicateAccountCode,
  onDuplicateAccountCodeChange,
  duplicateCopyCredentials,
  onDuplicateCopyCredentialsChange,
  onConfirm,
  isPending,
}: DuplicateIntegrationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate Integration</DialogTitle>
          <DialogDescription>
            Create a copy of this integration for a different account. You can reuse the same credentials.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="duplicate-name">Integration Name</Label>
            <Input
              id="duplicate-name"
              value={duplicateName}
              onChange={(e) => onDuplicateNameChange(e.target.value)}
              placeholder="Enter name for the new integration"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="duplicate-account-code">Account Code</Label>
            <Input
              id="duplicate-account-code"
              value={duplicateAccountCode}
              onChange={(e) => onDuplicateAccountCodeChange(e.target.value)}
              placeholder="e.g., NorthAmerica, EMEA, APAC"
            />
            <p className="text-xs text-muted-foreground">
              The account identifier used in API URLs (different from the original)
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="duplicate-copy-credentials"
              checked={duplicateCopyCredentials}
              onCheckedChange={(checked) => onDuplicateCopyCredentialsChange(checked === true)}
            />
            <Label htmlFor="duplicate-copy-credentials" className="text-sm font-normal cursor-pointer">
              Copy credentials from original integration
            </Label>
          </div>
          {duplicateCopyCredentials && (
            <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
              The same username and password will be used. After duplicating, click "Test" to verify the credentials work with the new account code.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isPending || !duplicateName.trim()}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Duplicate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
