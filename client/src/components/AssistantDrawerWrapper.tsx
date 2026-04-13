import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useNavigation } from "@/contexts/NavigationContext";
import { AssistantDrawer } from "./AssistantDrawer";

type AssistantMode = "closed" | "drawer" | "pinned";

export function AssistantDrawerWrapper() {
  const { selectedEvent } = useNavigation();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<AssistantMode>("closed");

  const handleModeChange = (newMode: AssistantMode) => {
    setMode(newMode);
  };

  useEffect(() => {
    const handler = () => {
      setMode("drawer");
    };
    window.addEventListener("open-assistant", handler);
    return () => window.removeEventListener("open-assistant", handler);
  }, []);

  if (!selectedEvent || mode === "closed") return null;

  return (
    <AssistantDrawer
      eventId={String(selectedEvent.id)}
      mode={mode}
      onModeChange={handleModeChange}
      onNavigate={(route) => setLocation(route)}
    />
  );
}
