import PDFDocument from "pdfkit";
import type { Response } from "express";

const NAVY = "#0B2958";
const GREEN = "#2FB36D";
const GRAY = "#666666";
const LIGHT_GRAY = "#999999";
const RED = "#DC2626";

function addHeader(doc: PDFKit.PDFDocument) {
  doc.fontSize(24).fillColor(NAVY).text("Checkmate", { continued: true });
  doc.fontSize(10).fillColor(LIGHT_GRAY).text("  Event Check-in Platform", { baseline: "alphabetic" });
  doc.moveDown(0.3);
  doc.moveTo(doc.x, doc.y).lineTo(doc.x + 460, doc.y).strokeColor(NAVY).lineWidth(2).stroke();
  doc.moveDown(1);
}

function addStep(doc: PDFKit.PDFDocument, num: number, title: string, body: string[], tips?: string[], warnings?: string[]) {
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
  if (warnings && warnings.length > 0) {
    doc.moveDown(0.3);
    for (const w of warnings) {
      doc.fontSize(9).fillColor(RED).text(`Warning: ${w}`, { indent: 12 });
    }
  }
  doc.moveDown(0.8);
}

export function generateAccountSetupPdf(res: Response) {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 50, bottom: 50, left: 60, right: 60 } });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=Checkmate-Account-Setup-Guide.pdf");
  doc.pipe(res);

  addHeader(doc);

  doc.fontSize(20).fillColor(NAVY).text("Account & Integration Setup Guide");
  doc.moveDown(0.2);
  doc.fontSize(9).fillColor(RED).text("SUPER ADMIN / PRO SERVICES ONLY", { characterSpacing: 1 });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor(GRAY).text("Pro services reference for onboarding new client accounts in Checkmate.");
  doc.moveDown(1);

  doc.fontSize(10).fillColor(NAVY)
    .text("Note: ", { continued: true })
    .fillColor(GRAY)
    .text("Event-level configuration is covered in the Event Setup Guide, which is available to all users.");
  doc.moveDown(1);

  addStep(doc, 1, "Create the Client Account", [
    "Go to Accounts in the super admin menu and click Create Account.",
    "  \u2022  Account name \u2014 the client\u2019s organization name (visible in sidebar and reports)",
    "  \u2022  Primary contact \u2014 who to reach for questions about this account",
  ]);

  addStep(doc, 2, "Create Admin Users", [
    "Navigate into the account and go to User Management.",
    "Create at least one admin user for the client.",
    "",
    "Available roles:",
    "  \u2022  Admin \u2014 full access to events, integrations, templates, and users",
    "  \u2022  Manager \u2014 can manage events and check-ins, no account-level settings",
    "  \u2022  Staff \u2014 limited to check-in operations only",
    "",
    "Users receive login credentials via email or SMS.",
    "Authentication supports phone OTP, email OTP, or password.",
  ], [
    "For now, create separate logins per account. Multi-account access is planned.",
  ]);

  addStep(doc, 3, "Connect an Integration", [
    "Go to the account\u2019s Integrations page and add a connection.",
    "",
    "Supported auth types:",
    "  \u2022  OAuth 2.0 \u2014 redirect-based authorization (client ID, secret, auth/token URLs)",
    "  \u2022  Basic Auth \u2014 username and password (some Certain deployments)",
    "  \u2022  Bearer Token \u2014 static API key or token",
    "",
    "Certain-specific notes:",
    "  \u2022  Only events tagged with \u201Ccheckmate\u201D (case-insensitive) are synced",
    "  \u2022  Events that lose the tag are pruned along with all associated data",
    "  \u2022  Field mappings define how external data maps to Checkmate fields",
    "",
    "After saving, click Test Connection to verify credentials.",
  ], undefined, [
    "Credentials are encrypted with AES-256-GCM. Never share raw credentials via chat or email.",
  ]);

  addStep(doc, 4, "Configure Field Mappings", [
    "Field mappings translate external platform data into attendee records.",
    "",
    "  \u2022  Source path \u2014 JSON path in the API response (dot notation, array brackets)",
    "  \u2022  Target field \u2014 the Checkmate attendee field to map to",
    "  \u2022  Transform \u2014 optional: lowercase, uppercase, boolean, date, number, default value",
    "",
    "Common mappings: name fields, email, company, title, registration status, participant type.",
  ], [
    "Auto-discovery can detect arrays in the API response and suggest field paths automatically.",
  ]);

  addStep(doc, 5, "Set Up Printers", [
    "Go to Printer Settings and add printers for this client.",
    "",
    "Printer types:",
    "  \u2022  PrintNode \u2014 cloud-connected printers via PrintNode (enter PrintNode printer ID)",
    "  \u2022  Browser \u2014 local printers via browser print dialog",
    "  \u2022  Zebra \u2014 direct-connect label printers using ZPL commands",
    "",
    "Mark printers as active so they appear in event printer selection.",
  ], [
    "Have clients test printer connections the day before. PrintNode printers need the PrintNode client running.",
  ]);

  addStep(doc, 6, "Upload Badge Templates", [
    "Go to Badge Templates and create templates for the client\u2019s events.",
    "  \u2022  Templates are account-level \u2014 any event under this account can use them",
    "  \u2022  Create participant-type-specific templates for different badge designs",
    "  \u2022  Upload client logos and branding assets",
    "  \u2022  Two-sided (foldable) badges are supported",
  ]);

  addStep(doc, 7, "Configure Locations", [
    "Add the client\u2019s common venue locations in Locations.",
    "  \u2022  Location name and address",
    "  \u2022  Locations are reusable across events for the same account",
  ]);

  addStep(doc, 8, "Set Up Configuration Templates (Optional)", [
    "Event Configurations let you save reusable templates for event settings.",
    "Includes badge templates, printer selections, staff settings, and workflows.",
    "Clients can apply a configuration to pre-populate settings for new events.",
  ], [
    "Create a \u201Cstandard\u201D configuration for clients who run similar events repeatedly.",
  ]);

  addStep(doc, 9, "Enable Feature Flags", [
    "Premium features are controlled by feature flags in System Settings.",
    "",
    "  \u2022  Badge flip preview \u2014 interactive 3D badge preview for two-sided badges",
    "  \u2022  Giveaway tracking \u2014 prize drawing and winner management",
    "  \u2022  Beta feedback widget \u2014 in-app feedback collection",
  ], undefined, [
    "Feature flag changes take effect immediately \u2014 no restart required.",
  ]);

  if (doc.y > 500) doc.addPage();

  doc.fontSize(13).fillColor(NAVY).text("Handoff Checklist");
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor(GRAY).text("Before handing the account to the client, verify:");
  doc.moveDown(0.3);

  const checklist = [
    "Admin user(s) created and can log in",
    "Integration connected and test passed",
    "Field mappings configured and a test sync pulled attendees",
    "At least one printer configured and active",
    "At least one badge template created with client branding",
    "Client locations added",
    "Event Setup Guide shared with the client team",
  ];
  for (const item of checklist) {
    doc.fontSize(10).fillColor(GRAY).text(`  \u25A1  ${item}`, { indent: 8, lineGap: 3 });
  }

  doc.moveDown(2);
  doc.fontSize(8).fillColor(LIGHT_GRAY).text("Generated by Checkmate \u2014 Event Check-in Platform", { align: "center" });

  doc.end();
}
