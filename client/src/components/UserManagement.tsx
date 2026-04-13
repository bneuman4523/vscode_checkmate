import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { 
  Users, 
  Plus, 
  Pencil, 
  Trash2, 
  Shield, 
  UserCog, 
  User as UserIcon,
  Building,
  Mail,
  Phone,
  CheckCircle2,
  XCircle,
  Key,
  Clock
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatPhoneNumber } from "@/lib/phone-format";
import type { User, Customer, UserRole } from "@shared/schema";

const userFormSchema = z.object({
  email: z.string().email("Invalid email address"),
  phoneNumber: z.string().transform(val => {
    const digits = val.replace(/[^\d+]/g, "");
    if (digits.startsWith("+")) return "+" + digits.slice(1).replace(/\D/g, "");
    const raw = digits.replace(/\D/g, "");
    return raw ? `+${raw}` : "";
  }).pipe(z.string().regex(/^\+[1-9]\d{1,14}$/, "Please enter a valid phone number with country code")),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["super_admin", "admin", "manager", "staff"]),
  customerId: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  sendInviteSMS: z.boolean().default(true),
});

type UserFormValues = z.infer<typeof userFormSchema>;

interface AuthInfo {
  user: User;
  customer: { id: string; name: string } | null;
  isSuperAdmin: boolean;
}

