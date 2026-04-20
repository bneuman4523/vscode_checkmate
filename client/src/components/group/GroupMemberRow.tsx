import { Star, CheckCircle2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GroupMember } from "@/hooks/useGroupCheckin";

export interface GroupMemberRowProps {
  member: GroupMember;
  isPrimary: boolean;
  isSelected: boolean;
  isAlreadyCheckedIn: boolean;
  isScannedPerson: boolean;
  onToggle: () => void;
  mode: 'kiosk' | 'staff';
  disabled: boolean;
}

export default function GroupMemberRow({
  member,
  isPrimary,
  isSelected,
  isAlreadyCheckedIn,
  isScannedPerson,
  onToggle,
  mode,
  disabled,
}: GroupMemberRowProps) {
  const isKiosk = mode === 'kiosk';
  const canToggle = !isAlreadyCheckedIn && !isPrimary && !disabled;

  const handleRowClick = () => {
    if (isKiosk && canToggle) {
      onToggle();
    }
  };

  return (
    <div
      role={isKiosk && canToggle ? "button" : undefined}
      tabIndex={isKiosk && canToggle ? 0 : undefined}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (isKiosk && canToggle && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        "flex items-center justify-between rounded-lg border transition-colors",
        isKiosk ? "min-h-[64px] p-4" : "min-h-[48px] p-3",
        isAlreadyCheckedIn && "opacity-50 bg-muted/30",
        !isAlreadyCheckedIn && isSelected && "border-primary/50 bg-primary/5",
        !isAlreadyCheckedIn && !isSelected && "border-border",
        isKiosk && canToggle && "cursor-pointer hover:bg-accent active:bg-accent/80",
      )}
      data-testid={`group-member-row-${member.id}`}
    >
      {/* Left side: icon + member info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Status icon */}
        <div className="flex-shrink-0">
          {isAlreadyCheckedIn ? (
            <CheckCircle2 className={cn(
              "text-green-600 dark:text-green-500",
              isKiosk ? "h-6 w-6" : "h-5 w-5",
            )} />
          ) : isPrimary ? (
            <Star className={cn(
              "text-amber-500 fill-amber-500",
              isKiosk ? "h-6 w-6" : "h-5 w-5",
            )} />
          ) : (
            <div className={cn(
              "rounded-full bg-muted",
              isKiosk ? "h-6 w-6" : "h-5 w-5",
            )} />
          )}
        </div>

        {/* Name + metadata */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "font-medium truncate",
              isKiosk ? "text-lg" : "text-sm",
            )}>
              {member.firstName} {member.lastName}
            </span>

            {isPrimary && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {isScannedPerson ? "You" : "Booked by"}
              </Badge>
            )}

            {isAlreadyCheckedIn && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 border-green-500/50 text-green-700 dark:text-green-400">
                Checked in
              </Badge>
            )}
          </div>

          <div className={cn(
            "text-muted-foreground truncate",
            isKiosk ? "text-sm" : "text-xs",
          )}>
            {mode === 'staff' && member.email ? (
              <span>{member.email}</span>
            ) : (
              <span>{member.participantType}{member.company ? ` - ${member.company}` : ""}</span>
            )}
          </div>
        </div>
      </div>

      {/* Right side: toggle switch */}
      <div className="flex-shrink-0 ml-3">
        {isAlreadyCheckedIn ? (
          <span className={cn(
            "text-muted-foreground italic",
            isKiosk ? "text-sm" : "text-xs",
          )}>
            Done
          </span>
        ) : (
          <Switch
            checked={isSelected}
            onCheckedChange={canToggle ? onToggle : undefined}
            disabled={!canToggle}
            className={cn(
              isKiosk && "scale-125 origin-right",
            )}
            onClick={(e) => {
              // In kiosk mode, the row handles the click, so prevent double-toggle
              if (isKiosk) {
                e.stopPropagation();
              }
            }}
            data-testid={`group-member-switch-${member.id}`}
          />
        )}
      </div>
    </div>
  );
}
