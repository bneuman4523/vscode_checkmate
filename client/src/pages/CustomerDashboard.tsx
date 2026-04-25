import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useNavigation } from "@/contexts/NavigationContext";
import { CreateEventDialog } from "@/components/CreateEventDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays,
  Users,
  ArrowLeft,
  Plus,
  MoreVertical,
  Building2,
  Clock,
  ChevronRight,
  Link2,
  Type,
  Settings,
  Filter,
  AlertCircle,
  Search,
  UserCheck,
  UserX,
  TrendingUp,
  Star,
  StarOff,
  ChevronDown,
  LayoutGrid,
  List,
  Copy,
} from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { Customer, Event, Attendee, CustomerIntegration } from "@shared/schema";
import { ApplyConfigurationModal } from "@/components/ApplyConfigurationModal";
import EventsListView from "@/components/EventsListView";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function CustomerDashboard() {
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId || "";
  const [, setLocation] = useLocation();
  const { selectedCustomer, setSelectedCustomer, setSelectedEvent, clearEventContext } = useNavigation();
  const [createEventDialogOpen, setCreateEventDialogOpen] = useState(false);
  const [selectedIntegrationFilter, setSelectedIntegrationFilter] = useState<string>('all');
  const [configureEventOpen, setConfigureEventOpen] = useState(false);
  const [eventToConfig, setEventToConfig] = useState<Event | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "upcoming">("all");
  const [duplicateEvent, setDuplicateEvent] = useState<Event | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const duplicateMutation = useMutation({
    mutationFn: async ({ sourceEventId, name }: { sourceEventId: string; name: string }) => {
      const res = await apiRequest("POST", `/api/events/${sourceEventId}/copy`, { name });
      return res.json();
    },
    onSuccess: (newEvent: Event) => {
      queryClient.invalidateQueries({ queryKey: [`/api/events`] });
      setDuplicateEvent(null);
      setDuplicateName("");
      toast({ title: "Event duplicated", description: `${newEvent.name} created with all configuration copied.` });
      setSelectedEvent(newEvent);
      setLocation(`/customers/${customerId}/events/${newEvent.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to duplicate event", description: error.message, variant: "destructive" });
    },
  });

  const { data: viewModePref } = useQuery<{ value: string | null }>({
    queryKey: ["/api/user/preferences/events_view_mode"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/user/preferences/events_view_mode");
      return res.json();
    },
  });

  const viewMode: "cards" | "list" = (viewModePref?.value as "cards" | "list") || "cards";

  const setViewModeMutation = useMutation({
    mutationFn: async (mode: "cards" | "list") => {
      await apiRequest("PUT", "/api/user/preferences/events_view_mode", { value: mode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/preferences/events_view_mode"] });
    },
  });

  const { data: activeOverviewPref } = useQuery<{ value: boolean | null }>({
    queryKey: ["/api/user/preferences/dashboard_active_overview_expanded"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/user/preferences/dashboard_active_overview_expanded");
      return res.json();
    },
  });

  const activeOverviewExpanded = activeOverviewPref?.value ?? false;

  const toggleActiveOverviewMutation = useMutation({
    mutationFn: async (expanded: boolean) => {
      await apiRequest("PUT", "/api/user/preferences/dashboard_active_overview_expanded", { value: expanded });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/preferences/dashboard_active_overview_expanded"] });
    },
  });

  const { data: pinnedEventsData } = useQuery<{ value: Array<{ eventId: string; eventName: string; customerId: string; customerName: string }> | null }>({
    queryKey: ["/api/user/preferences/pinned_events"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/user/preferences/pinned_events");
      return res.json();
    },
  });

  const pinnedEvents = pinnedEventsData?.value ?? [];

  const pinMutation = useMutation({
    mutationFn: async (event: Event) => {
      const updated = [...pinnedEvents, { eventId: event.id, eventName: event.name, customerId: customer!.id, customerName: customer!.name }];
      await apiRequest("PUT", "/api/user/preferences/pinned_events", { value: updated });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/preferences/pinned_events"] });
      toast({ title: "Event pinned to favorites" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to pin event", description: error.message, variant: "destructive" });
    },
  });

  const unpinMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const updated = pinnedEvents.filter((e) => e.eventId !== eventId);
      await apiRequest("PUT", "/api/user/preferences/pinned_events", { value: updated });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/preferences/pinned_events"] });
      toast({ title: "Event unpinned from favorites" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to unpin event", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    clearEventContext();
    setSearchQuery("");
    const savedFilter = localStorage.getItem(`integration_filter_${customerId}`) || 'all';
    setSelectedIntegrationFilter(savedFilter);
  }, [customerId, clearEventContext]);

  const { data: apiCustomer, isLoading: customerLoading } = useQuery<Customer>({
    queryKey: [`/api/customers/${customerId}`],
    enabled: !!customerId,
  });

  const customer = apiCustomer || selectedCustomer;

  const { data: events = [], isLoading: eventsLoading } = useQuery<Event[]>({
    queryKey: [`/api/events?customerId=${customerId}`],
    enabled: !!customerId,
  });

  const { data: allAttendees = [] } = useQuery<Attendee[]>({
    queryKey: [`/api/attendees?customerId=${customerId}`],
    enabled: !!customerId,
  });

  const { data: integrations = [], isLoading: integrationsLoading } = useQuery<CustomerIntegration[]>({
    queryKey: [`/api/integrations?customerId=${customerId}`],
    enabled: !!customerId,
  });

  // Validate filter against available integrations - reset to 'all' if invalid
  // Only run after integrations have finished loading
  useEffect(() => {
    // Wait for integrations to finish loading before validating
    if (integrationsLoading) return;
    
    // If filter is set to a specific integration ID (not 'all' or 'none')
    if (selectedIntegrationFilter !== 'all' && selectedIntegrationFilter !== 'none') {
      // Reset if customer has no integrations, or if the selected integration doesn't exist
      const filterExists = integrations.length > 0 && 
        integrations.some(i => i.id === selectedIntegrationFilter);
      if (!filterExists) {
        setSelectedIntegrationFilter('all');
        localStorage.setItem(`integration_filter_${customerId}`, 'all');
      }
    }
  }, [integrations, integrationsLoading, selectedIntegrationFilter, customerId]);

  const getIntegrationById = (integrationId: string | null) => {
    if (!integrationId) return null;
    return integrations.find(i => i.id === integrationId);
  };

  const handleIntegrationFilterChange = (value: string) => {
    setSelectedIntegrationFilter(value);
    localStorage.setItem(`integration_filter_${customerId}`, value);
  };

  const integrationFilteredEvents = selectedIntegrationFilter === 'all' 
    ? events 
    : selectedIntegrationFilter === 'none'
      ? events.filter(e => !e.integrationId)
      : events.filter(e => e.integrationId === selectedIntegrationFilter);

  const statusFilteredEvents = useMemo(() => {
    if (statusFilter === "all") return integrationFilteredEvents;
    if (statusFilter === "active") return integrationFilteredEvents.filter(e => (e as any).tempStaffSettings?.enabled === true);
    return integrationFilteredEvents.filter(e => (e as any).tempStaffSettings?.enabled !== true);
  }, [integrationFilteredEvents, statusFilter]);

  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return statusFilteredEvents;
    const q = searchQuery.toLowerCase().trim();
    return statusFilteredEvents.filter(e => 
      e.name.toLowerCase().includes(q) || 
      (e.eventCode && e.eventCode.toLowerCase().includes(q)) ||
      e.id.toLowerCase().includes(q)
    );
  }, [statusFilteredEvents, searchQuery]);

  const getEventAttendeeCount = (eventId: string) => {
    return allAttendees.filter(a => a.eventId === eventId).length;
  };

  const getEventCheckedInCount = (eventId: string) => {
    return allAttendees.filter(a => a.eventId === eventId && a.checkedIn).length;
  };

  const activeEventsAll = events.filter(e => (e as any).tempStaffSettings?.enabled === true);
  const upcomingEventsAll = events.filter(e => (e as any).tempStaffSettings?.enabled !== true);

  const activeAttendeesTotal = useMemo(() => {
    const activeEventIds = new Set(activeEventsAll.map(e => e.id));
    return allAttendees.filter(a => activeEventIds.has(a.eventId));
  }, [allAttendees, activeEventsAll]);

  const checkedInTotal = activeAttendeesTotal.filter(a => a.checkedIn).length;
  const yetToCheckIn = activeAttendeesTotal.length - checkedInTotal;
  const overallCheckinRate = activeAttendeesTotal.length > 0 
    ? Math.round((checkedInTotal / activeAttendeesTotal.length) * 100) 
    : 0;

  useEffect(() => {
    if (apiCustomer && (!selectedCustomer || selectedCustomer.id !== apiCustomer.id)) {
      setSelectedCustomer(apiCustomer);
    }
  }, [apiCustomer, selectedCustomer, setSelectedCustomer]);

  const handleEventClick = (event: Event) => {
    setSelectedEvent(event);
    setLocation(`/customers/${customerId}/events/${event.id}`);
  };

  const handleEventSettings = (event: Event) => {
    setSelectedEvent(event);
    setLocation(`/customers/${customerId}/events/${event.id}/settings`);
  };

  if (customerLoading && !selectedCustomer) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <p className="text-muted-foreground">Customer not found</p>
        <Button variant="outline" onClick={() => setLocation("/customers")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Customers
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-customer-dashboard">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-customer-name">{customer.name}</h1>
          </div>
          <Badge variant={customer.status === "active" ? "default" : "secondary"}>
            {customer.status}
          </Badge>
        </div>
        <Button 
          onClick={() => setCreateEventDialogOpen(true)}
          data-testid="button-create-event"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Event
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-events">{events.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {activeEventsAll.length} active, {upcomingEventsAll.length} upcoming
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Registered</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-attendees">
              {activeAttendeesTotal.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {activeEventsAll.length} active event{activeEventsAll.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Checked In</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-checked-in-total">{checkedInTotal}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {overallCheckinRate}% check-in rate
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Yet to Check In</CardTitle>
            <UserX className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500" data-testid="text-yet-to-checkin">{yetToCheckIn}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {activeAttendeesTotal.length > 0 ? `${100 - overallCheckinRate}% remaining` : 'No active events'}
            </p>
          </CardContent>
        </Card>
      </div>

      {activeEventsAll.length > 0 && (
        <Card>
          <CardHeader 
            className="pb-3 cursor-pointer select-none" 
            onClick={() => toggleActiveOverviewMutation.mutate(!activeOverviewExpanded)}
          >
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Active Events Check-in Progress
              <span className="text-xs text-muted-foreground font-normal ml-1">({activeEventsAll.length})</span>
              <ChevronDown className={`h-4 w-4 ml-auto text-muted-foreground transition-transform duration-200 ${activeOverviewExpanded ? 'rotate-0' : '-rotate-90'}`} />
            </CardTitle>
          </CardHeader>
          {activeOverviewExpanded && (
            <CardContent>
              <div className="space-y-3">
                {activeEventsAll.map((event) => {
                  const total = getEventAttendeeCount(event.id);
                  const checked = getEventCheckedInCount(event.id);
                  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
                  return (
                    <div 
                      key={event.id} 
                      className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -mx-2 transition-colors"
                      onClick={() => handleEventClick(event)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" title={event.name}>{event.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-green-500 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{checked}/{total}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">{pct}%</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      )}


      <div className="space-y-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Events</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-[200px] sm:w-[240px]"
                  data-testid="input-event-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "active" | "upcoming")}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                </SelectContent>
              </Select>
              {integrations.length > 0 && (
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select value={selectedIntegrationFilter} onValueChange={handleIntegrationFilterChange}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Filter by account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Accounts</SelectItem>
                      <SelectItem value="none">No Account (Manual)</SelectItem>
                      {integrations.map((integration) => (
                        <SelectItem key={integration.id} value={integration.id}>
                          {integration.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center border rounded-md">
                <Button
                  variant={viewMode === "cards" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 px-2.5 rounded-r-none"
                  onClick={() => setViewModeMutation.mutate("cards")}
                  data-testid="button-view-cards"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 px-2.5 rounded-l-none"
                  onClick={() => setViewModeMutation.mutate("list")}
                  data-testid="button-view-list"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {eventsLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <Card className="p-8">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <CalendarDays className="h-12 w-12 text-muted-foreground" />
              <div>
                {events.length === 0 ? (
                  <>
                    <h3 className="font-medium">No events yet</h3>
                    <p className="text-sm text-muted-foreground">Create your first event to get started</p>
                  </>
                ) : searchQuery.trim() ? (
                  <>
                    <h3 className="font-medium">No events match "{searchQuery}"</h3>
                    <p className="text-sm text-muted-foreground">
                      Try a different search term
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="font-medium">No events match this filter</h3>
                    <p className="text-sm text-muted-foreground">
                      Try selecting a different account or "All Accounts"
                    </p>
                  </>
                )}
              </div>
              {events.length === 0 ? (
                <Button 
                  onClick={() => setCreateEventDialogOpen(true)}
                  data-testid="button-create-first-event"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Event
                </Button>
              ) : searchQuery.trim() ? (
                <Button 
                  variant="outline"
                  onClick={() => setSearchQuery('')}
                >
                  Clear Search
                </Button>
              ) : (
                <Button 
                  variant="outline"
                  onClick={() => handleIntegrationFilterChange('all')}
                >
                  Show All Events
                </Button>
              )}
            </div>
          </Card>
        ) : viewMode === "list" ? (
          <EventsListView
            events={filteredEvents}
            getEventAttendeeCount={getEventAttendeeCount}
            getEventCheckedInCount={getEventCheckedInCount}
            getIntegrationById={getIntegrationById}
            pinnedEvents={pinnedEvents}
            onEventClick={handleEventClick}
            onPin={(event) => pinMutation.mutate(event)}
            onUnpin={(eventId) => unpinMutation.mutate(eventId)}
            onConfigure={(event) => {
              setEventToConfig(event);
              setConfigureEventOpen(true);
            }}
            onSettings={handleEventSettings}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredEvents.map((event) => (
              <Card 
                key={event.id} 
                className="hover-elevate cursor-pointer group"
                onClick={() => handleEventClick(event)}
                data-testid={`card-event-${event.id}`}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <CardTitle className="text-base truncate" title={event.name}>{event.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {event.eventCode ? (
                        <span className="font-mono">{event.eventCode}</span>
                      ) : (
                        event.id.substring(0, 8).toUpperCase()
                      )}
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {pinnedEvents.some((p) => p.eventId === event.id) ? (
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          unpinMutation.mutate(event.id);
                        }}>
                          <StarOff className="h-4 w-4 mr-2" />
                          Unpin from Favorites
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          pinMutation.mutate(event);
                        }}>
                          <Star className="h-4 w-4 mr-2" />
                          Pin to Favorites
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        handleEventSettings(event);
                      }}>
                        <Settings className="h-4 w-4 mr-2" />
                        Event Settings
                      </DropdownMenuItem>
                      {event.configStatus === 'unconfigured' && (
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          setEventToConfig(event);
                          setConfigureEventOpen(true);
                        }}>
                          <Settings className="h-4 w-4 mr-2" />
                          Configure Event
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        setDuplicateEvent(event);
                        setDuplicateName(`${event.name} (Copy)`);
                      }}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate Event
                      </DropdownMenuItem>
                      <DropdownMenuItem>Edit Event</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4 shrink-0" />
                    <span>
                      {event.eventDate ? new Date(event.eventDate).toLocaleDateString() : "No date set"}
                    </span>
                  </div>
                  {event.integrationId && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Link2 className="h-4 w-4 shrink-0" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="truncate cursor-help">
                            {getIntegrationById(event.integrationId)?.name || "Integration linked"}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Syncing attendees via {getIntegrationById(event.integrationId)?.providerId}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-1.5 pt-2">
                    {event.configStatus === 'unconfigured' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge 
                            variant="destructive" 
                            className="gap-1 cursor-pointer text-xs hover:bg-destructive/90"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEventToConfig(event);
                              setConfigureEventOpen(true);
                            }}
                          >
                            <AlertCircle className="h-3 w-3" />
                            Setup
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Click to configure this event</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Badge 
                      variant={
                        event.status === "active" ? "default" : 
                        event.status === "upcoming" ? "secondary" : 
                        "outline"
                      }
                      className="text-xs"
                    >
                      {event.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{getEventAttendeeCount(event.id)} attendees</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreateEventDialog
        open={createEventDialogOpen}
        onOpenChange={setCreateEventDialogOpen}
        customerId={customerId}
        onEventCreated={(event) => {
          setEventToConfig(event);
          setConfigureEventOpen(true);
        }}
      />

      {eventToConfig && (
        <ApplyConfigurationModal
          open={configureEventOpen}
          onOpenChange={(open) => {
            setConfigureEventOpen(open);
            if (!open) {
              if (eventToConfig) {
                setLocation(`/customers/${customerId}/events/${eventToConfig.id}`);
              }
              setEventToConfig(null);
            }
          }}
          event={eventToConfig}
          customerId={customerId}
          onConfigurationApplied={() => {
            if (eventToConfig) {
              setLocation(`/customers/${customerId}/events/${eventToConfig.id}`);
            }
          }}
        />
      )}

      <Dialog open={!!duplicateEvent} onOpenChange={(open) => { if (!open) { setDuplicateEvent(null); setDuplicateName(""); } }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Duplicate Event</DialogTitle>
            <DialogDescription>
              Create a copy of "{duplicateEvent?.name}" with all configuration (workflow, badges, staff settings, notifications). Attendees and sessions will not be copied.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="duplicate-name">Event Name</Label>
            <Input
              id="duplicate-name"
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              placeholder="New event name"
              data-testid="input-duplicate-name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDuplicateEvent(null); setDuplicateName(""); }}>
              Cancel
            </Button>
            <Button
              onClick={() => duplicateEvent && duplicateMutation.mutate({ sourceEventId: duplicateEvent.id, name: duplicateName })}
              disabled={!duplicateName.trim() || duplicateMutation.isPending}
              data-testid="button-confirm-duplicate"
            >
              {duplicateMutation.isPending ? "Duplicating..." : "Duplicate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
