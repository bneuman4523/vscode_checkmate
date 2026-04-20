import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useParams } from "wouter";
import { Loader2, Users, Clock, Printer, Cloud } from "lucide-react";
import KioskMode from "@/components/KioskMode";
import { KioskErrorBoundary } from "@/components/KioskErrorBoundary";
import type { KioskSettings } from "@/components/KioskLauncher";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { useBackNavigationGuard } from "@/hooks/useBackNavigationGuard";
import { IdleTimeoutDialog } from "@/components/IdleTimeoutDialog";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStaffSession } from "./hooks/useStaffSession";
import { useStaffQueries } from "./hooks/useStaffQueries";
import { useStaffMutations, useSessionMutations } from "./hooks/useStaffMutations";
import { useWorkflowActions } from "./hooks/useWorkflowActions";
import { useAttendeeFilters, useSessionRegistrationFilters } from "./hooks/useAttendeeFilters";
import { DashboardHeader } from "./components/DashboardHeader";
import { DashboardStats } from "./components/DashboardStats";
import { AttendeeTab } from "./components/AttendeeTab";
import { SessionTab } from "./components/SessionTab";
import {
  CheckinDialog,
  EditAttendeeDialog,
  PrintPreviewDialog,
  WorkflowDialog,
  BadgePreviewDialog,
  AddAttendeeDialog,
} from "./components/dialogs";
import { StaffFeedbackWidget } from "./StaffFeedbackWidget";
import { usePrinter } from "@/hooks/usePrinter";
import PrinterSelector from "@/components/PrinterSelector";
import PrinterOfflineAlert from "@/components/PrinterOfflineAlert";
import { useNetworkPrint } from "@/hooks/use-network-print";
import { printOrchestrator } from "@/services/print-orchestrator";
import type { Attendee, Session, EditFormData, PrintPreviewData } from "./types";
import { registrationStatuses } from "@shared/schema";
import { useGroupCheckin } from "@/hooks/useGroupCheckin";
import GroupCheckinCard from "@/components/group/GroupCheckinCard";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { getAuthHeaders } from "./utils";

/**
 * Staff Dashboard - Composition Root
 * 
 * Why: This component assembles all dashboard sub-components using hooks for
 * business logic. It manages UI state (dialogs, selected items) and passes
 * callbacks to child components. All data fetching, mutations, and complex
 * logic is delegated to specialized hooks.
 * 
 * Architecture:
 * - useStaffSession: Authentication and session management
 * - useStaffQueries: All TanStack Query data fetching
 * - useStaffMutations: Check-in, print, update mutations
 * - useWorkflowActions: Workflow-related callbacks
 * - useAttendeeFilters: Search and filter logic
 */
