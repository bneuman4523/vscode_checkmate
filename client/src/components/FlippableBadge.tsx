import { useState, useRef, useEffect, memo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RotateCcw, Info, Ruler, Type, QrCode, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FlippableBadgeProps {
  front: ReactNode;
  back?: ReactNode;
  templateName?: string;
  templateWidth?: number;
  templateHeight?: number;
  templateFont?: string;
  backgroundColor?: string;
  accentColor?: string;
  textColor?: string;
  participantTypes?: string[];
  includeQR?: boolean;
  qrEmbedType?: string;
  className?: string;
  showFlipButton?: boolean;
  flipOnHover?: boolean;
}

export default function FlippableBadge({
  front,
  back,
  templateName,
  templateWidth,
  templateHeight,
  templateFont,
  backgroundColor = "#1e3a5f",
  accentColor = "#3b82f6",
  textColor = "#ffffff",
  participantTypes,
  includeQR,
  qrEmbedType,
  className,
  showFlipButton = true,
  flipOnHover = false,
}: FlippableBadgeProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [hasBeenFlipped, setHasBeenFlipped] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const [frontSize, setFrontSize] = useState<{ width: number; height: number } | null>(null);

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (frontRef.current) {
      const rect = frontRef.current.getBoundingClientRect();
      setFrontSize({ width: rect.width, height: rect.height });
    }
  }, [front]);

  const handleFlip = () => {
    if (!hasBeenFlipped) setHasBeenFlipped(true);
    setIsFlipped((prev) => !prev);
  };

  const handleHoverEnter = () => {
    if (!hasBeenFlipped) setHasBeenFlipped(true);
    setIsFlipped(true);
  };

  return (
    <div className={cn("relative group", className)}>
      <div
        className="badge-flip-container"
        style={{ perspective: "1200px" }}
        onMouseEnter={flipOnHover && !prefersReducedMotion ? handleHoverEnter : undefined}
        onMouseLeave={flipOnHover && !prefersReducedMotion ? () => setIsFlipped(false) : undefined}
      >
        <div
          className="badge-flip-inner"
          style={{
            transformStyle: "preserve-3d",
            transition: prefersReducedMotion ? "none" : "transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)",
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
            position: "relative",
            width: "100%",
          }}
        >
          <div
            ref={frontRef}
            className="badge-flip-front"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              position: "relative",
              zIndex: isFlipped ? 0 : 1,
            }}
          >
            {front}
          </div>

          <div
            className="badge-flip-back"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              position: "absolute",
              top: 0,
              left: 0,
              width: frontSize?.width ?? "100%",
              height: frontSize?.height ?? "100%",
              zIndex: isFlipped ? 1 : 0,
            }}
          >
            {hasBeenFlipped && (
              back || (
                <MemoizedBadgeBack
                  templateName={templateName}
                  width={templateWidth}
                  height={templateHeight}
                  fontFamily={templateFont}
                  backgroundColor={backgroundColor}
                  accentColor={accentColor}
                  textColor={textColor}
                  participantTypes={participantTypes}
                  includeQR={includeQR}
                  qrEmbedType={qrEmbedType}
                />
              )
            )}
          </div>
        </div>
      </div>

      {showFlipButton && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleFlip}
          className={cn(
            "absolute -bottom-3 left-1/2 -translate-x-1/2 z-10",
            "bg-background/95 backdrop-blur-sm shadow-md",
            "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
            "h-7 px-3 text-xs gap-1.5",
            isFlipped && "opacity-100"
          )}
        >
          <RotateCcw className={cn(
            "h-3 w-3 transition-transform duration-500",
            isFlipped && "rotate-180"
          )} />
          {isFlipped ? "Front" : "Back"}
        </Button>
      )}
    </div>
  );
}

interface BadgeBackProps {
  templateName?: string;
  width?: number;
  height?: number;
  fontFamily?: string;
  backgroundColor: string;
  accentColor: string;
  textColor: string;
  participantTypes?: string[];
  includeQR?: boolean;
  qrEmbedType?: string;
}

const MemoizedBadgeBack = memo(function BadgeBack({
  templateName,
  width,
  height,
  fontFamily,
  backgroundColor,
  accentColor,
  textColor,
  participantTypes,
  includeQR,
  qrEmbedType,
}: BadgeBackProps) {
  const darkerBg = adjustBrightness(backgroundColor, -20);

  return (
    <div
      className="w-full h-full rounded-lg overflow-hidden flex flex-col relative"
      style={{
        background: `linear-gradient(135deg, ${backgroundColor} 0%, ${darkerBg} 100%)`,
        color: textColor,
      }}
    >
      <div
        className="px-4 pt-4 pb-2 flex items-center gap-2"
        style={{ borderBottom: `2px solid ${accentColor}40` }}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ backgroundColor: accentColor, color: textColor }}
        >
          C
        </div>
        <span className="text-[10px] font-medium opacity-70 uppercase tracking-wider truncate">
          Template Details
        </span>
      </div>

      <div className="flex-1 px-4 py-3 space-y-2.5 overflow-hidden">
        {templateName && (
          <InfoRow icon={<Info className="h-3 w-3" />} label="Template" value={templateName} accentColor={accentColor} textColor={textColor} />
        )}
        {width && height && (
          <InfoRow icon={<Ruler className="h-3 w-3" />} label="Size" value={`${width}" x ${height}"`} accentColor={accentColor} textColor={textColor} />
        )}
        {fontFamily && (
          <InfoRow icon={<Type className="h-3 w-3" />} label="Font" value={fontFamily} accentColor={accentColor} textColor={textColor} />
        )}
        {includeQR !== undefined && (
          <InfoRow
            icon={<QrCode className="h-3 w-3" />}
            label="QR Code"
            value={includeQR ? (qrEmbedType || "Enabled") : "Disabled"}
            accentColor={accentColor}
            textColor={textColor}
          />
        )}
        {participantTypes && participantTypes.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 opacity-60">
              <Palette className="h-3 w-3" />
              <span className="text-[9px] uppercase tracking-wider">Types</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {participantTypes.map((type) => (
                <span
                  key={type}
                  className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: `${accentColor}30`,
                    color: textColor,
                  }}
                >
                  {type}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-center justify-center gap-2 opacity-30">
          <div className="h-px flex-1" style={{ backgroundColor: textColor }} />
          <span className="text-[8px] uppercase tracking-widest">Checkmate</span>
          <div className="h-px flex-1" style={{ backgroundColor: textColor }} />
        </div>
      </div>

      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `repeating-linear-gradient(45deg, ${textColor} 0, ${textColor} 1px, transparent 0, transparent 8px)`,
        }}
      />
    </div>
  );
});

function InfoRow({
  icon,
  label,
  value,
  accentColor,
  textColor,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  accentColor: string;
  textColor: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${accentColor}25` }}
      >
        <span style={{ color: accentColor }}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-[9px] uppercase tracking-wider opacity-50 block">{label}</span>
        <span className="text-xs font-medium truncate block" style={{ color: textColor }}>
          {value}
        </span>
      </div>
    </div>
  );
}

function adjustBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
