import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { User, Mail, Building2, Tag, Edit2, Check } from "lucide-react";
import type { Attendee } from "@shared/schema";

interface EditableField {
  field: string;
  label: string;
  value: string;
  editable: boolean;
}

interface WorkflowBadgeEditProps {
  attendee: Attendee;
  editableFields?: string[];
  badgeEdits: Record<string, string>;
  onBadgeEditChange: (fieldName: string, value: string) => void;
  badgeConfirmed?: boolean;
  onConfirmBadge?: (confirmed: boolean) => void;
  disabled?: boolean;
}

const FIELD_ICONS: Record<string, typeof User> = {
  firstName: User,
  lastName: User,
  email: Mail,
  company: Building2,
  title: Tag,
};

const FIELD_LABELS: Record<string, string> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  email: 'Email',
  company: 'Company',
  title: 'Title/Role',
  participantType: 'Attendee Type',
};

const DEFAULT_EDITABLE_FIELDS = ['firstName', 'lastName', 'company', 'title'];

export function WorkflowBadgeEdit({
  attendee,
  editableFields = DEFAULT_EDITABLE_FIELDS,
  badgeEdits,
  onBadgeEditChange,
  badgeConfirmed = false,
  onConfirmBadge,
  disabled = false,
}: WorkflowBadgeEditProps) {
  const getFieldValue = (field: string): string => {
    if (badgeEdits[field] !== undefined) {
      return badgeEdits[field];
    }
    
    switch (field) {
      case 'firstName':
        return attendee.firstName;
      case 'lastName':
        return attendee.lastName;
      case 'email':
        return attendee.email;
      case 'company':
        return attendee.company || '';
      case 'title':
        return attendee.title || '';
      case 'participantType':
        return attendee.participantType || 'General';
      default:
        return '';
    }
  };
  
  const fields: EditableField[] = [
    { field: 'firstName', label: FIELD_LABELS.firstName, value: getFieldValue('firstName'), editable: editableFields.includes('firstName') },
    { field: 'lastName', label: FIELD_LABELS.lastName, value: getFieldValue('lastName'), editable: editableFields.includes('lastName') },
    { field: 'email', label: FIELD_LABELS.email, value: getFieldValue('email'), editable: editableFields.includes('email') },
    { field: 'company', label: FIELD_LABELS.company, value: getFieldValue('company'), editable: editableFields.includes('company') },
    { field: 'title', label: FIELD_LABELS.title, value: getFieldValue('title'), editable: editableFields.includes('title') },
  ];
  
  const displayName = `${getFieldValue('firstName')} ${getFieldValue('lastName')}`;
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle data-testid="text-badge-edit-title">Review Your Badge</CardTitle>
            <CardDescription>Make any corrections before printing.</CardDescription>
          </div>
          <Badge variant="secondary">
            {attendee.participantType || 'General'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="p-6 border rounded-lg bg-card space-y-4">
          <div className="text-center pb-4 border-b">
            <div className="text-2xl font-bold" data-testid="text-badge-display-name">
              {displayName}
            </div>
            {getFieldValue('title') && (
              <div className="text-muted-foreground mt-1">
                {getFieldValue('title')}
              </div>
            )}
            {getFieldValue('company') && (
              <div className="text-sm text-muted-foreground">
                {getFieldValue('company')}
              </div>
            )}
          </div>
          
          <div className="grid gap-4">
            {fields.map((field) => {
              const Icon = FIELD_ICONS[field.field] || Tag;
              
              return (
                <div key={field.field} className="space-y-1.5">
                  <Label 
                    htmlFor={`badge-${field.field}`}
                    className="text-sm flex items-center gap-2"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {field.label}
                    {field.editable && (
                      <Edit2 className="h-3 w-3 text-muted-foreground" />
                    )}
                  </Label>
                  
                  {field.editable ? (
                    <Input
                      id={`badge-${field.field}`}
                      data-testid={`input-badge-${field.field}`}
                      value={field.value}
                      onChange={(e) => onBadgeEditChange(field.field, e.target.value)}
                      disabled={disabled}
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                    />
                  ) : (
                    <div 
                      className="px-3 py-2 border rounded-md bg-muted/50 text-muted-foreground"
                      data-testid={`text-badge-${field.field}`}
                    >
                      {field.value || '-'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        
        <p className="text-sm text-muted-foreground text-center">
          Editable fields are marked with a pencil icon. Changes will appear on your printed badge.
        </p>
        
        {onConfirmBadge && (
          <div className={`flex items-center space-x-3 p-4 border rounded-lg ${badgeConfirmed ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' : 'bg-muted/30'}`}>
            <Checkbox
              id="confirm-badge"
              data-testid="checkbox-confirm-badge"
              checked={badgeConfirmed}
              onCheckedChange={(checked) => {
                if (onConfirmBadge) {
                  onConfirmBadge(checked === true);
                }
              }}
              disabled={disabled}
            />
            <div className="flex-1">
              <Label 
                htmlFor="confirm-badge" 
                className="text-sm font-medium cursor-pointer flex items-center gap-2"
              >
                {badgeConfirmed && <Check className="h-4 w-4 text-green-600" />}
                I confirm this badge information is correct
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {badgeConfirmed 
                  ? "Confirmed! You may proceed to the next step." 
                  : "Please review the information above and confirm before proceeding."}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
