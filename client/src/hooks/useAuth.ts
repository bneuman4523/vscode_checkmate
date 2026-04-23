import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

interface AuthUser {
  user: User;
  customer: { id: string; name: string } | null;
  isSuperAdmin?: boolean;
  isPartner?: boolean;
  assignedCustomerIds?: string[];
}

export function useAuth() {
  const { data, isLoading, error } = useQuery<AuthUser>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  return {
    user: data?.user,
    customer: data?.customer,
    isLoading,
    isAuthenticated: !!data?.user,
    isPartner: data?.isPartner ?? false,
    assignedCustomerIds: data?.assignedCustomerIds,
    error,
  };
}
