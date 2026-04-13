import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, CheckCircle2, Clock, AlertCircle, ClipboardList, Lightbulb, RefreshCw } from "lucide-react";
import { useMemo } from "react";

function parseStats(content: string) {
  const lines = content.split('\n');
  const seenItems = new Set<string>();
  let resolved = 0;
  let awaitingUat = 0;
  let inProgress = 0;
  let planned = 0;
  let open = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;

    let itemKey: string | null = null;

    const batchMatch = trimmed.match(/^\|\s*(\d+)\s*\|/);
    if (batchMatch) {
      itemKey = `batch-${batchMatch[1]}`;
    }

    if (!itemKey) {
      const testerMatch = trimmed.match(/^\|\s*([A-Z]\d+)\s*\|/);
      if (testerMatch) {
        itemKey = testerMatch[1];
      }
    }

    if (!itemKey || seenItems.has(itemKey)) continue;
    seenItems.add(itemKey);

    if (/🔄|:arrows_counterclockwise:|🔔|:bell:/.test(trimmed)) {
      awaitingUat++;
    } else if (/✅|:white_check_mark:/.test(trimmed)) {
      resolved++;
    } else if (/⏳|:hourglass_flowing_sand:/.test(trimmed)) {
      inProgress++;
    } else if (/📋|:clipboard:/.test(trimmed)) {
      planned++;
    } else {
      open++;
    }
  }

  const totalItems = resolved + awaitingUat + inProgress + planned + open;

  return {
    resolved,
    awaitingUat,
    inProgress,
    planned,
    open,
    totalItems,
  };
}

function renderSeverityBadge(text: string) {
  const trimmed = text.trim();
  const map: Record<string, { label: string; className: string }> = {
    "🔴 Blocker": { label: "Blocker", className: "bg-red-600 hover:bg-red-700 text-white" },
    "🟠 Major": { label: "Major", className: "bg-orange-500 hover:bg-orange-600 text-white" },
    "🟡 Minor": { label: "Minor", className: "bg-yellow-500 hover:bg-yellow-600 text-black" },
    "🟢 Suggestion": { label: "Suggestion", className: "bg-[#2FB36D] hover:bg-[#28a060] text-white" },
    "🟠 Confirmed Gap": { label: "Confirmed Gap", className: "bg-orange-500 hover:bg-orange-600 text-white" },
    "Critical": { label: "Critical", className: "bg-red-600 hover:bg-red-700 text-white" },
    "Blocker": { label: "Blocker", className: "bg-red-600 hover:bg-red-700 text-white" },
    "Major": { label: "Major", className: "bg-orange-500 hover:bg-orange-600 text-white" },
    "Medium": { label: "Medium", className: "bg-yellow-500 hover:bg-yellow-600 text-black" },
    "Minor": { label: "Minor", className: "bg-slate-400 hover:bg-slate-500 text-white" },
  };
  return map[trimmed] || null;
}

function renderStatusCell(text: string) {
  if (text.includes("🔄") || text.includes(":arrows_counterclockwise:")) {
    const cleaned = text.replace(/🔄\s*|:arrows_counterclockwise:\s*/g, "");
    return (
      <span className="inline-flex items-center gap-1.5 text-purple-600 dark:text-purple-400 font-medium">
        <RefreshCw className="h-4 w-4 flex-shrink-0" />
        <span>{cleaned}</span>
      </span>
    );
  }
  if (text.includes("✅") || text.includes(":white_check_mark:")) {
    const cleaned = text.replace(/✅\s*|:white_check_mark:\s*/g, "");
    return (
      <span className="inline-flex items-center gap-1.5 text-[#2FB36D] font-medium">
        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
        <span>{cleaned}</span>
      </span>
    );
  }
  if (text.includes("⏳") || text.includes(":hourglass_flowing_sand:")) {
    const cleaned = text.replace(/⏳\s*|:hourglass_flowing_sand:\s*/g, "");
    return (
      <span className="inline-flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400 font-medium">
        <Clock className="h-4 w-4 flex-shrink-0" />
        <span>{cleaned}</span>
      </span>
    );
  }
  if (text.includes("📋") || text.includes(":clipboard:")) {
    const cleaned = text.replace(/📋\s*|:clipboard:\s*/g, "");
    return (
      <span className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium">
        <ClipboardList className="h-4 w-4 flex-shrink-0" />
        <span>{cleaned}</span>
      </span>
    );
  }
  return null;
}

