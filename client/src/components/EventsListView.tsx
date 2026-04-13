import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MoreVertical,
  Star,
  StarOff,
  Settings,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Users,
  UserCheck,
  RefreshCw,
} from "lucide-react";
import type { Event, CustomerIntegration } from "@shared/schema";

type SortKey = "name" | "date" | "attendees" | "checkedIn" | "status" | "integration";
type SortDir = "asc" | "desc";

interface EventsListViewProps {
  events: Event[];
  getEventAttendeeCount: (eventId: string) => number;
  getEventCheckedInCount: (eventId: string) => number;
  getIntegrationById: (integrationId: string | null) => CustomerIntegration | null | undefined;
  pinnedEvents: Array<{ eventId: string }>;
  onEventClick: (event: Event) => void;
  onPin: (event: Event) => void;
  onUnpin: (eventId: string) => void;
  onConfigure: (event: Event) => void;
  onSettings?: (event: Event) => void;
}

export default function EventsListView({
  events,
  getEventAttendeeCount,
  getEventCheckedInCount,
  getIntegrationById,
  pinnedEvents,
  onEventClick,
  onPin,
  onUnpin,
  onConfigure,
  onSettings,
}: EventsListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedEvents = useMemo(() => {
    const sorted = [...events].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "date": {
          const da = a.eventDate ? new Date(a.eventDate).getTime() : 0;
          const db2 = b.eventDate ? new Date(b.eventDate).getTime() : 0;
          cmp = da - db2;
          break;
        }
        case "attendees":
          cmp = getEventAttendeeCount(a.id) - getEventAttendeeCount(b.id);
          break;
        case "checkedIn":
          cmp = getEventCheckedInCount(a.id) - getEventCheckedInCount(b.id);
          break;
        case "status":
          cmp = (a.status || "").localeCompare(b.status || "");
          break;
        case "integration": {
          const ia = a.integrationId ? (getIntegrationById(a.integrationId)?.name || "") : "";
          const ib = b.integrationId ? (getIntegrationById(b.integrationId)?.name || "") : "";
          cmp = ia.localeCompare(ib);
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [events, sortKey, sortDir, getEventAttendeeCount, getEventCheckedInCount, getIntegrationById]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" 
      ? <ArrowUp className="h-3 w-3 ml-1" /> 
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const SortableHeader = ({ column, children, className }: { column: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead 
      className={`cursor-pointer select-none hover:bg-muted/50 transition-colors ${className || ""}`}
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center">
        {children}
        <SortIcon column={column} />
      </div>
    </TableHead>
  );

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHeader column="name">Event Name</SortableHeader>
            <SortableHeader column="date">Date</SortableHeader>
            <SortableHeader column="attendees">
              <Users className="h-3.5 w-3.5 mr-1" />
              Attendees
            </SortableHeader>
            <SortableHeader column="checkedIn">
              <UserCheck className="h-3.5 w-3.5 mr-1" />
              Checked In
            </SortableHeader>
            <SortableHeader column="status">Status</SortableHeader>
            <SortableHeader column="integration">Integration</SortableHeader>
            <TableHead>Sync</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedEvents.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                No events match the current filters
              </TableCell>
            </TableRow>
          ) : (
            sortedEvents.map((event) => {
              const attendeeCount = getEventAttendeeCount(event.id);
              const checkedInCount = getEventCheckedInCount(event.id);
              const checkinPct = attendeeCount > 0 ? Math.round((checkedInCount / attendeeCount) * 100) : 0;
              const isPinned = pinnedEvents.some((p) => p.eventId === event.id);
              const integration = event.integrationId ? getIntegrationById(event.integrationId) : null;
              const isActive = (event as any).tempStaffSettings?.enabled === true;
              const syncSettings = event.syncSettings as { syncFrozen?: boolean; syncIntervalMinutes?: number | null } | null;
              const hasSyncIntegration = !!event.integrationId;
              const isSyncFrozen = syncSettings?.syncFrozen === true;
              const isSyncActive = hasSyncIntegration && !isSyncFrozen;

              return (
                <TableRow
                  key={event.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onEventClick(event)}
                  data-testid={`row-event-${event.id}`}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {isPinned && <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 shrink-0" />}
                      <div className="min-w-0">
                        <span className="truncate block max-w-[250px]" title={event.name}>{event.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {event.eventCode || event.id.substring(0, 8).toUpperCase()}
                        </span>
                      </div>
                      {event.configStatus === 'unconfigured' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="destructive" className="gap-1 text-xs shrink-0">
                              <AlertCircle className="h-3 w-3" />
                              Setup
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>Event needs configuration</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {event.eventDate
                      ? new Date(event.eventDate).toLocaleDateString()
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-sm">{attendeeCount}</TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-2">
                      <span>{checkedInCount}</span>
                      {attendeeCount > 0 && (
                        <span className="text-xs text-muted-foreground">({checkinPct}%)</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={isActive ? "default" : event.status === "upcoming" ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {isActive ? "Active" : (event.status || "upcoming")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {integration ? (
                      <span className="truncate block max-w-[150px]" title={integration.name}>
                        {integration.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {hasSyncIntegration ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            className={`text-xs gap-1 ${
                              isSyncActive
                                ? "bg-green-600 hover:bg-green-700 text-white"
                                : "bg-red-600 hover:bg-red-700 text-white"
                            }`}
                          >
                            <RefreshCw className="h-3 w-3" />
                            {isSyncActive ? "Active" : "Frozen"}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          {isSyncFrozen
                            ? "Inbound sync is frozen for this event"
                            : syncSettings?.syncIntervalMinutes
                              ? `Syncing every ${syncSettings.syncIntervalMinutes} min`
                              : "Syncing at account default interval"}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isPinned ? (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUnpin(event.id); }}>
                            <StarOff className="h-4 w-4 mr-2" />
                            Unpin from Favorites
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onPin(event); }}>
                            <Star className="h-4 w-4 mr-2" />
                            Pin to Favorites
                          </DropdownMenuItem>
                        )}
                        {onSettings && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSettings(event); }}>
                            <Settings className="h-4 w-4 mr-2" />
                            Event Settings
                          </DropdownMenuItem>
                        )}
                        {event.configStatus === 'unconfigured' && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onConfigure(event); }}>
                            <Settings className="h-4 w-4 mr-2" />
                            Configure Event
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
