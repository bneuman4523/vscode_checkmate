import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Rocket,
  Search,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Loader2,
  Shield,
  Zap,
  ToggleLeft,
  Filter,
} from "lucide-react";

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  enabled: boolean;
  scope: string;
  rolloutPercentage: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

const CATEGORIES = [
  { value: "general", label: "General", color: "bg-slate-500" },
  { value: "badges", label: "Badges", color: "bg-violet-500" },
  { value: "events", label: "Events", color: "bg-blue-500" },
  { value: "printing", label: "Printing", color: "bg-cyan-500" },
  { value: "integrations", label: "Integrations", color: "bg-emerald-500" },
  { value: "ai", label: "AI", color: "bg-amber-500" },
  { value: "analytics", label: "Analytics", color: "bg-rose-500" },
  { value: "feedback", label: "Feedback", color: "bg-pink-500" },
  { value: "notifications", label: "Notifications", color: "bg-orange-500" },
  { value: "branding", label: "Branding", color: "bg-purple-500" },
  { value: "platform", label: "Platform", color: "bg-red-500" },
];

const SCOPES = [
  { value: "platform", label: "Platform" },
  { value: "account", label: "Account" },
  { value: "event", label: "Event" },
];

function getCategoryInfo(category: string) {
  return CATEGORIES.find((c) => c.value === category) || CATEGORIES[0];
}

function RolloutBar({ percentage }: { percentage: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#2FB36D] rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-slate-400 min-w-[32px]">{percentage}%</span>
    </div>
  );
}

