import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { stripHtml } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Plus,
  MoreVertical,
  Clock,
  MapPin,
  Users,
  Lock,
  Unlock,
  UserCheck,
  UserX,
  Edit,
  Trash2,
  LogIn,
  LogOut,
  ListOrdered,
  RefreshCw,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { Session, Attendee, InsertSession } from "@shared/schema";

interface EventSessionsProps {
  eventId: string;
  customerId: string;
}

interface SessionWithStats extends Session {
  registeredCount?: number;
  waitlistCount?: number;
  checkedInCount?: number;
}

interface Registration {
  id: string;
  attendeeId: string;
  status: string;
  waitlistPosition?: number;
  registeredAt: string;
  attendee?: Attendee;
}

interface CheckinRecord {
  id: string;
  attendeeId: string;
  action: string;
  timestamp: string;
  attendee?: Attendee;
}

const sessionFormSchema = z.object({
  name: z.string().min(1, "Session name is required"),
  description: z.string().optional(),
  location: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  capacity: z.coerce.number().min(0).optional(),
  restrictToRegistered: z.boolean().default(false),
  allowWaitlist: z.boolean().default(true),
});

type SessionFormValues = z.infer<typeof sessionFormSchema>;

export default function EventSessions({ eventId, customerId }: EventSessionsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [managingSession, setManagingSession] = useState<Session | null>(null);
  const [deleteConfirmSession, setDeleteConfirmSession] = useState<Session | null>(null);
  const { toast } = useToast();

  const { data: sessions = [], isLoading } = useQuery<Session[]>({
    queryKey: [`/api/events/${eventId}/sessions`],
    enabled: !!eventId,
  });

  const { data: attendees = [] } = useQuery<Attendee[]>({
    queryKey: [`/api/attendees?eventId=${eventId}`],
    enabled: !!eventId,
  });

  const { data: allRegistrations = [] } = useQuery<Array<{sessionId: string; attendeeId: string; status: string}>>({
    queryKey: [`/api/events/${eventId}/sessions/registrations/all`],
    enabled: !!eventId && sessions.length > 0,
    queryFn: async () => {
      const allRegs: Array<{sessionId: string; attendeeId: string; status: string}> = [];
      for (const session of sessions) {
        try {
          const response = await fetch(`/api/sessions/${session.id}/registrations`);
          if (response.ok) {
            const regs = await response.json();
            allRegs.push(...regs.map((r: Registration) => ({ ...r, sessionId: session.id })));
          }
        } catch (e) {
          console.error(`Failed to fetch registrations for session ${session.id}`);
        }
      }
      return allRegs;
    },
  });

  const { data: allCheckins = [] } = useQuery<Array<{sessionId: string; attendeeId: string; action: string}>>({
    queryKey: [`/api/events/${eventId}/sessions/checkins/all`],
    enabled: !!eventId && sessions.length > 0,
    queryFn: async () => {
      const allChecks: Array<{sessionId: string; attendeeId: string; action: string}> = [];
      for (const session of sessions) {
        try {
          const response = await fetch(`/api/sessions/${session.id}/checkins`);
          if (response.ok) {
            const checks = await response.json();
            allChecks.push(...checks.map((c: CheckinRecord) => ({ ...c, sessionId: session.id })));
          }
        } catch (e) {
          console.error(`Failed to fetch checkins for session ${session.id}`);
        }
      }
      return allChecks;
    },
  });

  const sessionsWithStats: SessionWithStats[] = sessions.map((session) => {
    const sessionRegs = allRegistrations.filter((r) => r.sessionId === session.id);
    const sessionChecks = allCheckins.filter((c) => c.sessionId === session.id);
    return {
      ...session,
      registeredCount: sessionRegs.filter((r) => r.status === "registered").length,
      waitlistCount: sessionRegs.filter((r) => r.status === "waitlisted").length,
      checkedInCount: sessionChecks.filter((c) => c.action === "checkin").length,
    };
  });

  const createSessionMutation = useMutation({
    mutationFn: async (data: SessionFormValues) => {
      const payload = {
        name: data.name,
        description: data.description || null,
        location: data.location || null,
        startTime: data.startTime ? new Date(data.startTime) : null,
        endTime: data.endTime ? new Date(data.endTime) : null,
        capacity: data.capacity || null,
        restrictToRegistered: data.restrictToRegistered,
        allowWaitlist: data.allowWaitlist,
      };
      const response = await apiRequest("POST", `/api/events/${eventId}/sessions`, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sessions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sessions/registrations/all`] });
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sessions/checkins/all`] });
      setIsCreateDialogOpen(false);
      toast({ title: "Session created", description: "The session has been created successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateSessionMutation = useMutation({
    mutationFn: async ({ sessionId, data }: { sessionId: string; data: SessionFormValues }) => {
      const payload: Partial<InsertSession> = {
        name: data.name,
        description: data.description || null,
        location: data.location || null,
        startTime: data.startTime ? new Date(data.startTime) : null,
        endTime: data.endTime ? new Date(data.endTime) : null,
        capacity: data.capacity || null,
        restrictToRegistered: data.restrictToRegistered,
        allowWaitlist: data.allowWaitlist,
      };
      const response = await apiRequest("PATCH", `/api/sessions/${sessionId}`, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sessions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sessions/registrations/all`] });
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sessions/checkins/all`] });
      setEditingSession(null);
      toast({ title: "Session updated", description: "The session has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await apiRequest("DELETE", `/api/sessions/${sessionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sessions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sessions/registrations/all`] });
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sessions/checkins/all`] });
      setDeleteConfirmSession(null);
      toast({ title: "Session deleted", description: "The session has been deleted." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredSessions = sessionsWithStats.filter((session) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      session.name.toLowerCase().includes(searchLower) ||
      session.location?.toLowerCase().includes(searchLower) ||
      (session.description ? stripHtml(session.description).toLowerCase().includes(searchLower) : false)
    );
  });

  const formatDateTime = (date: Date | string | null) => {
    if (!date) return "-";
    const d = new Date(date);
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTime = (date: Date | string | null) => {
    if (!date) return "-";
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="section-event-sessions">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-sessions"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" data-testid="button-sync-sessions">
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync from Integration
          </Button>
          <Button size="sm" onClick={() => setIsCreateDialogOpen(true)} data-testid="button-add-session">
            <Plus className="h-4 w-4 mr-2" />
            Add Session
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sessions ({filteredSessions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {searchQuery ? "No sessions match your search" : "No sessions created yet"}
              </p>
              {!searchQuery && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setIsCreateDialogOpen(true)}
                  data-testid="button-create-first-session"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Session
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Registrations</TableHead>
                  <TableHead>Check-ins</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSessions.map((session) => (
                  <TableRow key={session.id} data-testid={`row-session-${session.id}`}>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-session-menu-${session.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem
                            onClick={() => setEditingSession(session)}
                            data-testid={`menu-edit-session-${session.id}`}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Session
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setManagingSession(session)}
                            data-testid={`menu-manage-checkins-${session.id}`}
                          >
                            <UserCheck className="h-4 w-4 mr-2" />
                            Manage Check-ins
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setManagingSession(session)}
                            data-testid={`menu-manage-registrations-${session.id}`}
                          >
                            <ListOrdered className="h-4 w-4 mr-2" />
                            Manage Registrations
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteConfirmSession(session)}
                            className="text-destructive"
                            data-testid={`menu-delete-session-${session.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Session
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{session.name}</div>
                        {session.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {stripHtml(session.description)}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {session.startTime ? (
                          <span>
                            {formatTime(session.startTime)}
                            {session.endTime && ` - ${formatTime(session.endTime)}`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Not set</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {session.location ? (
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          {session.location}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {session.capacity ? (
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          {session.capacity}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Unlimited</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {session.registeredCount || 0} registered
                        </Badge>
                        {(session.waitlistCount || 0) > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {session.waitlistCount} waitlisted
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          (session.checkedInCount || 0) > 0 ? "default" : "secondary"
                        }
                        className="text-xs"
                      >
                        <UserCheck className="h-3 w-3 mr-1" />
                        {session.checkedInCount || 0}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {session.restrictToRegistered ? (
                          <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                            <Lock className="h-3 w-3 mr-1" />
                            Restricted
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            <Unlock className="h-3 w-3 mr-1" />
                            Open
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SessionFormDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={(data) => createSessionMutation.mutate(data)}
        isPending={createSessionMutation.isPending}
        title="Create Session"
        description="Add a new session to this event."
      />

      <SessionFormDialog
        open={!!editingSession}
        onOpenChange={(open) => !open && setEditingSession(null)}
        onSubmit={(data) =>
          editingSession && updateSessionMutation.mutate({ sessionId: editingSession.id, data })
        }
        isPending={updateSessionMutation.isPending}
        title="Edit Session"
        description="Update session details."
        defaultValues={
          editingSession
            ? {
                name: editingSession.name,
                description: editingSession.description || "",
                location: editingSession.location || "",
                startTime: editingSession.startTime
                  ? new Date(editingSession.startTime).toISOString().slice(0, 16)
                  : "",
                endTime: editingSession.endTime
                  ? new Date(editingSession.endTime).toISOString().slice(0, 16)
                  : "",
                capacity: editingSession.capacity || undefined,
                restrictToRegistered: editingSession.restrictToRegistered,
                allowWaitlist: editingSession.allowWaitlist,
              }
            : undefined
        }
      />

      <Dialog open={!!deleteConfirmSession} onOpenChange={(open) => !open && setDeleteConfirmSession(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteConfirmSession?.name}"? This action cannot be undone.
              All registrations and check-in records will be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmSession(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmSession && deleteSessionMutation.mutate(deleteConfirmSession.id)}
              disabled={deleteSessionMutation.isPending}
              data-testid="button-confirm-delete-session"
            >
              {deleteSessionMutation.isPending ? "Deleting..." : "Delete Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SessionManagementSheet
        session={managingSession}
        onClose={() => setManagingSession(null)}
        eventId={eventId}
        customerId={customerId}
        attendees={attendees}
      />
    </div>
  );
}

interface SessionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: SessionFormValues) => void;
  isPending: boolean;
  title: string;
  description: string;
  defaultValues?: Partial<SessionFormValues>;
}

function SessionFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  title,
  description,
  defaultValues,
}: SessionFormDialogProps) {
  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      name: "",
      description: "",
      location: "",
      startTime: "",
      endTime: "",
      capacity: undefined,
      restrictToRegistered: false,
      allowWaitlist: true,
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: "",
        description: "",
        location: "",
        startTime: "",
        endTime: "",
        capacity: undefined,
        restrictToRegistered: false,
        allowWaitlist: true,
        ...defaultValues,
      });
    }
  }, [open, defaultValues]);

  const handleSubmit = (data: SessionFormValues) => {
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Session Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Keynote: Future of AI" {...field} data-testid="input-session-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Session description..."
                        {...field}
                        data-testid="input-session-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Main Hall, Room 101" {...field} data-testid="input-session-location" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Time</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} data-testid="input-session-start" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Time</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} data-testid="input-session-end" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacity</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Leave empty for unlimited"
                        {...field}
                        value={field.value || ""}
                        data-testid="input-session-capacity"
                      />
                    </FormControl>
                    <FormDescription>Maximum number of attendees (leave empty for unlimited)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="restrictToRegistered"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Restrict to Pre-Registered</FormLabel>
                      <FormDescription>Only allow attendees who registered beforehand</FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-restrict-registered"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="allowWaitlist"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Allow Waitlist</FormLabel>
                      <FormDescription>Queue attendees when capacity is reached</FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-allow-waitlist"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-4 border-t mt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-session">
                {isPending ? "Saving..." : "Save Session"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface SessionManagementSheetProps {
  session: Session | null;
  onClose: () => void;
  eventId: string;
  customerId: string;
  attendees: Attendee[];
}

interface TimeTrackingSummary {
  totalAttendees: number;
  currentlyInRoom: number;
  avgTimeMs: number;
  avgFormattedTime: string;
}

function SessionManagementSheet({
  session,
  onClose,
  eventId,
  customerId,
  attendees,
}: SessionManagementSheetProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"checkins" | "registrations">("checkins");
  const { toast } = useToast();

  const { data: registrations = [], isLoading: registrationsLoading } = useQuery<Registration[]>({
    queryKey: [`/api/sessions/${session?.id}/registrations`],
    enabled: !!session?.id,
  });

  const { data: checkins = [], isLoading: checkinsLoading } = useQuery<CheckinRecord[]>({
    queryKey: [`/api/sessions/${session?.id}/checkins`],
    enabled: !!session?.id,
  });
  
  const { data: timeTracking } = useQuery<{ summary: TimeTrackingSummary }>({
    queryKey: [`/api/reports/sessions/${session?.id}/time-tracking`],
    enabled: !!session?.id,
  });

  const checkInMutation = useMutation({
    mutationFn: async (attendeeId: string) => {
      const response = await apiRequest("POST", `/api/sessions/${session?.id}/checkin`, {
        attendeeId,
        source: "staff",
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/sessions/${session?.id}/checkins`] });
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sessions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sessions/checkins/all`] });
      toast({ title: "Checked in", description: "Attendee has been checked in to this session." });
    },
    onError: (error: Error) => {
      toast({ title: "Check-in failed", description: error.message, variant: "destructive" });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (attendeeId: string) => {
      const response = await apiRequest("POST", `/api/sessions/${session?.id}/checkout`, {
        attendeeId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/sessions/${session?.id}/checkins`] });
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sessions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sessions/checkins/all`] });
      toast({ title: "Checked out", description: "Attendee has been checked out of this session." });
    },
    onError: (error: Error) => {
      toast({ title: "Check-out failed", description: error.message, variant: "destructive" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (attendeeId: string) => {
      const response = await apiRequest("POST", `/api/sessions/${session?.id}/register`, {
        attendeeId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/sessions/${session?.id}/registrations`] });
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sessions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/sessions/registrations/all`] });
      toast({ title: "Registered", description: "Attendee has been registered for this session." });
    },
    onError: (error: Error) => {
      toast({ title: "Registration failed", description: error.message, variant: "destructive" });
    },
  });

  const checkedInAttendeeIds = new Set(
    checkins.filter((c) => c.action === "checkin").map((c) => c.attendeeId)
  );

  const registeredAttendeeIds = new Set(
    registrations.filter((r) => r.status === "registered").map((r) => r.attendeeId)
  );

  const filteredAttendees = attendees.filter((attendee) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      attendee.firstName.toLowerCase().includes(searchLower) ||
      attendee.lastName.toLowerCase().includes(searchLower) ||
      attendee.email.toLowerCase().includes(searchLower)
    );
  });

  return (
    <Sheet open={!!session} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[600px] sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle>{session?.name}</SheetTitle>
          <SheetDescription>
            {session?.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {session.location}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {timeTracking?.summary && (
            <div className="flex gap-4 p-3 bg-muted/50 rounded-lg">
              <div className="text-center flex-1">
                <div className="text-xl font-bold text-primary">
                  {timeTracking.summary.avgFormattedTime}
                </div>
                <div className="text-xs text-muted-foreground">Avg Time in Room</div>
              </div>
              <div className="text-center flex-1">
                <div className="text-xl font-bold">
                  {timeTracking.summary.totalAttendees}
                </div>
                <div className="text-xs text-muted-foreground">Attended</div>
              </div>
              <div className="text-center flex-1">
                <div className="text-xl font-bold text-green-600">
                  {timeTracking.summary.currentlyInRoom}
                </div>
                <div className="text-xs text-muted-foreground">In Room Now</div>
              </div>
            </div>
          )}
          
          <div className="flex gap-2">
            <Button
              variant={activeTab === "checkins" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("checkins")}
              data-testid="button-tab-checkins"
            >
              <UserCheck className="h-4 w-4 mr-2" />
              Check-ins
            </Button>
            <Button
              variant={activeTab === "registrations" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("registrations")}
              data-testid="button-tab-registrations"
            >
              <ListOrdered className="h-4 w-4 mr-2" />
              Registrations
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search attendees..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-session-attendees"
            />
          </div>

          {activeTab === "checkins" && (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {checkinsLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : filteredAttendees.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No attendees found</p>
              ) : (
                filteredAttendees.map((attendee) => {
                  const isCheckedIn = checkedInAttendeeIds.has(attendee.id);
                  return (
                    <div
                      key={attendee.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`checkin-row-${attendee.id}`}
                    >
                      <div>
                        <div className="font-medium">
                          {attendee.firstName} {attendee.lastName}
                        </div>
                        <div className="text-sm text-muted-foreground">{attendee.email}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isCheckedIn ? (
                          <>
                            <Badge variant="default" className="text-xs">
                              <UserCheck className="h-3 w-3 mr-1" />
                              Checked In
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => checkOutMutation.mutate(attendee.id)}
                              disabled={checkOutMutation.isPending}
                              data-testid={`button-checkout-${attendee.id}`}
                            >
                              <LogOut className="h-4 w-4 mr-1" />
                              Check Out
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => checkInMutation.mutate(attendee.id)}
                            disabled={checkInMutation.isPending}
                            data-testid={`button-checkin-${attendee.id}`}
                          >
                            <LogIn className="h-4 w-4 mr-1" />
                            Check In
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === "registrations" && (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {registrationsLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : filteredAttendees.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No attendees found</p>
              ) : (
                filteredAttendees.map((attendee) => {
                  const registration = registrations.find((r) => r.attendeeId === attendee.id);
                  const isRegistered = registeredAttendeeIds.has(attendee.id);
                  return (
                    <div
                      key={attendee.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`registration-row-${attendee.id}`}
                    >
                      <div>
                        <div className="font-medium">
                          {attendee.firstName} {attendee.lastName}
                        </div>
                        <div className="text-sm text-muted-foreground">{attendee.email}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {registration ? (
                          <Badge
                            variant={registration.status === "registered" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {registration.status === "waitlisted" && registration.waitlistPosition && (
                              <span className="mr-1">#{registration.waitlistPosition}</span>
                            )}
                            {registration.status}
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => registerMutation.mutate(attendee.id)}
                            disabled={registerMutation.isPending}
                            data-testid={`button-register-${attendee.id}`}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Register
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
