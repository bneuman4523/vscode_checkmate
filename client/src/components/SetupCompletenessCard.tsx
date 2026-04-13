import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { Badge } from "./ui/badge";

interface SetupItem {
  id: string;
  label: string;
  description: string;
  complete: boolean;
  severity: "required" | "recommended" | "optional";
  fixAction: string | null;
  fixRoute: string | null;
}

interface SetupStatus {
  eventId: string;
  eventName: string;
  overallReady: boolean;
  requiredComplete: number;
  requiredTotal: number;
  items: SetupItem[];
  summary: string;
  hasBadgePrintStep: boolean;
}

interface SetupCompletenessCardProps {
  eventId: string;
  onOpenAssistant: () => void;
}

async function fetchSetupStatus(eventId: string): Promise<SetupStatus> {
  const res = await fetch(`/api/assistant/setup-status/${eventId}`);
  if (!res.ok) throw new Error("Failed to fetch setup status");
  return res.json();
}

export function SetupCompletenessCard({
  eventId,
  onOpenAssistant,
}: SetupCompletenessCardProps) {
  const [, setLocation] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const { data: status, isLoading } = useQuery({
    queryKey: ["setupStatus", eventId],
    queryFn: () => fetchSetupStatus(eventId),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  if (isLoading || !status) {
    return (
      <div className="rounded-xl border bg-card p-5 space-y-3 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded" />
        <div className="h-2 w-full bg-muted rounded" />
        <div className="h-16 w-full bg-muted rounded" />
      </div>
    );
  }

  const { overallReady, requiredComplete, requiredTotal, items } = status;
  const pct = requiredTotal > 0 ? Math.round((requiredComplete / requiredTotal) * 100) : 100;

  const requiredItems = items.filter((i) => i.severity === "required");
  const recommendedItems = items.filter((i) => i.severity === "recommended");
  const optionalItems = items.filter((i) => i.severity === "optional");

  const hasIncompleteRecommended = recommendedItems.some((i) => !i.complete);

  const handleItemClick = (item: SetupItem) => {
    if (item.fixRoute) {
      setLocation(item.fixRoute);
    } else if (item.fixAction) {
      onOpenAssistant();
    }
  };

  const renderConfiguredItem = (item: SetupItem) => {
    return (
      <div
        key={item.id}
        className="flex items-center gap-2.5 rounded-md px-3 py-2 border border-transparent bg-muted/30"
      >
        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground leading-tight">{item.label}</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{item.description}</p>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 text-green-600 border-green-300 bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-950/30 flex-shrink-0"
        >
          Configured
        </Badge>
      </div>
    );
  };

  const renderUnconfiguredItem = (item: SetupItem) => {
    const isClickable = !!(item.fixRoute || item.fixAction);

    return (
      <div
        key={item.id}
        className="flex items-center gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-card pl-0 pr-3 py-2.5 border-l-[3px] border-l-amber-500"
      >
        <div className="pl-3 flex-shrink-0">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">{item.label}</p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 leading-snug">
            {item.description}
          </p>
        </div>
        {isClickable && (
          <Button
            size="sm"
            variant="default"
            className="flex-shrink-0 bg-amber-500 hover:bg-amber-600 text-white text-xs px-3 h-7"
            onClick={(e) => {
              e.stopPropagation();
              handleItemClick(item);
            }}
          >
            Set up
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </div>
    );
  };

  const renderItem = (item: SetupItem) => {
    return item.complete ? renderConfiguredItem(item) : renderUnconfiguredItem(item);
  };

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  if (!expanded) {
    return (
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {overallReady ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            )}
            <span className="text-sm font-medium">
              {overallReady ? "Event ready" : "Setup incomplete"}
            </span>
            <span className="text-xs text-muted-foreground">
              {requiredComplete}/{requiredTotal} required
            </span>
            {!overallReady && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30">
                {requiredTotal - requiredComplete} remaining
              </Badge>
            )}
            {overallReady && hasIncompleteRecommended && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30">
                Recommendations available
              </Badge>
            )}
          </div>
          <button
            onClick={toggleExpanded}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View checklist
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            {overallReady ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            )}
            <p className="font-semibold text-sm">
              {overallReady ? "Event is ready to run" : "Event setup incomplete"}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {requiredComplete} of {requiredTotal} required steps done
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!overallReady && (
            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-xs flex-shrink-0">
              {requiredTotal - requiredComplete} remaining
            </Badge>
          )}
          <button
            onClick={toggleExpanded}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Collapse
            <ChevronDown className="h-3 w-3 rotate-180" />
          </button>
        </div>
      </div>

      <Progress value={pct} className="h-1.5" />

      {!overallReady && (
        <button
          onClick={onOpenAssistant}
          className="flex items-center gap-2 w-full rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-left hover:bg-primary/10 transition-colors"
        >
          <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm text-primary font-medium">
            Need help getting started? Review setup with assistant
          </span>
        </button>
      )}

      {requiredItems.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Required
          </p>
          <div className="space-y-1.5">
            {requiredItems.map(renderItem)}
          </div>
        </div>
      )}

      {recommendedItems.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Recommended
          </p>
          <div className="space-y-1.5">
            {recommendedItems.map(renderItem)}
          </div>
        </div>
      )}

      {optionalItems.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Optional
          </p>
          <div className="space-y-1.5">
            {optionalItems.map(renderItem)}
          </div>
        </div>
      )}

      <button
        onClick={onOpenAssistant}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Sparkles className="h-3 w-3" />
        Review with assistant
      </button>
    </div>
  );
}
