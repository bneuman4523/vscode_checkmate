import PDFDocument from "pdfkit";
import type { Response } from "express";

const NAVY = "#0B2958";
const GREEN = "#2FB36D";
const GRAY = "#666666";
const LIGHT_GRAY = "#999999";

function addHeader(doc: PDFKit.PDFDocument) {
  doc.fontSize(24).fillColor(NAVY).text("Greet", { continued: true });
  doc.fontSize(10).fillColor(LIGHT_GRAY).text("  Event Check-in Platform", { baseline: "alphabetic" });
  doc.moveDown(0.3);
  doc.moveTo(doc.x, doc.y).lineTo(doc.x + 460, doc.y).strokeColor(NAVY).lineWidth(2).stroke();
  doc.moveDown(1);
}

function addTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.fontSize(20).fillColor(NAVY).text(title);
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor(GRAY).text("Step-by-step instructions for getting an event ready to run.");
  doc.moveDown(1);
}

function addStep(doc: PDFKit.PDFDocument, num: number, title: string, body: string[], tips?: string[]) {
  if (doc.y > 660) doc.addPage();
  doc.fontSize(13).fillColor(NAVY).text(`Step ${num}: ${title}`);
  doc.moveDown(0.3);
  for (const line of body) {
    doc.fontSize(10).fillColor(GRAY).text(line, { indent: 12, lineGap: 2 });
  }
  if (tips && tips.length > 0) {
    doc.moveDown(0.3);
    for (const tip of tips) {
      doc.fontSize(9).fillColor(GREEN).text(`Tip: ${tip}`, { indent: 12 });
    }
  }
  doc.moveDown(0.8);
}

function addSection(doc: PDFKit.PDFDocument, title: string, items: string[]) {
  if (doc.y > 660) doc.addPage();
  doc.fontSize(12).fillColor(NAVY).text(title);
  doc.moveDown(0.3);
  for (const item of items) {
    doc.fontSize(10).fillColor(GRAY).text(`  \u2022  ${item}`, { indent: 8, lineGap: 2 });
  }
  doc.moveDown(0.8);
}

export function generateEventSetupPdf(res: Response) {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 50, bottom: 50, left: 60, right: 60 } });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=Greet-Event-Setup-Guide.pdf");
  doc.pipe(res);

  addHeader(doc);
  addTitle(doc, "Event Setup Guide");

  doc.fontSize(10).fillColor(NAVY)
    .text("Before you begin: ", { continued: true })
    .fillColor(GRAY)
    .text("Make sure your account has been set up by the pro services team \u2014 you\u2019ll need at least one active integration and a printer configured at the account level.");
  doc.moveDown(1);

  doc.fontSize(11).fillColor(NAVY).text("Using an integration? Your events are synced automatically.");
  doc.fontSize(10).fillColor(GRAY).text(
    "If your account is connected to an external platform (e.g. Certain), your events are created and synced automatically through the integration. Skip ahead to Step 2 to configure the check-in workflow for your event. Step 1 below is only needed if you are running a standalone event without an integration.",
    { indent: 12, lineGap: 2 }
  );
  doc.moveDown(1);

  addStep(doc, 1, "Create a Standalone Event (Skip if Using Integration)", [
    "Navigate to your account dashboard and click Create Event.",
    "Fill in the event name, date, timezone, and location.",
    "This step is only needed for standalone events not managed by an external platform.",
  ], [
    "You can update event details later from the event Settings page.",
  ]);

  addStep(doc, 2, "Configure the Check-in Workflow", [
    "Go to Settings and set up the check-in workflow. This defines what happens when an attendee checks in.",
    "",
    "Available workflow steps:",
    "  \u2022  Badge Print \u2014 prints a name badge automatically",
    "  \u2022  Buyer Questions \u2014 displays custom questions for staff to ask",
    "  \u2022  Disclaimer \u2014 shows a waiver or agreement for the attendee",
    "  \u2022  Badge Edit \u2014 lets the attendee review and correct their badge",
    "",
    "Drag steps to reorder them. The workflow runs top-to-bottom during check-in.",
  ], [
    "If you don\u2019t add a Badge Print step, badge template and printer setup items are hidden from the checklist.",
  ]);

  addStep(doc, 3, "Verify Attendees Are Loaded", [
    "For integration users: Go to Data Sync and confirm your event is linked and attendees are syncing.",
    "Check the sync status dot in the sidebar \u2014 green means all syncs succeeded.",
    "",
    "For standalone events: Upload a CSV or Excel file from the Attendees page.",
    "Map columns to attendee fields during the import.",
  ], [
    "Walk-in attendees added by staff are marked separately and can be pushed back via outbound sync.",
  ]);

  addStep(doc, 4, "Set Up Badge Templates", [
    "Open the Badges page and create or select a badge template.",
    "Use the drag-and-drop editor to position fields (name, company, title, QR code).",
    "Set font sizes, colors, and alignment for each field.",
    "Preview with real attendee data before going live.",
    "Two-sided (foldable) badges are supported.",
    "",
    "If your event has different attendee types (Speaker, VIP, General),",
    "create separate templates and map them by participant type.",
  ]);

  addStep(doc, 5, "Select a Printer", [
    "On the Badges page, select which printer this event should use from the dropdown.",
    "Printers must be active and online to be selectable.",
    "You can switch printers at any time \u2014 even during a live event.",
    "If a printer goes offline, the system queues badges and prints when it comes back.",
  ]);

  addStep(doc, 6, "Set a Kiosk Exit PIN", [
    "Kiosk mode locks the device to a full-screen check-in interface.",
    "To exit kiosk mode, staff need an exit PIN.",
    "Set this from the event Settings page or use the Setup Assistant.",
  ], [
    "Choose a PIN your onsite team knows but attendees can\u2019t guess.",
  ]);

  addStep(doc, 7, "Configure Staff Access (Optional)", [
    "Enable Temp Staff Access in event Settings for temporary onsite staff.",
    "Staff log in with a shared code \u2014 no account required.",
    "They can check in attendees and print badges, but can\u2019t change settings.",
    "Enable \u201CAllow Kiosk Launch\u201D if staff should be able to start kiosk mode.",
    "If walk-ins are enabled, staff can register new attendees on the spot.",
  ]);

  addStep(doc, 8, "Test and Go Live", [
    "Before the event, do a dry run:",
    "  1. Open the Overview page and confirm all required items show green",
    "  2. Use the QR scanner to check in a test attendee",
    "  3. Verify the badge prints correctly with the right template",
    "  4. If using kiosk mode, test the full self-service flow",
    "  5. Check that the exit PIN works to leave kiosk mode",
  ], [
    "The Setup Assistant on the Overview page can walk you through any remaining items.",
  ]);

  addSection(doc, "Day-of Quick Reference", [
    "Share the Staff QR Code from Settings so volunteers can connect their devices quickly",
    "Monitor check-in progress from the Overview dashboard \u2014 it auto-refreshes",
    "If the printer goes down, badges queue automatically and print when it reconnects",
    "Run Reports during or after the event for attendance numbers and check-in timelines",
  ]);

  doc.moveDown(1);
  doc.fontSize(8).fillColor(LIGHT_GRAY).text("Generated by Greet \u2014 Event Check-in Platform", { align: "center" });

  doc.end();
}
