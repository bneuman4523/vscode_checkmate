import { useParams } from "wouter";
import { useEffect } from "react";
import { useNavigation } from "@/contexts/NavigationContext";
import { useQuery } from "@tanstack/react-query";
import type { Customer } from "@shared/schema";
import IntegrationSetup from "@/components/IntegrationSetup";
import { Skeleton } from "@/components/ui/skeleton";

export default function CustomerIntegrations() {
  const { customerId } = useParams<{ customerId: string }>();
  const { setSelectedCustomer } = useNavigation();

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ["/api/customers", customerId],
    enabled: !!customerId,
  });

  useEffect(() => {
    if (customer) {
      setSelectedCustomer(customer);
    }
  }, [customer, setSelectedCustomer]);

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="page-customer-integrations">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="page-customer-integrations">
      <IntegrationSetup />
    </div>
  );
}