export default function UserManagement() {
  const { toast } = useToast();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [settingPasswordUser, setSettingPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data: authInfo, isLoading: authLoading } = useQuery<AuthInfo>({
    queryKey: ["/api/auth/me"],
  });

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    enabled: authInfo?.isSuperAdmin,
  });

  const effectiveCustomerId = authInfo?.isSuperAdmin 
    ? selectedCustomerId 
    : authInfo?.user?.customerId;

  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users", effectiveCustomerId],
    queryFn: async () => {
      const url = effectiveCustomerId 
        ? `/api/users?customerId=${effectiveCustomerId}`
        : "/api/users";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch users");
      return response.json();
    },
    enabled: !!authInfo,
  });

  const createMutation = useMutation({
    mutationFn: async (data: UserFormValues) => {
      return apiRequest("POST", "/api/users", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsCreateDialogOpen(false);
      toast({ title: "User created successfully" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to create user", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<UserFormValues> }) => {
      return apiRequest("PATCH", `/api/users/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditingUser(null);
      toast({ title: "User updated successfully" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to update user", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setDeletingUser(null);
      toast({ title: "User deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to delete user", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      return apiRequest("POST", `/api/users/${id}/set-password`, { password });
    },
    onSuccess: () => {
      setSettingPasswordUser(null);
      setNewPassword("");
      toast({ title: "Password set successfully", description: "The user can now log in with the new password." });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to set password", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "super_admin":
        return <Shield className="h-4 w-4" />;
      case "admin":
        return <UserCog className="h-4 w-4" />;
      default:
        return <UserIcon className="h-4 w-4" />;
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "super_admin":
        return "default";
      case "admin":
        return "secondary";
      default:
        return "outline";
    }
  };

  const availableRoles = (): UserRole[] => {
    if (authInfo?.isSuperAdmin) {
      return ["super_admin", "admin", "manager", "staff"];
    }
    return ["admin", "manager", "staff"];
  };

  if (authLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (!authInfo?.user || !["super_admin", "admin"].includes(authInfo.user.role)) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-medium mb-2">Access Denied</h3>
          <p className="text-muted-foreground">
            Only admins can manage users.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="h-6 w-6" />
            User Management
          </h2>
          <p className="text-muted-foreground mt-1">
            {authInfo.isSuperAdmin 
              ? "Manage users across all accounts"
              : `Manage users for ${authInfo.customer?.name || "your organization"}`
            }
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {authInfo.isSuperAdmin && (
            <Select
              value={selectedCustomerId || "all"}
              onValueChange={(v) => setSelectedCustomerId(v === "all" ? null : v)}
            >
              <SelectTrigger className="w-[200px]" data-testid="select-customer-filter">
                <Building className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-add-user">
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </div>
      </div>

      {usersLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-medium mb-2">No Users Found</h3>
            <p className="text-muted-foreground mb-4">
              {selectedCustomerId 
                ? "No users in this account yet."
                : "Get started by creating your first user."
              }
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {users.map((user) => (
            <Card key={user.id} className="hover-elevate" data-testid={`card-user-${user.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate flex items-center gap-2">
                      {user.firstName} {user.lastName}
                      {user.id === authInfo.user.id && (
                        <Badge variant="outline" className="text-xs">You</Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-1 truncate">
                      <Mail className="h-3 w-3" />
                      {user.email}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  <Badge 
                    variant={getRoleBadgeVariant(user.role) as "default" | "secondary" | "outline"}
                    className="gap-1"
                  >
                    {getRoleIcon(user.role)}
                    {user.role.replace("_", " ")}
                  </Badge>
                  <Badge variant={user.isActive ? "outline" : "destructive"} className="gap-1 text-xs">
                    {user.isActive ? (
                      <><CheckCircle2 className="h-3 w-3" /> Active</>
                    ) : (
                      <><XCircle className="h-3 w-3" /> Inactive</>
                    )}
                  </Badge>
                  {user.phoneNumber && (
                    <Badge variant="outline" className="gap-1 text-xs">
                      <Phone className="h-3 w-3" /> SMS
                    </Badge>
                  )}
                  {authInfo.isSuperAdmin && user.customerId && (
                    <Badge variant="outline" className="gap-1 text-xs">
                      <Building className="h-3 w-3" />
                      {customers.find(c => c.id === user.customerId)?.name || "Unknown"}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {user.lastLoginAt
                      ? `Last login ${formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })}`
                      : "Never logged in"}
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingUser(user)}
                      data-testid={`button-edit-user-${user.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeletingUser(user)}
                      disabled={user.id === authInfo.user.id}
                      data-testid={`button-delete-user-${user.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <UserDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        mode="create"
        isSuperAdmin={authInfo.isSuperAdmin}
        customers={customers}
        defaultCustomerId={effectiveCustomerId}
        availableRoles={availableRoles()}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />

      {editingUser && (
        <UserDialog
          open={!!editingUser}
          onOpenChange={(open) => !open && setEditingUser(null)}
          mode="edit"
          user={editingUser}
          isSuperAdmin={authInfo.isSuperAdmin}
          customers={customers}
          defaultCustomerId={editingUser.customerId}
          availableRoles={availableRoles()}
          onSubmit={(data) => updateMutation.mutate({ id: editingUser.id, data })}
          isPending={updateMutation.isPending}
        />
      )}

      <AlertDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deletingUser?.firstName} {deletingUser?.lastName}? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingUser && deleteMutation.mutate(deletingUser.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog 
        open={!!settingPasswordUser} 
        onOpenChange={(open) => {
          if (!open) {
            setSettingPasswordUser(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Password</DialogTitle>
            <DialogDescription>
              Set a new password for {settingPasswordUser?.firstName} {settingPasswordUser?.lastName}. 
              They can use this to log in with their email address.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 8 characters)"
                data-testid="input-new-password"
              />
              {newPassword && newPassword.length < 8 && (
                <p className="text-sm text-destructive">Password must be at least 8 characters</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setSettingPasswordUser(null);
                setNewPassword("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (settingPasswordUser && newPassword.length >= 8) {
                  setPasswordMutation.mutate({ id: settingPasswordUser.id, password: newPassword });
                }
              }}
              disabled={!newPassword || newPassword.length < 8 || setPasswordMutation.isPending}
              data-testid="button-confirm-set-password"
            >
              {setPasswordMutation.isPending ? "Setting..." : "Set Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  user?: User;
  isSuperAdmin: boolean;
  customers: Customer[];
  defaultCustomerId: string | null | undefined;
  availableRoles: UserRole[];
  onSubmit: (data: UserFormValues) => void;
  isPending: boolean;
}

function UserDialog({
  open,
  onOpenChange,
  mode,
  user,
  isSuperAdmin,
  customers,
  defaultCustomerId,
  availableRoles,
  onSubmit,
  isPending,
}: UserDialogProps) {
  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      email: "",
      phoneNumber: "",
      firstName: "",
      lastName: "",
      role: "staff",
      customerId: defaultCustomerId || null,
      isActive: true,
      sendInviteSMS: true,
    },
  });

  useEffect(() => {
    if (open) {
      if (mode === "edit" && user) {
        form.reset({
          email: user.email || "",
          phoneNumber: user.phoneNumber || "",
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          role: (user.role as UserRole) || "staff",
          customerId: user.customerId || defaultCustomerId || null,
          isActive: user.isActive ?? true,
          sendInviteSMS: false,
        });
      } else {
        form.reset({
          email: "",
          phoneNumber: "",
          firstName: "",
          lastName: "",
          role: "staff",
          customerId: defaultCustomerId || null,
          isActive: true,
          sendInviteSMS: true,
        });
      }
    }
  }, [open, mode, user, defaultCustomerId, form]);

  const selectedRole = form.watch("role");

  const handleSubmit = (data: UserFormValues) => {
    if (data.role === "super_admin") {
      data.customerId = null;
    }
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create New User" : "Edit User"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create" 
              ? "Add a new user to the system."
              : "Update user information and permissions."
            }
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      type="email" 
                      placeholder="user@example.com"
                      disabled={mode === "edit"}
                      data-testid="input-user-email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      type="tel" 
                      placeholder="+1 (555) 123-4567"
                      data-testid="input-user-phone"
                      onChange={(e) => field.onChange(formatPhoneNumber(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground">
                    E.164 format required (e.g., +15551234567). Used for SMS access codes.
                  </p>
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="John" data-testid="input-user-firstname" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Doe" data-testid="input-user-lastname" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role <span className="text-destructive">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-user-role">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {isSuperAdmin && selectedRole !== "super_admin" && (
              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value || undefined}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-user-customer">
                          <SelectValue placeholder="Select a customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {mode === "edit" && (
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Active Status</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Inactive users cannot log in
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-user-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

            {mode === "create" && (
              <FormField
                control={form.control}
                name="sendInviteSMS"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 bg-blue-50 dark:bg-blue-950">
                    <div className="space-y-0.5">
                      <FormLabel>Send Welcome SMS</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Notify user they can log in with their phone number
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-send-invite"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-submit-user">
                {isPending 
                  ? (mode === "create" ? "Creating..." : "Saving...") 
                  : (mode === "create" ? "Create User" : "Save Changes")
                }
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
