import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useEmc } from "@/lib/emc-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Wifi, WifiOff, Key, RefreshCw, Copy, Shield, ArrowUpDown, Clock, AlertTriangle, CheckCircle2, XCircle, Loader2, ServerCrash, Trash2 } from "lucide-react";
import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function LfsManagementPage() {
  const { selectedPropertyId } = useEmc();
  const { toast } = useToast();
  const [newRawKey, setNewRawKey] = useState<string | null>(null);

  const { data: properties } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/properties"],
  });
  const selectedProperty = properties?.find((p) => p.id === selectedPropertyId);

  const { data: lfsConfig, isLoading: configLoading } = useQuery({
    queryKey: ["/api/emc/lfs-config", selectedPropertyId],
    queryFn: () => apiRequest("GET", `/api/emc/lfs-config/${selectedPropertyId}`).then(r => r.json()),
    enabled: !!selectedPropertyId,
  });

  const { data: syncLogs, isLoading: logsLoading } = useQuery({
    queryKey: ["/api/emc/lfs-sync-logs", selectedPropertyId],
    queryFn: () => apiRequest("GET", `/api/emc/lfs-sync-logs/${selectedPropertyId}?limit=20`).then(r => r.json()),
    enabled: !!selectedPropertyId,
  });

  const generateKeyMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/emc/lfs-config/${selectedPropertyId}/generate-key`).then(r => r.json()),
    onSuccess: (data) => {
      setNewRawKey(data.rawKey);
      queryClient.invalidateQueries({ queryKey: ["/api/emc/lfs-config", selectedPropertyId] });
      toast({ title: "API Key Generated", description: "Copy the key now — it will not be shown again." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to generate key", variant: "destructive" });
    },
  });

  const rotateKeyMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/emc/lfs-config/${selectedPropertyId}/rotate-key`).then(r => r.json()),
    onSuccess: (data: { rawKey: string }) => {
      setNewRawKey(data.rawKey);
      queryClient.invalidateQueries({ queryKey: ["/api/emc/lfs-config", selectedPropertyId] });
      toast({ title: "API Key Rotated", description: "Copy the new key now — it will not be shown again." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to rotate key", variant: "destructive" });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/emc/lfs-config/${selectedPropertyId}/revoke-key`).then(r => r.json()),
    onSuccess: () => {
      setNewRawKey(null);
      queryClient.invalidateQueries({ queryKey: ["/api/emc/lfs-config", selectedPropertyId] });
      toast({ title: "API Key Revoked", description: "The LFS for this property will no longer be able to sync." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to revoke key", variant: "destructive" });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "API key copied to clipboard" });
  };

  if (!selectedPropertyId) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]" data-testid="lfs-no-property">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <ServerCrash className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Select a property from the sidebar to manage its Local Failover Server.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const syncStatusBadge = (status: string | null | undefined) => {
    switch (status) {
      case "connected":
        return <Badge variant="default" className="bg-green-600" data-testid="status-connected"><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</Badge>;
      case "error":
        return <Badge variant="destructive" data-testid="status-error"><XCircle className="h-3 w-3 mr-1" /> Error</Badge>;
      case "never_connected":
      default:
        return <Badge variant="secondary" data-testid="status-never-connected"><WifiOff className="h-3 w-3 mr-1" /> Never Connected</Badge>;
    }
  };

  const logStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    }
  };

  const formatTimestamp = (ts: string | null | undefined) => {
    if (!ts) return "Never";
    return new Date(ts).toLocaleString();
  };

  return (
    <div className="p-6 space-y-6" data-testid="lfs-management-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Local Failover Server</h1>
          <p className="text-muted-foreground mt-1">
            Manage the LFS connection for <strong>{selectedProperty?.name || "this property"}</strong>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-connection-status">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Connection Status</CardTitle>
          </CardHeader>
          <CardContent>
            {configLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <div className="space-y-2">
                {syncStatusBadge(lfsConfig?.syncStatus)}
                {lfsConfig?.lastSyncAt && (
                  <p className="text-xs text-muted-foreground mt-1" data-testid="text-last-sync">
                    Last sync: {formatTimestamp(lfsConfig.lastSyncAt)}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-lfs-version">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">LFS Version</CardTitle>
          </CardHeader>
          <CardContent>
            {configLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <p className="text-lg font-semibold" data-testid="text-lfs-version">
                {lfsConfig?.lfsVersion || "—"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-last-sync-ip">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Last Sync IP</CardTitle>
          </CardHeader>
          <CardContent>
            {configLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <p className="text-lg font-semibold font-mono" data-testid="text-last-ip">
                {lfsConfig?.lastSyncIp || "—"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-config-summary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            Configuration Summary
          </CardTitle>
          <CardDescription>LFS connection details for this property</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Property ID</p>
              <p className="font-mono text-sm font-medium" data-testid="text-config-property-id">{selectedPropertyId}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Property Name</p>
              <p className="text-sm font-medium" data-testid="text-config-property-name">{selectedProperty?.name || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Cloud API URL</p>
              <p className="font-mono text-sm font-medium" data-testid="text-config-cloud-url">{window.location.origin}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">API Key Status</p>
              <p className="text-sm font-medium" data-testid="text-config-key-status">
                {lfsConfig?.apiKey ? (
                  <Badge variant="default" className="bg-green-600">Active</Badge>
                ) : (
                  <Badge variant="secondary">Not Configured</Badge>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="text-sm font-medium" data-testid="text-config-created">{formatTimestamp(lfsConfig?.createdAt)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Last Updated</p>
              <p className="text-sm font-medium" data-testid="text-config-updated">{formatTimestamp(lfsConfig?.updatedAt)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sync Interval</p>
              <p className="text-sm font-medium" data-testid="text-config-sync-interval">
                {lfsConfig ? "30 seconds (automatic)" : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-api-key">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Key Management
          </CardTitle>
          <CardDescription>
            Generate an API key for this property's LFS to authenticate with the cloud. The Property ID for LFS setup is: <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" data-testid="text-property-code">{selectedPropertyId}</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lfsConfig && lfsConfig.apiKey ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium">Active API Key</p>
                  <p className="text-sm text-muted-foreground font-mono" data-testid="text-masked-key">{lfsConfig.apiKey}</p>
                </div>
              </div>

              {newRawKey && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4" data-testid="card-new-key">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Copy this key now — it will not be shown again</p>
                      <div className="mt-2 flex items-center gap-2">
                        <code className="bg-white dark:bg-black px-3 py-1.5 rounded border text-xs font-mono break-all" data-testid="text-raw-key">{newRawKey}</code>
                        <Button variant="outline" size="sm" onClick={() => copyToClipboard(newRawKey)} data-testid="button-copy-key">
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => rotateKeyMutation.mutate()}
                  disabled={rotateKeyMutation.isPending}
                  data-testid="button-rotate-key"
                >
                  {rotateKeyMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Rotate Key
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={revokeKeyMutation.isPending} data-testid="button-revoke-key">
                      {revokeKeyMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                      Revoke Key
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Revoke LFS API Key?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will immediately disconnect the Local Failover Server for this property.
                        It will no longer be able to sync data with the cloud until a new key is generated.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-cancel-revoke">Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => revokeKeyMutation.mutate()} data-testid="button-confirm-revoke">Revoke</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-muted-foreground">
                <WifiOff className="h-5 w-5" />
                <p className="text-sm">No API key configured. Generate one to enable LFS sync for this property.</p>
              </div>
              <Button
                onClick={() => generateKeyMutation.mutate()}
                disabled={generateKeyMutation.isPending}
                data-testid="button-generate-key"
              >
                {generateKeyMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Key className="h-4 w-4 mr-2" />}
                Generate API Key
              </Button>
            </div>
          )}

          <div className="mt-4 p-3 bg-muted/50 rounded-lg" data-testid="card-first-run-setup">
            <h4 className="text-sm font-medium mb-2">LFS First-Run Setup</h4>
            <p className="text-xs text-muted-foreground mb-2">
              Generate your API key in EMC under your Property &gt; Local Failover Server, then configure the LFS machine:
            </p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Generate an API key above (or rotate an existing one)</li>
              <li>On the LFS machine, set <code className="bg-muted px-1 rounded">CLOUD_API_URL</code> to <code className="bg-muted px-1 rounded font-mono">{window.location.origin}</code></li>
              <li>Set <code className="bg-muted px-1 rounded">LFS_API_KEY</code> to the generated key</li>
              <li>Set <code className="bg-muted px-1 rounded">PROPERTY_ID</code> to <code className="bg-muted px-1 rounded font-mono">{selectedPropertyId}</code></li>
              <li>Start the LFS — it will auto-sync configuration from the cloud</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-sync-history">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpDown className="h-5 w-5" />
            Sync History
          </CardTitle>
          <CardDescription>Recent synchronization activity between this property's LFS and the cloud</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !syncLogs || syncLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-sync-logs">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No sync activity recorded yet</p>
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">Status</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead className="text-right">Records</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncLogs.map((log: { id: string; syncType: string; direction: string; status: string; recordCount?: number; lfsIp?: string; lfsVersion?: string; createdAt?: string }) => (
                    <TableRow key={log.id} data-testid={`row-sync-log-${log.id}`}>
                      <TableCell>{logStatusIcon(log.status)}</TableCell>
                      <TableCell className="font-mono text-xs">{log.syncType}</TableCell>
                      <TableCell>
                        <Badge variant={log.direction === "up" ? "default" : "secondary"} className="text-xs">
                          {log.direction === "up" ? "↑ Upload" : "↓ Download"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{log.recordCount ?? 0}</TableCell>
                      <TableCell className="font-mono text-xs">{log.lfsIp || "—"}</TableCell>
                      <TableCell className="text-xs">{log.lfsVersion || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatTimestamp(log.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
