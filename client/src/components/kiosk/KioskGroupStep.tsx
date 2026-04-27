import { useKiosk } from "./KioskContext";
import GroupCheckinCard from "@/components/group/GroupCheckinCard";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function KioskGroupStep() {
  const { groupCheckin, handleGroupConfirm, handleGroupCheckInJustMe, handleGroupBack, groupScannedMemberId } = useKiosk();

  if (!groupCheckin.isGroupFound) return null;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-semibold">Group Check-In</h2>
        <p className="text-lg text-muted-foreground">
          Select who you'd like to check in
        </p>
      </div>

      <GroupCheckinCard
        members={groupCheckin.members}
        primaryId={groupCheckin.primaryId}
        selectedIds={groupCheckin.selectedIds}
        onToggleMember={groupCheckin.toggleMember}
        onSelectAll={groupCheckin.selectAll}
        onDeselectAll={groupCheckin.deselectAll}
        onConfirm={handleGroupConfirm}
        onCheckInJustMe={handleGroupCheckInJustMe}
        mode="kiosk"
        isProcessing={groupCheckin.isProcessing}
        scannedMemberId={groupScannedMemberId || undefined}
      />

      <div className="text-center pt-2">
        <Button variant="outline" onClick={handleGroupBack} data-testid="button-group-back">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Scan
        </Button>
      </div>
    </div>
  );
}
