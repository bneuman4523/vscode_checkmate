import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, ChevronRight, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNavigation } from "@/contexts/NavigationContext";
import type { Event } from "@shared/schema";

export default function Badges() {
  const [, setLocation] = useLocation();
  const { selectedCustomer } = useNavigation();
  const customerId = selectedCustomer?.id;

  const { data: events = [], isLoading } = useQuery<Event[]>({
    queryKey: [`/api/events?customerId=${customerId}`],
    enabled: !!customerId,
  });

  const activeEvents = events.filter(e => e.status === "active");
  const upcomingEvents = events.filter(e => e.status === "upcoming");
  const recentEvents = [...activeEvents, ...upcomingEvents].slice(0, 10);

  if (isLoading || !customerId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Badge Setup</h1>
          <p className="text-muted-foreground">Configure badge templates and printing for your events</p>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Badge Setup</h1>
        <p className="text-muted-foreground">Configure badge templates and printing for your events</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Printer className="h-4 w-4" />
            Select an Event
          </CardTitle>
          <CardDescription>
            Choose an event to configure badge templates and printer settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No events found</p>
              <p className="text-sm">Create an event first to configure badges</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentEvents.map((event) => (
                <button
                  key={event.id}
                  onClick={() => setLocation(`/customers/${event.customerId}/events/${event.id}?tab=badges`)}
                  className="w-full flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                  data-testid={`event-badge-link-${event.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Printer className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{event.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {event.eventDate ? new Date(event.eventDate).toLocaleDateString() : "No date set"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={event.status === "active" ? "default" : "secondary"}>
                      {event.status}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
