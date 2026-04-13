import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { AttendeeCard } from "./AttendeeCard";
import type { Attendee } from "../../types";

interface AttendeeListProps {
  attendees: Attendee[];
  isLoading: boolean;
  hasActiveWorkflow: boolean;
  isCheckingIn: boolean;
  isReverting: boolean;
  isPrinting: boolean;
  onCheckin: (attendee: Attendee) => void;
  onRevert: (attendeeId: string) => void;
  onEdit: (attendee: Attendee) => void;
  onPrint: (attendeeId: string) => void;
  onViewDetails: (attendee: Attendee) => void;
}

/**
 * Scrollable list of attendee cards with loading and empty states.
 * 
 * Why: List rendering logic (mapping, loading states, empty states) is
 * separated from individual card rendering for cleaner composition.
 */
export function AttendeeList({
  attendees,
  isLoading,
  hasActiveWorkflow,
  isCheckingIn,
  isReverting,
  isPrinting,
  onCheckin,
  onRevert,
  onEdit,
  onPrint,
  onViewDetails,
}: AttendeeListProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-400px)]">
      <div className="space-y-2">
        {attendees.map((attendee) => (
          <AttendeeCard
            key={attendee.id}
            attendee={attendee}
            hasActiveWorkflow={hasActiveWorkflow}
            isCheckingIn={isCheckingIn}
            isReverting={isReverting}
            isPrinting={isPrinting}
            onCheckin={onCheckin}
            onRevert={onRevert}
            onEdit={onEdit}
            onPrint={onPrint}
            onViewDetails={onViewDetails}
          />
        ))}
        {attendees.length === 0 && (
          <Alert>
            <AlertDescription>
              No attendees found matching your search.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </ScrollArea>
  );
}
