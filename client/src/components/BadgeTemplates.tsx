import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Plus, Edit, Copy, Trash2, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import BadgeDesigner from "./BadgeDesigner";
import ReadOnlyBadgePreview from "./ReadOnlyBadgePreview";
import FlippableBadge from "./FlippableBadge";
import { useNavigation } from "@/contexts/NavigationContext";

import { useToast } from "@/hooks/use-toast";
import type { BadgeTemplate } from "@shared/schema";

export default function BadgeTemplates() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<BadgeTemplate | null>(null);
  const { selectedCustomer } = useNavigation();
  const customerId = selectedCustomer?.id;
  const { toast } = useToast();

  const { data: templates = [], isLoading } = useQuery<BadgeTemplate[]>({
    queryKey: [`/api/badge-templates?customerId=${customerId}`],
    enabled: !!customerId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!customerId) {
        throw new Error("Customer context not available");
      }
      const res = await apiRequest("POST", "/api/badge-templates", {
        ...data,
        customerId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/badge-templates?customerId=${customerId}`] });
      setCreateDialogOpen(false);
      toast({ title: "Template created", description: "Badge template has been saved successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create template", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/badge-templates/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/badge-templates?customerId=${customerId}`] });
      setEditDialogOpen(false);
      setSelectedTemplate(null);
      toast({ title: "Template updated", description: "Badge template has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update template", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/badge-templates/${id}`);
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/badge-templates?customerId=${customerId}`] });
      setDeleteDialogOpen(false);
      setSelectedTemplate(null);
      toast({ title: "Template deleted", description: "Badge template has been deleted." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete template", description: error.message, variant: "destructive" });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (template: BadgeTemplate) => {
      const { id, createdAt, ...rest } = template;
      const res = await apiRequest("POST", "/api/badge-templates", {
        ...rest,
        name: `${template.name} (Copy)`.slice(0, 50),
        customerId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/badge-templates?customerId=${customerId}`] });
      toast({ title: "Template duplicated", description: "A copy of the template has been created." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to duplicate template", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (template: BadgeTemplate) => {
    setSelectedTemplate(template);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (template: BadgeTemplate) => {
    setSelectedTemplate(template);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedTemplate) {
      deleteMutation.mutate(selectedTemplate.id);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Badge Templates</h1>
            <p className="text-muted-foreground">
              Design badge layouts for attendee types - used across all your events
            </p>
          </div>
          <Button disabled>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-3 w-16" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="aspect-[3/4] w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 w-8" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Badge Templates</h1>
          <p className="text-muted-foreground">
            Design badge layouts for attendee types - used across all your events
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-template">
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Design Badge Template</DialogTitle>
              <DialogDescription>
                Customize badge size, colors, and merge fields from attendee data
              </DialogDescription>
            </DialogHeader>
            <BadgeDesigner
              customerId={customerId}
              onSave={(data) => {
                createMutation.mutate(data);
              }}
              onCancel={() => setCreateDialogOpen(false)}
              isSaving={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {templates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Plus className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No Badge Templates</h3>
            <p className="text-muted-foreground mb-4 max-w-sm">
              Create badge templates to design how attendee badges will look at your events.
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-add-first-template">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {templates.map((template) => (
            <Card key={template.id} data-testid={`template-${template.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <CardTitle className="text-base truncate">{template.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {template.width}" × {template.height}"
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="text-xs flex-shrink-0">
                    {template.includeQR ? "QR" : "No QR"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {(template as any).layoutMode === 'foldable' ? (
                  <FlippableBadge
                    front={<ReadOnlyBadgePreview template={template} maxWidth={200} renderSide="front" />}
                    back={<ReadOnlyBadgePreview template={template} maxWidth={200} renderSide="back" />}
                    flipOnHover
                    showFlipButton={false}
                  />
                ) : (
                  <ReadOnlyBadgePreview template={template} maxWidth={200} />
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEdit(template)}
                    data-testid={`button-edit-${template.id}`}
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => duplicateMutation.mutate(template)}
                    disabled={duplicateMutation.isPending}
                    data-testid={`button-duplicate-${template.id}`}
                  >
                    {duplicateMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleDeleteClick(template)}
                    data-testid={`button-delete-${template.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) setSelectedTemplate(null);
      }}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Badge Template</DialogTitle>
            <DialogDescription>
              Update badge design, colors, and merge fields
            </DialogDescription>
          </DialogHeader>
          {selectedTemplate && (
            <BadgeDesigner
              templateId={selectedTemplate.id}
              customerId={customerId}
              initialData={selectedTemplate}
              onSave={(data) => {
                updateMutation.mutate({ id: selectedTemplate.id, data });
              }}
              onCancel={() => {
                setEditDialogOpen(false);
                setSelectedTemplate(null);
              }}
              isSaving={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Badge Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{selectedTemplate?.name}". This action cannot be undone.
              Events using this template will need to select a different template.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Delete Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
