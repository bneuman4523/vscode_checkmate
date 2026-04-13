import { useCallback, useRef } from "react";
import { useFeatureFlags } from "./useFeatureFlags";
import { useAuth } from "./useAuth";

interface BehaviorEvent {
  feature: string;
  step?: string;
  action: "start" | "complete" | "abandon";
  durationMs?: number;
  eventId?: string;
  metadata?: Record<string, any>;
}

const queue: BehaviorEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushQueue() {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  fetch("/api/behavior-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(batch),
  }).catch(() => {});
}

function enqueue(event: BehaviorEvent) {
  queue.push(event);
  if (flushTimer) clearTimeout(flushTimer);
  if (queue.length >= 10) {
    flushQueue();
  } else {
    flushTimer = setTimeout(flushQueue, 5000);
  }
}

export function useBehaviorTracking() {
  const { betaFeedback } = useFeatureFlags();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const enabled = betaFeedback && isSuperAdmin;
  const timers = useRef<Map<string, number>>(new Map());

  const trackStart = useCallback((feature: string, step?: string, metadata?: Record<string, any>) => {
    if (!enabled) return;
    const key = `${feature}:${step || ""}`;
    timers.current.set(key, Date.now());
    enqueue({ feature, step, action: "start", metadata });
  }, [enabled]);

  const trackComplete = useCallback((feature: string, step?: string, metadata?: Record<string, any>) => {
    if (!enabled) return;
    const key = `${feature}:${step || ""}`;
    const startTime = timers.current.get(key);
    const durationMs = startTime ? Date.now() - startTime : undefined;
    timers.current.delete(key);
    enqueue({ feature, step, action: "complete", durationMs, metadata });
  }, [enabled]);

  const trackAbandon = useCallback((feature: string, step?: string, metadata?: Record<string, any>) => {
    if (!enabled) return;
    const key = `${feature}:${step || ""}`;
    const startTime = timers.current.get(key);
    const durationMs = startTime ? Date.now() - startTime : undefined;
    timers.current.delete(key);
    enqueue({ feature, step, action: "abandon", durationMs, metadata });
  }, [enabled]);

  return { trackStart, trackComplete, trackAbandon };
}
