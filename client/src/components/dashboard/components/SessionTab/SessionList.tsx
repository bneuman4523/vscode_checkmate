import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MapPin, Clock, UserCheck, Search, CalendarDays } from "lucide-react";
import { format, isSameDay } from "date-fns";
import { stripHtml } from "@/lib/utils";
import type { Session } from "../../types";

interface SessionListProps {
  sessions: Session[];
  isLoading: boolean;
  onSelectSession: (session: Session) => void;
}

export function SessionList({
  sessions,
  isLoading,
  onSelectSession,
}: SessionListProps) {
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const availableDates = useMemo(() => {
    const dateSet = new Map<string, Date>();
    for (const s of sessions) {
      if (s.startTime) {
        const d = new Date(s.startTime);
        const key = format(d, "yyyy-MM-dd");
        if (!dateSet.has(key)) {
          dateSet.set(key, d);
        }
      }
    }
    return Array.from(dateSet.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, date]) => ({ key, date }));
  }, [sessions]);

  const filtered = useMemo(() => {
    let result = sessions;

    if (selectedDate) {
      result = result.filter((s) => {
        if (!s.startTime) return false;
        const d = new Date(s.startTime);
        return format(d, "yyyy-MM-dd") === selectedDate;
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.location?.toLowerCase().includes(q) ||
        (s.description ? stripHtml(s.description).toLowerCase().includes(q) : false)
      );
    }

    return result;
  }, [sessions, search, selectedDate]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          No sessions are available for check-in at this time.
        </AlertDescription>
      </Alert>
    );
  }

  const showFilters = sessions.length > 5;
  const showDateFilter = availableDates.length > 1;

  return (
    <div className="space-y-3">
      {showFilters && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sessions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-session-search"
            />
          </div>

          {showDateFilter && (
            <div className="flex flex-wrap gap-1.5" data-testid="session-date-filters">
              <Button
                variant={selectedDate === null ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setSelectedDate(null)}
              >
                All Dates
              </Button>
              {availableDates.map(({ key, date }) => (
                <Button
                  key={key}
                  variant={selectedDate === key ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => setSelectedDate(selectedDate === key ? null : key)}
                >
                  <CalendarDays className="h-3 w-3" />
                  {format(date, "EEE, MMM d")}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <Alert>
          <AlertDescription>
            No sessions match your filters.
          </AlertDescription>
        </Alert>
      ) : (
        filtered.map((session) => (
          <Card 
            key={session.id}
            className="hover-elevate cursor-pointer"
            onClick={() => onSelectSession(session)}
            data-testid={`card-session-${session.id}`}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium">{session.name}</h3>
                  {session.description && (
                    <p className="text-sm text-muted-foreground truncate">{stripHtml(session.description)}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
                    {session.startTime && (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {format(new Date(session.startTime), "EEE, MMM d")}
                      </span>
                    )}
                    {session.startTime && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(session.startTime), "h:mm a")}
                        {session.endTime && ` - ${format(new Date(session.endTime), "h:mm a")}`}
                      </span>
                    )}
                    {session.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {session.location}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <Badge variant="outline">
                    <UserCheck className="h-3 w-3 mr-1" />
                    {session.checkedInCount}
                    {session.capacity ? ` / ${session.capacity}` : ""}
                  </Badge>
                  {session.restrictToRegistered && (
                    <Badge variant="secondary" className="text-xs">
                      Pre-registration only
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
