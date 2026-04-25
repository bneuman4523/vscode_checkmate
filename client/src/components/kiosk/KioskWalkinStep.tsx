import { useKiosk } from "./KioskContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, XCircle, ArrowLeft } from "lucide-react";

export function KioskWalkinStep() {
  const { event, walkinForm, setWalkinForm, walkinError, walkinSubmitting, handleWalkinSubmit, setStep } = useKiosk();

  if (!event) return null;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-2">
          <UserPlus className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-2xl font-semibold">Register as Walk-in</h2>
        <p className="text-muted-foreground">
          Fill in your details below to register for this event
        </p>
      </div>

      <div className="space-y-3">
        {(() => {
          const config = event.tempStaffSettings?.kioskWalkinConfig;
          const enabledFields = config?.enabledFields || ['firstName', 'lastName', 'email'];
          const requiredFields = config?.requiredFields || ['firstName', 'lastName', 'email'];
          const availableTypes = config?.availableTypes || ['Walk-in'];

          const fieldDefs = [
            { key: 'firstName', label: 'First Name', type: 'text', alwaysShow: true },
            { key: 'lastName', label: 'Last Name', type: 'text', alwaysShow: true },
            { key: 'email', label: 'Email Address', type: 'email', alwaysShow: false },
            { key: 'company', label: 'Company', type: 'text', alwaysShow: false },
            { key: 'title', label: 'Title', type: 'text', alwaysShow: false },
          ];

          return (
            <>
              {fieldDefs
                .filter(f => f.alwaysShow || enabledFields.includes(f.key))
                .map(field => (
                  <div key={field.key}>
                    <label htmlFor={`walkin-${field.key}`} className="sr-only">{field.label}</label>
                    <Input
                      id={`walkin-${field.key}`}
                      type={field.type}
                      placeholder={`${field.label}${requiredFields.includes(field.key) || field.alwaysShow ? ' *' : ''}`}
                      value={walkinForm[field.key] || ''}
                      onChange={(e) => setWalkinForm({ ...walkinForm, [field.key]: e.target.value })}
                      className="h-12 text-base"
                      aria-required={requiredFields.includes(field.key) || field.alwaysShow}
                      data-testid={`input-walkin-${field.key}`}
                    />
                  </div>
                ))}

              {enabledFields.includes('participantType') && availableTypes.length > 1 && (
                <div>
                  <label htmlFor="walkin-participantType" className="sr-only">Attendee Type</label>
                <Select
                  value={walkinForm.participantType || config?.defaultType || availableTypes[0]}
                  onValueChange={(value) => setWalkinForm({ ...walkinForm, participantType: value })}
                >
                  <SelectTrigger id="walkin-participantType" className="h-12 text-base" data-testid="select-walkin-type">
                    <SelectValue placeholder="Select attendee type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {walkinError && (
        <div role="alert" className="flex items-center justify-center gap-2 text-destructive">
          <XCircle className="h-5 w-5" aria-hidden="true" />
          <span>{walkinError}</span>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="h-12"
          onClick={() => { setStep("scanning"); setWalkinForm({}); setWalkinError(null); }}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button
          size="lg"
          className="flex-1 h-12 text-lg"
          onClick={handleWalkinSubmit}
          disabled={walkinSubmitting || !walkinForm.firstName?.trim() || !walkinForm.lastName?.trim()}
          data-testid="button-walkin-submit"
        >
          {walkinSubmitting ? "Registering..." : "Register & Check In"}
        </Button>
      </div>
    </div>
  );
}
