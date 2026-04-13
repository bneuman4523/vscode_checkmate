import { useEffect, useRef, useState, useCallback } from "react";

interface UseIdleTimeoutOptions {
  timeoutMs: number;
  warningMs: number;
  onTimeout: () => void;
  enabled?: boolean;
}

export function useIdleTimeout({
  timeoutMs,
  warningMs,
  onTimeout,
  enabled = true,
}: UseIdleTimeoutOptions) {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningActiveRef = useRef(false);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    timeoutRef.current = null;
    warningRef.current = null;
    countdownRef.current = null;
  }, []);

  const resetTimers = useCallback(() => {
    if (!enabled) return;
    clearTimers();
    setShowWarning(false);
    warningActiveRef.current = false;

    const warningDelay = timeoutMs - warningMs;

    warningRef.current = setTimeout(() => {
      setShowWarning(true);
      warningActiveRef.current = true;
      const warningEnd = Math.ceil(warningMs / 1000);
      setRemainingSeconds(warningEnd);
      countdownRef.current = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, warningDelay);

    timeoutRef.current = setTimeout(() => {
      clearTimers();
      setShowWarning(false);
      warningActiveRef.current = false;
      onTimeoutRef.current();
    }, timeoutMs);
  }, [enabled, timeoutMs, warningMs, clearTimers]);

  const stayActive = useCallback(() => {
    resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      setShowWarning(false);
      warningActiveRef.current = false;
      return;
    }

    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];

    const handleActivity = () => {
      if (!warningActiveRef.current) {
        resetTimers();
      }
    };

    events.forEach((event) => document.addEventListener(event, handleActivity, { passive: true }));
    resetTimers();

    return () => {
      events.forEach((event) => document.removeEventListener(event, handleActivity));
      clearTimers();
    };
  }, [enabled, resetTimers, clearTimers]);

  return { showWarning, remainingSeconds, stayActive };
}
