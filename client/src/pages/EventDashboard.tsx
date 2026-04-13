import { useEffect, lazy, Suspense, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigation } from "@/contexts/NavigationContext";
import { SetupCompletenessCard } from "@/components/SetupCompletenessCard";
import { 
  Users, 
  QrCode,
  Printer,
  Settings,
  CalendarDays,
  CheckCircle,
  UserCheck,
  ArrowLeft,
  Layers,
  FileBarChart
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import type { Customer, Event, Attendee } from "@shared/schema";

import EventAttendees from "@/components/EventAttendees";
import EventBadgeSetup from "@/components/EventBadgeSetup";
import EventScanner from "@/components/EventScanner";
import EventSettings from "@/components/EventSettings";
import EventSessions from "@/components/EventSessions";
import DataSyncPage from "@/components/DataSyncPage";

const mockEventData: Record<string, Event> = {
  "evt-1": {
    id: "evt-1",
    customerId: "1",
    name: "Annual Developer Conference 2025",
    eventDate: new Date("2025-06-15"),
    status: "upcoming",
    defaultBadgeTemplateId: null,
    printerSettings: null,
    selectedTemplates: [],
    selectedPrinterId: null,
    integrationId: null,
    externalEventId: null,
    tempStaffSettings: null,
    createdAt: new Date(),
  },
  "evt-2": {
    id: "evt-2",
    customerId: "1",
    name: "Product Launch Event",
    eventDate: new Date("2025-03-20"),
    status: "active",
    defaultBadgeTemplateId: null,
    printerSettings: null,
    selectedTemplates: [],
    selectedPrinterId: null,
    integrationId: null,
    externalEventId: null,
    tempStaffSettings: null,
    createdAt: new Date(),
  },
};

const mockCustomerData: Record<string, Customer> = {
  "1": {
    id: "1",
    name: "Tech Conference Inc",
    contactEmail: "admin@techconf.com",
    apiBaseUrl: "https://api.techconf.com/v1",
    status: "active",
    createdAt: new Date(),
  },
  "2": {
    id: "2",
    name: "Global Events Corp",
    contactEmail: "contact@globalevents.com",
    apiBaseUrl: "https://events.globalcorp.io/api",
    status: "active",
    createdAt: new Date(),
  },
};

const getEventFallback = (eventId: string, customerId: string): Event => mockEventData[eventId] || {
  id: eventId,
  customerId,
  name: `Event ${eventId}`,
  eventDate: new Date(),
  status: "active",
  defaultBadgeTemplateId: null,
  printerSettings: null,
  selectedTemplates: [],
  selectedPrinterId: null,
  integrationId: null,
  externalEventId: null,
  tempStaffSettings: null,
  createdAt: new Date(),
};

const getCustomerFallback = (id: string): Customer => mockCustomerData[id] || {
  id,
  name: `Customer ${id}`,
  contactEmail: `contact@customer-${id}.com`,
  apiBaseUrl: null,
  status: "active",
  createdAt: new Date(),
};

export default function EventDashboard() {
  const params = useParams<{ customerId: string; eventId: string }>();
  const customerId = params.customerId || "";
  const eventId = params.eventId || "";
  const [location, setLocation] = useLocation();
  const { selectedCustomer, selectedEvent, setSelectedCustomer, setSelectedEvent } = useNavigation();

  const basePath = `/customers/${customerId}/events/${eventId}`;

  const { data: apiCustomer, isLoading: customerLoading } = useQuery<Customer>({
    queryKey: ["/api/customers", customerId],
    enabled: !!customerId,
  });

  const { data: apiEvent, isLoading: eventLoading } = useQuery<Event>({
    queryKey: ["/api/events", eventId],
    enabled: !!eventId,
  });

  const { data: attendees = [] } = useQuery<Attendee[]>({
    queryKey: [`/api/attendees?eventId=${eventId}`],
    enabled: !!eventId,
    refetchInterval: 30000,
  });

  const eventFallback = eventId && customerId ? getEventFallback(eventId, customerId) : null;
  const customerFallback = customerId ? getCustomerFallback(customerId) : null;
  const customer = apiCustomer || selectedCustomer || customerFallback;
  const event = apiEvent || selectedEvent || eventFallback;

  useEffect(() => {
    if (apiCustomer && (!selectedCustomer || selectedCustomer.id !== apiCustomer.id)) {
      setSelectedCustomer(apiCustomer);
    }
  }, [apiCustomer, selectedCustomer, setSelectedCustomer]);

  useEffect(() => {
    if (apiEvent && (!selectedEvent || selectedEvent.id !== apiEvent.id)) {
      setSelectedEvent(apiEvent);
    }
  }, [apiEvent, selectedEvent, setSelectedEvent]);

  const getCurrentTab = () => {
    if (location.includes("/attendees")) return "attendees";
    if (location.includes("/sessions")) return "sessions";
    if (location.includes("/badges")) return "badges";
    if (location.includes("/scanner")) return "scanner";
    if (location.includes("/data-sync")) return "data-sync";
    if (location.includes("/settings")) return "settings";
    return "overview";
  };

  const handleTabChange = (tab: string) => {
    if (tab === "overview") {
      setLocation(basePath);
    } else {
      setLocation(`${basePath}/${tab}`);
    }
  };

  const checkedInCount = attendees.filter(a => a.checkedIn).length;
  const notCheckedIn = attendees.length - checkedInCount;
  const checkinRate = attendees.length > 0 ? Math.round((checkedInCount / attendees.length) * 100) : 0;
  const badgesPrinted = attendees.filter(a => a.badgePrinted).length;
  const badgesNotPrinted = attendees.length - badgesPrinted;

  const checkinChartData = useMemo(() => [
    { name: "Checked In", value: checkedInCount, color: "hsl(142, 71%, 45%)" },
    { name: "Not Checked In", value: notCheckedIn, color: "hsl(30, 90%, 55%)" },
  ], [checkedInCount, notCheckedIn]);

  const badgeChartData = useMemo(() => [
    { name: "Printed", value: badgesPrinted, color: "hsl(221, 83%, 53%)" },
    { name: "Not Printed", value: badgesNotPrinted, color: "hsl(215, 20%, 75%)" },
  ], [badgesPrinted, badgesNotPrinted]);

  const participantTypeData = useMemo(() => {
    const typeMap = new Map<string, number>();
    attendees.forEach(a => {
      const type = a.participantType || "Unknown";
      typeMap.set(type, (typeMap.get(type) || 0) + 1);
    });
    const typeColors = [
      "hsl(221, 83%, 53%)", "hsl(142, 71%, 45%)", "hsl(30, 90%, 55%)",
      "hsl(280, 65%, 55%)", "hsl(350, 80%, 55%)", "hsl(180, 60%, 45%)",
      "hsl(45, 85%, 55%)", "hsl(200, 70%, 50%)",
    ];
    return Array.from(typeMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({
        name, value, color: typeColors[i % typeColors.length]
      }));
  }, [attendees]);

  if ((customerLoading || eventLoading) && !selectedEvent) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!event || !customer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <p className="text-muted-foreground">Event not found</p>
        <Button variant="outline" onClick={() => setLocation(`/customers/${customerId}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Customer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="page-event-dashboard">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold truncate" data-testid="text-event-name">{event.name}</h1>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-4 w-4 flex-shrink-0" />
              {event.eventDate ? new Date(event.eventDate).toLocaleDateString() : "No date"}
            </span>
            <Badge variant={event.status === "active" ? "default" : "secondary"}>
              {event.status}
            </Badge>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => setLocation(`${basePath}/reports`)}
          data-testid="button-reports"
        >
          <FileBarChart className="h-4 w-4 mr-2" />
          Reports
        </Button>
      </div>

      {getCurrentTab() === "overview" && (
        <div className="space-y-4 sm:space-y-6">
          <SetupCompletenessCard
            eventId={String(eventId)}
            onOpenAssistant={() => {
              window.dispatchEvent(new CustomEvent("open-assistant"));
            }}
          />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Attendees</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-attendees">{attendees.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Checked In</CardTitle>
                <UserCheck className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600" data-testid="text-checked-in">{checkedInCount}</div>
                <p className="text-xs text-muted-foreground mt-1">{checkinRate}% of total</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Yet to Check In</CardTitle>
                <CheckCircle className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-500" data-testid="text-yet-to-checkin">{notCheckedIn}</div>
                <p className="text-xs text-muted-foreground mt-1">{attendees.length > 0 ? 100 - checkinRate : 0}% remaining</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Badges Printed</CardTitle>
                <Printer className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-500" data-testid="text-badges-printed">
                  {badgesPrinted}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {attendees.length > 0 ? Math.round((badgesPrinted / attendees.length) * 100) : 0}% of total
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">Check-in Progress</CardTitle>
              </CardHeader>
              <CardContent>
                {attendees.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                    No attendees yet
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={checkinChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          {checkinChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value: number, name: string) => [`${value} attendees`, name]}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--popover))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            color: 'hsl(var(--popover-foreground))'
                          }}
                          itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                          labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex items-center gap-4 text-xs mt-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(142, 71%, 45%)" }} />
                        <span>Checked In ({checkedInCount})</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(30, 90%, 55%)" }} />
                        <span>Remaining ({notCheckedIn})</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">Badge Printing</CardTitle>
              </CardHeader>
              <CardContent>
                {attendees.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                    No attendees yet
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={badgeChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          {badgeChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value: number, name: string) => [`${value} badges`, name]}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--popover))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            color: 'hsl(var(--popover-foreground))'
                          }}
                          itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                          labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex items-center gap-4 text-xs mt-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(221, 83%, 53%)" }} />
                        <span>Printed ({badgesPrinted})</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(215, 20%, 75%)" }} />
                        <span>Not Printed ({badgesNotPrinted})</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">Attendee Types</CardTitle>
              </CardHeader>
              <CardContent>
                {participantTypeData.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                    No attendees yet
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={participantTypeData}
                          cx="50%"
                          cy="50%"
                          innerRadius={0}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          {participantTypeData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value: number, name: string) => [`${value} attendees`, name]}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--popover))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            color: 'hsl(var(--popover-foreground))'
                          }}
                          itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                          labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs mt-2">
                      {participantTypeData.slice(0, 6).map((entry) => (
                        <div key={entry.name} className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                          <span className="truncate max-w-[100px]">{entry.name} ({entry.value})</span>
                        </div>
                      ))}
                      {participantTypeData.length > 6 && (
                        <span className="text-muted-foreground">+{participantTypeData.length - 6} more</span>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm sm:text-base">Recent Check-ins</CardTitle>
              </CardHeader>
              <CardContent>
                {attendees.filter(a => a.checkedIn).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No check-ins yet</p>
                ) : (
                  <div className="space-y-3">
                    {attendees
                      .filter(a => a.checkedIn)
                      .sort((a, b) => {
                        const aTime = a.checkedInAt ? new Date(a.checkedInAt).getTime() : 0;
                        const bTime = b.checkedInAt ? new Date(b.checkedInAt).getTime() : 0;
                        return bTime - aTime;
                      })
                      .slice(0, 5)
                      .map((attendee) => (
                        <div key={attendee.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <UserCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />
                            <span className="truncate">{attendee.firstName} {attendee.lastName}</span>
                          </div>
                          <span className="text-muted-foreground text-xs shrink-0 ml-2">
                            {attendee.checkedInAt ? new Date(attendee.checkedInAt).toLocaleTimeString() : ""}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      )}

      {getCurrentTab() === "attendees" && <EventAttendees eventId={eventId} />}
      {getCurrentTab() === "sessions" && <EventSessions eventId={eventId} customerId={customerId} />}
      {getCurrentTab() === "badges" && <EventBadgeSetup eventId={eventId} />}
      {getCurrentTab() === "scanner" && <EventScanner eventId={eventId} />}
      {getCurrentTab() === "data-sync" && <DataSyncPage eventId={eventId} />}
      {getCurrentTab() === "settings" && <EventSettings eventId={eventId} />}
    </div>
  );
}