export default function AlphaFeedbackTracker() {
  const { data, isLoading, error } = useQuery<{ content: string }>({
    queryKey: ["/api/admin/alpha-feedback-tracker"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/alpha-feedback-tracker");
      return res.json();
    },
  });

  const stats = useMemo(() => {
    if (!data?.content) return null;
    return parseStats(data.content);
  }, [data?.content]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data?.content) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground gap-3">
        <AlertCircle className="h-12 w-12 opacity-40" />
        <p>Failed to load the Alpha Feedback Tracker.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <FileText className="h-7 w-7 text-[#0B2958] dark:text-white" />
          <h1 className="text-2xl font-bold text-[#0B2958] dark:text-white">
            Alpha Feedback Tracker
          </h1>
          <Badge variant="outline" className="text-xs border-[#2FB36D] text-[#2FB36D]">
            Alpha
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm ml-10">
          Tracking all feedback items received during alpha testing — updated live from the project docs.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="border-l-4 border-l-[#2FB36D]">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <CheckCircle2 className="h-4 w-4 text-[#2FB36D]" />
                Resolved
              </div>
              <p className="text-2xl font-bold text-[#2FB36D]">{stats.resolved}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <RefreshCw className="h-4 w-4 text-purple-500" />
                Awaiting UAT
              </div>
              <p className="text-2xl font-bold text-purple-500">{stats.awaitingUat}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-yellow-500">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Clock className="h-4 w-4 text-yellow-500" />
                In Progress
              </div>
              <p className="text-2xl font-bold text-yellow-500">{stats.inProgress}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <ClipboardList className="h-4 w-4 text-blue-500" />
                Planned
              </div>
              <p className="text-2xl font-bold text-blue-500">{stats.planned}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-orange-400">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Lightbulb className="h-4 w-4 text-orange-400" />
                Open
              </div>
              <p className="text-2xl font-bold text-orange-400">{stats.open}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-[#0B2958] dark:border-l-white">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <FileText className="h-4 w-4 text-[#0B2958] dark:text-white" />
                Total Items
              </div>
              <p className="text-2xl font-bold text-[#0B2958] dark:text-white">{stats.totalItems}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="pt-6 pb-8 px-6 md:px-10">
          <div className="prose prose-sm dark:prose-invert max-w-none
            prose-headings:text-[#0B2958] dark:prose-headings:text-white
            prose-h1:text-2xl prose-h1:font-bold prose-h1:border-b prose-h1:border-border prose-h1:pb-3 prose-h1:mb-6
            prose-h2:text-xl prose-h2:font-semibold prose-h2:mt-8 prose-h2:mb-4 prose-h2:text-[#0B2958] dark:prose-h2:text-white
            prose-h3:text-base prose-h3:font-semibold prose-h3:mt-6 prose-h3:mb-3
            prose-table:text-sm prose-table:w-full
            prose-th:bg-muted prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:text-foreground prose-th:border prose-th:border-border
            prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-border prose-td:align-top
            prose-tr:even:bg-muted/30
            prose-blockquote:border-l-[#2FB36D] prose-blockquote:bg-muted/50 prose-blockquote:rounded-r prose-blockquote:py-1 prose-blockquote:px-4
            prose-strong:text-foreground
            prose-a:text-[#2FB36D] prose-a:no-underline hover:prose-a:underline
            prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
            prose-hr:border-border prose-hr:my-8
            prose-p:leading-relaxed
            prose-li:leading-relaxed
          ">
            {/* @ts-ignore - react-markdown type compatibility */}
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                td: ({ children, node, ...rest }: any) => {
                  const text = String(children ?? "");
                  const severityBadge = renderSeverityBadge(text);
                  if (severityBadge) {
                    return (
                      <td className="px-3 py-2 border border-border align-top">
                        <Badge className={`text-xs ${severityBadge.className}`}>{severityBadge.label}</Badge>
                      </td>
                    );
                  }
                  const statusContent = renderStatusCell(text);
                  if (statusContent) {
                    return (
                      <td className="px-3 py-2 border border-border align-top">
                        {statusContent}
                      </td>
                    );
                  }
                  return <td className="px-3 py-2 border border-border align-top">{children}</td>;
                },
              }}
            >
              {data.content}
            </ReactMarkdown>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
