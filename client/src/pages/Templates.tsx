import { useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import BadgeTemplates from "@/components/BadgeTemplates";
import { useNavigation } from "@/contexts/NavigationContext";
import type { Customer } from "@shared/schema";

export default function Templates() {
  const params = useParams<{ customerId?: string }>();
  const customerId = params.customerId;
  const { selectedCustomer, setSelectedCustomer } = useNavigation();

  const { data: customer } = useQuery<Customer>({
    queryKey: ["/api/customers", customerId],
    enabled: !!customerId && (!selectedCustomer || selectedCustomer.id !== customerId),
  });

  useEffect(() => {
    if (customer && (!selectedCustomer || selectedCustomer.id !== customer.id)) {
      setSelectedCustomer(customer);
    }
  }, [customer, selectedCustomer, setSelectedCustomer]);

  return <BadgeTemplates />;
}
