import html2canvas from "html2canvas";

export interface CaptureResult {
  file: File;
  previewDataUrl: string;
  wasFallback: boolean;
}

export interface CaptureOptions {
  target?: Element;
  timeoutMs?: number;
  backgroundColor?: string;
  location?: string;
}

const CAPTURE_CONFIG = {
  useCORS: true,
  allowTaint: false,
  scale: Math.min(window.devicePixelRatio || 2, 2),
  logging: false,
  imageTimeout: 15000,
  foreignObjectRendering: false,
  removeContainer: true,
};

const PROBLEMATIC_CSS = [
  "filter",
  "backdrop-filter",
  "-webkit-backdrop-filter",
  "clip-path",
  "mix-blend-mode",
  "will-change",
  "mask",
  "-webkit-mask",
  "mask-image",
  "-webkit-mask-image",
];

export class ScreenshotService {
  static async capture(options: CaptureOptions = {}): Promise<CaptureResult> {
    const {
      target,
      timeoutMs = 5000,
      backgroundColor,
      location = window.location.pathname,
    } = options;

    const mainEl = target || document.querySelector("main") || document.getElementById("root") || document.body;
    const rect = mainEl.getBoundingClientRect();
    const snapshotWidth = Math.max(rect.width, 800);
    const snapshotHeight = Math.max(rect.height, 600);
    const bgColor = backgroundColor || getComputedStyle(document.body).backgroundColor || "#ffffff";

    const captureResult = await Promise.race([
      this.executeCapture(mainEl as HTMLElement, bgColor),
      this.circuitBreaker(timeoutMs),
    ]);

    let wasFallback = false;
    let canvas: HTMLCanvasElement;

    if (captureResult === null) {
      console.warn("[ScreenshotService] Circuit breaker triggered or capture failed, using text fallback");
      canvas = this.createTextSnapshot(mainEl, snapshotWidth, snapshotHeight, location);
      wasFallback = true;
    } else {
      canvas = captureResult;
    }

    return this.canvasToResult(canvas, wasFallback, mainEl, snapshotWidth, snapshotHeight, location);
  }

  private static async executeCapture(element: HTMLElement, bgColor: string): Promise<HTMLCanvasElement | null> {
    try {
      await this.awaitRenderReadiness(element);

      const canvas = await html2canvas(element, {
        ...CAPTURE_CONFIG,
        backgroundColor: bgColor,
        ignoreElements: (el) => el.hasAttribute("data-feedback-widget"),
        onclone: (clonedDoc: Document) => {
          this.sanitizeClonedDOM(clonedDoc);
        },
      });

      return canvas;
    } catch (error) {
      console.error("[ScreenshotService] html2canvas capture failed:", error);
      return null;
    }
  }

  private static async awaitRenderReadiness(root: Element): Promise<void> {
    const readinessTimeout = 2500;

    try {
      await Promise.race([
        Promise.all([
          document.fonts?.ready ? document.fonts.ready.catch(() => {}) : Promise.resolve(),
          ...Array.from(root.querySelectorAll("img"))
            .filter((img) => !img.complete)
            .map((img) =>
              img.decode
                ? img.decode().catch(() => {})
                : new Promise<void>((resolve) => {
                    img.onload = () => resolve();
                    img.onerror = () => resolve();
                  })
            ),
        ]),
        new Promise<void>((resolve) => setTimeout(resolve, readinessTimeout)),
      ]);
    } catch {
      // Swallow readiness errors — proceed with capture anyway
    }
  }

  private static sanitizeClonedDOM(doc: Document): void {
    const allElements = doc.querySelectorAll("*");

    allElements.forEach((el) => {
      if (!(el instanceof HTMLElement)) return;

      if (el.hasAttribute("data-feedback-widget")) {
        el.style.display = "none";
        return;
      }

      if (el.getAttribute("aria-hidden") === "true") {
        el.style.display = "none";
        return;
      }

      const computed = doc.defaultView?.getComputedStyle(el);
      if (!computed) return;

      const hasBackdropFilter =
        computed.getPropertyValue("backdrop-filter") !== "none" ||
        computed.getPropertyValue("-webkit-backdrop-filter") !== "none";

      if (hasBackdropFilter) {
        el.style.backdropFilter = "none";
        el.style.setProperty("-webkit-backdrop-filter", "none");
        const existingBg = computed.getPropertyValue("background-color");
        if (!existingBg || existingBg === "rgba(0, 0, 0, 0)" || existingBg === "transparent") {
          el.style.backgroundColor = "rgba(255, 255, 255, 0.95)";
        }
      }

      PROBLEMATIC_CSS.forEach((prop) => {
        if (prop === "backdrop-filter" || prop === "-webkit-backdrop-filter") return;
        const val = computed.getPropertyValue(prop);
        if (val && val !== "none" && val !== "auto" && val !== "normal") {
          el.style.setProperty(prop, "none", "important");
        }
      });
    });
  }

