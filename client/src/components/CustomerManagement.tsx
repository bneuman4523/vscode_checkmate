import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Building2, Plus, MoreVertical, ChevronRight, Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";
import { useNavigation } from "@/contexts/NavigationContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Customer {
  id: string;
  name: string;
  contactEmail: string;
  apiBaseUrl?: string | null;
  status: "active" | "inactive";
  createdAt: Date;
}

export default function CustomerManagement() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", apiBaseUrl: "", notes: "" });
  const [, setLocation] = useLocation();
  const { setSelectedCustomer } = useNavigation();
  const { toast } = useToast();

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomerLocal] = useState<Customer | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const response = await apiRequest(
        "POST",
        "/api/customers",
        {
          name: data.name,
          contactEmail: data.email,
          apiBaseUrl: data.apiBaseUrl || null,
          status: "active",
        }
      );
      return response.json();
    },
    onSuccess: (newCustomer: Customer) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Customer created", description: `${newCustomer.name} has been created successfully.` });
      setFormData({ name: "", email: "", apiBaseUrl: "", notes: "" });
      setDialogOpen(false);
    },
    onError: (error: Error) => {
      console.error("Customer creation error:", error);
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to create customer" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Customer> }) => {
      const response = await apiRequest("PATCH", `/api/customers/${id}`, data);
      return response.json();
    },
    onSuccess: (updatedCustomer: Customer) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Customer updated", description: `${updatedCustomer.name} has been updated.` });
      setRenameDialogOpen(false);
      setDeactivateDialogOpen(false);
      setSelectedCustomerLocal(null);
      setNewName("");
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to update customer" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/customers/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Customer deleted", description: "The customer and all related data have been permanently deleted." });
      setDeleteDialogOpen(false);
      setSelectedCustomerLocal(null);
      setDeleteConfirmText("");
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to delete customer" });
    },
  });

  const handleCustomerClick = (customer: Customer) => {
    setSelectedCustomer({
      id: customer.id,
      name: customer.name,
      contactEmail: customer.contactEmail,
      apiBaseUrl: customer.apiBaseUrl || null,
      status: customer.status,
      createdAt: customer.createdAt,
    });
    setLocation(`/customers/${customer.id}`);
  };

  const handleCreateCustomer = () => {
    if (!formData.name.trim() || !formData.email.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Please fill in required fields" });
      return;
    }
    createMutation.mutate(formData);
  };

  const openRenameDialog = (customer: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCustomerLocal(customer);
    setNewName(customer.name);
    setNewEmail(customer.contactEmail || "");
    setRenameDialogOpen(true);
  };

  const openDeactivateDialog = (customer: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCustomerLocal(customer);
    setDeactivateDialogOpen(true);
  };

  const openDeleteDialog = (customer: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCustomerLocal(customer);
    setDeleteConfirmText("");
    setDeleteDialogOpen(true);
  };

  const handleRename = () => {
    if (!selectedCustomer || !newName.trim() || !newEmail.trim()) return;
    updateMutation.mutate({ id: selectedCustomer.id, data: { name: newName.trim(), contactEmail: newEmail.trim() } });
  };

  const handleDeactivate = () => {
    if (!selectedCustomer) return;
    updateMutation.mutate({ id: selectedCustomer.id, data: { status: "inactive" } });
  };

  const handleReactivate = (customer: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    updateMutation.mutate({ id: customer.id, data: { status: "active" } });
  };

  const handleDelete = () => {
    if (!selectedCustomer || deleteConfirmText !== selectedCustomer.name) return;
    deleteMutation.mutate(selectedCustomer.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Accounts</h1>
          <p className="text-muted-foreground">
            Manage customer organizations and their access
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-customer">
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Account</DialogTitle>
              <DialogDescription>
                Set up a new customer organization with admin access
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="customer-name">Organization Name</Label>
                <Input
                  id="customer-name"
                  placeholder="Tech Conference Inc"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  data-testid="input-customer-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-email">Admin Email</Label>
                <Input
                  id="customer-email"
                  type="email"
                  placeholder="admin@company.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  data-testid="input-customer-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="api-base-url">API Base URL (Optional)</Label>
                <Input
                  id="api-base-url"
                  type="url"
                  placeholder="https://api.yourplatform.com/v1"
                  value={formData.apiBaseUrl}
                  onChange={(e) => setFormData({ ...formData, apiBaseUrl: e.target.value })}
                  data-testid="input-api-base-url"
                />
                <p className="text-xs text-muted-foreground">
                  Default base URL for this customer's API integrations
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateCustomer}
                disabled={createMutation.isPending}
                data-testid="button-submit-customer"
              >
                {createMutation.isPending ? "Creating..." : "Create Account"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && (
        <div className="text-center text-muted-foreground">Loading customers...</div>
      )}

      {!isLoading && customers.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No accounts yet</p>
            <p className="text-sm text-muted-foreground/70">Create your first account to get started</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {customers.map((customer) => (
          <Card 
            key={customer.id} 
            className={`hover-elevate cursor-pointer group ${customer.status === "inactive" ? "opacity-60" : ""}`}
            data-testid={`card-customer-${customer.id}`}
            onClick={() => handleCustomerClick(customer)}
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-md ${customer.status === "inactive" ? "bg-muted" : "bg-primary/10"}`}>
                  <Building2 className={`h-5 w-5 ${customer.status === "inactive" ? "text-muted-foreground" : "text-primary"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base truncate">{customer.name}</CardTitle>
                  <CardDescription className="text-xs truncate">
                    {customer.contactEmail}
                  </CardDescription>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    data-testid={`button-customer-actions-${customer.id}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem onClick={() => handleCustomerClick(customer)}>
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => openRenameDialog(customer, e)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {customer.status === "active" ? (
                    <DropdownMenuItem 
                      className="text-orange-600"
                      onClick={(e) => openDeactivateDialog(customer, e)}
                    >
                      <PowerOff className="h-4 w-4 mr-2" />
                      Deactivate Account
                    </DropdownMenuItem>
                  ) : (
                    <>
                      <DropdownMenuItem 
                        className="text-green-600"
                        onClick={(e) => handleReactivate(customer, e)}
                      >
                        <Power className="h-4 w-4 mr-2" />
                        Reactivate Account
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={(e) => openDeleteDialog(customer, e)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Permanently Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>
            <CardContent className="space-y-3">
              {customer.apiBaseUrl && (
                <div className="text-sm">
                  <span className="text-muted-foreground">API Base URL</span>
                  <p className="font-mono text-xs truncate">{customer.apiBaseUrl}</p>
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                {customer.contactEmail}
              </div>
              <div className="flex items-center justify-between pt-2">
                <Badge
                  variant={customer.status === "active" ? "default" : "secondary"}
                >
                  {customer.status === "active" ? "Active" : "Inactive"}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
            <DialogDescription>
              Update the account name and contact email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-name">Account Name</Label>
              <Input
                id="new-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter account name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email">Contact Email</Label>
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Enter contact email"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleRename}
              disabled={updateMutation.isPending || !newName.trim() || !newEmail.trim()}
            >
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Account</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to deactivate <strong>{selectedCustomer?.name}</strong>?
              </p>
              <p className="text-sm">
                This will:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>Mark the account as inactive</li>
                <li>Preserve all data (events, attendees, templates, integrations)</li>
                <li>Allow reactivation at any time</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                After deactivating, you will have the option to permanently delete the account and all its data.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeactivate}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {updateMutation.isPending ? "Deactivating..." : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Permanently Delete Account</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This action <strong>cannot be undone</strong>. This will permanently delete:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>The account</li>
                <li>All events and attendees</li>
                <li>All badge templates</li>
                <li>All integrations and credentials</li>
                <li>All activity logs and sync history</li>
              </ul>
              <div className="pt-4">
                <Label htmlFor="confirm-delete" className="text-sm">
                  Type <strong>{selectedCustomer?.name}</strong> to confirm:
                </Label>
                <Input
                  id="confirm-delete"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Enter customer name to confirm"
                  className="mt-2"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmText("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              disabled={deleteConfirmText !== selectedCustomer?.name || deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Permanently Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
