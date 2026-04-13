import { useEffect } from "react";

export function useBackNavigationGuard(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    document.documentElement.style.overscrollBehaviorX = "none";
    document.body.style.overscrollBehaviorX = "none";

    window.history.pushState(null, "", window.location.href);
    window.history.pushState(null, "", window.location.href);

    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
    };

    window.addEventListener("popstate", handlePopState);

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const edgeThreshold = 30;
      const isLeftEdge = touch.clientX < edgeThreshold;
      const isRightEdge = touch.clientX > window.innerWidth - edgeThreshold;
      if (isLeftEdge || isRightEdge) {
        (e.target as HTMLElement)?.dataset && 
          ((e.target as HTMLElement).dataset._guardX = String(touch.clientX));
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const target = e.target as HTMLElement;
      const startX = target?.dataset?._guardX;
      if (startX) {
        const dx = Math.abs(touch.clientX - Number(startX));
        if (dx > 10) {
          e.preventDefault();
        }
      }
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      document.documentElement.style.overscrollBehaviorX = "";
      document.body.style.overscrollBehaviorX = "";
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
    };
  }, [enabled]);
}
