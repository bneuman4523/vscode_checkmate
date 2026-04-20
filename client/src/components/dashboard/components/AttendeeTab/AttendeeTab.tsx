import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ScanLine, XCircle, UserPlus } from "lucide-react";
import StaffQRScanner from "@/components/StaffQRScanner";
import { AttendeeList } from "./AttendeeList";
import type { Attendee } from "../../types";

interface AttendeeTabProps {
  attendees: Attendee[];
  filteredAttendees: Attendee[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  statusFilter: string[];
  onStatusFilterChange: (filter: string[]) => void;
  /** Dynamic list of statuses for the filter buttons (from event selectedStatuses or fallback) */
  availableStatuses: string[];
  scanMode: boolean;
  onToggleScanMode: () => void;
  isLoading: boolean;
  hasActiveWorkflow: boolean;
  isCheckingIn: boolean;
  isReverting: boolean;
  isPrinting: boolean;
  allowWalkins: boolean;
  onCheckin: (attendee: Attendee) => void;
  onRevert: (attendeeId: string) => void;
  onEdit: (attendee: Attendee) => void;
  onPrint: (attendeeId: string) => void;
  onViewDetails: (attendee: Attendee) => void;
  onQRScanFound: (attendee: Attendee) => void;
  onAddWalkin: () => void;
}

/**
 * Main attendee tab content with scanner toggle and list/scan modes.
 * 
 * Why: Tab content encapsulates the mode switching logic (list vs scanner)
 * and search functionality, keeping the parent component focused on
 * tab navigation only.
 */
export function AttendeeTab({
  attendees,
  filteredAttendees,
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  availableStatuses,
  scanMode,
  onToggleScanMode,
  isLoading,
  hasActiveWorkflow,
  isCheckingIn,
  isReverting,
  isPrinting,
  allowWalkins,
  onCheckin,
  onRevert,
  onEdit,
  onPrint,
  onViewDetails,
  onQRScanFound,
  onAddWalkin,
}: AttendeeTabProps) {
  const toggleStatus = (status: string) => {
    onStatusFilterChange(
      statusFilter.includes(status)
        ? statusFilter.filter(s => s !== status)
        : [...statusFilter, status]
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant={scanMode ? "default" : "outline"}
          onClick={onToggleScanMode}
          className="flex-shrink-0"
          data-testid="button-toggle-attendee-scan"
        >
          {scanMode ? (
            <>
              <XCircle className="h-4 w-4 mr-2" />
              Close Scanner
            </>
          ) : (
            <>
              <ScanLine className="h-4 w-4 mr-2" />
              Scan QR
            </>
          )}
        </Button>
        {allowWalkins && (
          <Button
            variant="outline"
            onClick={onAddWalkin}
            className="flex-shrink-0"
            data-testid="button-add-walkin"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add Walk-in
          </Button>
        )}
        {!scanMode && (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or company..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10"
              data-testid="input-search-attendees"
            />
          </div>
        )}
      </div>

      {!scanMode && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground">Status:</span>
          {availableStatuses.map((status) => {
            const count = attendees.filter(a => (a.registrationStatusLabel || a.registrationStatus) === status).length;
            const isActive = statusFilter.includes(status);
            return (
              <Button
                key={status}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => toggleStatus(status)}
                className="h-6 text-xs px-2"
                data-testid={`filter-status-${status.toLowerCase()}`}
              >
                {status} ({count})
              </Button>
            );
          })}
          {statusFilter.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onStatusFilterChange([])}
              className="h-6 text-xs px-2 text-muted-foreground"
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {scanMode ? (
        <StaffQRScanner
          attendees={attendees}
          onAttendeeFound={onQRScanFound}
          onCheckIn={onCheckin}
          onRevertCheckIn={(attendee) => onRevert(attendee.id)}
          isCheckingIn={isCheckingIn}
          isReverting={isReverting}
          allowRevert={true}
          autoCheckIn={true}
        />
      ) : (
        <AttendeeList
          attendees={filteredAttendees}
          isLoading={isLoading}
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
      )}
    </div>
  );
}