  private static circuitBreaker(ms: number): Promise<null> {
    return new Promise((resolve) =>
      setTimeout(() => {
        console.warn(`[ScreenshotService] Circuit breaker: ${ms}ms timeout reached`);
        resolve(null);
      }, ms)
    );
  }

  private static async canvasToResult(
    canvas: HTMLCanvasElement,
    wasFallback: boolean,
    mainEl: Element,
    snapshotWidth: number,
    snapshotHeight: number,
    location: string,
  ): Promise<CaptureResult> {
    let blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );

    if (!blob) {
      console.warn("[ScreenshotService] toBlob failed, falling back to text snapshot");
      const fallbackCanvas = this.createTextSnapshot(mainEl, snapshotWidth, snapshotHeight, location);
      wasFallback = true;
      blob = await new Promise<Blob | null>((resolve) =>
        fallbackCanvas.toBlob(resolve, "image/png")
      );
      if (!blob) {
        throw new Error("Screenshot capture failed completely — both visual and text fallback returned null");
      }
    }

    const file = new File([blob], `screen-capture-${Date.now()}.png`, { type: "image/png" });

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({
          file,
          previewDataUrl: e.target?.result as string,
          wasFallback,
        });
      };
      reader.onerror = () => reject(new Error("Failed to read screenshot as data URL"));
      reader.readAsDataURL(file);
    });
  }

  private static createTextSnapshot(mainEl: Element, width: number, height: number, location: string): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);

    const isDark = document.documentElement.classList.contains("dark");
    ctx.fillStyle = isDark ? "#1a1a2e" : "#f8f9fa";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#0B2958";
    ctx.fillRect(0, 0, width, 48);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px Inter, system-ui, sans-serif";
    ctx.fillText(`Page: ${document.title || location}`, 16, 30);

    ctx.fillStyle = isDark ? "#e2e8f0" : "#1e293b";
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.fillText(`URL: ${window.location.pathname}  •  ${new Date().toLocaleString()}`, 16, 68);

    let y = 96;
    const seenTexts = new Set<string>();

    const headings = mainEl.querySelectorAll("h1, h2, h3, h4");
    headings.forEach((el) => {
      const text = (el.textContent || "").trim().substring(0, 100);
      if (text && !seenTexts.has(text) && y < height - 40) {
        seenTexts.add(text);
        const tag = el.tagName.toLowerCase();
        const fontSize = tag === "h1" ? 18 : tag === "h2" ? 16 : 14;
        ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = isDark ? "#e2e8f0" : "#0f172a";
        ctx.fillText(text, 16, y);
        y += fontSize + 10;
      }
    });

    y += 8;
    ctx.font = "13px Inter, system-ui, sans-serif";
    ctx.fillStyle = isDark ? "#cbd5e1" : "#334155";

    const contentEls = mainEl.querySelectorAll("p, td, th, li, label, span[class], div[class*='card'], div[class*='stat']");
    contentEls.forEach((el) => {
      const text = (el.textContent || "").trim().substring(0, 120);
      if (text && text.length > 2 && !seenTexts.has(text) && y < height - 40) {
        seenTexts.add(text);
        const lines = this.wrapText(ctx, text, width - 32);
        lines.forEach((line) => {
          if (y < height - 40) {
            ctx.fillText(line, 16, y);
            y += 18;
          }
        });
      }
    });

    ctx.fillStyle = isDark ? "#64748b" : "#94a3b8";
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.fillText("Screen snapshot — captured page content for feedback context", 16, height - 12);

    return canvas;
  }

  private static wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    words.forEach((word) => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [text];
  }
}

export async function captureScreenshot(options: CaptureOptions = {}): Promise<CaptureResult> {
  return ScreenshotService.capture(options);
}
