import {
  CalendarDays,
  Users,
  ListChecks,
  Palette,
  Printer,
  KeyRound,
  QrCode,
  UserPlus,
  CheckCircle2,
  ArrowRight,
  ChevronDown,
  Download,
  Info,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

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

export default function EventSetupGuide() {
  const handleDownloadPdf = () => {
    window.open("/api/docs/event-setup.pdf", "_blank");
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B2958] dark:text-white">Event Setup Guide</h1>
          <p className="text-muted-foreground mt-1">
            Step-by-step instructions for getting an event ready to run in Checkmate.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleDownloadPdf} className="flex-shrink-0">
          <Download className="h-4 w-4 mr-1.5" />
          Download PDF
        </Button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        Before you begin, make sure your account has been set up by the pro services team — you'll need at least one active integration and a printer configured at the account level.
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-300 flex gap-2">
        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div>
          <strong>Using an integration?</strong> Your events are synced automatically from the external platform.
          Skip Step 1 and go directly to Step 2 to configure the check-in workflow for your event.
          Step 1 is only for standalone events that aren't managed by an integration.
        </div>
      </div>

      <div className="space-y-3">
        <Step
          number={1}
          title="Create a Standalone Event (Skip If Using Integration)"
          icon={<CalendarDays className="h-4 w-4 text-[#0B2958] dark:text-white" />}
        >
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground mb-2">
            If your account is connected to an external platform (e.g. Certain), your events are created and synced automatically. Skip to Step 2.
          </div>
          <p>
            Navigate to your account dashboard and click <strong>Create Event</strong>. Fill in the basics:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Event name</strong> — what attendees and staff will see</li>
            <li><strong>Event date</strong> — the day the event runs</li>
            <li><strong>Timezone</strong> — used for check-in timestamps and reports</li>
            <li><strong>Location</strong> — select from your account's configured locations</li>
          </ul>
          <Tip>
            You can update these details later from the event Settings page.
          </Tip>
        </Step>

        <Step
          number={2}
          title="Configure the Check-in Workflow"
          icon={<ListChecks className="h-4 w-4 text-[#0B2958] dark:text-white" />}
          defaultOpen
        >
          <p>
            Go to <strong>Settings</strong> and set up the check-in workflow. This defines what happens step-by-step when an attendee checks in.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Badge Print</strong> — prints a name badge automatically</li>
            <li><strong>Buyer Questions</strong> — displays custom questions for staff to ask</li>
            <li><strong>Disclaimer</strong> — shows a waiver or agreement for the attendee to accept</li>
            <li><strong>Badge Edit</strong> — lets the attendee review and correct their badge before printing</li>
          </ul>
          <p>
            Drag steps to reorder them. The workflow runs top-to-bottom during check-in.
          </p>
          <Tip>
            If you don't add a Badge Print step, the badge template and printer setup items will be hidden from the checklist — they're only needed when printing is part of your workflow.
          </Tip>
        </Step>

        <Step
          number={3}
          title="Verify Attendees Are Loaded"
          icon={<Users className="h-4 w-4 text-[#0B2958] dark:text-white" />}
        >
          <p><strong>If using an integration:</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Go to <strong>Data Sync</strong> and confirm your event is linked and attendees are syncing</li>
            <li>Check the sync status dot in the sidebar — green means all syncs succeeded</li>
            <li>Attendees update automatically on the configured schedule</li>
          </ul>

          <p className="mt-3"><strong>For standalone events (no integration):</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Upload a CSV or Excel file from the <strong>Attendees</strong> page</li>
            <li>Map columns to attendee fields during the import</li>
          </ul>
          <Tip>
            Walk-in attendees added by staff are marked separately and can be pushed back to the external platform via outbound sync.
          </Tip>
        </Step>

        <Step
          number={4}
          title="Set Up Badge Templates"
          icon={<Palette className="h-4 w-4 text-[#0B2958] dark:text-white" />}
        >
          <p>
            Open the <strong>Badges</strong> page and create or select a badge template. The template defines what gets printed — attendee name, company, title, QR code, etc.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Use the drag-and-drop editor to position fields on the badge</li>
            <li>Set font sizes, colors, and alignment for each field</li>
            <li>Preview with real attendee data before going live</li>
            <li>Two-sided badges can be configured with a front and back layout</li>
          </ul>
          <p>
            If your event has different attendee types (Speaker, VIP, General), you can create separate templates
            and map them by participant type.
          </p>
        </Step>

        <Step
          number={5}
          title="Select a Printer"
          icon={<Printer className="h-4 w-4 text-[#0B2958] dark:text-white" />}
        >
          <p>
            On the <strong>Badges</strong> page, select which printer this event should use from the dropdown.
            Your account's printers are configured in Printer Settings (ask your admin if none are available).
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Printers must be active and online to be selectable</li>
            <li>You can switch printers at any time — even during a live event</li>
            <li>If a printer goes offline, the system queues badges for printing when it comes back</li>
          </ul>
        </Step>

        <Step
          number={6}
          title="Set a Kiosk Exit PIN"
          icon={<KeyRound className="h-4 w-4 text-[#0B2958] dark:text-white" />}
        >
          <p>
            Kiosk mode locks the device to a full-screen check-in interface. To exit kiosk mode, staff need an exit PIN.
            Set this from the event Settings page or use the Setup Assistant on the Overview page.
          </p>
          <Tip>
            Choose a PIN your onsite team knows but attendees can't guess — the device is in their hands during self-service check-in.
          </Tip>
        </Step>

        <Step
          number={7}
          title="Configure Staff Access (Optional)"
          icon={<UserPlus className="h-4 w-4 text-[#0B2958] dark:text-white" />}
        >
          <p>
            If you have temporary onsite staff who shouldn't have full admin accounts, enable <strong>Temp Staff Access</strong>
            in the event Settings. This creates a simple staff login for the event.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Staff log in with a shared code — no account required</li>
            <li>They can check in attendees and print badges, but can't change settings</li>
            <li>Enable "Allow Kiosk Launch" if staff should be able to start kiosk mode from their dashboard</li>
            <li>If walk-ins are enabled, staff can register new attendees on the spot</li>
          </ul>
        </Step>

        <Step
          number={8}
          title="Test and Go Live"
          icon={<QrCode className="h-4 w-4 text-[#0B2958] dark:text-white" />}
        >
          <p>
            Before the event, do a dry run:
          </p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Open the <strong>Overview</strong> page and confirm all required items show green</li>
            <li>Use the QR scanner to check in a test attendee</li>
            <li>Verify the badge prints correctly with the right template</li>
            <li>If using kiosk mode, launch it from the staff dashboard and test the full self-service flow</li>
            <li>Check that the exit PIN works to leave kiosk mode</li>
          </ol>
          <Tip>
            The Setup Assistant on the Overview page can walk you through any remaining items — click "Need help getting started?" to open it.
          </Tip>
        </Step>
      </div>

      <div className="rounded-lg bg-muted/50 border px-5 py-4 space-y-2">
        <h3 className="text-sm font-semibold">Day-of Quick Reference</h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li className="flex items-center gap-2">
            <ArrowRight className="h-3 w-3 flex-shrink-0" />
            Share the <strong>Staff QR Code</strong> from Settings so volunteers can connect their devices quickly
          </li>
          <li className="flex items-center gap-2">
            <ArrowRight className="h-3 w-3 flex-shrink-0" />
            Monitor check-in progress from the <strong>Overview</strong> dashboard — it auto-refreshes
          </li>
          <li className="flex items-center gap-2">
            <ArrowRight className="h-3 w-3 flex-shrink-0" />
            If the printer goes down, badges queue automatically and print when it reconnects
          </li>
          <li className="flex items-center gap-2">
            <ArrowRight className="h-3 w-3 flex-shrink-0" />
            Run <strong>Reports</strong> during or after the event for attendance numbers and check-in timelines
          </li>
        </ul>
      </div>
    </div>
  );
}
