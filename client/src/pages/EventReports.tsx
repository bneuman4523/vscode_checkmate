import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigation } from "@/contexts/NavigationContext";
import {
  ArrowLeft,
  Download,
  FileText,
  Users,
  CheckCircle2,
  Clock,
  Calendar,
  Pen,
  Image,
} from "lucide-react";
import type { Customer, Event } from "@shared/schema";

interface AttendeeReport {
  attendee: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    company?: string;
    registrationType?: string;
    status?: string;
  };
  checkIns: Array<{
    id: string;
    checkinType: string;
    checkinTime: string;
    badgePrinted: boolean;
  }>;
  badgePrintCount: number;
  lastBadgePrintTime?: string;
  customResponses: Array<{
    questionId: string;
    questionText: string;
    response: string;
    responseType: string;
  }>;
  signature?: {
    id: string;
    signatureData?: string;
    signatureFileUrl?: string;
    thumbnailFileUrl?: string;
    signedAt: string;
    staffUserId?: string;
  };
  sessionCheckins: Array<{
    sessionId: string;
    sessionName: string;
    checkinTime: string;
    checkoutTime?: string;
  }>;
}

interface EventReportData {
  event: Event;
  summary: {
    totalAttendees: number;
    totalCheckins: number;
    uniqueCheckins: number;
    badgesPrinted: number;
    signaturesCollected: number;
    customQuestionsAnswered: number;
    sessionCheckinsTotal: number;
  };
  attendees: AttendeeReport[];
}

interface SessionReportData {
  session: {
    id: string;
    name: string;
    startTime?: string;
    endTime?: string;
    capacity?: number;
  };
  summary: {
    totalRegistered: number;
    totalCheckedIn: number;
    totalCheckedOut: number;
    currentlyAttending: number;
  };
  attendees: Array<{
    attendeeId: string;
    firstName: string;
    lastName: string;
    email: string;
    company?: string;
    checkinTime?: string;
    checkoutTime?: string;
    status: string;
  }>;
}

interface SessionTimeTrackingData {
  session: {
    id: string;
    name: string;
    startTime?: string;
    endTime?: string;
  };
  summary: {
    totalAttendees: number;
    currentlyInRoom: number;
    avgTimeMs: number;
    avgFormattedTime: string;
    totalTimeAllMs: number;
  };
  attendees: Array<{
    attendeeId: string;
    firstName: string;
    lastName: string;
    email: string;
    company?: string;
    totalTimeMs: number;
    formattedTime: string;
    isCurrentlyCheckedIn: boolean;
    checkinCount: number;
    lastCheckinTime?: string;
    lastCheckoutTime?: string;
  }>;
}

