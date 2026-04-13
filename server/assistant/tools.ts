import type { Tool } from "@google/genai";

export const assistantToolDeclarations: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "get_event_setup_status",
        description:
          "Read the current setup completeness for the active event. " +
          "Returns which steps are complete and which still need action. " +
          "Always call this first at the start of a conversation.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "get_available_printers",
        description:
          "List all printers registered to this customer account, " +
          "with online/offline status, display name, model, and connection type.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "get_badge_templates",
        description:
          "List all badge templates available for this customer. " +
          "Includes template name and participant type mapping.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "get_integration_status",
        description:
          "Check the connection status of all third-party integrations " +
          "for this customer account.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "get_event_sessions",
        description:
          "List sessions configured for this event with their capacity " +
          "and check-in counts.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "set_event_printer",
        description:
          "Set the badge printer for this event. " +
          "Only call this after the user has explicitly confirmed the selection.",
        parameters: {
          type: "OBJECT",
          properties: {
            printer_id: {
              type: "STRING",
              description: "Internal printer ID",
            },
            display_name: {
              type: "STRING",
              description: "Human-readable printer name shown in confirmation",
            },
          },
          required: ["printer_id", "display_name"],
        },
      },
      {
        name: "set_badge_template",
        description:
          "Set the badge template for this event, or enable auto-match mode. " +
          "Only call this after the user has explicitly confirmed the selection.",
        parameters: {
          type: "OBJECT",
          properties: {
            auto_match: {
              type: "BOOLEAN",
              description:
                "If true, system auto-selects template by attendee participant type",
            },
            template_id: {
              type: "STRING",
              description:
                "Specific template ID to use (only when auto_match is false)",
            },
            template_name: {
              type: "STRING",
              description: "Template name shown in confirmation message",
            },
          },
          required: ["auto_match"],
        },
      },
      {
        name: "set_kiosk_pin",
        description:
          "Update the kiosk exit PIN for this event. " +
          "Only call this after the user has explicitly confirmed. " +
          "Do not echo the PIN value back in assistant messages.",
        parameters: {
          type: "OBJECT",
          properties: {
            pin: {
              type: "STRING",
              description: "4-digit numeric PIN",
            },
          },
          required: ["pin"],
        },
      },
      {
        name: "set_kiosk_mode",
        description:
          "Enable or disable kiosk mode for this event by toggling the " +
          "allowKioskFromStaff setting. Only call after explicit confirmation.",
        parameters: {
          type: "OBJECT",
          properties: {
            enabled: {
              type: "BOOLEAN",
              description: "Whether kiosk mode is enabled for staff",
            },
          },
          required: ["enabled"],
        },
      },
      {
        name: "set_temp_staff_access",
        description:
          "Configure temporary staff access for this event: " +
          "passcode and whether it is enabled. " +
          "Only call after explicit user confirmation.",
        parameters: {
          type: "OBJECT",
          properties: {
            enabled: { type: "BOOLEAN" },
            passcode: {
              type: "STRING",
              description: "Passcode for temp staff login",
            },
          },
          required: ["enabled"],
        },
      },
      {
        name: "trigger_attendee_sync",
        description:
          "Trigger an immediate sync of attendees from the connected integration. " +
          "Only available if an integration is connected.",
        parameters: {
          type: "OBJECT",
          properties: {
            integration_id: {
              type: "STRING",
              description: "ID of the integration to sync from",
            },
          },
          required: ["integration_id"],
        },
      },
      {
        name: "navigate_to",
        description:
          "Tell the client to navigate to a specific screen. " +
          "Use when the user needs to do something the assistant cannot do " +
          "(e.g. design a badge template, upload a font, configure a new integration).",
        parameters: {
          type: "OBJECT",
          properties: {
            route: {
              type: "STRING",
              description: "App route to navigate to",
            },
            reason: {
              type: "STRING",
              description: "Plain-English explanation of why we are navigating there",
            },
          },
          required: ["route", "reason"],
        },
      },
    ],
  },
];
