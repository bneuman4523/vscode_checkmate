import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Clock, Calendar, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

function useLoginBackground() {
  return useQuery<{ imageUrl: string | null; backgroundColor: string | null }>({
    queryKey: ["/api/settings/login-background"],
    queryFn: async () => {
      const response = await fetch("/api/settings/login-background");
      if (!response.ok) return { imageUrl: null, backgroundColor: null };
      return response.json();
    },
    staleTime: 60000,
  });
}

interface EventStatus {
  available: boolean;
  reason?: string;
  startsAt?: string;
  endedAt?: string;
  event?: {
    id: string;
    name: string;
    eventDate: string;
    customerName: string;
  };
  accessWindow?: {
    startTime: string;
    endTime: string;
  };
}

export default function StaffLogin() {
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: bgSettings } = useLoginBackground();
  
  const [passcode, setPasscode] = useState("");
  const [staffName, setStaffName] = useState("");
  
  const backgroundStyle: React.CSSProperties = {
    ...(bgSettings?.backgroundColor && { backgroundColor: bgSettings.backgroundColor }),
    ...(bgSettings?.imageUrl && {
      backgroundImage: `url(${bgSettings.imageUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      backgroundRepeat: 'no-repeat',
    }),
  };

  const { data: status, isLoading: statusLoading, error: statusError } = useQuery<EventStatus>({
    queryKey: ['/api/staff/events', eventId, 'status'],
    enabled: !!eventId,
  });

  const loginMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/staff/events/${eventId}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode, staffName }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      localStorage.setItem('staffToken', data.token);
      localStorage.setItem('staffSession', JSON.stringify({
        token: data.token,
        expiresAt: data.expiresAt,
        staffName: data.session.staffName,
        eventId: data.event.id,
        eventName: data.event.name,
        customerId: data.event.customerId,
        customerName: data.event.customerName,
      }));
      toast({
        title: "Login successful",
        description: `Welcome, ${staffName}! You can now check in attendees.`,
      });
      window.location.replace(`/staff/${eventId}/dashboard`);
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim() || !staffName.trim()) {
      toast({
        title: "Missing information",
        description: "Please enter both the passcode and your name.",
        variant: "destructive",
      });
      return;
    }
    loginMutation.mutate();
  };

  const hasBackgroundStyle = Object.keys(backgroundStyle).length > 0;

  if (statusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" style={hasBackgroundStyle ? backgroundStyle : undefined}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (statusError || !status) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" style={hasBackgroundStyle ? backgroundStyle : undefined}>
        <Card className="w-full max-w-md bg-background/95 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-destructive">Event Not Found</CardTitle>
            <CardDescription>
              The event you're looking for could not be found.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please check the event link and try again.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!status.available) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" style={hasBackgroundStyle ? backgroundStyle : undefined}>
        <Card className="w-full max-w-md bg-background/95 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {status.event?.name || "Event Access"}
            </CardTitle>
            {status.event?.customerName && (
              <CardDescription>{status.event.customerName}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {status.reason}
                {status.startsAt && (
                  <p className="mt-2 font-medium">
                    Access starts: {format(new Date(status.startsAt), "PPp")}
                  </p>
                )}
                {status.endedAt && (
                  <p className="mt-2 text-muted-foreground">
                    Access ended: {format(new Date(status.endedAt), "PPp")}
                  </p>
                )}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" style={hasBackgroundStyle ? backgroundStyle : undefined}>
      <Card className="w-full max-w-md bg-background/95 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Staff Check-In Portal
          </CardTitle>
          <CardDescription>
            {status.event?.name}
            {status.event?.customerName && (
              <span className="block text-xs mt-1">{status.event.customerName}</span>
            )}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {status.event?.eventDate && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground pb-2 border-b">
                <Calendar className="h-4 w-4" />
                {format(new Date(status.event.eventDate), "PPP")}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="staffName">Your Name</Label>
              <Input
                id="staffName"
                type="text"
                placeholder="Enter your name"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                disabled={loginMutation.isPending}
                data-testid="input-staff-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="passcode">Passcode</Label>
              <Input
                id="passcode"
                type="password"
                placeholder="Enter the event passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                disabled={loginMutation.isPending}
                data-testid="input-passcode"
              />
            </div>

            {status.accessWindow && (
              <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                <p className="font-medium">Access Window:</p>
                <p>{format(new Date(status.accessWindow.startTime), "p")} - {format(new Date(status.accessWindow.endTime), "p")}</p>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loginMutation.isPending}
              data-testid="button-login"
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Logging in...
                </>
              ) : (
                "Login to Check-In Portal"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
