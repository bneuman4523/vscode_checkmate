import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAssistant, type Message } from "../hooks/useAssistant";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import {
  Bot,
  X,
  Pin,
  PinOff,
  Send,
  ChevronRight,
  Loader2,
} from "lucide-react";

interface AssistantDrawerProps {
  eventId: string;
  mode: "closed" | "drawer" | "pinned";
  onModeChange: (mode: "closed" | "drawer" | "pinned") => void;
  onNavigate?: (route: string) => void;
}

const TOOL_LABELS: Record<string, string> = {
  get_event_setup_status: "Checking setup status...",
  get_available_printers: "Looking up printers...",
  get_badge_templates: "Loading templates...",
  get_integration_status: "Checking integrations...",
  get_event_sessions: "Loading sessions...",
  set_event_printer: "Setting printer...",
  set_badge_template: "Updating badge template...",
  set_kiosk_pin: "Updating exit PIN...",
  set_kiosk_mode: "Configuring kiosk mode...",
  set_temp_staff_access: "Configuring staff access...",
  trigger_attendee_sync: "Syncing attendees...",
  navigate_to: "Opening screen...",
};

export function AssistantDrawer({
  eventId,
  mode,
  onModeChange,
  onNavigate,
}: AssistantDrawerProps) {
  const [location] = useLocation();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, send, isStreaming } = useAssistant({
    eventId,
    currentRoute: location,
    onNavigate: (route, _reason) => onNavigate?.(route),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isStreaming && mode !== "closed") {
      textareaRef.current?.focus();
    }
  }, [isStreaming, mode]);

  const hasGreeted = useRef(false);
  useEffect(() => {
    if (mode !== "closed" && !hasGreeted.current && messages.length === 0) {
      hasGreeted.current = true;
      send("What still needs to be done to get this event ready?");
    }
  }, [mode, messages.length, send]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    send(input.trim());
    setInput("");
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isPinned = mode === "pinned";

  return (
    <>
      {!isPinned && (
        <div
          className="fixed inset-0 z-40 bg-background/30 backdrop-blur-sm"
          onClick={() => onModeChange("closed")}
          aria-hidden="true"
        />
      )}

      <aside
        data-testid="assistant-drawer"
        className={`
          flex flex-col bg-background border-l shadow-2xl z-50
          ${isPinned
            ? "relative h-full w-[420px] flex-shrink-0"
            : "fixed right-0 top-0 h-full w-[420px] animate-in slide-in-from-right duration-200"
          }
        `}
        aria-label="Setup assistant"
      >
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <Bot className="h-5 w-5 text-primary flex-shrink-0" />
          <span className="flex-1 font-semibold text-sm">Setup Assistant</span>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onModeChange(isPinned ? "drawer" : "pinned")}
            title={isPinned ? "Unpin panel" : "Keep panel open"}
            className="h-8 w-8"
          >
            {isPinned ? (
              <PinOff className="h-4 w-4" />
            ) : (
              <Pin className="h-4 w-4" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onModeChange("closed")}
            title="Close"
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center text-muted-foreground">
              <Bot className="h-10 w-10 opacity-30" />
              <p className="text-sm">
                I'll walk you through getting this event ready to run.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onOptionClick={send}
              isStreaming={isStreaming}
            />
          ))}

          <div ref={messagesEndRef} />
        </div>

        {messages.length === 0 && (
          <div className="border-t px-4 py-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Quick start
            </p>
            {[
              "What still needs to be set up?",
              "Help me pick a badge printer",
              "Set up kiosk mode",
              "Configure temp staff access",
            ].map((prompt) => (
              <button
                key={prompt}
                onClick={() => send(prompt)}
                disabled={isStreaming}
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm text-left hover:bg-muted transition-colors disabled:opacity-50"
              >
                <span>{prompt}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              </button>
            ))}
          </div>
        )}

        <div className="border-t p-3 space-y-2">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about setup..."
              rows={1}
              className="flex-1 resize-none min-h-[40px] max-h-[120px]"
              disabled={isStreaming}
              aria-label="Message input"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              aria-label="Send message"
              className="h-10 w-10 flex-shrink-0"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            Changes are confirmed before they're made
          </p>
        </div>
      </aside>
    </>
  );
}

function MessageBubble({
  message,
  onOptionClick,
  isStreaming,
}: {
  message: Message;
  onOptionClick: (text: string) => void;
  isStreaming: boolean;
}) {
  const isUser = message.role === "user";
  const activeTools = (message.toolsUsed ?? []).filter(
    () => message.isStreaming
  );

  const showOptions =
    !message.isStreaming &&
    !isStreaming &&
    (message.options ?? []).length > 0;

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isUser && (
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}

      <div className={`max-w-[85%] space-y-1 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        {activeTools.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>
              {TOOL_LABELS[activeTools[activeTools.length - 1]] ?? "Working..."}
            </span>
          </div>
        )}

        <div
          className={`
            rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed
            ${isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted text-foreground rounded-tl-sm"
            }
          `}
        >
          {message.content || (message.isStreaming ? (
            <span className="inline-flex gap-1 items-center text-muted-foreground">
              <span className="animate-pulse">●</span>
              <span className="animate-pulse [animation-delay:150ms]">●</span>
              <span className="animate-pulse [animation-delay:300ms]">●</span>
            </span>
          ) : null)}
        </div>

        {showOptions && (
          <div className="flex flex-col gap-1.5 w-full mt-1">
            {message.options!.map((opt) => (
              <button
                key={opt.id}
                onClick={() => onOptionClick(opt.label)}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm text-left hover:bg-primary/5 hover:border-primary/30 transition-colors group"
              >
                <span className="font-medium">{opt.label}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </button>
            ))}
          </div>
        )}

        {!message.isStreaming &&
          (message.toolsUsed ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {[...new Set(message.toolsUsed)].map((tool) => (
                <Badge
                  key={tool}
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 h-4 font-normal"
                >
                  {tool.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
