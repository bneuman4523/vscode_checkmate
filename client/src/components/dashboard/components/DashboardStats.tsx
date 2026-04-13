import { Card, CardContent } from "@/components/ui/card";

interface DashboardStatsProps {
  totalAttendees: number;
  checkedInCount: number;
  badgePrintedCount: number;
  sessionsCount: number;
}

/**
 * Stats cards grid showing key event metrics.
 * 
 * Why: Stats display is a pure presentational component that receives
 * computed values. Isolating it allows easy testing and potential
 * reuse in summary views.
 */
export function DashboardStats({
  totalAttendees,
  checkedInCount,
  badgePrintedCount,
  sessionsCount,
}: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-bold" data-testid="stat-total-attendees">
            {totalAttendees}
          </div>
          <div className="text-xs text-muted-foreground">Total Attendees</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-bold text-green-700 dark:text-green-400" data-testid="stat-checked-in">
            {checkedInCount}
          </div>
          <div className="text-xs text-muted-foreground">Checked In</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-bold" data-testid="stat-badges-printed">
            {badgePrintedCount}
          </div>
          <div className="text-xs text-muted-foreground">Badges Printed</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-bold" data-testid="stat-sessions">
            {sessionsCount}
          </div>
          <div className="text-xs text-muted-foreground">Sessions</div>
        </CardContent>
      </Card>
    </div>
  );
}
