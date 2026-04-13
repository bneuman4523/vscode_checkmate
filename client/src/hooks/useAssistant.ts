import { useState, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export interface OptionItem {
  id: string;
  label: string;
  action: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  toolsUsed?: string[];
  options?: OptionItem[];
}

interface UseAssistantOptions {
  eventId: string;
  currentRoute?: string;
  onNavigate?: (route: string, reason: string) => void;
}

interface UseAssistantReturn {
  messages: Message[];
  send: (text: string) => void;
  isStreaming: boolean;
  clearHistory: () => void;
}

function toApiMessages(messages: Message[]) {
  return messages
    .filter((m) => !m.isStreaming)
    .map((m) => ({ role: m.role, content: m.content }));
}

let messageCounter = 0;
const nextId = () => `msg_${++messageCounter}_${Date.now()}`;

export function useAssistant({
  eventId,
  currentRoute,
  onNavigate,
}: UseAssistantOptions): UseAssistantReturn {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      const userMessage: Message = {
        id: nextId(),
        role: "user",
        content: text.trim(),
      };

      const assistantId = nextId();
      const assistantPlaceholder: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        isStreaming: true,
        toolsUsed: [],
      };

      setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
      setIsStreaming(true);

      const history = toApiMessages(messages);
      history.push({ role: "user", content: text.trim() });

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, eventId, currentRoute }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;

            let event: Record<string, unknown>;
            try {
              event = JSON.parse(raw);
            } catch {
              continue;
            }

            switch (event.type) {
              case "text":
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + String(event.content ?? "") }
                      : m
                  )
                );
                break;

              case "tool_start":
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          toolsUsed: [...(m.toolsUsed ?? []), String(event.tool ?? "")],
                        }
                      : m
                  )
                );
                break;

              case "options":
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, options: event.options as OptionItem[] }
                      : m
                  )
                );
                break;

              case "data_changed":
                queryClient.invalidateQueries({ queryKey: ["event"] });
                queryClient.invalidateQueries({ queryKey: ["setupStatus", eventId] });
                break;

              case "navigate":
                onNavigate?.(
                  String(event.route ?? ""),
                  String(event.reason ?? "")
                );
                break;

              case "error":
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content:
                            m.content ||
                            String(event.message ?? "Something went wrong."),
                          isStreaming: false,
                        }
                      : m
                  )
                );
                break;

              case "done":
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, isStreaming: false } : m
                  )
                );
                break;
            }
          }
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") return;

        console.error("[useAssistant] Stream error:", err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: m.content || "Connection error. Please try again.",
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [eventId, currentRoute, isStreaming, messages, onNavigate, queryClient]
  );

  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, send, isStreaming, clearHistory };
}
