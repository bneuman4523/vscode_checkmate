import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Bell,
  Mail,
  MessageSquare,
  Webhook,
  Trash2,
  Settings,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface NotificationConfig {
  id: string;
  name: string;
  triggerEvent: string;
  webhookEnabled: boolean;
  webhookUrl?: string;
  smsEnabled: boolean;
  smsRecipients?: string[];
  emailEnabled: boolean;
  emailRecipients?: string[];
  emailSubject?: string;
  participantTypeFilter?: string;
  active: boolean;
}

const mockConfigs: NotificationConfig[] = [
  {
    id: "config_1",
    name: "VIP Check-in Alerts",
    triggerEvent: "check_in",
    webhookEnabled: true,
    webhookUrl: "https://api.example.com/webhook",
    smsEnabled: true,
    smsRecipients: ["+1234567890"],
    emailEnabled: true,
    emailRecipients: ["events@company.com"],
    emailSubject: "VIP Check-in Alert",
    participantTypeFilter: "VIP",
    active: true,
  },
];

export default function NotificationConfig() {
  const [configs, setConfigs] = useState<NotificationConfig[]>(mockConfigs);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<NotificationConfig | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [triggerEvent, setTriggerEvent] = useState("check_in");
  const [participantTypeFilter, setParticipantTypeFilter] = useState("");
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [smsRecipients, setSmsRecipients] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState("");
  const [emailSubject, setEmailSubject] = useState("");

  const resetForm = () => {
    setName("");
    setTriggerEvent("check_in");
    setParticipantTypeFilter("");
    setWebhookEnabled(false);
    setWebhookUrl("");
    setSmsEnabled(false);
    setSmsRecipients("");
    setEmailEnabled(false);
    setEmailRecipients("");
    setEmailSubject("");
    setEditingConfig(null);
  };

  const handleSave = () => {
    const newConfig: NotificationConfig = {
      id: editingConfig?.id || `config_${Date.now()}`,
      name,
      triggerEvent,
      webhookEnabled,
      webhookUrl: webhookEnabled ? webhookUrl : undefined,
      smsEnabled,
      smsRecipients: smsEnabled ? smsRecipients.split(",").map(s => s.trim()) : undefined,
      emailEnabled,
      emailRecipients: emailEnabled ? emailRecipients.split(",").map(s => s.trim()) : undefined,
      emailSubject: emailEnabled ? emailSubject : undefined,
      participantTypeFilter: participantTypeFilter || undefined,
      active: true,
    };

    if (editingConfig) {
      setConfigs(configs.map(c => c.id === editingConfig.id ? newConfig : c));
    } else {
      setConfigs([...configs, newConfig]);
    }

    setDialogOpen(false);
    resetForm();
  };

  const handleDelete = (id: string) => {
    setConfigs(configs.filter(c => c.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Notification Settings</h1>
          <p className="text-muted-foreground">
            Configure alerts for check-in events
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-notification">
              <Plus className="h-4 w-4 mr-2" />
              Add Notification
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Configure Notification</DialogTitle>
              <DialogDescription>
                Set up alerts to be sent when attendees check in
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="notification-name">Notification Name</Label>
                  <Input
                    id="notification-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="VIP Check-in Alerts"
                    data-testid="input-notification-name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="trigger-event">Trigger Event</Label>
                    <Select value={triggerEvent} onValueChange={setTriggerEvent}>
                      <SelectTrigger id="trigger-event" data-testid="select-trigger-event">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="check_in">Check-in</SelectItem>
                        <SelectItem value="badge_printed">Badge Printed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="participant-filter">Attendee Type (Optional)</Label>
                    <Select value={participantTypeFilter || "all"} onValueChange={(v) => setParticipantTypeFilter(v === "all" ? "" : v)}>
                      <SelectTrigger id="participant-filter" data-testid="select-participant-filter">
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="VIP">VIP</SelectItem>
                        <SelectItem value="Speaker">Speaker</SelectItem>
                        <SelectItem value="General">General</SelectItem>
                        <SelectItem value="Staff">Staff</SelectItem>
                        <SelectItem value="Sponsor">Sponsor</SelectItem>
                        <SelectItem value="Press">Press</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Webhook className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label htmlFor="webhook-enabled">Webhook</Label>
                      <p className="text-xs text-muted-foreground">Send HTTP POST to your endpoint</p>
                    </div>
                  </div>
                  <Switch
                    id="webhook-enabled"
                    checked={webhookEnabled}
                    onCheckedChange={setWebhookEnabled}
                    data-testid="switch-webhook-enabled"
                  />
                </div>

                {webhookEnabled && (
                  <div className="space-y-2 pl-7">
                    <Label htmlFor="webhook-url">Webhook URL</Label>
                    <Input
                      id="webhook-url"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://api.example.com/webhook"
                      data-testid="input-webhook-url"
                    />
                    <p className="text-xs text-muted-foreground">
                      Includes HMAC signature for verification
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label htmlFor="sms-enabled">SMS</Label>
                      <p className="text-xs text-muted-foreground">Send text message alerts</p>
                    </div>
                  </div>
                  <Switch
                    id="sms-enabled"
                    checked={smsEnabled}
                    onCheckedChange={setSmsEnabled}
                    data-testid="switch-sms-enabled"
                  />
                </div>

                {smsEnabled && (
                  <div className="space-y-2 pl-7">
                    <Label htmlFor="sms-recipients">Phone Numbers (comma-separated)</Label>
                    <Input
                      id="sms-recipients"
                      value={smsRecipients}
                      onChange={(e) => setSmsRecipients(e.target.value)}
                      placeholder="+1234567890, +0987654321"
                      data-testid="input-sms-recipients"
                    />
                    <p className="text-xs text-muted-foreground">
                      Requires Twilio integration
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label htmlFor="email-enabled">Email</Label>
                      <p className="text-xs text-muted-foreground">Send email notifications</p>
                    </div>
                  </div>
                  <Switch
                    id="email-enabled"
                    checked={emailEnabled}
                    onCheckedChange={setEmailEnabled}
                    data-testid="switch-email-enabled"
                  />
                </div>

                {emailEnabled && (
                  <div className="space-y-3 pl-7">
                    <div className="space-y-2">
                      <Label htmlFor="email-recipients">Email Addresses (comma-separated)</Label>
                      <Input
                        id="email-recipients"
                        value={emailRecipients}
                        onChange={(e) => setEmailRecipients(e.target.value)}
                        placeholder="events@company.com, manager@company.com"
                        data-testid="input-email-recipients"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email-subject">Email Subject</Label>
                      <Input
                        id="email-subject"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        placeholder="Check-in Alert"
                        data-testid="input-email-subject"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Requires SendGrid or Resend integration
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={handleSave} data-testid="button-save-notification">
                Save Notification
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {configs.map((config) => (
          <Card key={config.id} data-testid={`notification-config-${config.id}`}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    {config.name}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Trigger: {config.triggerEvent}
                    {config.participantTypeFilter && ` • Filter: ${config.participantTypeFilter}`}
                  </CardDescription>
                </div>
                <Badge variant={config.active ? "default" : "secondary"}>
                  {config.active ? (
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                  ) : (
                    <XCircle className="h-3 w-3 mr-1" />
                  )}
                  {config.active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Channels</div>
                <div className="flex flex-wrap gap-2">
                  {config.webhookEnabled && (
                    <Badge variant="outline" className="text-xs">
                      <Webhook className="h-3 w-3 mr-1" />
                      Webhook
                    </Badge>
                  )}
                  {config.smsEnabled && (
                    <Badge variant="outline" className="text-xs">
                      <MessageSquare className="h-3 w-3 mr-1" />
                      SMS ({config.smsRecipients?.length || 0})
                    </Badge>
                  )}
                  {config.emailEnabled && (
                    <Badge variant="outline" className="text-xs">
                      <Mail className="h-3 w-3 mr-1" />
                      Email ({config.emailRecipients?.length || 0})
                    </Badge>
                  )}
                </div>
              </div>

              {config.webhookUrl && (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Webhook URL</div>
                  <code className="text-xs bg-muted px-2 py-1 rounded block truncate">
                    {config.webhookUrl}
                  </code>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  data-testid={`button-edit-${config.id}`}
                >
                  <Settings className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(config.id)}
                  data-testid={`button-delete-${config.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {configs.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Notifications Configured</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Set up notifications to receive alerts when attendees check in
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Notification
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
