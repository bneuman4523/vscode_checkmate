import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Printer, Loader2 } from "lucide-react";
import BadgeRenderSurface from "@/components/BadgeRenderSurface";
import type { PrintPreviewData } from "../../types";

interface PrintPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PrintPreviewData | null;
  isPrinting: boolean;
  onPrint: () => void;
  onSkip: () => void;
}

/**
 * Dialog for previewing and printing a badge after check-in.
 * 
 * Why: Print preview involves rendering the badge canvas and providing
 * print instructions. Isolating it keeps the complex rendering logic
 * separate from check-in flow management.
 */
export function PrintPreviewDialog({
  open,
  onOpenChange,
  data,
  isPrinting,
  onPrint,
  onSkip,
}: PrintPreviewDialogProps) {
  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Badge Print Preview</DialogTitle>
          <DialogDescription>
            Review the badge before printing. Click Print to send to printer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-center p-4 bg-muted rounded-lg">
            <BadgeRenderSurface
              firstName={data.attendee.firstName}
              lastName={data.attendee.lastName}
              email={data.attendee.email}
              company={data.attendee.company}
              title={data.attendee.title}
              participantType={data.attendee.participantType}
              externalId={data.attendee.externalId}
              orderCode={(data.attendee as any).orderCode}
              templateConfig={data.template}
              scale={0.8}
            />
          </div>
          <div className="text-center text-sm text-muted-foreground">
            <p><strong>{data.attendee.firstName} {data.attendee.lastName}</strong></p>
            <p>{data.attendee.company}</p>
            <Badge variant="secondary" className="mt-1">{data.attendee.participantType}</Badge>
          </div>
          <Alert className="bg-green-50 border-green-200">
            <AlertDescription className="text-xs text-green-800">
              <strong>Clean print output:</strong> Badges are printed as PDF so browser headers and footers (page URL, date) will not appear on your badges.
            </AlertDescription>
          </Alert>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            onClick={onPrint}
            disabled={isPrinting}
            className="w-full sm:w-auto"
            data-testid="button-print-badge"
          >
            {isPrinting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Printer className="h-4 w-4 mr-2" />
            )}
            Print Badge
          </Button>
          <Button
            variant="outline"
            onClick={onSkip}
            className="w-full sm:w-auto"
            data-testid="button-skip-print"
          >
            Skip Printing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
