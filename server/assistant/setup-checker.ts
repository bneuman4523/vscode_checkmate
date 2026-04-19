import type { IStorage } from "../storage";

export type SetupSeverity = "required" | "recommended" | "optional";

export interface SetupItem {
  id: string;
  label: string;
  description: string;
  complete: boolean;
  severity: SetupSeverity;
  fixAction: string | null;
  fixRoute: string | null;
}

export interface SetupStatus {
  eventId: string;
  eventName: string;
  overallReady: boolean;
  requiredComplete: number;
  requiredTotal: number;
  items: SetupItem[];
  summary: string;
  hasBadgePrintStep: boolean;
}

export async function checkEventSetup(
  storage: IStorage,
  eventId: string,
  customerId: string
): Promise<SetupStatus> {
  const [event, attendees, templates, printers, sessions, integrations, workflowConfig, workflowSteps] =
    await Promise.all([
      storage.getEvent(eventId),
      storage.getAttendees(eventId),
      storage.getBadgeTemplates(customerId),
      storage.getPrinters(customerId),
      storage.getSessions(eventId),
      storage.getCustomerIntegrations(customerId),
      storage.getEventWorkflowConfig(eventId),
      storage.getEventWorkflowSteps(eventId),
    ]);

  const allSteps = workflowSteps ?? [];
  const workflowEnabled = !!(workflowConfig?.enabled);
  const enabledSteps = allSteps.filter(s => s.enabled !== false);
  const hasWorkflowConfigured = workflowEnabled && enabledSteps.length > 0;
  const hasBadgePrintStep = hasWorkflowConfigured && enabledSteps.some(s => s.stepType === "badge_print");

  const basePath = `/customers/${customerId}/events/${eventId}`;
  const customerPath = `/customers/${customerId}`;
  const items: SetupItem[] = [];

  const staffEnabled = !!(event?.tempStaffSettings as any)?.enabled;
  const kioskFromStaff = !!(event?.tempStaffSettings as any)?.allowKioskFromStaff;
  const kioskEnabled = kioskFromStaff;

  items.push({
    id: "event_basics",
    label: "Event details",
    description: "Event name and date are set",
    complete: !!(event?.name && event?.eventDate),
    severity: "required",
    fixAction: null,
    fixRoute: `${basePath}/settings`,
  });

  const attendeeCount = attendees?.length ?? 0;
  items.push({
    id: "attendees",
    label: "Attendees imported",
    description:
      attendeeCount > 0
        ? `${attendeeCount} attendees registered`
        : "No attendees yet — import from a spreadsheet or connect an integration",
    complete: attendeeCount > 0,
    severity: "required",
    fixAction: null,
    fixRoute: `${basePath}/attendees`,
  });

  const hasIntegration = (integrations ?? []).some((i) => i.status === "connected");
  if (hasIntegration || attendeeCount > 0) {
    const statusesConfigured = !!(event?.syncSettings as any)?.statusesConfigured;
    items.push({
      id: "attendee_statuses",
      label: "Attendee statuses selected",
      description: statusesConfigured
        ? "Status filter configured"
        : "Choose which attendee statuses to include for this event",
      complete: statusesConfigured,
      severity: "required",
      fixAction: "set_attendee_statuses",
      fixRoute: `${basePath}/settings`,
    });
  }

  if (hasWorkflowConfigured) {
    items.push({
      id: "checkin_workflow",
      label: "Check-in workflow",
      description: `${enabledSteps.length} step(s) configured${hasBadgePrintStep ? " (includes badge printing)" : ""}`,
      complete: true,
      severity: "recommended",
      fixAction: null,
      fixRoute: `${basePath}/settings`,
    });

    if (hasBadgePrintStep) {
      const hasTemplate = (templates?.length ?? 0) > 0;
      items.push({
        id: "badge_template",
        label: "Badge template configured",
        description: hasTemplate
          ? `${templates!.length} template(s) available`
          : "No badge template set — workflow includes badge printing but no template is configured",
        complete: hasTemplate,
        severity: "required",
        fixAction: null,
        fixRoute: `${basePath}/badges`,
      });

      const activePrinters = (printers ?? []).filter((p) => p.isActive);
      const hasPrinter = activePrinters.length > 0;
      const selectedPrinter = event?.selectedPrinterId
        ? activePrinters.find((p) => p.id === event.selectedPrinterId)
        : null;

      items.push({
        id: "printer",
        label: "Badge printer selected",
        description: selectedPrinter
          ? `${selectedPrinter.name} is selected and active`
          : hasPrinter
            ? `${activePrinters.length} printer(s) available — none selected for this event`
            : "No printers connected — add a printer in printer settings",
        complete: !!selectedPrinter,
        severity: "required",
        fixAction: hasPrinter ? "set_event_printer" : null,
        fixRoute: hasPrinter ? `${basePath}/badges` : `${customerPath}/printer-settings`,
      });
    }
  } else {
    const hasStepsButDisabled = allSteps.length > 0 && !workflowEnabled;
    items.push({
      id: "checkin_workflow",
      label: "Check-in workflow",
      description: hasStepsButDisabled
        ? "Workflow is disabled — check-ins are simple (tap to check in). Enable workflow in settings to add steps like badge printing"
        : "No workflow — check-ins are simple (tap to check in, data syncs automatically)",
      complete: true,
      severity: "optional",
      fixAction: null,
      fixRoute: `${basePath}/settings`,
    });

    items.push({
      id: "badge_template",
      label: "Badge printing",
      description: "Enable a check-in workflow with a badge print step to use on-site badge printing",
      complete: false,
      severity: "optional",
      fixAction: null,
      fixRoute: `${basePath}/settings`,
    });
  }

  if (kioskEnabled) {
    const hasPin = !!(event?.kioskPin);
    items.push({
      id: "kiosk_pin",
      label: "Kiosk exit PIN",
      description: hasPin
        ? "Exit PIN is set"
        : "No exit PIN set — staff cannot exit kiosk mode without it",
      complete: hasPin,
      severity: "required",
      fixAction: "set_kiosk_pin",
      fixRoute: null,
    });
  } else {
    items.push({
      id: "kiosk_pin",
      label: "Kiosk exit PIN",
      description: "Enable kiosk mode to configure an exit PIN",
      complete: false,
      severity: "optional",
      fixAction: null,
      fixRoute: null,
    });
  }

  const activeIntegrations = (integrations ?? []).filter(
    (i) => i.status === "connected"
  );
  items.push({
    id: "integration",
    label: "Integration connected",
    description:
      activeIntegrations.length > 0
        ? `${activeIntegrations.map((i) => i.providerName).join(", ")} connected`
        : "No integrations connected — attendees must be imported manually",
    complete: activeIntegrations.length > 0 || attendeeCount > 0,
    severity: "recommended",
    fixAction: null,
    fixRoute: `${customerPath}/integrations`,
  });

  const sessionCount = sessions?.length ?? 0;
  if (sessionCount > 0) {
    items.push({
      id: "sessions",
      label: "Sessions configured",
      description: `${sessionCount} session(s) set up for this event`,
      complete: true,
      severity: "recommended",
      fixAction: null,
      fixRoute: `${basePath}/sessions`,
    });
  }

  items.push({
    id: "temp_staff",
    label: "Temp staff access",
    description: staffEnabled
      ? "Temp staff login is configured"
      : "Temp staff access is not set up — only registered users can check in attendees",
    complete: staffEnabled,
    severity: "optional",
    fixAction: "set_temp_staff_access",
    fixRoute: null,
  });

  items.push({
    id: "kiosk_mode",
    label: "Kiosk mode",
    description: kioskFromStaff
      ? "Staff can launch kiosk mode from the dashboard"
      : "Kiosk launch from staff dashboard is disabled",
    complete: kioskFromStaff,
    severity: "optional",
    fixAction: "set_kiosk_mode",
    fixRoute: null,
  });

  const required = items.filter((i) => i.severity === "required");
  const requiredComplete = required.filter((i) => i.complete).length;
  const overallReady = requiredComplete === required.length;

  const incomplete = items.filter((i) => !i.complete && i.severity !== "optional");

  const summary = overallReady
    ? "All required setup steps are complete. The event is ready to run."
    : `${requiredComplete} of ${required.length} required steps are complete. ` +
      `Still needed: ${incomplete.map((i) => i.label.toLowerCase()).join(", ")}.`;

  return {
    eventId,
    eventName: event?.name ?? "This event",
    overallReady,
    requiredComplete,
    requiredTotal: required.length,
    items,
    summary,
    hasBadgePrintStep,
  };
}
