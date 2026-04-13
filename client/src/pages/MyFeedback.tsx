import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import {
  MessageSquare,
  Lightbulb,
  Bug,
  MessageCircle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock,
  Search,
  AlertCircle,
  XCircle,
  Eye,
} from "lucide-react";
import { useLocation } from "wouter";

interface FeedbackItem {
  id: string;
  ticketNumber: number | null;
  ticketRef: string;
  type: string;
  message: string;
  status: string;
  severity?: string;
  createdAt: string;
  adminResponse?: string;
  adminResponseAt?: string;
  userReadAt?: string;
  hasUnreadResponse: boolean;
}

const typeConfig: Record<string, { label: string; icon: typeof MessageCircle; color: string }> = {
  comment: { label: "Comment", icon: MessageCircle, color: "text-blue-500" },
  feature_request: { label: "Feature Request", icon: Lightbulb, color: "text-amber-500" },
  issue: { label: "Issue", icon: Bug, color: "text-red-500" },
};

const statusConfig: Record<string, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  new: { label: "Submitted", icon: Clock, variant: "secondary" },
  reviewed: { label: "Under Review", icon: Search, variant: "outline" },
  planned: { label: "Planned", icon: CheckCircle2, variant: "default" },
  resolved: { label: "Resolved", icon: CheckCircle2, variant: "default" },
  dismissed: { label: "Closed", icon: XCircle, variant: "outline" },
};

export default function MyFeedback() {
  const [, navigate] = useLocation();
  const [selectedItem, setSelectedItem] = useState<FeedbackItem | null>(null);
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery<FeedbackItem[]>({
    queryKey: ["/api/my-feedback"],
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/my-feedback/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to mark as read");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-feedback"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-feedback/unread-count"] });
    },
  });

  const handleOpenItem = (item: FeedbackItem) => {
    setSelectedItem(item);
    if (item.hasUnreadResponse) {
      markReadMutation.mutate(item.id);
    }
  };

  const unreadCount = items.filter(i => i.hasUnreadResponse).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <MessageSquare className="h-7 w-7 text-[#0B2958]" />
          <div>
            <h1 className="text-2xl font-bold">My Feedback</h1>
            <p className="text-sm text-muted-foreground">
              Track your submissions and responses
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <Badge className="ml-auto bg-[#2FB36D] text-white">
            {unreadCount} new {unreadCount === 1 ? "response" : "responses"}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0B2958]" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium mb-1">No feedback yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              When you submit feedback using the feedback button, your submissions will appear here so you can track responses.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const typeInfo = typeConfig[item.type] || typeConfig.comment;
            const statusInfo = statusConfig[item.status] || statusConfig.new;
            const TypeIcon = typeInfo.icon;
            const StatusIcon = statusInfo.icon;

            return (
              <Card
                key={item.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  item.hasUnreadResponse
                    ? "border-[#2FB36D] bg-[#2FB36D]/5 ring-1 ring-[#2FB36D]/20"
                    : ""
                }`}
                onClick={() => handleOpenItem(item)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 ${typeInfo.color}`}>
                      <TypeIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-mono text-muted-foreground">
                          {item.ticketRef}
                        </span>
                        <Badge variant={statusInfo.variant} className="text-xs h-5">
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusInfo.label}
                        </Badge>
                        {item.hasUnreadResponse && (
                          <Badge className="text-xs h-5 bg-[#2FB36D] text-white animate-pulse">
                            <Bell className="h-3 w-3 mr-1" />
                            New Response
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm line-clamp-2">{item.message}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{format(new Date(item.createdAt), "MMM d, yyyy 'at' h:mm a")}</span>
                        {item.adminResponse && !item.hasUnreadResponse && (
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            Response read
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">
                {selectedItem?.ticketRef}
              </span>
              {selectedItem && (
                <Badge variant={statusConfig[selectedItem.status]?.variant || "secondary"} className="text-xs">
                  {statusConfig[selectedItem.status]?.label || selectedItem.status}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Submitted {selectedItem && format(new Date(selectedItem.createdAt), "MMMM d, yyyy 'at' h:mm a")}
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  {(() => {
                    const typeInfo = typeConfig[selectedItem.type] || typeConfig.comment;
                    const TypeIcon = typeInfo.icon;
                    return (
                      <>
                        <TypeIcon className={`h-4 w-4 ${typeInfo.color}`} />
                        <span className="text-sm font-medium">{typeInfo.label}</span>
                      </>
                    );
                  })()}
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-sm whitespace-pre-wrap">{selectedItem.message}</p>
                </div>
              </div>

              {selectedItem.adminResponse && (
                <>
                  <Separator />
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="h-4 w-4 text-[#0B2958]" />
                      <span className="text-sm font-medium text-[#0B2958]">Team Response</span>
                      {selectedItem.adminResponseAt && (
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatDistanceToNow(new Date(selectedItem.adminResponseAt), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                    <div className="bg-[#0B2958]/5 border border-[#0B2958]/10 rounded-lg p-3">
                      <p className="text-sm whitespace-pre-wrap">{selectedItem.adminResponse}</p>
                    </div>
                  </div>
                </>
              )}

              {!selectedItem.adminResponse && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Clock className="h-4 w-4" />
                  <span>We'll review this and get back to you.</span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