export default function StaffDashboard() {
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;

  const { session, isAuthenticated, logout } = useStaffSession(eventId);

  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);
  const [showCheckinDialog, setShowCheckinDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editFormData, setEditFormData] = useState<EditFormData>({ firstName: "", lastName: "", company: "", title: "" });
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const statusFilterInitialized = useRef(false);
  const [sessionSearchTerm, setSessionSearchTerm] = useState("");
  const [attendeeScanMode, setAttendeeScanMode] = useState(false);
  const [sessionScanMode, setSessionScanMode] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printPreviewData, setPrintPreviewData] = useState<PrintPreviewData | null>(null);
  const [showBadgePreview, setShowBadgePreview] = useState(false);
  const [showAddWalkin, setShowAddWalkin] = useState(false);
  const [kioskActive, setKioskActive] = useState(false);
  const [groupSheetOpen, setGroupSheetOpen] = useState(false);
  const [groupScannedMemberId, setGroupScannedMemberId] = useState<string | null>(null);
  const [isGroupPrinting, setIsGroupPrinting] = useState(false);

  const qc = useQueryClient();
  const staffPrinter = usePrinter({ eventId: eventId || '', mode: 'staff' });
  const networkPrint = useNetworkPrint();
  const groupCheckin = useGroupCheckin({ eventId: eventId || '', mode: 'staff', getStaffAuthHeaders: getAuthHeaders });

  const handleStaffIdleTimeout = useCallback(async () => {
    try {
      await fetch("/api/staff/logout", { method: "POST", credentials: "include" });
    } catch {}
    qc.clear();
    window.location.replace(`/staff/${eventId}?reason=timeout`);
  }, [qc, eventId]);

  const staffIdleTimeout = useIdleTimeout({
    timeoutMs: 8 * 60 * 60 * 1000,
    warningMs: 2 * 60 * 1000,
    onTimeout: handleStaffIdleTimeout,
    enabled: isAuthenticated,
  });

  useBackNavigationGuard(isAuthenticated);

  const queries = useStaffQueries(eventId, isAuthenticated, selectedSession?.id);
  const isGroupCheckinEnabled = Boolean((queries.event?.tempStaffSettings as any)?.groupCheckinEnabled);

  // Pre-filter attendees by the event's selected statuses (from sync config)
  const selectedStatuses = queries.event?.syncSettings?.selectedStatuses;

  const includedAttendees = useMemo(() => {
    if (!selectedStatuses || selectedStatuses.length === 0) {
      return queries.attendees;
    }
    return queries.attendees.filter(a => {
      const status = a.registrationStatusLabel || a.registrationStatus || '';
      return selectedStatuses.includes(status);
    });
  }, [queries.attendees, selectedStatuses]);

  // Determine which statuses to show as filter buttons
  const availableStatuses = useMemo(() => {
    if (selectedStatuses && selectedStatuses.length > 0) {
      return selectedStatuses;
    }
    return [...registrationStatuses];
  }, [selectedStatuses]);

  const handlePrintPreview = useCallback((data: PrintPreviewData) => {
    setPrintPreviewData(data);
    setShowPrintPreview(true);
  }, []);

  const handleCheckinSuccess = useCallback(() => {
    setShowCheckinDialog(false);
    setSelectedAttendee(null);
  }, []);

  const mutations = useStaffMutations({
    eventId,
    onPrintPreview: handlePrintPreview,
    onSuccess: handleCheckinSuccess,
  });

  const sessionMutations = useSessionMutations();

  const workflowActions = useWorkflowActions({
    resolveTemplateForAttendee: queries.resolveTemplateForAttendee,
    clearTemplateCache: queries.clearTemplateCache,
    checkinMutate: mutations.checkinMutation.mutateAsync,
    hasActiveWorkflow: queries.hasActiveWorkflow,
  });

  useEffect(() => {
    if (!statusFilterInitialized.current && queries.event?.tempStaffSettings?.defaultRegistrationStatusFilter) {
      setStatusFilter(queries.event.tempStaffSettings.defaultRegistrationStatusFilter);
      statusFilterInitialized.current = true;
    }
  }, [queries.event]);

  const { filteredAttendees, checkedInCount, badgePrintedCount } = useAttendeeFilters(
    includedAttendees,
    searchTerm,
    statusFilter
  );

  const { filteredRegistrations } = useSessionRegistrationFilters(
    queries.sessionRegistrations,
    sessionSearchTerm
  );

  const handleEditClick = useCallback((attendee: Attendee) => {
    setSelectedAttendee(attendee);
    setEditFormData({
      firstName: attendee.firstName,
      lastName: attendee.lastName,
      company: attendee.company || "",
      title: attendee.title || "",
    });
    setShowEditDialog(true);
  }, []);

  const handleViewDetails = useCallback((attendee: Attendee) => {
    setSelectedAttendee(attendee);
    setShowCheckinDialog(true);
  }, []);

  const openGroupSheet = useCallback(async (orderCode: string, scannedId?: string): Promise<boolean> => {
    try {
      // Peek at member count first via staff endpoint
      const res = await fetch(`/api/staff/group/${encodeURIComponent(orderCode)}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.found || !data.members || data.members.length <= 1) return false;

      // Multi-member group — populate hook state
      const found = await groupCheckin.lookupGroup(orderCode);
      if (found) {
        setGroupScannedMemberId(scannedId || null);
        setGroupSheetOpen(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [groupCheckin]);

  const handleGroupConfirm = useCallback(async () => {
    try {
      const result = await groupCheckin.checkInSelected();
      qc.invalidateQueries({ queryKey: ['/api/staff/attendees'] });
      queries.refetchAttendees();
      setGroupSheetOpen(false);
      groupCheckin.reset();
    } catch (err) {
      console.error("[StaffDashboard] Group check-in failed:", err);
    }
  }, [groupCheckin, qc, queries]);

  const handleCheckinClick = useCallback(async (attendee: Attendee) => {
    // Try group check-in first if enabled
    if (isGroupCheckinEnabled && (attendee as any).orderCode) {
      const isGroup = await openGroupSheet((attendee as any).orderCode, attendee.id);
      if (isGroup) return;
    }
    workflowActions.handleCheckinClick(attendee, () => setShowCheckinDialog(false));
  }, [workflowActions, isGroupCheckinEnabled, openGroupSheet]);

  const handleSessionSelect = useCallback((session: Session) => {
    setSelectedSession(session);
    setSessionScanMode(false);
    setSessionSearchTerm("");
    queries.refetchRegistrations();
  }, [queries]);

  const handleSessionBack = useCallback(() => {
    setSelectedSession(null);
    setSessionScanMode(false);
    setSessionSearchTerm("");
  }, []);

  const handleSessionQRScan = useCallback((attendee: Attendee) => {
    if (!selectedSession) return;
    setSelectedAttendee(attendee);
    const isCheckedIn = queries.sessionRegistrations.some(
      r => r.attendee.id === attendee.id && r.sessionCheckedIn
    );
    if (isCheckedIn) {
      sessionMutations.sessionCheckoutMutation.mutate({
        sessionId: selectedSession.id,
        attendeeId: attendee.id,
      });
    } else {
      sessionMutations.sessionCheckinMutation.mutate({
        sessionId: selectedSession.id,
        attendeeId: attendee.id,
      });
    }
  }, [selectedSession, queries.sessionRegistrations, sessionMutations]);

  const handlePrintAndClose = useCallback(async () => {
    if (!printPreviewData) return;

    const sp = staffPrinter.savedPrinter;
    const { attendee, template } = printPreviewData;
    const badgeData = {
      firstName: attendee.firstName,
      lastName: attendee.lastName,
      company: attendee.company || undefined,
      title: attendee.title || undefined,
      participantType: attendee.participantType,
      externalId: attendee.externalId || undefined,
    };
    const labelRotation = ((template as unknown as Record<string, unknown>).labelRotation || 0) as 0 | 90 | 180 | 270;

    try {
      if (sp?.type === 'printnode') {
        const pName = sp.printerName.toLowerCase();
        const isZebra = pName.includes('zebra') || pName.includes('zd') || pName.includes('zt') || pName.includes('zp');
        const token = localStorage.getItem('staffToken');
        if (isZebra) {
          const zplData = networkPrint.generateBadgeZpl(
            { firstName: attendee.firstName, lastName: attendee.lastName, company: attendee.company || undefined, title: attendee.title || undefined, externalId: attendee.externalId || undefined },
            { width: template.width, height: template.height, includeQR: template.includeQR, qrData: attendee.externalId || `${attendee.firstName}-${attendee.lastName}` },
          );
          const res = await fetch('/api/staff/printnode/print', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ printerId: sp.printNodeId, zplData, title: `Badge: ${attendee.firstName} ${attendee.lastName}` }),
          });
          if (!res.ok) throw new Error('PrintNode print failed');
        } else {
          const pdfBlob = await printOrchestrator.generatePDFBlob(badgeData, template, labelRotation);
          const pdfArrayBuffer = await pdfBlob.arrayBuffer();
          const pdfBase64 = btoa(new Uint8Array(pdfArrayBuffer).reduce((d, b) => d + String.fromCharCode(b), ''));
          const res = await fetch('/api/staff/printnode/print', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ printerId: sp.printNodeId, pdfBase64, title: `Badge: ${attendee.firstName} ${attendee.lastName}` }),
          });
          if (!res.ok) throw new Error('PrintNode print failed');
        }
      } else if (sp?.type === 'custom' || sp?.type === 'local') {
        const ip = sp.type === 'custom' ? sp.customIp : sp.ipAddress;
        const port = sp.type === 'custom' ? sp.customPort : (sp.port || 9100);
        const dpi = sp.type === 'custom' ? sp.customDpi : (sp.dpi || 203);
        if (ip) {
          networkPrint.setIp(ip);
          networkPrint.setPort(port);
          networkPrint.setDpi(dpi);
        }
        const zplData = networkPrint.generateBadgeZpl(
          { firstName: attendee.firstName, lastName: attendee.lastName, company: attendee.company || undefined, title: attendee.title || undefined, externalId: attendee.externalId || undefined },
          { width: template.width, height: template.height, includeQR: template.includeQR, qrData: attendee.externalId || `${attendee.firstName}-${attendee.lastName}` },
        );
        const result = await networkPrint.printZpl(zplData);
        if (!result.success) throw new Error(result.error || 'Network print failed');
      } else {
        await printOrchestrator.printBadge(badgeData, template, labelRotation);
      }

      mutations.badgePrintedMutation.mutate(attendee.id);
    } catch (error) {
      console.error('[StaffDashboard] Print failed:', error);
    }
    setShowPrintPreview(false);
    setPrintPreviewData(null);
  }, [printPreviewData, mutations.badgePrintedMutation, staffPrinter.savedPrinter, networkPrint]);

  const handleSkipPrint = useCallback(() => {
    setShowPrintPreview(false);
    setPrintPreviewData(null);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (selectedAttendee) {
      mutations.updateAttendeeMutation.mutate({
        attendeeId: selectedAttendee.id,
        data: editFormData,
      });
      setShowEditDialog(false);
      setSelectedAttendee(null);
    }
  }, [selectedAttendee, editFormData, mutations.updateAttendeeMutation]);

  const handleLaunchKiosk = useCallback(() => {
    setKioskActive(true);
  }, []);

  const handleExitKiosk = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setKioskActive(false);
    queries.refetchAttendees();
  }, [queries]);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (kioskActive && eventId) {
    return (
      <KioskErrorBoundary onExit={handleExitKiosk}>
        <KioskMode
          eventId={eventId}
          eventName={session.eventName}
          scopedCustomerId={session.customerId}
          onExit={handleExitKiosk}
          isLocked={true}
          kioskSettings={{ timeoutMinutes: 240, enableFullscreen: true }}
          staffToken={session.token}
        />
      </KioskErrorBoundary>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <IdleTimeoutDialog
        open={staffIdleTimeout.showWarning}
        remainingSeconds={staffIdleTimeout.remainingSeconds}
        onStayActive={staffIdleTimeout.stayActive}
      />
      <DashboardHeader
        session={session}
        onPreviewBadge={() => setShowBadgePreview(true)}
        onOpenPrinterSettings={staffPrinter.openSelector}
        onRefresh={() => { queries.refetchAttendees(); queries.refetchSessions(); }}
        onLogout={() => mutations.logoutMutation.mutate()}
        allowKiosk={queries.allowKioskFromStaff}
        onLaunchKiosk={handleLaunchKiosk}
      />

      {staffPrinter.isOffline && !staffPrinter.offlineDismissed && staffPrinter.savedPrinter?.type === 'printnode' && (
        <div className="max-w-4xl mx-auto px-4 pt-2">
          <PrinterOfflineAlert
            printerName={staffPrinter.displayName}
            onRetry={staffPrinter.retryConnection}
            onChangePrinter={staffPrinter.openSelector}
            onDismiss={staffPrinter.dismissOfflineAlert}
          />
        </div>
      )}

      {staffPrinter.savedPrinter && (
        <div className="max-w-4xl mx-auto px-4 pt-2 flex items-center gap-2 text-sm text-muted-foreground">
          {staffPrinter.savedPrinter.type === 'printnode' ? (
            <Cloud className="h-3.5 w-3.5" />
          ) : (
            <Printer className="h-3.5 w-3.5" />
          )}
          <span>Printing to: <span className="font-medium text-foreground">{staffPrinter.displayName}</span></span>
          <button className="text-xs underline hover:text-foreground" onClick={staffPrinter.openSelector}>Change</button>
        </div>
      )}

      <main className="p-4 max-w-4xl mx-auto">
        <DashboardStats
          totalAttendees={includedAttendees.length}
          checkedInCount={checkedInCount}
          badgePrintedCount={badgePrintedCount}
          sessionsCount={queries.sessions.length}
        />

        <Tabs defaultValue="event-checkin" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="event-checkin" data-testid="tab-event-checkin">
              <Users className="h-4 w-4 mr-2" />
              Attendees
            </TabsTrigger>
            <TabsTrigger value="session-checkin" data-testid="tab-session-checkin">
              <Clock className="h-4 w-4 mr-2" />
              Sessions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="event-checkin" className="space-y-4">
            <AttendeeTab
              attendees={includedAttendees}
              filteredAttendees={filteredAttendees}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              availableStatuses={availableStatuses}
              scanMode={attendeeScanMode}
              onToggleScanMode={() => setAttendeeScanMode(!attendeeScanMode)}
              isLoading={queries.attendeesLoading}
              hasActiveWorkflow={queries.hasActiveWorkflow}
              isCheckingIn={mutations.checkinMutation.isPending || workflowActions.showWorkflowRunner}
              isReverting={mutations.revertCheckinMutation.isPending}
              isPrinting={mutations.badgePrintedMutation.isPending}
              allowWalkins={queries.allowWalkins}
              onCheckin={handleCheckinClick}
              onRevert={(id) => mutations.revertCheckinMutation.mutate(id)}
              onEdit={handleEditClick}
              onPrint={(id) => mutations.badgePrintedMutation.mutate(id)}
              onViewDetails={handleViewDetails}
              onQRScanFound={async (attendee: Attendee) => {
                if (isGroupCheckinEnabled && (attendee as any).orderCode) {
                  const isGroup = await openGroupSheet((attendee as any).orderCode, attendee.id);
                  if (isGroup) return;
                }
                setSelectedAttendee(attendee);
              }}
              onAddWalkin={() => setShowAddWalkin(true)}
            />
          </TabsContent>

          <TabsContent value="session-checkin" className="space-y-2">
            <SessionTab
              sessions={queries.sessions}
              selectedSession={selectedSession}
              attendees={queries.attendees}
              registrations={queries.sessionRegistrations}
              filteredRegistrations={filteredRegistrations}
              searchTerm={sessionSearchTerm}
              onSearchChange={setSessionSearchTerm}
              scanMode={sessionScanMode}
              onToggleScanMode={() => setSessionScanMode(!sessionScanMode)}
              sessionsLoading={queries.sessionsLoading}
              registrationsLoading={queries.registrationsLoading}
              isCheckingIn={sessionMutations.sessionCheckinMutation.isPending}
              isCheckingOut={sessionMutations.sessionCheckoutMutation.isPending}
              onSelectSession={handleSessionSelect}
              onBack={handleSessionBack}
              onSessionCheckin={(sessionId, attendeeId) => 
                sessionMutations.sessionCheckinMutation.mutate({ sessionId, attendeeId })
              }
              onSessionCheckout={(sessionId, attendeeId) => 
                sessionMutations.sessionCheckoutMutation.mutate({ sessionId, attendeeId })
              }
              onQRScanFound={handleSessionQRScan}
            />
          </TabsContent>
        </Tabs>
      </main>

      <CheckinDialog
        open={showCheckinDialog}
        onOpenChange={setShowCheckinDialog}
        attendee={selectedAttendee}
        hasActiveWorkflow={queries.hasActiveWorkflow}
        isCheckingIn={mutations.checkinMutation.isPending}
        isPrinting={mutations.badgePrintedMutation.isPending}
        onCheckin={handleCheckinClick}
        onMarkPrinted={(id) => mutations.badgePrintedMutation.mutate(id)}
      />

      <EditAttendeeDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        formData={editFormData}
        onFormDataChange={setEditFormData}
        isUpdating={mutations.updateAttendeeMutation.isPending}
        onSave={handleSaveEdit}
      />

      <PrintPreviewDialog
        open={showPrintPreview}
        onOpenChange={setShowPrintPreview}
        data={printPreviewData}
        isPrinting={mutations.badgePrintedMutation.isPending}
        onPrint={handlePrintAndClose}
        onSkip={handleSkipPrint}
      />

      <WorkflowDialog
        open={workflowActions.showWorkflowRunner}
        onOpenChange={workflowActions.setShowWorkflowRunner}
        eventId={eventId || ''}
        attendee={workflowActions.workflowAttendee}
        workflowConfig={queries.workflowConfig}
        badgeTemplate={workflowActions.workflowBadgeTemplate}
        session={session}
        isResolvingTemplate={workflowActions.isResolvingTemplate}
        templateResolutionError={queries.templateResolutionError}
        onComplete={workflowActions.handleWorkflowComplete}
        onCancel={workflowActions.handleWorkflowCancel}
        onRetry={workflowActions.retryTemplateResolution}
      />

      <PrinterSelector
        open={staffPrinter.showSelector}
        onOpenChange={staffPrinter.setShowSelector}
        onSelect={staffPrinter.handleSelect}
        currentPrinter={staffPrinter.savedPrinter}
        mode="staff"
      />

      <BadgePreviewDialog
        open={showBadgePreview}
        onOpenChange={setShowBadgePreview}
        attendees={queries.attendees}
        eventId={eventId || ''}
        getAuthHeaders={() => {
          const token = session.token;
          return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
        }}
      />

      <AddAttendeeDialog
        open={showAddWalkin}
        onOpenChange={setShowAddWalkin}
        onSubmit={(data) => {
          mutations.addWalkinMutation.mutate(data, {
            onSuccess: () => setShowAddWalkin(false),
          });
        }}
        isSubmitting={mutations.addWalkinMutation.isPending}
        participantTypes={Array.from(new Set(queries.attendees.map(a => a.participantType).filter(Boolean)))}
      />

      <Sheet open={groupSheetOpen} onOpenChange={(open) => {
        if (!open) {
          setGroupSheetOpen(false);
          groupCheckin.reset();
        }
      }}>
        <SheetContent className="w-[480px] sm:max-w-[480px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Group Check-In
            </SheetTitle>
            <SheetDescription>
              Check in multiple attendees from the same group
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {groupCheckin.isLookingUp ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <GroupCheckinCard
                members={groupCheckin.members}
                primaryId={groupCheckin.primaryId}
                selectedIds={groupCheckin.selectedIds}
                onToggleMember={groupCheckin.toggleMember}
                onSelectAll={groupCheckin.selectAll}
                onDeselectAll={groupCheckin.deselectAll}
                onConfirm={handleGroupConfirm}
                mode="staff"
                isProcessing={groupCheckin.isProcessing || isGroupPrinting}
                scannedMemberId={groupScannedMemberId || undefined}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <StaffFeedbackWidget
        staffName={session.staffName || "Staff"}
        eventId={eventId || ""}
        eventName={session.eventName || "Event"}
        getAuthHeaders={() => ({
          'Authorization': `Bearer ${session.token}`,
          'Content-Type': 'application/json',
        })}
      />
    </div>
  );
}
