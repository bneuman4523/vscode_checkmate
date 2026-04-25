import type { IStorage } from "../storage";
import { checkEventSetup } from "./setup-checker";
import { logger } from "../logger";

interface ExecutorContext {
  storage: IStorage;
  customerId: string;
  eventId: string;
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ExecutorContext
): Promise<ToolResult> {
  const { storage, customerId, eventId } = ctx;

  try {
    switch (toolName) {
      case "get_event_setup_status": {
        const status = await checkEventSetup(storage, eventId, customerId);
        return { success: true, data: status };
      }

      case "get_available_printers": {
        const printers = await storage.getPrinters(customerId);
        return {
          success: true,
          data: (printers ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            provider: p.provider ?? "unknown",
            connectionType: p.connectionType ?? "unknown",
            isActive: p.isActive,
            isDefault: p.isDefault,
          })),
        };
      }

      case "get_badge_templates": {
        const templates = await storage.getBadgeTemplates(customerId);
        return {
          success: true,
          data: (templates ?? []).map((t) => ({
            id: t.id,
            name: t.name || "(Unnamed template)",
          })),
        };
      }

      case "get_integration_status": {
        const integrations = await storage.getCustomerIntegrations(customerId);
        return {
          success: true,
          data: (integrations ?? []).map((i) => ({
            id: i.id,
            providerName: i.providerName,
            status: i.status,
            lastSyncAt: i.lastSyncAt ?? null,
          })),
        };
      }

      case "get_event_sessions": {
        const sessions = await storage.getSessions(eventId);
        return {
          success: true,
          data: (sessions ?? []).map((s) => ({
            id: s.id,
            name: s.name,
            capacity: s.capacity ?? null,
          })),
        };
      }

      case "set_event_printer": {
        const printerId = String(args.printer_id ?? "");
        const displayName = String(args.display_name ?? "");

        if (!printerId) {
          return { success: false, error: "printer_id is required" };
        }

        const printers = await storage.getPrinters(customerId);
        const printer = printers?.find((p) => p.id === printerId);
        if (!printer) {
          return { success: false, error: "Printer not found in this account" };
        }

        await storage.updateEvent(eventId, {
          selectedPrinterId: printerId,
        });

        return {
          success: true,
          data: { message: `Printer set to "${displayName || printer.name}"` },
        };
      }

      case "set_badge_template": {
        const autoMatch = Boolean(args.auto_match);
        const templateId = args.template_id ? String(args.template_id) : null;
        const templateName = args.template_name ? String(args.template_name) : null;

        if (!autoMatch && !templateId) {
          return {
            success: false,
            error: "Either auto_match must be true or template_id must be provided",
          };
        }

        if (templateId) {
          const templates = await storage.getBadgeTemplates(customerId);
          const template = templates?.find((t) => t.id === templateId);
          if (!template) {
            return { success: false, error: "Template not found in this account" };
          }
        }

        await storage.updateEvent(eventId, {
          defaultBadgeTemplateId: autoMatch ? null : templateId,
        });

        return {
          success: true,
          data: {
            message: autoMatch
              ? "Badge template set to Auto-Match by Attendee Type"
              : `Badge template set to "${templateName}"`,
          },
        };
      }

      case "set_kiosk_pin": {
        const pin = String(args.pin ?? "");

        if (!/^\d{4}$/.test(pin)) {
          return { success: false, error: "PIN must be exactly 4 digits" };
        }

        await storage.updateEvent(eventId, { kioskPin: pin });

        return {
          success: true,
          data: { message: "Exit PIN updated" },
        };
      }

      case "set_kiosk_mode": {
        const enabled = Boolean(args.enabled);

        const event = await storage.getEvent(eventId);
        const currentSettings = (event?.tempStaffSettings as Record<string, unknown>) ?? {};

        await storage.updateEvent(eventId, {
          tempStaffSettings: {
            ...currentSettings,
            allowKioskFromStaff: enabled,
          },
        });

        return {
          success: true,
          data: {
            message: enabled
              ? "Kiosk mode enabled — staff can launch kiosk from the dashboard"
              : "Kiosk mode disabled",
          },
        };
      }

      case "set_temp_staff_access": {
        const enabled = Boolean(args.enabled);
        const passcode = args.passcode ? String(args.passcode) : undefined;

        const event = await storage.getEvent(eventId);
        const currentSettings = (event?.tempStaffSettings as Record<string, unknown>) ?? {};

        const updatedSettings: Record<string, unknown> = {
          ...currentSettings,
          enabled,
        };
        if (passcode) {
          updatedSettings.passcode = passcode;
        }

        await storage.updateEvent(eventId, {
          tempStaffSettings: updatedSettings,
        });

        return {
          success: true,
          data: {
            message: enabled
              ? "Temp staff access enabled"
              : "Temp staff access disabled",
          },
        };
      }

      case "trigger_attendee_sync": {
        const integrationId = String(args.integration_id ?? "");

        if (!integrationId) {
          return { success: false, error: "integration_id is required" };
        }

        const integrations = await storage.getCustomerIntegrations(customerId);
        const integration = integrations?.find((i) => i.id === integrationId);
        if (!integration) {
          return { success: false, error: "Integration not found in this account" };
        }

        await storage.createSyncJob({
          integrationId,
          customerId,
          status: "pending",
          priority: 8,
          dataType: "attendees",
        });

        return {
          success: true,
          data: {
            message: `Attendee sync queued from ${integration.providerName}`,
          },
        };
      }

      case "get_available_statuses": {
        const attendees = await storage.getAttendees(eventId);
        const counts = new Map<string, number>();
        for (const a of attendees) {
          const label = (a as any).registrationStatusLabel ?? (a as any).registrationStatus ?? "Unknown";
          counts.set(label, (counts.get(label) ?? 0) + 1);
        }

        const event = await storage.getEvent(eventId);
        const syncSettings = (event?.syncSettings) ?? {};
        const selectedStatuses: string[] | null = syncSettings.selectedStatuses ?? null;
        const statusesConfigured: boolean = !!syncSettings.statusesConfigured;

        return {
          success: true,
          data: {
            statuses: Array.from(counts.entries()).map(([label, count]) => ({ label, count })),
            selectedStatuses,
            statusesConfigured,
          },
        };
      }

      case "set_attendee_statuses": {
        const statuses = args.statuses as string[] | undefined;
        if (!Array.isArray(statuses) || statuses.length === 0) {
          return { success: false, error: "statuses must be a non-empty array of strings" };
        }

        const event = await storage.getEvent(eventId);
        const existing = (event?.syncSettings) ?? {};
        const updated = {
          ...existing,
          selectedStatuses: statuses,
          statusesConfigured: true,
        };

        await storage.updateEvent(eventId, { syncSettings: updated });

        return {
          success: true,
          data: {
            message: `Attendee statuses updated — ${statuses.length} status${statuses.length === 1 ? "" : "es"} selected`,
          },
        };
      }

      case "navigate_to": {
        return {
          success: true,
          data: {
            navigate: true,
            route: String(args.route ?? ""),
            reason: String(args.reason ?? ""),
          },
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    logger.error({ err }, `[assistant:tool-executor] ${toolName} failed`);
    return {
      success: false,
      error: "Something went wrong. Please try again or make the change manually.",
    };
  }
}
