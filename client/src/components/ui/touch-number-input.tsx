import * as React from "react";
import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";

interface TouchNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  suffix?: string;
  className?: string;
  "data-testid"?: string;
}

const TouchNumberInput = React.forwardRef<HTMLDivElement, TouchNumberInputProps>(
  ({ value, onChange, min, max, step = 1, label, suffix, className, "data-testid": testId }, ref) => {
    const [isEditing, setIsEditing] = React.useState(false);
    const [editValue, setEditValue] = React.useState(String(value));
    const inputRef = React.useRef<HTMLInputElement>(null);

    const clamp = React.useCallback((v: number) => {
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      return v;
    }, [min, max]);

    const decrement = React.useCallback((e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onChange(clamp(value - step));
    }, [value, step, clamp, onChange]);

    const increment = React.useCallback((e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onChange(clamp(value + step));
    }, [value, step, clamp, onChange]);

    const startEditing = React.useCallback(() => {
      setEditValue(step % 1 !== 0 ? value.toFixed(1) : String(value));
      setIsEditing(true);
    }, [value, step]);

    React.useEffect(() => {
      if (isEditing && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [isEditing]);

    const commitEdit = React.useCallback(() => {
      const parsed = step % 1 !== 0 ? parseFloat(editValue) : parseInt(editValue, 10);
      if (!isNaN(parsed)) {
        onChange(clamp(parsed));
      }
      setIsEditing(false);
    }, [editValue, step, clamp, onChange]);

    const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        commitEdit();
      } else if (e.key === "Escape") {
        setIsEditing(false);
      }
    }, [commitEdit]);

    React.useEffect(() => {
      if (!isEditing) {
        setEditValue(step % 1 !== 0 ? value.toFixed(1) : String(value));
      }
    }, [value, isEditing, step]);

    const isAtMin = min !== undefined && value <= min;
    const isAtMax = max !== undefined && value >= max;
    const displayValue = step % 1 !== 0 ? value.toFixed(1) : String(value);
    const ariaLabel = label || testId || "Numeric value";

    return (
      <div
        ref={ref}
        className={cn("flex items-center touch-manipulation", className)}
        data-testid={testId}
        role="group"
        aria-label={ariaLabel}
      >
        <button
          type="button"
          onPointerDown={decrement}
          disabled={isAtMin}
          className={cn(
            "flex items-center justify-center rounded-l-md border border-r-0 border-input bg-muted/50 transition-colors select-none touch-manipulation",
            "h-11 w-11 min-w-[44px] min-h-[44px]",
            "active:bg-primary active:text-primary-foreground",
            isAtMin && "opacity-40 cursor-not-allowed"
          )}
          aria-label={`Decrease ${ariaLabel}`}
        >
          <Minus className="h-4 w-4" />
        </button>

        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            aria-label={`Edit ${ariaLabel}`}
            className={cn(
              "flex-1 h-11 min-h-[44px] border-y border-input bg-background",
              "text-center text-sm font-medium outline-none",
              "focus:ring-2 focus:ring-ring focus:ring-inset"
            )}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className={cn(
              "flex-1 h-11 min-h-[44px] border-y border-input bg-background flex items-center justify-center",
              "text-sm font-medium cursor-text select-none touch-manipulation",
              "hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            )}
            aria-label={`${displayValue}${suffix ? ' ' + suffix : ''}, tap to edit`}
          >
            <span className="tabular-nums">
              {displayValue}
              {suffix && <span className="text-muted-foreground ml-0.5">{suffix}</span>}
            </span>
          </button>
        )}

        <button
          type="button"
          onPointerDown={increment}
          disabled={isAtMax}
          className={cn(
            "flex items-center justify-center rounded-r-md border border-l-0 border-input bg-muted/50 transition-colors select-none touch-manipulation",
            "h-11 w-11 min-w-[44px] min-h-[44px]",
            "active:bg-primary active:text-primary-foreground",
            isAtMax && "opacity-40 cursor-not-allowed"
          )}
          aria-label={`Increase ${ariaLabel}`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    );
  }
);

TouchNumberInput.displayName = "TouchNumberInput";

export { TouchNumberInput };
