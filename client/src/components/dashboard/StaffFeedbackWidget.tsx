import { useState, useCallback, useEffect, useRef } from "react";
import { X, Camera, Minus } from "lucide-react";

type FeedbackCategory = "issue" | "feature" | "comment";
type WidgetStep = "greeting" | "followup" | "screenshot" | "submitted";

interface ChatMessage {
  role: "bot" | "user";
  content: string;
  categoryPill?: { category: FeedbackCategory; label: string };
  browserTag?: string;
  quickAnswers?: { label: string; value: string }[];
  screenshotPrompt?: boolean;
}

interface StaffFeedbackWidgetProps {
  staffName: string;
  eventId: string;
  eventName: string;
  getAuthHeaders: () => Record<string, string>;
}

function detectBrowser(): { browser: string; device: string; os: string } {
  const ua = navigator.userAgent;
  let browser = "your browser";
  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";

  let device = "desktop";
  if (/Mobi|Android/i.test(ua)) device = "mobile";
  else if (/Tablet|iPad/i.test(ua)) device = "tablet";

  const os = ua.includes("Mac") ? "macOS" :
    ua.includes("Windows") ? "Windows" :
    ua.includes("Linux") ? "Linux" :
    ua.includes("Android") ? "Android" :
    ua.includes("iPhone") ? "iOS" : "your OS";

  return { browser, device, os };
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function categorizeInput(text: string): FeedbackCategory {
  const lower = text.toLowerCase();
  const issueWords = ["broken", "not working", "error", "bug", "crash", "freeze", "freezing", "stuck", "fail", "wrong", "issue", "problem", "can't", "cannot", "won't", "doesn't work", "isn't working", "slow", "laggy", "unresponsive", "missing", "disappeared", "blank", "loading"];
  const featureWords = ["would be great", "it would be nice", "can we add", "can you add", "could we", "would love", "wish", "suggestion", "feature", "request", "option to", "ability to", "should have", "need a way", "how about", "what if", "please add", "add a", "export", "integrate", "support for"];
  const commentWords = ["love", "like", "great", "awesome", "nice", "good job", "well done", "intuitive", "smooth", "works well", "impressed", "happy", "enjoy", "thank", "appreciate", "helpful", "easy to use", "fantastic"];

  let issueScore = 0, featureScore = 0, commentScore = 0;
  issueWords.forEach(w => { if (lower.includes(w)) issueScore++; });
  featureWords.forEach(w => { if (lower.includes(w)) featureScore++; });
  commentWords.forEach(w => { if (lower.includes(w)) commentScore++; });

  if (issueScore > featureScore && issueScore > commentScore) return "issue";
  if (featureScore > issueScore && featureScore > commentScore) return "feature";
  if (commentScore > 0) return "comment";
  if (lower.includes("?") && (lower.startsWith("can") || lower.startsWith("could") || lower.startsWith("how") || lower.startsWith("what if"))) return "feature";
  return "comment";
}

const categoryLabels: Record<FeedbackCategory, string> = {
  issue: "Issue / Bug",
  feature: "Feature Request",
  comment: "Comment",
};

const categoryTypeMap: Record<FeedbackCategory, string> = {
  issue: "issue",
  feature: "feature_request",
  comment: "comment",
};

export function StaffFeedbackWidget({ staffName, eventId, eventName, getAuthHeaders }: StaffFeedbackWidgetProps) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [step, setStep] = useState<WidgetStep>("greeting");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userDescription, setUserDescription] = useState("");
  const [detectedCategory, setDetectedCategory] = useState<FeedbackCategory>("comment");
  const [followUpAnswer, setFollowUpAnswer] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [ticketRef, setTicketRef] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const browserInfo = useRef(detectBrowser());

  const safeTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, step]);

  useEffect(() => {
    if (!open) return;
    const handlePaste = (e: ClipboardEvent) => {
      if (step !== "screenshot") return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            setScreenshot(file);
            const reader = new FileReader();
            reader.onload = (ev) => setScreenshotPreview(ev.target?.result as string);
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [open, step]);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return;
    setScreenshot(file);
    const reader = new FileReader();
    reader.onload = (e) => setScreenshotPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const openPanel = useCallback(() => {
    const greeting = getGreeting();
    const greetingText = `${greeting}${staffName ? ", " + staffName : ""}! I'm here to listen. What's on your mind?`;
    setMessages([{
      role: "bot",
      content: greetingText,
      browserTag: `You're on ${browserInfo.current.browser} / ${browserInfo.current.os} (${browserInfo.current.device})`,
    }]);
    setStep("greeting");
    setUserDescription("");
    setDetectedCategory("comment");
    setFollowUpAnswer("");
    setScreenshot(null);
    setScreenshotPreview(null);
    setTicketRef(null);
    setOpen(true);
    setMinimized(false);
    safeTimeout(() => inputRef.current?.focus(), 100);
  }, [staffName, safeTimeout]);

  const minimizePanel = useCallback(() => {
    setMinimized(true);
  }, []);

  const restorePanel = useCallback(() => {
    setMinimized(false);
    safeTimeout(() => inputRef.current?.focus(), 100);
  }, [safeTimeout]);

  const closePanel = useCallback(() => {
    clearAllTimers();
    setOpen(false);
    setMinimized(false);
    setMessages([]);
    setStep("greeting");
    setInputValue("");
    setUserDescription("");
    setFollowUpAnswer("");
    setScreenshot(null);
    setScreenshotPreview(null);
    setTicketRef(null);
  }, [clearAllTimers]);

  const handleInitialInput = useCallback(() => {
    const text = inputRef.current?.value?.trim() || inputValue.trim();
    if (!text) return;

    setInputValue("");
    if (inputRef.current) inputRef.current.value = "";
    setUserDescription(text);
    const category = categorizeInput(text);
    setDetectedCategory(category);

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);

    safeTimeout(() => {
      const followUpMessages: Record<FeedbackCategory, { text: string; answers: { label: string; value: string }[] }> = {
        issue: {
          text: "I understand \u2014 sounds like something isn't working right. Let me help capture this.",
          answers: [
            { label: "Every time", value: "Every time" },
            { label: "Sometimes", value: "Sometimes" },
            { label: "Just once", value: "Just once" },
            { label: "Not sure", value: "Not sure" },
          ],
        },
        feature: {
          text: "Great idea! I've noted this as a feature request.",
          answers: [
            { label: "Rarely", value: "Rarely" },
            { label: "Sometimes", value: "Sometimes" },
            { label: "Every event", value: "Every event" },
            { label: "Daily", value: "Daily" },
          ],
        },
        comment: {
          text: "Thanks for sharing that! I've captured your feedback.",
          answers: [
            { label: "Nice to have", value: "Nice to have" },
            { label: "Important", value: "Important" },
            { label: "Critical", value: "Critical" },
          ],
        },
      };

      const followUpQuestion: Record<FeedbackCategory, string> = {
        issue: "Does this happen every time, or only sometimes?",
        feature: "How often would you use this if we built it?",
        comment: "How important is this to your workflow?",
      };

      const followUp = followUpMessages[category];
      const botMsg: ChatMessage = {
        role: "bot",
        content: `${followUp.text}\n\n${followUpQuestion[category]}`,
        categoryPill: { category, label: categoryLabels[category] },
        quickAnswers: followUp.answers,
      };

      setMessages(prev => [...prev, botMsg]);
      setStep("followup");
    }, 800);
  }, [inputValue, safeTimeout]);

  const handleQuickAnswer = useCallback((answer: string) => {
    setFollowUpAnswer(answer);
    const userMsg: ChatMessage = { role: "user", content: answer };
    setMessages(prev => [...prev, userMsg]);

    safeTimeout(() => {
      const screenMsgs: Record<FeedbackCategory, string> = {
        comment: "Got it, thanks! One last thing \u2014 I can capture your screen to help illustrate what you mean. Want me to?",
        feature: "That's really helpful context. I can capture your screen to show what you're referring to. Shall I?",
        issue: "Thanks \u2014 that detail really helps. I can capture your screen to help our team track this down faster. Want me to?",
      };

      const botMsg: ChatMessage = {
        role: "bot",
        content: screenMsgs[detectedCategory],
        screenshotPrompt: true,
      };
      setMessages(prev => [...prev, botMsg]);
      setStep("screenshot");
    }, 700);
  }, [detectedCategory, safeTimeout]);

  const handleAdditionalInput = useCallback(() => {
    const text = inputRef.current?.value?.trim() || inputValue.trim();
    if (!text) return;

    setInputValue("");
    if (inputRef.current) inputRef.current.value = "";
    setUserDescription(prev => prev + " \u2014 " + text);
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);

    safeTimeout(() => {
      const screenMsgs: Record<FeedbackCategory, string> = {
        comment: "Got it, thanks! One last thing \u2014 I can capture your screen to help illustrate what you mean. Want me to?",
        feature: "That's really helpful context. I can capture your screen to show what you're referring to. Shall I?",
        issue: "Thanks \u2014 that detail really helps. I can capture your screen to help our team track this down faster. Want me to?",
      };

      const botMsg: ChatMessage = {
        role: "bot",
        content: screenMsgs[detectedCategory],
        screenshotPrompt: true,
      };
      setMessages(prev => [...prev, botMsg]);
      setStep("screenshot");
    }, 700);
  }, [inputValue, detectedCategory, safeTimeout]);

  const doSubmit = useCallback(async (withScreenshot: boolean) => {
    setIsSubmitting(true);
    try {
      const fullMessage = followUpAnswer
        ? `${userDescription} [Follow-up: ${followUpAnswer}]`
        : userDescription;

      const headers = getAuthHeaders();

      let screenshotDataUrl: string | undefined;
      if (withScreenshot && screenshotPreview) {
        screenshotDataUrl = screenshotPreview;
      }

      const res = await fetch("/api/staff/feedback", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: categoryTypeMap[detectedCategory],
          message: fullMessage,
          screenshotDataUrl,
        }),
      });

      if (!res.ok) {
        const botMsg: ChatMessage = {
          role: "bot",
          content: "Sorry, something went wrong submitting your feedback. Please try again later.",
        };
        setMessages(prev => [...prev, botMsg]);
        setIsSubmitting(false);
        return;
      }

      const entry = await res.json();
      if (entry.ticketNumber) {
        setTicketRef(`FB-${entry.ticketNumber}`);
      }
      setStep("submitted");
    } catch {
      const botMsg: ChatMessage = {
        role: "bot",
        content: "Sorry, something went wrong submitting your feedback. Please try again later.",
      };
      setMessages(prev => [...prev, botMsg]);
    } finally {
      setIsSubmitting(false);
    }
  }, [followUpAnswer, userDescription, detectedCategory, screenshotPreview, getAuthHeaders]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (step === "greeting") {
        handleInitialInput();
      } else if (step === "followup") {
        handleAdditionalInput();
      }
    }
  }, [step, handleInitialInput, handleAdditionalInput]);

  useEffect(() => {
    if (screenshot && step === "screenshot") {
      const userMsg: ChatMessage = { role: "user", content: "Screen captured" };
      setMessages(prev => [...prev, userMsg]);
      safeTimeout(() => doSubmit(true), 600);
    }
  }, [screenshot]);

  return (
    <>
      {(!open || minimized) && (
        <button
          onClick={minimized ? restorePanel : openPanel}
          className="fixed bottom-5 right-5 w-[52px] h-[52px] rounded-full border-none cursor-pointer flex items-center justify-center transition-transform duration-200 hover:scale-105"
          style={{
            background: "#0B2958",
            color: "#fff",
            boxShadow: "0 4px 12px rgba(11,41,88,0.3)",
            zIndex: 99999,
          }}
          aria-label={minimized ? "Restore Feedback" : "Send Feedback"}
        >
          {minimized ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <circle cx="8" cy="10" r="1" fill="currentColor" />
              <circle cx="12" cy="10" r="1" fill="currentColor" />
              <circle cx="16" cy="10" r="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          )}
          {minimized && (
            <span
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full text-white text-xs font-bold flex items-center justify-center"
              style={{ background: "#f59e0b" }}
            >
              <Minus className="h-3 w-3" />
            </span>
          )}
        </button>
      )}

      {open && !minimized && (
        <div
          role="dialog"
          aria-label="Share Feedback"
          className="fixed flex flex-col sfw-panel"
          style={{
            bottom: 20,
            right: 20,
            width: 380,
            maxHeight: 540,
            background: "var(--sfw-bg, #fff)",
            borderRadius: 12,
            border: "1px solid var(--sfw-border, #e5e7eb)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
            zIndex: 100000,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            overflow: "hidden",
            color: "var(--sfw-text, #1f2937)",
          }}
        >
          <div
            className="flex items-center justify-between"
            style={{ background: "#0B2958", color: "#fff", padding: "14px 16px" }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Share Feedback</h3>
            <div className="flex items-center gap-1">
              <button
                onClick={minimizePanel}
                title="Minimize (keeps your progress)"
                style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", opacity: 0.7, padding: 4 }}
                className="hover:opacity-100"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                onClick={closePanel}
                title="Close (resets form)"
                style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", opacity: 0.7, padding: 4 }}
                className="hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            className="flex-1 overflow-y-auto"
            style={{ padding: 16 }}
          >
            {step === "submitted" ? (
              <div style={{ textAlign: "center", padding: "24px 16px" }}>
                <div
                  className="flex items-center justify-center mx-auto"
                  style={{
                    width: 56,
                    height: 56,
                    background: "var(--sfw-check-bg, #ecfdf5)",
                    borderRadius: "50%",
                    marginBottom: 12,
                    fontSize: 28,
                  }}
                >
                  &#x2713;
                </div>
                <h4 style={{ fontSize: 16, color: "#0B2958", marginBottom: 6, fontWeight: 600 }}>
                  Feedback Submitted!
                </h4>
                {ticketRef && (
                  <p style={{ fontSize: 11, color: "var(--sfw-ticket-green, #058943)", fontWeight: 600, marginBottom: 4 }}>
                    Ref: {ticketRef}
                  </p>
                )}
                <p style={{ fontSize: 12, color: "var(--sfw-text-muted, #636971)", lineHeight: 1.5 }}>
                  Thanks for taking the time to share your thoughts. Our team will review this soon.
                </p>
                <div
                  style={{
                    marginTop: 16,
                    textAlign: "left",
                    background: "var(--sfw-summary-bg, #f9fafb)",
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 11,
                    color: "var(--sfw-text-muted, #636971)",
                  }}
                >
                  <div style={{ marginBottom: 6 }}><strong>Type:</strong> {categoryLabels[detectedCategory]}</div>
                  <div style={{ marginBottom: 6 }}><strong>Event:</strong> {eventName}</div>
                  <div style={{ marginBottom: 6 }}><strong>Staff:</strong> {staffName}</div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Browser:</strong> {browserInfo.current.browser} / {browserInfo.current.os} / {browserInfo.current.device}
                  </div>
                  <div style={{ marginBottom: followUpAnswer ? 6 : 0 }}><strong>Feedback:</strong> {userDescription || "(description)"}</div>
                  {followUpAnswer && (
                    <div><strong>Follow-up:</strong> {followUpAnswer}</div>
                  )}
                </div>
                <div className="flex gap-2 justify-center" style={{ marginTop: 16 }}>
                  <button
                    onClick={closePanel}
                    style={{
                      background: "#0B2958",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      padding: "10px 24px",
                      fontSize: 13,
                      cursor: "pointer",
                      fontWeight: 500,
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={msg.role === "user" ? "self-end" : "self-start"}
                    style={{
                      maxWidth: "88%",
                      padding: "10px 14px",
                      borderRadius: 12,
                      fontSize: 13,
                      lineHeight: 1.5,
                      animation: "sfwFadeInUp 0.3s ease",
                      ...(msg.role === "bot"
                        ? { background: "var(--sfw-bot-bg, #f0f4f8)", color: "var(--sfw-bot-text, #1f2937)", borderBottomLeftRadius: 4 }
                        : { background: "#0B2958", color: "#fff", borderBottomRightRadius: 4 }),
                    }}
                  >
                    <div style={{ whiteSpace: "pre-line" }}>{msg.content}</div>

                    {msg.categoryPill && (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 8px",
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          marginTop: 6,
                          ...(msg.categoryPill.category === "issue"
                            ? { background: "var(--sfw-issue-bg, #fef2f2)", color: "var(--sfw-issue-text, #991b1b)" }
                            : msg.categoryPill.category === "feature"
                            ? { background: "var(--sfw-feature-bg, #f0fdf4)", color: "var(--sfw-feature-text, #166534)" }
                            : { background: "var(--sfw-comment-bg, #eff6ff)", color: "var(--sfw-comment-text, #1e40af)" }),
                        }}
                      >
                        {msg.categoryPill.category === "issue" ? "\uD83D\uDC1B" : msg.categoryPill.category === "feature" ? "\uD83D\uDCA1" : "\uD83D\uDCAC"}{" "}
                        Flagged as: {msg.categoryPill.label}
                      </span>
                    )}

                    {msg.browserTag && (
                      <div
                        style={{
                          display: "inline-block",
                          background: "var(--sfw-browser-bg, #fef3c7)",
                          color: "var(--sfw-browser-text, #92400e)",
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          marginTop: 4,
                          fontWeight: 500,
                        }}
                      >
                        {msg.browserTag}
                      </div>
                    )}

                    {msg.quickAnswers && step === "followup" && (
                      <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
                        {msg.quickAnswers.map((qa) => (
                          <span
                            key={qa.value}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleQuickAnswer(qa.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleQuickAnswer(qa.value); } }}
                            style={{
                              cursor: "pointer",
                              padding: "5px 12px",
                              border: "1.5px solid var(--sfw-qa-border, #d1d5db)",
                              borderRadius: 8,
                              fontSize: 12,
                              background: "var(--sfw-qa-bg, #fff)",
                              transition: "all 0.2s",
                              color: "var(--sfw-qa-text, #374151)",
                            }}
                            className="hover:opacity-80"
                          >
                            {qa.label}
                          </span>
                        ))}
                      </div>
                    )}

                    {msg.screenshotPrompt && step === "screenshot" && (
                      <div style={{ marginTop: 8 }}>
                        <div
                          style={{
                            padding: 12,
                            borderRadius: 8,
                            border: "1.5px dashed var(--sfw-secondary-border, #d1d5db)",
                            background: "var(--sfw-secondary-bg, #f3f4f6)",
                            textAlign: "center",
                            marginBottom: 8,
                          }}
                        >
                          <Camera className="h-5 w-5 mx-auto mb-1" style={{ color: "var(--sfw-text-muted, #636971)" }} />
                          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--sfw-text, #1f2937)" }}>
                            Paste a screenshot (Ctrl+V / Cmd+V)
                          </div>
                          <div style={{ fontSize: 11, color: "var(--sfw-text-muted, #636971)", marginTop: 2 }}>
                            Take a screenshot with your device, then paste it here
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => doSubmit(false)}
                            disabled={isSubmitting}
                            style={{
                              flex: 1,
                              padding: 8,
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: isSubmitting ? "not-allowed" : "pointer",
                              border: "1.5px solid var(--sfw-secondary-border, #d1d5db)",
                              background: "var(--sfw-secondary-bg, #f3f4f6)",
                              color: "var(--sfw-secondary-text, #374151)",
                              opacity: isSubmitting ? 0.6 : 1,
                              transition: "all 0.2s",
                            }}
                          >
                            {isSubmitting ? "Submitting..." : "Skip, submit without screenshot"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {(step === "greeting" || step === "followup") && messages.length > 0 && messages[messages.length - 1].role === "user" && (
                  <div className="self-start flex gap-1" style={{ padding: "10px 14px" }}>
                    <span className="w-[7px] h-[7px] rounded-full animate-bounce" style={{ background: "var(--sfw-dots, #6f7682)", animationDelay: "0ms" }} />
                    <span className="w-[7px] h-[7px] rounded-full animate-bounce" style={{ background: "var(--sfw-dots, #6f7682)", animationDelay: "200ms" }} />
                    <span className="w-[7px] h-[7px] rounded-full animate-bounce" style={{ background: "var(--sfw-dots, #6f7682)", animationDelay: "400ms" }} />
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {step !== "submitted" && step !== "screenshot" && (
            <div>
              <div
                className="flex gap-2 items-center"
                style={{ borderTop: "1px solid var(--sfw-border, #e5e7eb)", padding: 12 }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  autoFocus
                  autoComplete="off"
                  value={inputValue}
                  onChange={(e) => {
                    e.stopPropagation();
                    setInputValue(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    handleKeyDown(e);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  placeholder={step === "greeting" ? "Tell me what's going on..." : "Add more detail or skip..."}
                  style={{
                    flex: 1,
                    border: "1px solid var(--sfw-input-border, #d1d5db)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 13,
                    fontFamily: "inherit",
                    outline: "none",
                    background: "var(--sfw-input-bg, #fff)",
                    color: "var(--sfw-input-text, #111)",
                    boxSizing: "border-box",
                    display: "block",
                    width: "100%",
                    minHeight: 36,
                  }}
                />
                {step === "greeting" ? (
                  <button
                    onClick={handleInitialInput}
                    style={{
                      background: "#0B2958",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 14px",
                      fontSize: 13,
                      cursor: "pointer",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Send
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (inputValue.trim()) {
                        handleAdditionalInput();
                      } else {
                        const screenMsgs: Record<FeedbackCategory, string> = {
                          comment: "Got it, thanks! One last thing \u2014 would a screenshot help illustrate what you mean?",
                          feature: "That's really helpful context. Would a screenshot help show what you're referring to?",
                          issue: "Thanks \u2014 that detail really helps. A screenshot could help our team track this down faster. Want to attach one?",
                        };
                        const botMsg: ChatMessage = {
                          role: "bot",
                          content: screenMsgs[detectedCategory],
                          screenshotPrompt: true,
                        };
                        setMessages(prev => [...prev, botMsg]);
                        setStep("screenshot");
                      }
                    }}
                    style={{
                      background: "var(--sfw-secondary-bg, #f3f4f6)",
                      color: "var(--sfw-secondary-text, #374151)",
                      border: "1px solid var(--sfw-secondary-border, #d1d5db)",
                      borderRadius: 8,
                      padding: "8px 14px",
                      fontSize: 12,
                      cursor: "pointer",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Submit now
                  </button>
                )}
              </div>
              <div
                style={{
                  textAlign: "center",
                  fontSize: 10,
                  color: "var(--sfw-text-hint, #6f7682)",
                  padding: "4px 16px 8px",
                  fontStyle: "italic",
                }}
              >
                You can close or submit at any point - no pressure
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes sfwFadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sfw-panel {
          --sfw-bg: #fff;
          --sfw-border: #e5e7eb;
          --sfw-text: #1f2937;
          --sfw-text-muted: #636971;
          --sfw-text-hint: #6f7682;
          --sfw-bot-bg: #f0f4f8;
          --sfw-bot-text: #1f2937;
          --sfw-input-bg: #fff;
          --sfw-input-border: #d1d5db;
          --sfw-input-text: #111;
          --sfw-summary-bg: #f9fafb;
          --sfw-ticket-green: #058943;
          --sfw-qa-bg: #fff;
          --sfw-qa-border: #d1d5db;
          --sfw-qa-text: #374151;
          --sfw-secondary-bg: #f3f4f6;
          --sfw-secondary-text: #374151;
          --sfw-secondary-border: #d1d5db;
          --sfw-check-bg: #ecfdf5;
          --sfw-issue-bg: #fef2f2;
          --sfw-issue-text: #991b1b;
          --sfw-feature-bg: #f0fdf4;
          --sfw-feature-text: #166534;
          --sfw-comment-bg: #eff6ff;
          --sfw-comment-text: #1e40af;
          --sfw-browser-bg: #fef3c7;
          --sfw-browser-text: #92400e;
          --sfw-dots: #6f7682;
        }
        .dark .sfw-panel {
          --sfw-bg: #1e293b;
          --sfw-border: #334155;
          --sfw-text: #e2e8f0;
          --sfw-text-muted: #94a3b8;
          --sfw-text-hint: #8b9bb5;
          --sfw-bot-bg: #273548;
          --sfw-bot-text: #e2e8f0;
          --sfw-input-bg: #0f172a;
          --sfw-input-border: #475569;
          --sfw-input-text: #f1f5f9;
          --sfw-summary-bg: #0f172a;
          --sfw-ticket-green: #4ade80;
          --sfw-qa-bg: #1e293b;
          --sfw-qa-border: #475569;
          --sfw-qa-text: #cbd5e1;
          --sfw-secondary-bg: #334155;
          --sfw-secondary-text: #e2e8f0;
          --sfw-secondary-border: #475569;
          --sfw-check-bg: #064e3b;
          --sfw-issue-bg: #450a0a;
          --sfw-issue-text: #fca5a5;
          --sfw-feature-bg: #052e16;
          --sfw-feature-text: #86efac;
          --sfw-comment-bg: #1e1b4b;
          --sfw-comment-text: #a5b4fc;
          --sfw-browser-bg: #451a03;
          --sfw-browser-text: #fcd34d;
          --sfw-dots: #8b9bb5;
        }
      `}</style>
    </>
  );
}
