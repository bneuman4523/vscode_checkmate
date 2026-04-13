import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Bell,
  MessageSquare,
  Trash2,
  Settings,
  CheckCircle2,
  XCircle,
  Upload,
  Phone,
  X,
  MoreVertical,
  Users,
  Building,
  User,
  FileSpreadsheet,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatPhoneNumber, toE164 } from "@/lib/phone-format";
import type { EventNotificationRule } from "@shared/schema";

interface EventNotificationsProps {
  eventId: string;
}

interface SmsRecipient {
  phoneNumber: string;
  name?: string;
}

export default function EventNotifications({ eventId }: EventNotificationsProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<EventNotificationRule | null>(null);

  const [name, setName] = useState("");
  const [participantTypes, setParticipantTypes] = useState<string[]>([]);
  const [companyNames, setCompanyNames] = useState<string[]>([]);
  const [attendeeNames, setAttendeeNames] = useState<string[]>([]);
  const [smsRecipients, setSmsRecipients] = useState<SmsRecipient[]>([]);
  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const [newRecipientName, setNewRecipientName] = useState("");
  const [includeAttendeeName, setIncludeAttendeeName] = useState(true);
  const [includeCompany, setIncludeCompany] = useState(true);
  const [includeCheckinTime, setIncludeCheckinTime] = useState(true);
  const [customMessage, setCustomMessage] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [filterInput, setFilterInput] = useState("");
  const [filterType, setFilterType] = useState<"participantType" | "company" | "name">("participantType");

  const { data: rules = [], isLoading, isError } = useQuery<EventNotificationRule[]>({
    queryKey: [`/api/events/${eventId}/notification-rules`],
    enabled: !!eventId,
    retry: (failureCount, error) => {
      if (error?.message?.includes("Access denied")) return false;
      return failureCount < 2;
    },
  });

  const { data: participantTypeOptions = [] } = useQuery<string[]>({
    queryKey: [`/api/events/${eventId}/participant-types`],
    enabled: !!eventId,
  });

  const { data: companyOptions = [] } = useQuery<string[]>({
    queryKey: [`/api/events/${eventId}/companies`],
    enabled: !!eventId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/events/${eventId}/notification-rules`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/notification-rules`] });
      toast({ title: "Notification rule created" });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create rule", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/notification-rules/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/notification-rules`] });
      toast({ title: "Notification rule updated" });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update rule", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/notification-rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/notification-rules`] });
      toast({ title: "Notification rule deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete rule", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setName("");
    setParticipantTypes([]);
    setCompanyNames([]);
    setAttendeeNames([]);
    setSmsRecipients([]);
    setNewPhoneNumber("");
    setNewRecipientName("");
    setIncludeAttendeeName(true);
    setIncludeCompany(true);
    setIncludeCheckinTime(true);
    setCustomMessage("");
    setIsActive(true);
    setFilterInput("");
    setEditingRule(null);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const openEditDialog = (rule: EventNotificationRule) => {
    setEditingRule(rule);
    setName(rule.name);
    setParticipantTypes((rule.participantTypes as string[]) || []);
    setCompanyNames((rule.companyNames as string[]) || []);
    setAttendeeNames((rule.attendeeNames as string[]) || []);
    setSmsRecipients((rule.smsRecipients as SmsRecipient[]) || []);
    setIncludeAttendeeName(rule.includeAttendeeName);
    setIncludeCompany(rule.includeCompany);
    setIncludeCheckinTime(rule.includeCheckinTime);
    setCustomMessage(rule.customMessage || "");
    setIsActive(rule.isActive);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast({ title: "Please enter a name for this notification rule", variant: "destructive" });
      return;
    }
    if (smsRecipients.length === 0) {
      toast({ title: "Please add at least one phone number", variant: "destructive" });
      return;
    }

    const data = {
      name,
      participantTypes,
      companyNames,
      attendeeNames,
      smsRecipients,
      includeAttendeeName,
      includeCompany,
      includeCheckinTime,
      customMessage: customMessage || null,
      isActive,
    };

    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const addPhoneNumber = () => {
    const cleaned = newPhoneNumber.trim();
    if (!cleaned) return;
    
    const formatted = toE164(cleaned);
    if (!formatted || formatted.length < 4) {
      toast({ title: "Please enter a valid phone number", variant: "destructive" });
      return;
    }

    if (smsRecipients.some(r => r.phoneNumber === formatted)) {
      toast({ title: "Phone number already added", variant: "destructive" });
      return;
    }

    setSmsRecipients([...smsRecipients, { phoneNumber: formatted, name: newRecipientName.trim() || undefined }]);
    setNewPhoneNumber("");
    setNewRecipientName("");
  };

  const removeRecipient = (phoneNumber: string) => {
    setSmsRecipients(smsRecipients.filter(r => r.phoneNumber !== phoneNumber));
  };

  const addFilter = () => {
    const value = filterInput.trim();
    if (!value) return;

    if (filterType === "participantType") {
      if (!participantTypes.includes(value)) {
        setParticipantTypes([...participantTypes, value]);
      }
    } else if (filterType === "company") {
      if (!companyNames.includes(value)) {
        setCompanyNames([...companyNames, value]);
      }
    } else if (filterType === "name") {
      if (!attendeeNames.includes(value)) {
        setAttendeeNames([...attendeeNames, value]);
      }
    }
    setFilterInput("");
  };

  const removeFilter = (type: "participantType" | "company" | "name", value: string) => {
    if (type === "participantType") {
      setParticipantTypes(participantTypes.filter(v => v !== value));
    } else if (type === "company") {
      setCompanyNames(companyNames.filter(v => v !== value));
    } else if (type === "name") {
      setAttendeeNames(attendeeNames.filter(v => v !== value));
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter(line => line.trim());
      const imported: SmsRecipient[] = [];

      for (const line of lines) {
        const parts = line.split(/[,\t]/).map(p => p.trim());
        let phoneNumber = "";
        let recipientName = "";

        for (const part of parts) {
          const cleaned = part.replace(/[^\d+]/g, "");
          if (cleaned.length >= 10) {
            phoneNumber = cleaned.startsWith("+") ? cleaned : 
                          cleaned.startsWith("1") && cleaned.length === 11 ? "+" + cleaned :
                          cleaned.length === 10 ? "+1" + cleaned : "+" + cleaned;
          } else if (part && !phoneNumber) {
            recipientName = part;
          } else if (part && phoneNumber && !recipientName) {
            recipientName = part;
          }
        }

        if (phoneNumber && !smsRecipients.some(r => r.phoneNumber === phoneNumber) && !imported.some(r => r.phoneNumber === phoneNumber)) {
          imported.push({ phoneNumber, name: recipientName || undefined });
        }
      }

      if (imported.length > 0) {
        setSmsRecipients([...smsRecipients, ...imported]);
        toast({ title: `Imported ${imported.length} phone number(s)` });
      } else {
        toast({ title: "No new phone numbers found", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const toggleRuleActive = (rule: EventNotificationRule) => {
    updateMutation.mutate({ id: rule.id, data: { isActive: !rule.isActive } });
  };

  if (isLoading) {
    return <div className="p-4">Loading notifications...</div>;
  }

  if (isError) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Unable to load notification rules for this event.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Notification Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRule ? "Edit" : "Create"} Notification Rule</DialogTitle>
              <DialogDescription>
                Configure who should receive SMS alerts when matching attendees check in
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="rule-name">Rule Name <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input
                    id="rule-name"
                    value={name}
                    onChange={(e) => {
                      if (e.target.value.length <= 50) setName(e.target.value);
                    }}
                    placeholder="e.g., VIP Check-in Alerts"
                    maxLength={50}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {name.length}/50
                  </span>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div>
                  <Label className="text-base font-medium">Filter Criteria</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Leave all filters empty to notify on all check-ins, or add filters to target specific attendees
                  </p>
                </div>

                <div className="flex gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="shrink-0">
                        {filterType === "participantType" && <Users className="h-4 w-4 mr-2" />}
                        {filterType === "company" && <Building className="h-4 w-4 mr-2" />}
                        {filterType === "name" && <User className="h-4 w-4 mr-2" />}
                        {filterType === "participantType" ? "Type" : filterType === "company" ? "Company" : "Name"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => setFilterType("participantType")}>
                        <Users className="h-4 w-4 mr-2" />
                        Attendee Type
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterType("company")}>
                        <Building className="h-4 w-4 mr-2" />
                        Company Name
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterType("name")}>
                        <User className="h-4 w-4 mr-2" />
                        Attendee Name
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  
                  {filterType === "participantType" && participantTypeOptions.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Input
                          value={filterInput}
                          onChange={(e) => setFilterInput(e.target.value)}
                          placeholder="Select or type attendee type..."
                          className="flex-1"
                          onKeyDown={(e) => e.key === "Enter" && addFilter()}
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[200px]">
                        {participantTypeOptions.map(type => (
                          <DropdownMenuItem key={type} onClick={() => { setFilterInput(type); }}>
                            {type}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : filterType === "company" && companyOptions.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Input
                          value={filterInput}
                          onChange={(e) => setFilterInput(e.target.value)}
                          placeholder="Select or type company name..."
                          className="flex-1"
                          onKeyDown={(e) => e.key === "Enter" && addFilter()}
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[200px] max-h-[200px] overflow-y-auto">
                        {companyOptions.slice(0, 20).map(company => (
                          <DropdownMenuItem key={company} onClick={() => { setFilterInput(company); }}>
                            {company}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Input
                      value={filterInput}
                      onChange={(e) => setFilterInput(e.target.value)}
                      placeholder={
                        filterType === "participantType" ? "Type attendee type..." :
                        filterType === "company" ? "Type company name..." :
                        "Type attendee name..."
                      }
                      className="flex-1"
                      onKeyDown={(e) => e.key === "Enter" && addFilter()}
                    />
                  )}
                  <Button size="sm" onClick={addFilter}>Add</Button>
                </div>

                {(participantTypes.length > 0 || companyNames.length > 0 || attendeeNames.length > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {participantTypes.map(type => (
                      <Badge key={`type-${type}`} variant="secondary" className="gap-1">
                        <Users className="h-3 w-3" />
                        {type}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => removeFilter("participantType", type)} />
                      </Badge>
                    ))}
                    {companyNames.map(company => (
                      <Badge key={`company-${company}`} variant="secondary" className="gap-1">
                        <Building className="h-3 w-3" />
                        {company}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => removeFilter("company", company)} />
                      </Badge>
                    ))}
                    {attendeeNames.map(attendeeName => (
                      <Badge key={`name-${attendeeName}`} variant="secondary" className="gap-1">
                        <User className="h-3 w-3" />
                        {attendeeName}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => removeFilter("name", attendeeName)} />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-medium">SMS Recipients</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Add phone numbers to receive check-in alerts
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={handleImport}
                  />
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Import CSV
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Input
                    value={newRecipientName}
                    onChange={(e) => setNewRecipientName(e.target.value)}
                    placeholder="Name (optional)"
                    className="w-32"
                  />
                  <Input
                    value={newPhoneNumber}
                    onChange={(e) => setNewPhoneNumber(formatPhoneNumber(e.target.value))}
                    placeholder="+1 (555) 123-4567"
                    className="flex-1"
                    onKeyDown={(e) => e.key === "Enter" && addPhoneNumber()}
                  />
                  <Button size="icon" onClick={addPhoneNumber}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {smsRecipients.length > 0 && (
                  <div className="border rounded-md divide-y max-h-[200px] overflow-y-auto">
                    {smsRecipients.map(recipient => (
                      <div key={recipient.phoneNumber} className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono text-sm">{recipient.phoneNumber}</span>
                          {recipient.name && <span className="text-muted-foreground">({recipient.name})</span>}
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRecipient(recipient.phoneNumber)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Import format: CSV with name, phone number columns or just phone numbers (one per line)
                </p>
              </div>

              <Separator />

              <div className="space-y-4">
                <Label className="text-base font-medium">Message Options</Label>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="include-name">Include attendee name</Label>
                    <Switch id="include-name" checked={includeAttendeeName} onCheckedChange={setIncludeAttendeeName} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="include-company">Include company</Label>
                    <Switch id="include-company" checked={includeCompany} onCheckedChange={setIncludeCompany} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="include-time">Include check-in time</Label>
                    <Switch id="include-time" checked={includeCheckinTime} onCheckedChange={setIncludeCheckinTime} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="custom-message">Custom Message Prefix (optional)</Label>
                  <Textarea
                    id="custom-message"
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="Leave empty for default: 'Check-in alert:'"
                    rows={2}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
                {editingRule ? "Update" : "Create"} Rule
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {rules.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Notification Rules</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Create notification rules to receive SMS alerts when attendees check in
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rules.map((rule) => {
            const recipients = (rule.smsRecipients as SmsRecipient[]) || [];
            const types = (rule.participantTypes as string[]) || [];
            const companies = (rule.companyNames as string[]) || [];
            const names = (rule.attendeeNames as string[]) || [];
            const hasFilters = types.length > 0 || companies.length > 0 || names.length > 0;

            return (
              <Card key={rule.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Bell className="h-4 w-4" />
                        {rule.name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {hasFilters ? (
                          <span>
                            {types.length > 0 && `Types: ${types.join(", ")}`}
                            {types.length > 0 && (companies.length > 0 || names.length > 0) && " • "}
                            {companies.length > 0 && `Companies: ${companies.join(", ")}`}
                            {companies.length > 0 && names.length > 0 && " • "}
                            {names.length > 0 && `Names: ${names.join(", ")}`}
                          </span>
                        ) : (
                          "All check-ins"
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={rule.isActive ? "default" : "secondary"}
                        className="cursor-pointer"
                        onClick={() => toggleRuleActive(rule)}
                      >
                        {rule.isActive ? (
                          <><CheckCircle2 className="h-3 w-3 mr-1" />Active</>
                        ) : (
                          <><XCircle className="h-3 w-3 mr-1" />Paused</>
                        )}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(rule)}>
                            <Settings className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive" 
                            onClick={() => deleteMutation.mutate(rule.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{recipients.length} recipient{recipients.length !== 1 ? "s" : ""}</span>
                  </div>
                  
                  {recipients.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {recipients.slice(0, 3).map(r => (
                        <Badge key={r.phoneNumber} variant="outline" className="text-xs font-mono">
                          {r.name || r.phoneNumber}
                        </Badge>
                      ))}
                      {recipients.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{recipients.length - 3} more
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
