import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Plus, MapPin, Trash2, Edit2, Building2, Globe, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useNavigation } from '@/contexts/NavigationContext';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { Location } from '@shared/schema';

interface LocationFormData {
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  timezone: string;
  matchPatterns: string[];
}

const emptyFormData: LocationFormData = {
  name: '',
  address: '',
  city: '',
  state: '',
  country: '',
  timezone: '',
  matchPatterns: [],
};

export default function Locations() {
  const { toast } = useToast();
  const { selectedCustomer } = useNavigation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<Location | null>(null);
  const [formData, setFormData] = useState<LocationFormData>(emptyFormData);
  const [matchPatternsInput, setMatchPatternsInput] = useState('');

  const customerId = selectedCustomer?.id;

  const { data: locations = [], isLoading } = useQuery<Location[]>({
    queryKey: ['/api/locations', customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const res = await fetch(`/api/locations?customerId=${customerId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch locations');
      return res.json();
    },
    enabled: !!customerId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: LocationFormData) => {
      const response = await apiRequest('POST', '/api/locations', {
        ...data,
        customerId,
        matchPatterns: data.matchPatterns,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations', customerId] });
      toast({ title: 'Location created', description: 'The location has been added successfully.' });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<LocationFormData> }) => {
      const response = await apiRequest('PATCH', `/api/locations/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations', customerId] });
      toast({ title: 'Location updated', description: 'The location has been updated successfully.' });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/locations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations', customerId] });
      toast({ title: 'Location deleted', description: 'The location has been removed.' });
      setDeleteConfirmOpen(false);
      setLocationToDelete(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const openCreateDialog = () => {
    setEditingLocation(null);
    setFormData(emptyFormData);
    setMatchPatternsInput('');
    setDialogOpen(true);
  };

  const openEditDialog = (location: Location) => {
    setEditingLocation(location);
    setFormData({
      name: location.name,
      address: location.address || '',
      city: location.city || '',
      state: location.state || '',
      country: location.country || '',
      timezone: location.timezone || '',
      matchPatterns: (location.matchPatterns as string[]) || [],
    });
    setMatchPatternsInput(((location.matchPatterns as string[]) || []).join(', '));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingLocation(null);
    setFormData(emptyFormData);
    setMatchPatternsInput('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const patterns = matchPatternsInput
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    const submitData = { ...formData, matchPatterns: patterns };

    if (editingLocation) {
      updateMutation.mutate({ id: editingLocation.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleDelete = (location: Location) => {
    setLocationToDelete(location);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (locationToDelete) {
      deleteMutation.mutate(locationToDelete.id);
    }
  };

  if (!customerId) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>No Customer Selected</CardTitle>
            <CardDescription>Please select an account to manage locations.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Locations</h1>
          <p className="text-muted-foreground">
            Manage physical venues where your events take place. Printers can be assigned to locations.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Location
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingLocation ? 'Edit Location' : 'Add Location'}</DialogTitle>
              <DialogDescription>
                {editingLocation ? 'Update the location details.' : 'Add a new venue where events are held.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Location Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Chicago Convention Center"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Street Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="123 Main Street"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Chicago"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State/Province</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="IL"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder="USA"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input
                    id="timezone"
                    value={formData.timezone}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    placeholder="America/Chicago"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="matchPatterns">Auto-Match Patterns</Label>
                <Input
                  id="matchPatterns"
                  value={matchPatternsInput}
                  onChange={(e) => setMatchPatternsInput(e.target.value)}
                  placeholder="Chicago, McCormick Place, CHI"
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated keywords to auto-match synced events to this location
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingLocation ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : locations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Locations Yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Add your first venue location to organize events and printers by physical site.
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Location
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {locations.map((location) => (
            <Card key={location.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{location.name}</CardTitle>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEditDialog(location)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(location)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {(location.address || location.city || location.state) && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      {[location.address, location.city, location.state, location.country]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </div>
                )}
                {location.timezone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{location.timezone}</span>
                  </div>
                )}
                {((location.matchPatterns as string[]) || []).length > 0 && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Globe className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span className="text-xs">
                      Auto-match: {((location.matchPatterns as string[]) || []).join(', ')}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Location</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{locationToDelete?.name}"? This will remove the location assignment from any printers and events.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
