import {
  Building2,
  Link2,
  Printer,
  Shield,
  Users,
  Palette,
  MapPin,
  Key,
  CheckCircle2,
  ChevronDown,
  AlertTriangle,
  Settings,
  RefreshCw,
  Download,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "./not-found";

interface StepProps {
  number: number;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Step({ number, title, icon, children, defaultOpen = false }: StepProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full px-5 py-4 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-[#0B2958] text-white text-sm font-semibold flex-shrink-0">
          {number}
        </div>
        <div className="flex items-center gap-2 flex-1">
          {icon}
          <span className="font-semibold text-sm">{title}</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 text-sm leading-relaxed text-muted-foreground space-y-3 border-t">
          {children}
        </div>
      )}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-md bg-[#2FB36D]/10 border border-[#2FB36D]/20 px-3 py-2 text-[#2FB36D] dark:text-[#4fd88f] text-xs">
      <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-red-700 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400 text-xs">
      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

export default function AccountSetupGuide() {
  const { user } = useAuth();

  if (user?.role !== "super_admin") {
    return <NotFound />;
  }

  const handleDownloadPdf = () => {
    window.open("/api/docs/account-setup.pdf", "_blank");
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-5 w-5 text-[#0B2958] dark:text-white" />
            <span className="text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 px-2 py-0.5 rounded-full">Super Admin Only</span>
          </div>
          <h1 className="text-2xl font-bold text-[#0B2958] dark:text-white">Account & Integration Setup Guide</h1>
          <p className="text-muted-foreground mt-1">
            Pro services reference for onboarding new client accounts in Checkmate.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleDownloadPdf} className="flex-shrink-0">
          <Download className="h-4 w-4 mr-1.5" />
          Download PDF
        </Button>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
        This document is for the professional services team setting up client accounts. Event-level configuration is covered in the Event Setup Guide, which is available to all users.
      </div>

      <div className="space-y-3">
        <Step
          number={1}
          title="Create the Client Account"
          icon={<Building2 className="h-4 w-4 text-[#0B2958] dark:text-white" />}
          defaultOpen
        >
          <p>
            Go to <strong>Accounts</strong> in the super admin menu and click <strong>Create Account</strong>.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Account name</strong> — the client's organization name (visible in the sidebar and reports)</li>
            <li><strong>Primary contact</strong> — who to reach for questions about this account</li>
          </ul>
          <p>
            After creation, you can manage the account by clicking into it from the Accounts list.
          </p>
        </Step>

        <Step
          number={2}
          title="Create Admin Users"
          icon={<Users className="h-4 w-4 text-[#0B2958] dark:text-white" />}
        >
          <p>
            Navigate into the account and go to <strong>User Management</strong>. Create at least one admin user for the client.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Admin</strong> — full access to the account's events, integrations, templates, and users</li>
            <li><strong>Manager</strong> — can manage events and check-ins but can't change account-level settings</li>
            <li><strong>Staff</strong> — limited to check-in operations only</li>
          </ul>
          <p>
            Users receive login credentials via email or SMS. They can authenticate with phone OTP, email OTP, or password.
          </p>
          <Tip>
            For service partners managing multiple clients, a single user can be given access to multiple accounts (once multi-account support is enabled). For now, create separate logins per account.
          </Tip>
        </Step>

        <Step
          number={3}
          title="Connect an Integration"
          icon={<Link2 className="h-4 w-4 text-[#0B2958] dark:text-white" />}
        >
          <p>
            Go to the account's <strong>Integrations</strong> page and add a connection to the client's ticketing platform.
          </p>

          <h4 className="font-semibold text-foreground mt-2">Supported Auth Types</h4>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>OAuth 2.0</strong> — redirect-based authorization. Enter client ID, client secret, and the authorization/token URLs.</li>
            <li><strong>Basic Auth</strong> — username and password. Used by some Certain deployments.</li>
            <li><strong>Bearer Token</strong> — static API key or token.</li>
          </ul>

          <h4 className="font-semibold text-foreground mt-2">Certain-Specific Notes</h4>
          <ul className="list-disc pl-5 space-y-1">
            <li>Only events tagged with <code className="text-xs bg-muted px-1 py-0.5 rounded">checkmate</code> (case-insensitive) in the Certain platform will be synced</li>
            <li>Events that lose the tag are automatically pruned along with all associated data</li>
            <li>Field mappings define how external attendee data maps to Checkmate fields — configure these during integration setup</li>
          </ul>

          <h4 className="font-semibold text-foreground mt-2">Testing the Connection</h4>
          <p>
            After saving, click <strong>Test Connection</strong>. A successful test confirms credentials are valid and the API is reachable. 
            If it fails, check the credentials and ensure the API endpoint is correct.
          </p>

          <Warning>
            Credentials are encrypted with AES-256-GCM using the platform's encryption key. Never share raw credentials via chat or email — always enter them directly into the integration form.
          </Warning>
        </Step>

        <Step
          number={4}
          title="Configure Field Mappings"
          icon={<RefreshCw className="h-4 w-4 text-[#0B2958] dark:text-white" />}
        >
          <p>
            Field mappings tell Checkmate how to translate data from the external platform into attendee records.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Source path</strong> — the JSON path in the API response (supports dot notation and array brackets)</li>
            <li><strong>Target field</strong> — the Checkmate attendee field to map to</li>
            <li><strong>Transform</strong> — optional data transform: lowercase, uppercase, boolean, date, number, or default value</li>
          </ul>
          <p>
            Common mappings include: name fields, email, company, title, registration status, and participant type.
          </p>
          <Tip>
            The auto-discovery feature can detect arrays in the API response and suggest field paths automatically.
          </Tip>
        </Step>

        <Step
          number={5}
          title="Set Up Printers"
          icon={<Printer className="h-4 w-4 text-[#0B2958] dark:text-white" />}
        >
          <p>
            Go to the account's <strong>Printer Settings</strong> page and add printers that this client will use.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>PrintNode printers</strong> — cloud-connected printers managed through PrintNode. Enter the PrintNode printer ID.</li>
            <li><strong>Browser printers</strong> — local printers accessible via the browser's print dialog. No configuration needed beyond naming.</li>
            <li><strong>Zebra printers</strong> — direct-connect label printers using ZPL commands. Ideal for badge printing at scale.</li>
          </ul>
          <p>
            Mark printers as <strong>active</strong> so they appear in event printer selection. Inactive printers are hidden from event managers.
          </p>
          <Tip>
            For onsite events, have the client test their printer connection the day before. PrintNode printers need the PrintNode client running on the computer connected to the printer.
          </Tip>
        </Step>

        <Step
          number={6}
          title="Upload Badge Templates"
          icon={<Palette className="h-4 w-4 text-[#0B2958] dark:text-white" />}
        >
          <p>
            Go to <strong>Badge Templates</strong> and create templates the client's events will use.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Templates are account-level — any event under this account can use them</li>
            <li>Create participant-type-specific templates if the client has different badge designs per attendee type</li>
            <li>Upload the client's logo and branding assets for use in templates</li>
            <li>Two-sided (foldable) badges are supported — configure front and back layouts separately</li>
          </ul>
        </Step>

        <Step
          number={7}
          title="Configure Locations"
          icon={<MapPin className="h-4 w-4 text-[#0B2958] dark:text-white" />}
        >
          <p>
            Add the client's common venue locations in <strong>Locations</strong>. Events can select from these when setting up.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Location name and address</li>
            <li>Locations are reusable across events for the same account</li>
          </ul>
        </Step>

        <Step
          number={8}
          title="Set Up Configuration Templates (Optional)"
          icon={<Settings className="h-4 w-4 text-[#0B2958] dark:text-white" />}
        >
          <p>
            <strong>Event Configurations</strong> let you save reusable templates for event settings — badge templates, printer selections, staff settings, and check-in workflows.
          </p>
          <p>
            When creating a new event, the client can apply a configuration template to pre-populate all settings instead of starting from scratch.
          </p>
          <Tip>
            Create a "standard" configuration for clients who run similar events repeatedly. This saves significant setup time.
          </Tip>
        </Step>

        <Step
          number={9}
          title="Enable Feature Flags"
          icon={<Key className="h-4 w-4 text-[#0B2958] dark:text-white" />}
        >
          <p>
            Premium features are controlled by feature flags in <strong>System Settings</strong>. Enable or disable features per account:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Badge flip preview</strong> — interactive 3D badge preview for two-sided badges</li>
            <li><strong>Giveaway tracking</strong> — prize drawing and winner management</li>
            <li><strong>Beta feedback widget</strong> — in-app feedback collection during beta</li>
          </ul>
          <Warning>
            Feature flags are global or per-event. Changes take effect immediately — no restart required.
          </Warning>
        </Step>
      </div>

      <div className="rounded-lg bg-muted/50 border px-5 py-4 space-y-3">
        <h3 className="text-sm font-semibold">Handoff Checklist</h3>
        <p className="text-sm text-muted-foreground">
          Before handing the account to the client, verify:
        </p>
        <ul className="text-sm text-muted-foreground space-y-1.5">
          {[
            "Admin user(s) created and can log in",
            "Integration connected and test passed",
            "Field mappings configured and a test sync pulled attendees",
            "At least one printer configured and active",
            "At least one badge template created with client branding",
            "Client locations added",
            "Event Setup Guide shared with the client team",
          ].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <div className="h-4 w-4 rounded border flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
