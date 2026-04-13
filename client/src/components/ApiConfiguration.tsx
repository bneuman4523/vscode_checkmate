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
import { Plus, Settings, Cloud, Trash2, Play } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

interface ApiEndpoint {
  name: string;
  path: string;
  method: string;
  transformRequest?: string;
  transformResponse?: string;
}

interface ApiConfigurationProps {
  customerId?: string;
  customerBaseUrl?: string;
}

export default function ApiConfiguration({ customerId, customerBaseUrl }: ApiConfigurationProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([
    {
      name: "getAttendees",
      path: "/api/events/{{eventId}}/attendees",
      method: "GET",
    },
  ]);

  const addEndpoint = () => {
    setEndpoints([
      ...endpoints,
      {
        name: `endpoint${endpoints.length + 1}`,
        path: "/api/",
        method: "GET",
      },
    ]);
  };

  if (!customerId) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">Select an account to manage API integrations</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">API Integrations</h1>
          <p className="text-muted-foreground">
            Configure external platform connections and data synchronization
          </p>
          {customerBaseUrl && (
            <p className="text-xs text-muted-foreground mt-1">
              Default Base URL: <code className="font-mono">{customerBaseUrl}</code>
            </p>
          )}
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-api">
              <Plus className="h-4 w-4 mr-2" />
              New Integration
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Configure API Integration</DialogTitle>
              <DialogDescription>
                Set up connection to external event platform with custom transformations
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="basic">Basic</TabsTrigger>
                <TabsTrigger value="auth">Authentication</TabsTrigger>
                <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
                <TabsTrigger value="transformations">Transformations</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="api-name">Integration Name</Label>
                  <Input
                    id="api-name"
                    placeholder="My API Integration"
                    data-testid="input-api-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="base-url">Base URL</Label>
                  <Input
                    id="base-url"
                    placeholder={customerBaseUrl || "https://api.example.com/v1"}
                    defaultValue={customerBaseUrl}
                    data-testid="input-base-url"
                  />
                  {customerBaseUrl && (
                    <p className="text-xs text-muted-foreground">
                      Using customer default base URL (can be overridden)
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="auth" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="auth-type">Authentication Type</Label>
                  <Select defaultValue="bearer">
                    <SelectTrigger id="auth-type" data-testid="select-auth-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bearer">Bearer Token</SelectItem>
                      <SelectItem value="apikey">API Key</SelectItem>
                      <SelectItem value="basic">Basic Auth</SelectItem>
                      <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api-token">API Token / Key</Label>
                  <Input
                    id="api-token"
                    type="password"
                    placeholder="Enter your API token"
                    data-testid="input-api-token"
                  />
                  <p className="text-xs text-muted-foreground">
                    Credentials are encrypted and stored securely, never in plain text
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="endpoints" className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base">API Endpoints</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addEndpoint}
                    data-testid="button-add-endpoint"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Endpoint
                  </Button>
                </div>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {endpoints.map((endpoint, index) => (
                    <Card key={index}>
                      <CardContent className="pt-4 space-y-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Endpoint Name</Label>
                            <Input
                              value={endpoint.name}
                              placeholder="getAttendees"
                              data-testid={`input-endpoint-name-${index}`}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">HTTP Method</Label>
                            <Select defaultValue={endpoint.method}>
                              <SelectTrigger data-testid={`select-method-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="GET">GET</SelectItem>
                                <SelectItem value="POST">POST</SelectItem>
                                <SelectItem value="PUT">PUT</SelectItem>
                                <SelectItem value="PATCH">PATCH</SelectItem>
                                <SelectItem value="DELETE">DELETE</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Path (use {"{"}{"{"} variables {"}"}{"}"} )</Label>
                          <Input
                            value={endpoint.path}
                            placeholder="/api/events/{{eventId}}/attendees"
                            data-testid={`input-endpoint-path-${index}`}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-destructive"
                          onClick={() => setEndpoints(endpoints.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Remove
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="transformations" className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="request-transform">Request Transformation</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Transform data before sending to API. Use safe expressions like: rename, map, pick, wrap.
                    </p>
                    <Textarea
                      id="request-transform"
                      placeholder={`rename({ "firstName": "first_name", "lastName": "last_name" })`}
                      rows={4}
                      className="font-mono text-xs"
                      data-testid="input-request-transform"
                    />
                  </div>
                  <Separator />
                  <div>
                    <Label htmlFor="response-transform">Response Transformation</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Transform API response data. Use safe expressions: pick("attendees"), rename(&#123;...&#125;), map("items", &#123;...&#125;).
                    </p>
                    <Textarea
                      id="response-transform"
                      placeholder={`pick("attendees") | rename({ "first_name": "firstName", "last_name": "lastName" })`}
                      rows={4}
                      className="font-mono text-xs"
                      data-testid="input-response-transform"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setDialogOpen(false);
                }}
                data-testid="button-save-api"
              >
                Save Integration
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Certain Integration</CardTitle>
              </div>
              <Badge variant="default">Connected</Badge>
            </div>
            <CardDescription>Last synced 2 minutes ago</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Base URL:</span>
              <p className="font-mono text-xs">https://api.certain.com</p>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Endpoints:</span>
              <p className="text-xs">3 configured</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1">
                <Settings className="h-3 w-3 mr-1" />
                Configure
              </Button>
              <Button variant="outline" size="sm" className="flex-1">
                <Play className="h-3 w-3 mr-1" />
                Test
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Custom Platform</CardTitle>
              </div>
              <Badge variant="secondary">Draft</Badge>
            </div>
            <CardDescription>Not yet configured</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" className="w-full">
              <Settings className="h-3 w-3 mr-1" />
              Complete Setup
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
