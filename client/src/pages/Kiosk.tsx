import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, X, Users, Calendar, CalendarCheck } from "lucide-react";
import KioskLauncher from "@/components/KioskLauncher";
import type { KioskSettings } from "@/components/KioskLauncher";
import type { SelectedPrinter } from "@/lib/printerPreferences";
import KioskMode from "@/components/KioskMode";
import KioskCustomerSelect from "@/components/KioskCustomerSelect";
import SessionKioskLauncher from "@/components/SessionKioskLauncher";
import SessionKioskMode from "@/components/SessionKioskMode";
import { KioskErrorBoundary } from "@/components/KioskErrorBoundary";

type KioskType = "event" | "session" | null;

export default function Kiosk() {
  const params = useParams<{ customerId?: string; eventId?: string }>();
  const [, setLocation] = useLocation();
  
  const customerId = params.customerId;
  const eventIdFromUrl = params.eventId;

  const [kioskType, setKioskType] = useState<KioskType>(null);
  const [kioskState, setKioskState] = useState<{
    isLocked: boolean;
    eventId: string | null;
    eventName: string | null;
    sessionId: string | null;
    sessionName: string | null;
    exitPin: string | null;
    scopedCustomerId: string | null;
    selectedPrinter: SelectedPrinter | null;
    kioskSettings: KioskSettings | null;
    forcedBadgeTemplateId: string | null;
  }>({
    isLocked: false,
    eventId: null,
    eventName: null,
    sessionId: null,
    sessionName: null,
    exitPin: null,
    scopedCustomerId: null,
    selectedPrinter: null,
    kioskSettings: null,
    forcedBadgeTemplateId: null,
  });

  const handleLaunchEventKiosk = (eventId: string, eventName: string, exitPin: string, printer?: SelectedPrinter, settings?: KioskSettings) => {
    if (!customerId) return;
    setKioskState({
      isLocked: true,
      eventId,
      eventName,
      sessionId: null,
      sessionName: null,
      exitPin,
      scopedCustomerId: customerId,
      selectedPrinter: printer || null,
      kioskSettings: settings || { timeoutMinutes: 240, enableFullscreen: true },
      forcedBadgeTemplateId: settings?.forcedBadgeTemplateId || null,
    });
  };

  const handleLaunchSessionKiosk = (
    sessionId: string, 
    eventId: string, 
    sessionName: string, 
    eventName: string, 
    exitPin: string
  ) => {
    if (!customerId) return;
    setKioskState({
      isLocked: true,
      eventId,
      eventName,
      sessionId,
      sessionName,
      exitPin,
      scopedCustomerId: customerId,
      selectedPrinter: null,
      kioskSettings: { timeoutMinutes: 240, enableFullscreen: true },
      forcedBadgeTemplateId: null,
    });
  };

  const handleExit = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    const returnCustomerId = kioskState.scopedCustomerId || customerId;
    const returnEventId = kioskState.eventId;

    setKioskState({
      isLocked: false,
      eventId: null,
      eventName: null,
      sessionId: null,
      sessionName: null,
      exitPin: null,
      scopedCustomerId: null,
      selectedPrinter: null,
      kioskSettings: null,
      forcedBadgeTemplateId: null,
    });
    setKioskType(null);

    if (returnCustomerId && returnEventId) {
      setLocation(`/customers/${returnCustomerId}/events/${returnEventId}`);
    } else if (returnCustomerId) {
      setLocation(`/customers/${returnCustomerId}`);
    }
  };

  const handleSelectCustomer = (selectedCustomerId: string) => {
    setLocation(`/kiosk/${selectedCustomerId}`);
  };

  const handleBackToKioskTypeSelection = () => {
    setKioskType(null);
  };

  if (kioskState.isLocked && kioskState.scopedCustomerId) {
    if (kioskState.sessionId && kioskState.eventId) {
      return (
        <KioskErrorBoundary onExit={handleExit}>
          <SessionKioskMode
            sessionId={kioskState.sessionId}
            eventId={kioskState.eventId}
            eventName={kioskState.sessionName || kioskState.eventName || undefined}
            exitPin={kioskState.exitPin || undefined}
            scopedCustomerId={kioskState.scopedCustomerId}
            onExit={handleExit}
            isLocked={true}
            kioskSettings={kioskState.kioskSettings || undefined}
          />
        </KioskErrorBoundary>
      );
    }
    
    if (kioskState.eventId) {
      return (
        <KioskErrorBoundary onExit={handleExit}>
          <KioskMode
            eventId={kioskState.eventId}
            eventName={kioskState.eventName || undefined}
            exitPin={kioskState.exitPin || undefined}
            scopedCustomerId={kioskState.scopedCustomerId}
            onExit={handleExit}
            isLocked={true}
            selectedPrinter={kioskState.selectedPrinter || undefined}
            kioskSettings={kioskState.kioskSettings || undefined}
            forcedBadgeTemplateId={kioskState.forcedBadgeTemplateId || undefined}
          />
        </KioskErrorBoundary>
      );
    }
  }

  if (!customerId) {
    return <KioskCustomerSelect onSelect={handleSelectCustomer} />;
  }

  if (kioskType === "event") {
    return (
      <KioskErrorBoundary onExit={handleBackToKioskTypeSelection}>
        <div>
          <div className="p-4">
            <Button 
              variant="ghost" 
              onClick={handleBackToKioskTypeSelection}
              data-testid="button-back-kiosk-type"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Kiosk Type Selection
            </Button>
          </div>
          <KioskLauncher 
            customerId={customerId} 
            onLaunch={handleLaunchEventKiosk}
            preselectedEventId={eventIdFromUrl}
          />
        </div>
      </KioskErrorBoundary>
    );
  }

  if (kioskType === "session") {
    return (
      <KioskErrorBoundary onExit={handleBackToKioskTypeSelection}>
        <SessionKioskLauncher 
          customerId={customerId} 
          onLaunch={handleLaunchSessionKiosk}
          onBack={handleBackToKioskTypeSelection}
          preselectedEventId={eventIdFromUrl}
        />
      </KioskErrorBoundary>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary mb-4">
            <Users className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-semibold mb-2">Kiosk Mode</h1>
          <p className="text-lg text-muted-foreground">
            Select the type of check-in kiosk to launch
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card 
            className="cursor-pointer hover-elevate transition-all"
            onClick={() => setKioskType("event")}
            data-testid="card-event-kiosk"
          >
            <CardHeader className="text-center pb-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/20 mx-auto mb-2">
                <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <CardTitle>Event Check-In</CardTitle>
              <CardDescription>
                Check attendees into the event and print badges
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center text-sm text-muted-foreground">
              <ul className="space-y-1">
                <li>Event-wide check-in</li>
                <li>Badge printing</li>
                <li>Name/email search</li>
              </ul>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover-elevate transition-all"
            onClick={() => setKioskType("session")}
            data-testid="card-session-kiosk"
          >
            <CardHeader className="text-center pb-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/20 mx-auto mb-2">
                <CalendarCheck className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <CardTitle>Session Check-In</CardTitle>
              <CardDescription>
                Check attendees into specific sessions
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center text-sm text-muted-foreground">
              <ul className="space-y-1">
                <li>Session-specific check-in</li>
                <li>Capacity tracking</li>
                <li>Registration validation</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 text-center">
          <Button 
            variant="ghost" 
            onClick={() => {
              if (customerId) {
                setLocation(`/customers/${customerId}`);
              } else {
                window.history.back();
              }
            }}
            data-testid="button-close-kiosk"
          >
            <X className="h-4 w-4 mr-2" />
            Close Kiosk Mode
          </Button>
        </div>
      </div>
    </div>
  );
}
