import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  MessageSquare, 
  Send, 
  X, 
  Bot, 
  User,
  Lightbulb,
  Loader2,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Message {
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
}

interface AIResponse {
  message: string;
  suggestions?: string[];
  action?: {
    type: string;
    data?: Record<string, unknown>;
  };
}

interface BadgeAIChatProps {
  eventId?: string;
  templateId?: string;
  attendeeId?: string;
  compact?: boolean;
  onAction?: (action: { type: string; data?: Record<string, unknown> }) => void;
}

export default function BadgeAIChat({ 
  eventId, 
  templateId, 
  attendeeId, 
  compact = false,
  onAction 
}: BadgeAIChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest("POST", "/api/badge-ai/chat", { 
        message, eventId, templateId, attendeeId 
      });
      return response.json() as Promise<AIResponse>;
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: data.message,
        suggestions: data.suggestions 
      }]);
      if (data.action && data.action.type !== "none" && onAction) {
        onAction(data.action);
      }
    },
    onError: () => {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "I'm sorry, I had trouble processing that. Please try again." 
      }]);
    }
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;
    
    setMessages(prev => [...prev, { role: "user", content: input }]);
    chatMutation.mutate(input);
    setInput("");
  };

  const handleSuggestionClick = (suggestion: string) => {
    setMessages(prev => [...prev, { role: "user", content: suggestion }]);
    chatMutation.mutate(suggestion);
  };

  const quickActions = [
    "How do I adjust the badge font size?",
    "My badge isn't printing correctly",
    "Suggest improvements for my badge design",
    "Help me troubleshoot a print error"
  ];

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className={`fixed ${compact ? 'bottom-4 right-4 h-10 w-10' : 'bottom-6 right-6 h-12 w-12'} rounded-full shadow-lg z-50`}
        size="icon"
        data-testid="button-open-ai-chat"
        aria-label="Open badge assistant"
      >
        <MessageSquare className={compact ? "h-4 w-4" : "h-5 w-5"} aria-hidden="true" />
        <span className="sr-only">Open badge assistant</span>
      </Button>
    );
  }

  return (
    <Card className={`fixed ${compact ? 'bottom-4 right-4' : 'bottom-6 right-6'} z-50 shadow-xl ${compact ? 'w-72' : 'w-96'} ${isMinimized ? 'h-auto' : compact ? 'h-[400px]' : 'h-[500px]'} flex flex-col`}>
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 border-b">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" aria-hidden="true" />
          <CardTitle className="text-sm font-medium">Badge Assistant</CardTitle>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={() => setIsMinimized(!isMinimized)}
            aria-label={isMinimized ? "Expand chat" : "Minimize chat"}
          >
            {isMinimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={() => setIsOpen(false)}
            aria-label="Close chat"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>

      {!isMinimized && (
        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="space-y-4">
                <div className="text-center text-muted-foreground text-sm py-4">
                  <Bot className="h-10 w-10 mx-auto mb-2 text-primary/50" aria-hidden="true" />
                  <p>Hi! I can help you with badge design, printing issues, and configuration.</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Lightbulb className="h-3 w-3" aria-hidden="true" />
                    Quick actions:
                  </p>
                  {quickActions.map((action, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-left h-auto py-2 px-3"
                      onClick={() => handleSuggestionClick(action)}
                      data-testid={`button-quick-action-${index}`}
                    >
                      {action}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {msg.suggestions && msg.suggestions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {msg.suggestions.map((suggestion, i) => (
                            <Badge
                              key={i}
                              variant="secondary"
                              className="cursor-pointer text-xs"
                              onClick={() => handleSuggestionClick(suggestion)}
                            >
                              {suggestion}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <User className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                ))}
                {chatMutation.isPending && (
                  <div className="flex gap-2 justify-start">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
                    </div>
                    <div className="bg-muted rounded-lg px-3 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span className="sr-only">Thinking...</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          <div className="p-3 border-t">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about badges..."
                className="flex-1"
                disabled={chatMutation.isPending}
                data-testid="input-ai-chat"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || chatMutation.isPending}
                data-testid="button-send-ai-chat"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
