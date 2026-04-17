import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, CheckCircle2, Clock, AlertCircle, ClipboardList, Lightbulb, Bell, ArrowRight, XCircle } from "lucide-react";
import { useMemo } from "react";

function parseStats(content: string) {
  const totalMatch = content.match(/\*\*Total items:\s*(\d+)\*\*/);
  const verifiedMatch = content.match(/\*\*Verified:\s*(\d+)\*\*/);
  const pendingMatch = content.match(/\*\*Pending UAT:\s*(\d+)\*\*/);
  const bugsMatch = content.match(/\*\*Open bugs:\s*(\d+)\*\*/);
  const plannedMatch = content.match(/\*\*Planned:\s*(\d+)\*\*/);
  const deferredMatch = content.match(/\*\*Deferred:\s*(\d+)\*\*/);
  const featuresMatch = content.match(/\*\*Planned features:\s*(\d+)\*\*/);

  return {
    totalItems: totalMatch ? parseInt(totalMatch[1]) : 0,
    verified: verifiedMatch ? parseInt(verifiedMatch[1]) : 0,
    pendingUat: pendingMatch ? parseInt(pendingMatch[1]) : 0,
    openBugs: bugsMatch ? parseInt(bugsMatch[1]) : 0,
    planned: plannedMatch ? parseInt(plannedMatch[1]) : 0,
    deferred: deferredMatch ? parseInt(deferredMatch[1]) : 0,
    plannedFeatures: featuresMatch ? parseInt(featuresMatch[1]) : 0,
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
  if (text.includes("🔔")) {
    const cleaned = text.replace(/🔔\s*/g, "");
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
        <Bell className="h-4 w-4 flex-shrink-0" />
        <span>{cleaned}</span>
      </span>
    );
  }
  if (text.includes("✅")) {
    const cleaned = text.replace(/✅\s*/g, "");
    return (
      <span className="inline-flex items-center gap-1.5 text-[#2FB36D] font-medium">
        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
        <span>{cleaned}</span>
      </span>
    );
  }
  if (text.includes("⏳")) {
    const cleaned = text.replace(/⏳\s*/g, "");
    return (
      <span className="inline-flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400 font-medium">
        <Clock className="h-4 w-4 flex-shrink-0" />
        <span>{cleaned}</span>
      </span>
    );
  }
  if (text.includes("📋")) {
    const cleaned = text.replace(/📋\s*/g, "");
    return (
      <span className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium">
        <ClipboardList className="h-4 w-4 flex-shrink-0" />
        <span>{cleaned}</span>
      </span>
    );
  }
  if (text.includes("🔜")) {
    const cleaned = text.replace(/🔜\s*/g, "");
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium">
        <ArrowRight className="h-4 w-4 flex-shrink-0" />
        <span>{cleaned}</span>
      </span>
    );
  }
  if (text.includes("⚠️")) {
    const cleaned = text.replace(/⚠️\s*/g, "");
    return (
      <span className="inline-flex items-center gap-1.5 text-orange-500 dark:text-orange-400 font-medium">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span>{cleaned}</span>
      </span>
    );
  }
  if (text.includes("❌")) {
    const cleaned = text.replace(/❌\s*/g, "");
    return (
      <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium">
        <XCircle className="h-4 w-4 flex-shrink-0" />
        <span>{cleaned}</span>
      </span>
    );
  }
  return null;
}

export default function BetaFeedbackTracker() {
  const { data, isLoading, error } = useQuery<{ content: string }>({
    queryKey: ["/api/admin/beta-feedback-tracker"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/beta-feedback-tracker");
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
        <p>Failed to load the Beta Feedback Tracker.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <FileText className="h-7 w-7 text-[#0B2958] dark:text-white" />
          <h1 className="text-2xl font-bold text-[#0B2958] dark:text-white">
            Beta Feedback Tracker
          </h1>
          <Badge variant="outline" className="text-xs border-[#2FB36D] text-[#2FB36D]">
            Beta
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm ml-10">
          Consolidated feedback from all testing phases — alpha, beta, partner, and security — updated live.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Card className="border-l-4 border-l-[#2FB36D]">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#2FB36D]" />
                Verified
              </div>
              <p className="text-2xl font-bold text-[#2FB36D]">{stats.verified}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Bell className="h-3.5 w-3.5 text-amber-500" />
                Pending UAT
              </div>
              <p className="text-2xl font-bold text-amber-500">{stats.pendingUat}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <XCircle className="h-3.5 w-3.5 text-red-500" />
                Open Bugs
              </div>
              <p className="text-2xl font-bold text-red-500">{stats.openBugs}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <ClipboardList className="h-3.5 w-3.5 text-blue-500" />
                Planned
              </div>
              <p className="text-2xl font-bold text-blue-500">{stats.planned}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Lightbulb className="h-3.5 w-3.5 text-purple-500" />
                Features
              </div>
              <p className="text-2xl font-bold text-purple-500">{stats.plannedFeatures}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-slate-400">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                Deferred
              </div>
              <p className="text-2xl font-bold text-slate-400">{stats.deferred}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-[#0B2958] dark:border-l-white">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <FileText className="h-3.5 w-3.5 text-[#0B2958] dark:text-white" />
                Total
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
