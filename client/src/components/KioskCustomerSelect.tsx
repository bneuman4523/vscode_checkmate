import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Monitor, 
  Building2, 
  ChevronRight,
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Customer } from "@shared/schema";

interface KioskCustomerSelectProps {
  onSelect: (customerId: string) => void;
}

export default function KioskCustomerSelect({ onSelect }: KioskCustomerSelectProps) {
  const { data: customers = [], isLoading, error, refetch } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const activeCustomers = customers.filter(c => c.status === "active");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-4xl space-y-6">
          <div className="text-center space-y-4">
            <Skeleton className="h-16 w-16 rounded-full mx-auto" />
            <Skeleton className="h-10 w-64 mx-auto" />
            <Skeleton className="h-6 w-96 mx-auto" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h3 className="text-xl font-medium mb-2">Failed to Load</h3>
            <p className="text-muted-foreground mb-4">
              Could not load customer list. Please try again.
            </p>
            <Button onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary mb-4">
            <Monitor className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-semibold mb-2">Kiosk Mode</h1>
          <p className="text-lg text-muted-foreground">
            Select your organization to set up the check-in kiosk
          </p>
        </div>

        {activeCustomers.length === 0 ? (
          <Card className="border-2 border-dashed">
            <CardContent className="py-12 text-center">
              <Building2 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-medium mb-2">No Organizations Available</h3>
              <p className="text-muted-foreground mb-4">
                There are no active organizations configured for kiosk mode.
              </p>
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {activeCustomers.map((customer) => (
              <Card
                key={customer.id}
                className="cursor-pointer hover-elevate transition-all"
                onClick={() => onSelect(customer.id)}
                data-testid={`card-customer-${customer.id}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate" data-testid={`text-customer-name-${customer.id}`}>
                        {customer.name}
                      </CardTitle>
                      {customer.contactEmail && (
                        <CardDescription className="truncate">
                          {customer.contactEmail}
                        </CardDescription>
                      )}
                    </div>
                    <Badge variant="secondary">
                      {customer.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Building2 className="h-4 w-4" />
                      <span>Select to view events</span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-8 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Kiosk Security</p>
              <p>
                Kiosk mode is scoped to a single organization's events for security. 
                After selecting your organization, you'll set an exit PIN to prevent 
                unauthorized access to device settings.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
