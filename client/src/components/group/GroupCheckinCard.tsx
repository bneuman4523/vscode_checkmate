import { useMemo } from "react";
import { Users, UserCheck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import GroupMemberRow from "./GroupMemberRow";
import type { GroupMember } from "@/hooks/useGroupCheckin";

export interface GroupCheckinCardProps {
  members: GroupMember[];
  primaryId: string | null;
  selectedIds: Set<string>;
  onToggleMember: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onConfirm: () => void;
  onCheckInJustMe?: () => void;
  mode: 'kiosk' | 'staff';
  isProcessing: boolean;
  scannedMemberId?: string;
}

export default function GroupCheckinCard({
  members,
  primaryId,
  selectedIds,
  onToggleMember,
  onSelectAll,
  onDeselectAll,
  onConfirm,
  onCheckInJustMe,
  mode,
  isProcessing,
  scannedMemberId,
}: GroupCheckinCardProps) {
  const isKiosk = mode === 'kiosk';

  // Sort: primary first, then unchecked, then checked-in
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      if (a.id === primaryId) return -1;
      if (b.id === primaryId) return 1;
      if (a.checkedIn !== b.checkedIn) return a.checkedIn ? 1 : -1;
      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
    });
  }, [members, primaryId]);

  const uncheckedCount = members.filter(m => !m.checkedIn).length;
  const selectedCount = Array.from(selectedIds).filter(id => {
    const m = members.find(mem => mem.id === id);
    return m && !m.checkedIn;
  }).length;

  const allUncheckedSelected = uncheckedCount > 0 && selectedCount === uncheckedCount;

  const needsScroll = members.length > 5;

  const memberList = (
    <div className={cn("space-y-2", isKiosk ? "py-1" : "py-0.5")}>
      {sortedMembers.map((member) => (
        <GroupMemberRow
          key={member.id}
          member={member}
          isPrimary={member.id === primaryId}
          isSelected={selectedIds.has(member.id)}
          isAlreadyCheckedIn={member.checkedIn}
          isScannedPerson={member.id === scannedMemberId}
          onToggle={() => onToggleMember(member.id)}
          mode={mode}
          disabled={isProcessing}
        />
      ))}
    </div>
  );

  return (
    <Card className="border-2" data-testid="group-checkin-card">
      {/* Header */}
      <CardHeader className={cn(isKiosk ? "pb-4" : "pb-3")}>
        <div className="flex items-center justify-between">
          <CardTitle className={cn(
            "flex items-center gap-2",
            isKiosk ? "text-2xl" : "text-lg",
          )}>
            <Users className={isKiosk ? "h-6 w-6" : "h-5 w-5"} />
            Your Group
            <Badge variant="secondary" className={isKiosk ? "text-sm" : "text-xs"}>
              {members.length}
            </Badge>
          </CardTitle>

          {/* Select all / Deselect all toggle */}
          {uncheckedCount > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={allUncheckedSelected ? onDeselectAll : onSelectAll}
              disabled={isProcessing}
              className="text-xs"
              data-testid="group-select-toggle"
            >
              {allUncheckedSelected ? "Deselect All" : "Select All"}
            </Button>
          )}
        </div>
      </CardHeader>

      {/* Member list */}
      <CardContent className={cn(isKiosk ? "px-6 pb-6" : "px-4 pb-4")}>
        {needsScroll ? (
          <ScrollArea className="max-h-[400px]">
            {memberList}
          </ScrollArea>
        ) : (
          memberList
        )}

        {/* Confirm button */}
        <div className={cn("mt-4 space-y-3", isKiosk && "mt-6")}>
          <Button
            size="lg"
            className={cn(
              "w-full font-semibold",
              isKiosk ? "h-16 text-xl" : "h-12 text-lg",
            )}
            onClick={onConfirm}
            disabled={isProcessing || selectedCount === 0}
            data-testid="group-checkin-confirm"
          >
            {isProcessing ? (
              <>
                <div className="h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                Checking In...
              </>
            ) : (
              <>
                <UserCheck className={cn(isKiosk ? "h-6 w-6 mr-2" : "h-5 w-5 mr-2")} />
                Check In {selectedCount} {selectedCount === 1 ? "Person" : "People"}
              </>
            )}
          </Button>

          {/* Kiosk-only "Check In Just Me" link */}
          {isKiosk && onCheckInJustMe && (
            <button
              onClick={onCheckInJustMe}
              disabled={isProcessing}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2 disabled:opacity-50"
              data-testid="group-checkin-just-me"
            >
              Check In Just Me
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
