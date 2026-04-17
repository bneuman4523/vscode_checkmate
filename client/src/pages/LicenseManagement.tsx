import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Crown, Shield, Users, TrendingUp, AlertTriangle, Check, X, Lock, Save, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

interface LicenseInfo {
  licenseType: string;
  licensePlan: string | null;
  prepaidAttendees: number | null;
  licenseStartDate: string | null;
  licenseEndDate: string | null;
  licenseNotes: string | null;
  featureConfigs: Array<{
    id: string;
    customerId: string;
    featureKey: string;
    enabled: boolean;
    metadata: Record<string, unknown> | null;
  }>;
}

interface FeatureItem {
  key: string;
  name: string;
  category: string;
  enabled: boolean;
  metadata: Record<string, unknown> | null;
}

interface UsageSummary {
  customerId: string;
  customerName: string;
  licenseType: string;
  licensePlan: string | null;
  prepaidAttendees: number | null;
  totalAttendees: number;
  activeAttendees: number;
  eventCount: number;
  usagePercent: number | null;
  recentAlerts: Array<{
    alertType: string;
    threshold: number;
    attendeeCount: number;
    message: string;
    sentAt: string;
  }>;
}

const LICENSE_PLANS: Record<string, { name: string; attendees: number }> = {
  starter: { name: "Starter", attendees: 1000 },
  professional: { name: "Professional", attendees: 5000 },
  enterprise: { name: "Enterprise", attendees: 20000 },
  strategic: { name: "Strategic", attendees: 45000 },
};

const CATEGORY_LABELS: Record<string, string> = {
  administration: "Administration",
  analytics: "Analytics & Monitoring",
  attendee_management: "Attendee Management & Check-In",
  badge_design: "Badge Design & Printing",
  event_management: "Event Management",
  feedback: "Feedback & Collaboration",
  giveaways: "Giveaways & Prizes",
  integrations: "Integrations & Sync",
  kiosk: "Kiosk Mode",
  notifications: "Notifications & Alerts",
};

