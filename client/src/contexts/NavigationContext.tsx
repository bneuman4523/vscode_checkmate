import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import type { Customer, Event } from "@shared/schema";
import { setImpersonatedCustomerId, queryClient } from "@/lib/queryClient";

interface NavigationContextType {
  selectedCustomer: Customer | null;
  selectedEvent: Event | null;
  setSelectedCustomer: (customer: Customer | null) => void;
  setSelectedEvent: (event: Event | null) => void;
  clearEventContext: () => void;
  clearAllContext: () => void;
  breadcrumbs: BreadcrumbItem[];
  isInCustomerScope: boolean;
}

interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [selectedCustomer, setSelectedCustomerState] = useState<Customer | null>(null);
  const [selectedEvent, setSelectedEventState] = useState<Event | null>(null);
  const [location] = useLocation();
  const previousLocation = useRef(location);

  const isInCustomerScope = location.startsWith("/customers/") && location !== "/customers";

  const customerScopePreservingRoutes = ["/feedback"];

  useEffect(() => {
    const wasInCustomerScope = previousLocation.current.startsWith("/customers/") && previousLocation.current !== "/customers";
    const nowInCustomerScope = location.startsWith("/customers/") && location !== "/customers";
    const isPreservingRoute = customerScopePreservingRoutes.some(r => location.startsWith(r));
    
    if (wasInCustomerScope && !nowInCustomerScope && !isPreservingRoute) {
      setSelectedCustomerState(null);
      setSelectedEventState(null);
      setImpersonatedCustomerId(null);
      prevCustomerIdRef.current = null;
    }
    
    if (nowInCustomerScope && !location.includes("/events/")) {
      setSelectedEventState(null);
    }
    
    previousLocation.current = location;
  }, [location]);

  const prevCustomerIdRef = useRef<string | null>(null);

  const setSelectedCustomer = useCallback((customer: Customer | null) => {
    const newId = customer?.id ?? null;
    const changed = newId !== prevCustomerIdRef.current;
    prevCustomerIdRef.current = newId;

    setSelectedCustomerState(customer);
    setImpersonatedCustomerId(newId);

    if (changed) {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return key !== "/api/auth/me" && key !== "/api/settings/feature-flags";
        },
      });
    }

    if (!customer) {
      setSelectedEventState(null);
    }
  }, []);

  const setSelectedEvent = useCallback((event: Event | null) => {
    setSelectedEventState(event);
  }, []);

  const clearEventContext = useCallback(() => {
    setSelectedEventState(null);
  }, []);

  const clearAllContext = useCallback(() => {
    setSelectedCustomerState(null);
    setSelectedEventState(null);
  }, []);

  const breadcrumbs: BreadcrumbItem[] = [];
  
  if (isInCustomerScope) {
    breadcrumbs.push({
      label: "Accounts",
      href: "/customers",
      current: false,
    });

    if (selectedCustomer) {
      const isOnCustomerDashboard = location === `/customers/${selectedCustomer.id}`;
      breadcrumbs.push({
        label: selectedCustomer.name,
        href: `/customers/${selectedCustomer.id}`,
        current: isOnCustomerDashboard && !selectedEvent,
      });

      if (selectedEvent && location.includes("/events/")) {
        const eventBasePath = `/customers/${selectedCustomer.id}/events/${selectedEvent.id}`;
        breadcrumbs.push({
          label: selectedEvent.name,
          href: eventBasePath,
          current: location === eventBasePath,
        });

        if (location.includes("/attendees")) {
          breadcrumbs.push({ label: "Attendees", current: true });
        } else if (location.includes("/badges")) {
          breadcrumbs.push({ label: "Badges", current: true });
        } else if (location.includes("/scanner")) {
          breadcrumbs.push({ label: "Check-in", current: true });
        } else if (location.includes("/settings")) {
          breadcrumbs.push({ label: "Settings", current: true });
        }
      }
    }
  }

  return (
    <NavigationContext.Provider
      value={{
        selectedCustomer,
        selectedEvent,
        setSelectedCustomer,
        setSelectedEvent,
        clearEventContext,
        clearAllContext,
        breadcrumbs,
        isInCustomerScope,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error("useNavigation must be used within a NavigationProvider");
  }
  return context;
}