export default function MissionControl() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deletingFlag, setDeletingFlag] = useState<FeatureFlag | null>(null);
  const [formData, setFormData] = useState({
    key: "",
    name: "",
    description: "",
    category: "general",
    enabled: false,
    scope: "platform",
    rolloutPercentage: 0,
  });

  const { data: flags = [], isLoading, isError, error, refetch } = useQuery<FeatureFlag[]>({
    queryKey: ["/api/mission-control/flags"],
    enabled: user?.role === "super_admin",
  });

  const toggleMutation = useMutation({
    mutationFn: async (flagId: string) => {
      const res = await apiRequest("PATCH", `/api/mission-control/flags/${flagId}/toggle`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mission-control/flags"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to toggle flag", variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/mission-control/flags", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mission-control/flags"] });
      setShowCreateDialog(false);
      resetForm();
      toast({ title: "Flag created", description: "Feature flag has been created" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create flag", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const res = await apiRequest("PATCH", `/api/mission-control/flags/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mission-control/flags"] });
      setEditingFlag(null);
      resetForm();
      toast({ title: "Flag updated", description: "Feature flag has been updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update flag", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/mission-control/flags/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mission-control/flags"] });
      setDeletingFlag(null);
      toast({ title: "Flag deleted", description: "Feature flag has been removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete flag", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      key: "",
      name: "",
      description: "",
      category: "general",
      enabled: false,
      scope: "platform",
      rolloutPercentage: 0,
    });
  };

  const openEdit = (flag: FeatureFlag) => {
    setFormData({
      key: flag.key,
      name: flag.name,
      description: flag.description || "",
      category: flag.category,
      enabled: flag.enabled,
      scope: flag.scope,
      rolloutPercentage: flag.rolloutPercentage,
    });
    setEditingFlag(flag);
  };

  const openCreate = () => {
    resetForm();
    setShowCreateDialog(true);
  };

  const filteredFlags = useMemo(() => {
    return flags.filter((flag) => {
      const matchesSearch =
        !search ||
        flag.key.toLowerCase().includes(search.toLowerCase()) ||
        flag.name.toLowerCase().includes(search.toLowerCase()) ||
        (flag.description || "").toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || flag.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [flags, search, categoryFilter]);

  const categories = useMemo(() => {
    const cats = new Set(flags.map((f) => f.category));
    return Array.from(cats).sort();
  }, [flags]);

  const stats = useMemo(() => {
    const enabled = flags.filter((f) => f.enabled).length;
    const disabled = flags.filter((f) => !f.enabled).length;
    return { total: flags.length, enabled, disabled };
  }, [flags]);

  if (user?.role !== "super_admin") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground">Mission Control is restricted to super administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      <div className="border-b border-slate-800 bg-[#0d1117]">
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Rocket className="h-6 w-6 text-[#2FB36D]" />
                <h1 className="text-xl font-bold text-white tracking-tight">MISSION CONTROL</h1>
              </div>
              <span className="text-sm text-slate-500 hidden sm:inline">Feature Flags</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-4 mr-4 text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-[#2FB36D]" />
                  <span>{stats.enabled} active</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ToggleLeft className="h-3.5 w-3.5 text-slate-500" />
                  <span>{stats.disabled} disabled</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => refetch()}
                className="text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search flags..."
              className="pl-9 bg-[#161b22] border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-[#2FB36D] h-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-36 bg-[#161b22] border-slate-700 text-white h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#161b22] border-slate-700">
                <SelectItem value="all" className="text-white hover:bg-slate-700">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat} className="text-white hover:bg-slate-700">
                    {getCategoryInfo(cat).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1" />
          <Button
            onClick={openCreate}
            className="bg-[#2FB36D] hover:bg-[#28a060] text-white h-9"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New Flag
          </Button>
        </div>

        <div className="text-xs text-slate-500 mb-3 px-1">
          {filteredFlags.length} flag{filteredFlags.length !== 1 ? "s" : ""}
        </div>

        {isError ? (
          <div className="border border-red-900/50 rounded-lg bg-red-950/20 px-6 py-12 text-center">
            <Shield className="h-8 w-8 mx-auto text-red-400 mb-3" />
            <p className="text-red-400 font-medium mb-1">Failed to load feature flags</p>
            <p className="text-sm text-slate-500 mb-4">{(error as Error)?.message || "An unexpected error occurred"}</p>
            <Button onClick={() => refetch()} variant="outline" size="sm" className="border-red-800 text-red-400 hover:bg-red-950">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : (
          <div className="border border-slate-800 rounded-lg overflow-hidden bg-[#0d1117]">
            <div className="hidden lg:grid grid-cols-[52px_180px_100px_1fr_1fr_100px_80px_60px] gap-3 px-4 py-2.5 bg-[#161b22] text-xs font-medium text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <div>Status</div>
              <div>Key</div>
              <div>Scope</div>
              <div>Name</div>
              <div>Description</div>
              <div>Rollout</div>
              <div>Category</div>
              <div></div>
            </div>

            {filteredFlags.length === 0 ? (
              <div className="px-4 py-12 text-center text-slate-500 text-sm">
                {search || categoryFilter !== "all"
                  ? "No flags match your filters"
                  : "No feature flags yet — create one to get started"}
              </div>
            ) : (
              filteredFlags.map((flag) => {
                const catInfo = getCategoryInfo(flag.category);
                return (
                  <div
                    key={flag.id}
                    className="grid grid-cols-1 lg:grid-cols-[52px_180px_100px_1fr_1fr_100px_80px_60px] gap-2 lg:gap-3 px-4 py-3 border-b border-slate-800/60 hover:bg-[#161b22]/60 transition-colors items-center"
                  >
                    <div>
                      <Switch
                        checked={flag.enabled}
                        onCheckedChange={() => toggleMutation.mutate(flag.id)}
                        disabled={toggleMutation.isPending}
                        className="data-[state=checked]:bg-[#2FB36D]"
                      />
                    </div>

                    <div className="font-mono text-sm text-slate-300 truncate" title={flag.key}>
                      {flag.key}
                    </div>

                    <div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 border-slate-700 ${
                          flag.scope === "platform"
                            ? "text-blue-400"
                            : flag.scope === "account"
                              ? "text-amber-400"
                              : "text-emerald-400"
                        }`}
                      >
                        {flag.scope}
                      </Badge>
                    </div>

                    <div className="text-sm font-medium text-white truncate">
                      {flag.name}
                    </div>

                    <div className="text-xs text-slate-400 truncate" title={flag.description || ""}>
                      {flag.description || "—"}
                    </div>

                    <div>
                      <RolloutBar percentage={flag.rolloutPercentage} />
                    </div>

                    <div>
                      <span
                        className={`inline-block w-2 h-2 rounded-full mr-1.5 ${catInfo.color}`}
                      />
                      <span className="text-xs text-slate-400">{catInfo.label}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(flag)}
                        className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingFlag(flag)}
                        className="p-1.5 rounded hover:bg-red-900/40 text-slate-500 hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <Dialog open={showCreateDialog || !!editingFlag} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setEditingFlag(null);
          resetForm();
        }
      }}>
        <DialogContent className="bg-[#161b22] border-slate-700 text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingFlag ? "Edit Feature Flag" : "Create Feature Flag"}</DialogTitle>
            <DialogDescription className="text-slate-400">
              {editingFlag ? "Update the flag configuration." : "Add a new feature flag to control platform behavior."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Key</Label>
                <Input
                  value={formData.key}
                  onChange={(e) => setFormData({ ...formData, key: e.target.value.replace(/[^a-z0-9_]/g, "") })}
                  placeholder="my_feature_key"
                  disabled={!!editingFlag}
                  className="bg-[#0d1117] border-slate-700 text-white placeholder:text-slate-600 h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Feature"
                  className="bg-[#0d1117] border-slate-700 text-white placeholder:text-slate-600 h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What does this flag control?"
                rows={2}
                className="bg-[#0d1117] border-slate-700 text-white placeholder:text-slate-600 resize-none"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Category</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                  <SelectTrigger className="bg-[#0d1117] border-slate-700 text-white h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#161b22] border-slate-700">
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value} className="text-white hover:bg-slate-700">
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Scope</Label>
                <Select value={formData.scope} onValueChange={(v) => setFormData({ ...formData, scope: v })}>
                  <SelectTrigger className="bg-[#0d1117] border-slate-700 text-white h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#161b22] border-slate-700">
                    {SCOPES.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="text-white hover:bg-slate-700">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Rollout %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={formData.rolloutPercentage}
                  onChange={(e) => setFormData({ ...formData, rolloutPercentage: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
                  className="bg-[#0d1117] border-slate-700 text-white h-9"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Switch
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked, rolloutPercentage: checked ? 100 : 0 })}
                className="data-[state=checked]:bg-[#2FB36D]"
              />
              <Label className="text-slate-300">Enabled</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => { setShowCreateDialog(false); setEditingFlag(null); resetForm(); }}
              className="text-slate-400 hover:text-white hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingFlag) {
                  updateMutation.mutate({ id: editingFlag.id, data: formData });
                } else {
                  createMutation.mutate(formData);
                }
              }}
              disabled={!formData.key || !formData.name || createMutation.isPending || updateMutation.isPending}
              className="bg-[#2FB36D] hover:bg-[#28a060] text-white"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editingFlag ? "Save Changes" : "Create Flag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingFlag} onOpenChange={(open) => !open && setDeletingFlag(null)}>
        <AlertDialogContent className="bg-[#161b22] border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Feature Flag</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete <span className="font-mono text-slate-300">{deletingFlag?.key}</span>?
              This action cannot be undone and may affect platform behavior.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingFlag && deleteMutation.mutate(deletingFlag.id)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