export default function EventReports() {
  const params = useParams<{ customerId: string; eventId: string }>();
  const customerId = params.customerId || "";
  const eventId = params.eventId || "";
  const [, setLocation] = useLocation();
  const { selectedCustomer, selectedEvent } = useNavigation();
  const [activeTab, setActiveTab] = useState("overview");
  const [includeSignatures, setIncludeSignatures] = useState(false);

  const { data: reportData, isLoading: reportLoading } = useQuery<EventReportData>({
    queryKey: ["/api/reports/events", eventId],
    enabled: !!eventId,
  });

  const { data: sessions = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/events", eventId, "sessions"],
    enabled: !!eventId,
  });

  const customer = selectedCustomer;
  const event = reportData?.event || selectedEvent;

  const handleExport = async (format: 'csv' | 'xlsx' = 'csv') => {
    const url = `/api/reports/events/${eventId}/export?format=${format}&includeSignatures=${includeSignatures}`;
    const response = await fetch(url);
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `event-report-${eventId}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  };

  if (reportLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const summary = reportData?.summary || {
    totalAttendees: 0,
    totalCheckins: 0,
    uniqueCheckins: 0,
    badgesPrinted: 0,
    signaturesCollected: 0,
    customQuestionsAnswered: 0,
    sessionCheckinsTotal: 0,
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation(`/customers/${customerId}/events/${eventId}`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Event Reports</h1>
            <p className="text-muted-foreground">
              {event?.name || "Loading..."} - {customer?.name || ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="includeSignatures"
              checked={includeSignatures}
              onCheckedChange={(checked) => setIncludeSignatures(!!checked)}
            />
            <label htmlFor="includeSignatures" className="text-sm">
              Include signatures in export
            </label>
          </div>
          <Button variant="outline" onClick={() => handleExport('csv')}>
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button onClick={() => handleExport('xlsx')}>
            <Download className="h-4 w-4 mr-2" />
            Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Attendees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalAttendees}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Checked In</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.uniqueCheckins}</div>
            <p className="text-xs text-muted-foreground">
              {summary.totalCheckins} total check-ins
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Badges Printed</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.badgesPrinted}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Signatures</CardTitle>
            <Pen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.signaturesCollected}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="attendees">Attendees</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Check-in Summary</CardTitle>
              <CardDescription>
                Overview of event check-in activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex items-center gap-4 p-4 border rounded-lg">
                  <Clock className="h-8 w-8 text-blue-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Session Check-ins</p>
                    <p className="text-xl font-semibold">{summary.sessionCheckinsTotal}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 border rounded-lg">
                  <FileText className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Questions Answered</p>
                    <p className="text-xl font-semibold">{summary.customQuestionsAnswered}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 border rounded-lg">
                  <Calendar className="h-8 w-8 text-purple-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Event Date</p>
                    <p className="text-xl font-semibold">
                      {event?.eventDate
                        ? new Date(event.eventDate).toLocaleDateString()
                        : "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendees" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Attendee Details</CardTitle>
              <CardDescription>
                Individual attendee check-in and activity data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Check-ins</TableHead>
                    <TableHead>Badge</TableHead>
                    <TableHead>Signature</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData?.attendees?.map((item) => (
                    <TableRow key={item.attendee.id}>
                      <TableCell className="font-medium">
                        {item.attendee.firstName} {item.attendee.lastName}
                      </TableCell>
                      <TableCell>{item.attendee.email}</TableCell>
                      <TableCell>{item.attendee.company || "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.checkIns.length > 0 ? "default" : "secondary"
                          }
                        >
                          {item.checkIns.length > 0 ? "Checked In" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.checkIns.length}</TableCell>
                      <TableCell>
                        {item.badgePrintCount > 0 ? (
                          <Badge variant="outline">
                            {item.badgePrintCount} printed
                          </Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {item.signature ? (
                          item.signature.signatureData ? (
                            <img
                              src={item.signature.signatureData.startsWith('data:') ? item.signature.signatureData : `data:image/png;base64,${item.signature.signatureData}`}
                              alt="Signature"
                              className="h-8 w-20 object-contain border rounded bg-white"
                            />
                          ) : item.signature.thumbnailFileUrl ? (
                            <img
                              src={item.signature.thumbnailFileUrl}
                              alt="Signature"
                              className="h-8 w-20 object-contain border rounded bg-white"
                            />
                          ) : (
                            <Badge variant="outline">
                              <Pen className="h-3 w-3 mr-1" />
                              Signed
                            </Badge>
                          )
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!reportData?.attendees || reportData.attendees.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No attendees found for this event
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Session Attendance</CardTitle>
              <CardDescription>
                Track attendance across event sessions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sessions.length > 0 ? (
                <div className="space-y-4">
                  {sessions.map((session) => (
                    <SessionCard key={session.id} sessionId={session.id} sessionName={session.name} />
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No sessions found for this event
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SessionCard({ sessionId, sessionName }: { sessionId: string; sessionName: string }) {
  const [showTimeTracking, setShowTimeTracking] = useState(false);
  
  const { data: sessionReport, isLoading } = useQuery<SessionReportData>({
    queryKey: ["/api/reports/sessions", sessionId],
    enabled: !!sessionId,
  });
  
  const { data: timeTrackingData } = useQuery<SessionTimeTrackingData>({
    queryKey: [`/api/reports/sessions/${sessionId}/time-tracking`],
    enabled: !!sessionId && showTimeTracking,
  });

  if (isLoading) {
    return (
      <div className="border rounded-lg p-4">
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  const summary = sessionReport?.summary || {
    totalRegistered: 0,
    totalCheckedIn: 0,
    totalCheckedOut: 0,
    currentlyAttending: 0,
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">{sessionName}</h3>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            Registered: <strong>{summary.totalRegistered}</strong>
          </span>
          <span className="text-muted-foreground">
            Checked In: <strong>{summary.totalCheckedIn}</strong>
          </span>
          <span className="text-muted-foreground">
            Currently Attending: <strong>{summary.currentlyAttending}</strong>
          </span>
          <Button
            variant={showTimeTracking ? "default" : "outline"}
            size="sm"
            onClick={() => setShowTimeTracking(!showTimeTracking)}
          >
            <Clock className="h-4 w-4 mr-1" />
            Time Tracking
          </Button>
        </div>
      </div>
      
      {showTimeTracking && timeTrackingData && (
        <div className="mb-4 p-3 bg-muted/50 rounded-lg">
          <div className="flex gap-6 mb-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {timeTrackingData.summary.avgFormattedTime}
              </div>
              <div className="text-xs text-muted-foreground">Avg Time in Room</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {timeTrackingData.summary.totalAttendees}
              </div>
              <div className="text-xs text-muted-foreground">Attended</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {timeTrackingData.summary.currentlyInRoom}
              </div>
              <div className="text-xs text-muted-foreground">Currently In Room</div>
            </div>
          </div>
          {timeTrackingData.attendees.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Time in Room</TableHead>
                  <TableHead>Visits</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeTrackingData.attendees.map((attendee) => (
                  <TableRow key={attendee.attendeeId}>
                    <TableCell>
                      {attendee.firstName} {attendee.lastName}
                    </TableCell>
                    <TableCell>{attendee.company || "-"}</TableCell>
                    <TableCell className="font-mono">{attendee.formattedTime}</TableCell>
                    <TableCell>{attendee.checkinCount}</TableCell>
                    <TableCell>
                      <Badge variant={attendee.isCurrentlyCheckedIn ? "default" : "secondary"}>
                        {attendee.isCurrentlyCheckedIn ? "In Room" : "Left"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
      
      {!showTimeTracking && sessionReport?.attendees && sessionReport.attendees.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Check-in Time</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessionReport.attendees.map((attendee) => (
              <TableRow key={attendee.attendeeId}>
                <TableCell>
                  {attendee.firstName} {attendee.lastName}
                </TableCell>
                <TableCell>{attendee.email}</TableCell>
                <TableCell>
                  {attendee.checkinTime
                    ? new Date(attendee.checkinTime).toLocaleString()
                    : "-"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      attendee.status === "checked_in"
                        ? "default"
                        : attendee.status === "checked_out"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {attendee.status.replace("_", " ")}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : !showTimeTracking ? (
        <p className="text-sm text-muted-foreground">No attendance data</p>
      ) : null}
    </div>
  );
}
