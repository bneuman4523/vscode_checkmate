import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { UserCheck, Printer, ClipboardCheck, Loader2 } from "lucide-react";
import type { Attendee } from "../../types";

interface CheckinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attendee: Attendee | null;
  hasActiveWorkflow: boolean;
  isCheckingIn: boolean;
  isPrinting: boolean;
  onCheckin: (attendee: Attendee) => void;
  onMarkPrinted: (attendeeId: string) => void;
}

/**
 * Dialog for viewing attendee details and performing check-in.
 * 
 * Why: The check-in dialog has complex conditional rendering based on
 * attendee status (checked in, badge printed, workflow active).
 * Isolating it simplifies the parent component.
 */
export function CheckinDialog({
  open,
  onOpenChange,
  attendee,
  hasActiveWorkflow,
  isCheckingIn,
  isPrinting,
  onCheckin,
  onMarkPrinted,
}: CheckinDialogProps) {
  if (!attendee) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attendee Check-In</DialogTitle>
          <DialogDescription>
            {attendee.firstName} {attendee.lastName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-muted-foreground">Email:</div>
            <div>{attendee.email}</div>
            {attendee.company && (
              <>
                <div className="text-muted-foreground">Company:</div>
                <div>{attendee.company}</div>
              </>
            )}
            {attendee.title && (
              <>
                <div className="text-muted-foreground">Title:</div>
                <div>{attendee.title}</div>
              </>
            )}
            <div className="text-muted-foreground">Type:</div>
            <div>
              <Badge variant="outline">{attendee.participantType}</Badge>
            </div>
            <div className="text-muted-foreground">Status:</div>
            <div>
              {attendee.checkedIn ? (
                <Badge variant="default" className="bg-green-700">Checked In</Badge>
              ) : (
                <Badge variant="secondary">Not Checked In</Badge>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {!attendee.checkedIn && (
              <Button
                onClick={() => onCheckin(attendee)}
                disabled={isCheckingIn}
                className="w-full sm:w-auto"
                data-testid="button-confirm-checkin"
              >
                {isCheckingIn ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : hasActiveWorkflow ? (
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                ) : (
                  <UserCheck className="h-4 w-4 mr-2" />
                )}
                {hasActiveWorkflow ? "Start Check-In" : "Check In"}
              </Button>
            )}
            {attendee.checkedIn && !attendee.badgePrinted && (
              <Button
                variant="outline"
                onClick={() => onMarkPrinted(attendee.id)}
                disabled={isPrinting}
                className="w-full sm:w-auto"
                data-testid="button-mark-printed"
              >
                {isPrinting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4 mr-2" />
                )}
                Mark Badge Printed
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