function formatDateForInput(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

export default function LicenseManagement() {
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId || "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const [editForm, setEditForm] = useState<{
    licenseType: string;
    licensePlan: string;
    licenseStartDate: string;
    licenseEndDate: string;
    licenseNotes: string;
  } | null>(null);

  const { data: license, isLoading: licenseLoading } = useQuery<LicenseInfo>({
    queryKey: [`/api/customers/${customerId}/license`],
    enabled: !!customerId,
  });

  const { data: features = [], isLoading: featuresLoading } = useQuery<FeatureItem[]>({
    queryKey: [`/api/customers/${customerId}/features`],
    enabled: !!customerId,
  });

  const { data: usage, isLoading: usageLoading } = useQuery<UsageSummary>({
    queryKey: [`/api/customers/${customerId}/usage`],
    enabled: !!customerId,
  });

  useEffect(() => {
    if (license && !editForm) {
      setEditForm({
        licenseType: license.licenseType || "basic",
        licensePlan: license.licensePlan || "",
        licenseStartDate: formatDateForInput(license.licenseStartDate),
        licenseEndDate: formatDateForInput(license.licenseEndDate),
        licenseNotes: license.licenseNotes || "",
      });
    }
  }, [license, editForm]);

  const toggleFeatureMutation = useMutation({
    mutationFn: async ({ featureKey, enabled }: { featureKey: string; enabled: boolean }) => {
      const response = await apiRequest("PATCH", `/api/customers/${customerId}/features/${featureKey}`, { enabled });
      return response.json();
    },
    onSuccess: (_, { enabled }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${customerId}/features`] });
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${customerId}/license`] });
      toast({ title: enabled ? "Feature enabled" : "Feature disabled" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const updateLicenseMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await apiRequest("PATCH", `/api/customers/${customerId}/license`, data);
      return response.json();
    },
    onSuccess: (updated: Partial<LicenseInfo>) => {
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${customerId}/license`] });
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${customerId}/features`] });
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${customerId}/usage`] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setEditForm({
        licenseType: updated.licenseType || "basic",
        licensePlan: updated.licensePlan || "",
        licenseStartDate: formatDateForInput(updated.licenseStartDate),
        licenseEndDate: formatDateForInput(updated.licenseEndDate),
        licenseNotes: updated.licenseNotes || "",
      });
      toast({ title: "License updated", description: "All changes have been saved." });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const handleSave = () => {
    if (!editForm) return;

    if (editForm.licenseType === "premium" && !editForm.licensePlan) {
      toast({ variant: "destructive", title: "Plan required", description: "Please select a licensing plan for premium accounts." });
      return;
    }
    if (!editForm.licenseStartDate) {
      toast({ variant: "destructive", title: "Contract Start Date required", description: "Please set the contract start date." });
      return;
    }
    if (!editForm.licenseEndDate) {
      toast({ variant: "destructive", title: "Contract End Date required", description: "Please set the contract end date." });
      return;
    }

    const plan = editForm.licenseType === "premium" && editForm.licensePlan
      ? LICENSE_PLANS[editForm.licensePlan]
      : null;

    updateLicenseMutation.mutate({
      licenseType: editForm.licenseType,
      licensePlan: editForm.licenseType === "premium" ? (editForm.licensePlan || null) : null,
      prepaidAttendees: plan ? plan.attendees : null,
      licenseStartDate: editForm.licenseStartDate || null,
      licenseEndDate: editForm.licenseEndDate || null,
      licenseNotes: editForm.licenseNotes || null,
    });
  };

  const hasChanges = () => {
    if (!editForm || !license) return false;
    return (
      editForm.licenseType !== (license.licenseType || "basic") ||
      editForm.licensePlan !== (license.licensePlan || "") ||
      editForm.licenseStartDate !== formatDateForInput(license.licenseStartDate) ||
      editForm.licenseEndDate !== formatDateForInput(license.licenseEndDate) ||
      editForm.licenseNotes !== (license.licenseNotes || "")
    );
  };

  const handleDiscard = () => {
    if (!license) return;
    setEditForm({
      licenseType: license.licenseType || "basic",
      licensePlan: license.licensePlan || "",
      licenseStartDate: formatDateForInput(license.licenseStartDate),
      licenseEndDate: formatDateForInput(license.licenseEndDate),
      licenseNotes: license.licenseNotes || "",
    });
  };

  if (licenseLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const isPremium = editForm?.licenseType === "premium";
  const currentPlanKey = editForm?.licensePlan || "";
  const planInfo = currentPlanKey ? LICENSE_PLANS[currentPlanKey] : null;

  const featuresByCategory = features.reduce((acc, feature) => {
    if (!acc[feature.category]) acc[feature.category] = [];
    acc[feature.category].push(feature);
    return acc;
  }, {} as Record<string, FeatureItem[]>);

  const enabledCount = features.filter(f => f.enabled).length;
  const totalCount = features.length;

  const getUsageColor = (percent: number | null | undefined) => {
    if (!percent) return "bg-green-500";
    if (percent >= 100) return "bg-red-500";
    if (percent >= 90) return "bg-orange-500";
    if (percent >= 75) return "bg-amber-500";
    return "bg-green-500";
  };

  const isContractExpired = () => {
    if (!license?.licenseEndDate) return false;
    return new Date(license.licenseEndDate) < new Date();
  };

  const daysUntilExpiry = () => {
    if (!license?.licenseEndDate) return null;
    const diff = new Date(license.licenseEndDate).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">License & Features</h1>
          <p className="text-muted-foreground">
            Manage license type, plan, and feature access for this account
          </p>
        </div>
        {isSuperAdmin && hasChanges() && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDiscard}>
              Discard
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateLicenseMutation.isPending}
              className="gap-1.5"
            >
              <Save className="h-4 w-4" />
              {updateLicenseMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="features">Features ({enabledCount}/{totalCount})</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {isPremium ? <Crown className="h-5 w-5 text-amber-500" /> : <Shield className="h-5 w-5" />}
                  License Type
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isSuperAdmin && editForm ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">License Type</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setEditForm({ ...editForm, licenseType: "basic", licensePlan: "" })}
                          className={`flex items-center gap-2 rounded-lg border-2 p-3 transition-colors text-sm ${
                            editForm.licenseType === "basic"
                              ? "border-primary bg-primary/5"
                              : "border-muted hover:border-muted-foreground/30"
                          }`}
                        >
                          <Shield className="h-4 w-4 text-muted-foreground" />
                          Basic
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditForm({ ...editForm, licenseType: "premium" })}
                          className={`flex items-center gap-2 rounded-lg border-2 p-3 transition-colors text-sm ${
                            editForm.licenseType === "premium"
                              ? "border-amber-500 bg-amber-500/5"
                              : "border-muted hover:border-muted-foreground/30"
                          }`}
                        >
                          <Crown className="h-4 w-4 text-amber-500" />
                          Premium
                        </button>
                      </div>
                    </div>

                    {isPremium && (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Plan</Label>
                        <Select
                          value={editForm.licensePlan}
                          onValueChange={(value) => setEditForm({ ...editForm, licensePlan: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a plan" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="starter">Starter (1K)</SelectItem>
                            <SelectItem value="professional">Professional (5K)</SelectItem>
                            <SelectItem value="enterprise">Enterprise (20K)</SelectItem>
                            <SelectItem value="strategic">Strategic (45K)</SelectItem>
                          </SelectContent>
                        </Select>
                        {planInfo && (
                          <p className="text-xs text-muted-foreground">
                            {planInfo.attendees.toLocaleString()} prepaid attendees included
                          </p>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Contract Start</Label>
                        <Input
                          type="date"
                          value={editForm.licenseStartDate}
                          onChange={(e) => setEditForm({ ...editForm, licenseStartDate: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Contract End</Label>
                        <Input
                          type="date"
                          value={editForm.licenseEndDate}
                          onChange={(e) => setEditForm({ ...editForm, licenseEndDate: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Pro Services Notes</Label>
                      <Textarea
                        placeholder="Any notes for the pro services team..."
                        value={editForm.licenseNotes}
                        onChange={(e) => setEditForm({ ...editForm, licenseNotes: e.target.value })}
                        rows={2}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold capitalize">{license?.licenseType || "Basic"}</span>
                      {license?.licenseType === "premium" && license?.licensePlan && LICENSE_PLANS[license.licensePlan] && (
                        <Badge className="bg-amber-500 text-white">{LICENSE_PLANS[license.licensePlan].name}</Badge>
                      )}
                    </div>
                    {license?.licenseType === "premium" && license?.licensePlan && LICENSE_PLANS[license.licensePlan] && (
                      <p className="text-sm text-muted-foreground">
                        {LICENSE_PLANS[license.licensePlan].attendees.toLocaleString()} prepaid attendees
                      </p>
                    )}
                    {license?.licenseStartDate && (
                      <p className="text-xs text-muted-foreground">
                        Started: {new Date(license.licenseStartDate).toLocaleDateString()}
                      </p>
                    )}
                    {license?.licenseEndDate && (
                      <p className="text-xs text-muted-foreground">
                        Expires: {new Date(license.licenseEndDate).toLocaleDateString()}
                      </p>
                    )}
                    {license?.licenseNotes && (
                      <div className="rounded-md bg-muted p-3 text-sm">
                        <p className="font-medium text-xs text-muted-foreground mb-1">Pro Services Notes</p>
                        {license.licenseNotes}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-5 w-5" />
                    Feature Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">{enabledCount}</span>
                    <span className="text-muted-foreground text-sm">of {totalCount} features enabled</span>
                  </div>
                  <Progress value={totalCount > 0 ? (enabledCount / totalCount) * 100 : 0} className="h-2" />
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-green-500" />
                      <span>{enabledCount} active</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{totalCount - enabledCount} locked</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="h-5 w-5" />
                    Attendee Usage
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {usageLoading ? (
                    <Skeleton className="h-16 w-full" />
                  ) : usage ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-2xl font-bold">{usage.totalAttendees.toLocaleString()}</span>
                          {usage.prepaidAttendees && (
                            <span className="text-muted-foreground text-sm ml-1">/ {usage.prepaidAttendees.toLocaleString()}</span>
                          )}
                        </div>
                        {usage.usagePercent !== null && (
                          <Badge
                            variant={usage.usagePercent >= 90 ? "destructive" : usage.usagePercent >= 75 ? "secondary" : "default"}
                            className="text-sm"
                          >
                            {usage.usagePercent}%
                          </Badge>
                        )}
                      </div>
                      {usage.prepaidAttendees && (
                        <div className="space-y-1">
                          <Progress
                            value={Math.min(usage.usagePercent || 0, 100)}
                            className={`h-2 ${getUsageColor(usage.usagePercent)}`}
                          />
                          {(usage.usagePercent || 0) >= 75 && (
                            <p className="text-xs text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {(usage.usagePercent || 0) >= 100
                                ? "Exceeded prepaid limit"
                                : "Approaching prepaid limit"}
                            </p>
                          )}
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                        <div>
                          <p className="font-semibold text-base">{usage.totalAttendees.toLocaleString()}</p>
                          <p className="text-muted-foreground">Total</p>
                        </div>
                        <div>
                          <p className="font-semibold text-base">{usage.activeAttendees.toLocaleString()}</p>
                          <p className="text-muted-foreground">Active</p>
                        </div>
                        <div>
                          <p className="font-semibold text-base">{usage.eventCount}</p>
                          <p className="text-muted-foreground">Events</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No usage data available</p>
                  )}
                </CardContent>
              </Card>

              {license?.licenseEndDate && (
                <Card className={isContractExpired() ? "border-red-300 bg-red-50/50 dark:bg-red-950/20" : (daysUntilExpiry() !== null && daysUntilExpiry()! <= 30) ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20" : ""}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        {isContractExpired() ? (
                          <p className="text-sm font-medium text-red-600">Contract expired {new Date(license.licenseEndDate).toLocaleDateString()}</p>
                        ) : (
                          <p className="text-sm">
                            <span className="font-medium">Contract ends:</span>{" "}
                            {new Date(license.licenseEndDate).toLocaleDateString()}
                            {daysUntilExpiry() !== null && daysUntilExpiry()! <= 90 && (
                              <span className={`ml-2 text-xs ${daysUntilExpiry()! <= 30 ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                                ({daysUntilExpiry()} days remaining)
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {usage && usage.recentAlerts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Recent Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {usage.recentAlerts.map((alert, idx) => (
                    <div key={idx} className="flex items-start gap-3 text-sm border-b last:border-0 pb-3 last:pb-0">
                      <Badge variant={alert.alertType === "exceeded_limit" ? "destructive" : "secondary"} className="text-xs shrink-0">
                        {alert.threshold}%
                      </Badge>
                      <div>
                        <p>{alert.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(alert.sentAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {isSuperAdmin && hasChanges() && (
            <div className="sticky bottom-4 flex justify-end">
              <div className="flex items-center gap-2 rounded-lg border bg-background p-3 shadow-lg">
                <span className="text-sm text-muted-foreground">You have unsaved changes</span>
                <Button variant="outline" size="sm" onClick={handleDiscard}>
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={updateLicenseMutation.isPending}
                  className="gap-1.5"
                >
                  <Save className="h-4 w-4" />
                  {updateLicenseMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="features" className="space-y-4 mt-4">
          {featuresLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full" />)}
            </div>
          ) : (
            Object.entries(featuresByCategory)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([category, catFeatures]) => (
                <Card key={category}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{CATEGORY_LABELS[category] || category}</CardTitle>
                    <CardDescription>
                      {catFeatures.filter(f => f.enabled).length} of {catFeatures.length} enabled
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {catFeatures.map((feature) => (
                        <div key={feature.key} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div className="flex items-center gap-2">
                            {feature.enabled ? (
                              <Check className="h-4 w-4 text-green-500 shrink-0" />
                            ) : (
                              <X className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <span className={`text-sm ${!feature.enabled ? "text-muted-foreground" : ""}`}>
                              {feature.name}
                            </span>
                          </div>
                          {isSuperAdmin ? (
                            <Switch
                              checked={feature.enabled}
                              onCheckedChange={(checked) =>
                                toggleFeatureMutation.mutate({ featureKey: feature.key, enabled: checked })
                              }
                              disabled={toggleFeatureMutation.isPending}
                            />
                          ) : (
                            <Badge variant={feature.enabled ? "default" : "secondary"} className="text-xs">
                              {feature.enabled ? "Enabled" : "Locked"}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
          )}
        </TabsContent>

        <TabsContent value="usage" className="space-y-4 mt-4">
          {usageLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : usage ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Attendee Consumption</CardTitle>
                  <CardDescription>
                    Current usage against {planInfo?.name || license?.licenseType || "Basic"} plan
                    {usage.prepaidAttendees ? ` (${usage.prepaidAttendees.toLocaleString()} prepaid)` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-end gap-4">
                    <div>
                      <p className="text-4xl font-bold">{usage.totalAttendees.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">total attendees</p>
                    </div>
                    {usage.prepaidAttendees && (
                      <div className="text-right">
                        <p className="text-2xl font-semibold text-muted-foreground">/ {usage.prepaidAttendees.toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">prepaid limit</p>
                      </div>
                    )}
                  </div>

                  {usage.prepaidAttendees && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Usage</span>
                        <span className={`font-medium ${
                          (usage.usagePercent || 0) >= 100 ? "text-red-600" :
                          (usage.usagePercent || 0) >= 90 ? "text-orange-600" :
                          (usage.usagePercent || 0) >= 75 ? "text-amber-600" :
                          "text-green-600"
                        }`}>
                          {usage.usagePercent}%
                        </span>
                      </div>
                      <Progress value={Math.min(usage.usagePercent || 0, 100)} className="h-4" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0</span>
                        <span>75%</span>
                        <span>90%</span>
                        <span>100%</span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-xl font-semibold">{usage.eventCount}</p>
                      <p className="text-xs text-muted-foreground">Total Events</p>
                    </div>
                    <div>
                      <p className="text-xl font-semibold">{usage.activeAttendees.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">In Active Events</p>
                    </div>
                    <div>
                      <p className="text-xl font-semibold">{(usage.totalAttendees - usage.activeAttendees).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">In Past Events</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {usage.recentAlerts.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Alert History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {usage.recentAlerts.map((alert, idx) => (
                        <div key={idx} className="flex items-start gap-3 text-sm border-b last:border-0 pb-3 last:pb-0">
                          <Badge variant={alert.alertType === "exceeded_limit" ? "destructive" : "secondary"} className="text-xs shrink-0 mt-0.5">
                            {alert.threshold}%
                          </Badge>
                          <div className="flex-1">
                            <p>{alert.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Sent {new Date(alert.sentAt).toLocaleDateString()} at {new Date(alert.sentAt).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No usage data available yet
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
