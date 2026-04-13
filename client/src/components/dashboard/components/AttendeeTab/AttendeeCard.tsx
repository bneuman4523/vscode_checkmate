import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  User, 
  UserCheck, 
  Printer, 
  CheckCircle, 
  Undo2, 
  MoreHorizontal,
  Pencil,
  Loader2 
} from "lucide-react";
import type { Attendee } from "../../types";

interface AttendeeCardProps {
  attendee: Attendee;
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
 * Individual attendee card with check-in actions.
 * 
 * Why: Each card has complex interaction logic (conditionally show check-in vs revert,
 * dropdown menu with multiple actions). Isolating into a component makes the list
 * rendering cleaner and allows the card to be tested in isolation.
 */
export function AttendeeCard({
  attendee,
  hasActiveWorkflow,
  isCheckingIn,
  isReverting,
  isPrinting,
  onCheckin,
  onRevert,
  onEdit,
  onPrint,
  onViewDetails,
}: AttendeeCardProps) {
  return (
    <Card data-testid={`card-attendee-${attendee.id}`}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-start sm:items-center gap-2 flex-wrap">
              <User className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5 sm:mt-0" />
              <span className="font-medium text-sm sm:text-base">
                {attendee.firstName} {attendee.lastName}
              </span>
              <Badge variant="outline" className="text-xs flex-shrink-0">
                {attendee.participantType}
              </Badge>
            </div>
            <div className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-1">
              {attendee.company && <span>{attendee.company}</span>}
              {attendee.company && attendee.email && <span className="mx-1">|</span>}
              <span className="break-all">{attendee.email}</span>
            </div>
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {attendee.checkedIn ? (
                <Badge variant="default" className="bg-green-700 text-xs">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Attended
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600">
                  {attendee.registrationStatusLabel || attendee.registrationStatus || 'Registered'}
                </Badge>
              )}
              {attendee.badgePrinted && (
                <Badge variant="outline" className="text-xs">
                  <Printer className="h-3 w-3 mr-1" />
                  Printed
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0">
            {!attendee.checkedIn ? (
              <Button
                size="sm"
                className="flex-1 sm:flex-none"
                onClick={() => onCheckin(attendee)}
                disabled={isCheckingIn}
                data-testid={`button-checkin-${attendee.id}`}
              >
                {isCheckingIn ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserCheck className="h-4 w-4" />
                )}
                <span className="ml-1">{hasActiveWorkflow ? "Check-In" : "Check In"}</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => onRevert(attendee.id)}
                disabled={isReverting}
                data-testid={`button-revert-${attendee.id}`}
              >
                {isReverting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Undo2 className="h-4 w-4" />
                )}
                <span className="ml-1">Undo</span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-9 w-9" data-testid={`button-actions-${attendee.id}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => onEdit(attendee)}
                  data-testid={`menu-edit-${attendee.id}`}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Badge Data
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onPrint(attendee.id)}
                  disabled={isPrinting}
                  data-testid={`menu-print-${attendee.id}`}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  {attendee.badgePrinted ? "Reprint Badge" : "Print Badge"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onViewDetails(attendee)}
                  data-testid={`menu-details-${attendee.id}`}
                >
                  <User className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
