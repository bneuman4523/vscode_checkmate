import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Printer, 
  CheckCircle,
  XCircle,
  RefreshCw
} from "lucide-react";
import type { Attendee, BadgeTemplate } from "@shared/schema";

interface EventBadgesProps {
  eventId: string;
}

export default function EventBadges({ eventId }: EventBadgesProps) {
  const [selectedAttendees, setSelectedAttendees] = useState<Set<string>>(new Set());

  const { data: attendees = [], isLoading: attendeesLoading } = useQuery<Attendee[]>({
    queryKey: [`/api/attendees?eventId=${eventId}`],
    enabled: !!eventId,
  });

  const { data: templates = [] } = useQuery<BadgeTemplate[]>({
    queryKey: ["/api/badge-templates"],
  });

  const toggleAttendee = (id: string) => {
    setSelectedAttendees(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedAttendees.size === attendees.length) {
      setSelectedAttendees(new Set());
    } else {
      setSelectedAttendees(new Set(attendees.map(a => a.id)));
    }
  };

  const unprintedCount = attendees.filter(a => !a.badgePrinted).length;
  const printedCount = attendees.filter(a => a.badgePrinted).length;

  if (attendeesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="section-event-badges">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Badges Printed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{printedCount}</div>
            <p className="text-xs text-muted-foreground">of {attendees.length} attendees</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{unprintedCount}</div>
            <p className="text-xs text-muted-foreground">badges to print</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Templates</CardTitle>
            <Printer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{templates.length}</div>
            <p className="text-xs text-muted-foreground">available templates</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Print Badges</CardTitle>
            <CardDescription>Select attendees to print badges</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setSelectedAttendees(new Set(attendees.filter(a => !a.badgePrinted).map(a => a.id)))}
              data-testid="button-select-unprinted"
            >
              Select Unprinted
            </Button>
            <Button 
              size="sm" 
              disabled={selectedAttendees.size === 0}
              data-testid="button-print-selected"
            >
              <Printer className="h-4 w-4 mr-2" />
              Print Selected ({selectedAttendees.size})
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {attendees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-muted-foreground">No attendees to print badges for</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={selectedAttendees.size === attendees.length}
                      onCheckedChange={selectAll}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Badge Status</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendees.map((attendee) => (
                  <TableRow key={attendee.id} data-testid={`row-badge-${attendee.id}`}>
                    <TableCell>
                      <Checkbox
                        checked={selectedAttendees.has(attendee.id)}
                        onCheckedChange={() => toggleAttendee(attendee.id)}
                        data-testid={`checkbox-attendee-${attendee.id}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {attendee.firstName} {attendee.lastName}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{attendee.participantType}</Badge>
                    </TableCell>
                    <TableCell>
                      {attendee.badgePrinted ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Printed
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Not Printed</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        data-testid={`button-reprint-${attendee.id}`}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        {attendee.badgePrinted ? "Reprint" : "Print"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
