import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { insertPrintAgentSchema, type PrintAgent, type InsertPrintAgent, type Property } from "@shared/schema";
import { Copy, Download, RefreshCw, KeyRound, Wifi, WifiOff, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { z } from "zod";
import { getScopeColumn, getZoneColumn, getInheritanceColumn } from "@/components/admin/scope-column";
import { useScopeLookup } from "@/hooks/use-scope-lookup";

const formSchema = insertPrintAgentSchema.extend({
  name: z.string().min(1, "Name is required"),
});

type FormData = z.infer<typeof formSchema>;

export default function PrintAgentsPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PrintAgent | null>(null);
  const [newAgentToken, setNewAgentToken] = useState<string | null>(null);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const [agentToRegenerate, setAgentToRegenerate] = useState<PrintAgent | null>(null);
  const [regeneratedToken, setRegeneratedToken] = useState<string | null>(null);

  const { data: agents = [], isLoading } = useQuery<PrintAgent[]>({
    queryKey: ["/api/print-agents", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/print-agents${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      propertyId: undefined,
      description: "",
    },
  });

  const columns: Column<PrintAgent>[] = [
    { key: "name", header: "Name", sortable: true },
    {
      key: "propertyId",
      header: "Property",
      render: (value) => properties.find((p) => p.id === value)?.name || "Global",
    },
    {
      key: "status",
      header: "Status",
      render: (value) => {
        switch (value) {
          case "online":
            return (
              <Badge className="bg-green-600">
                <Wifi className="w-3 h-3 mr-1" /> Online
              </Badge>
            );
          case "disabled":
            return (
              <Badge variant="destructive">Disabled</Badge>
            );
          default:
            return (
              <Badge variant="secondary">
                <WifiOff className="w-3 h-3 mr-1" /> Offline
              </Badge>
            );
        }
      },
    },
    {
      key: "lastHeartbeat",
      header: "Last Seen",
      render: (value) => {
        if (!value) return "Never";
        const date = new Date(value as string);
        return date.toLocaleString();
      },
    },
    { key: "description", header: "Description" },
    getScopeColumn(),
    getZoneColumn<PrintAgent>(scopeLookup),
    getInheritanceColumn<PrintAgent>(contextPropertyId, selectedRvcId),
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertPrintAgent) => {
      const response = await apiRequest("POST", "/api/print-agents", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-agents", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      form.reset();
      if (data.agentToken) {
        setNewAgentToken(data.agentToken);
        setTokenDialogOpen(true);
      }
      toast({ title: "Print agent created" });
    },
    onError: () => {
      toast({ title: "Failed to create print agent", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<PrintAgent> & { id: string }) => {
      const response = await apiRequest("PATCH", "/api/print-agents/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-agents", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      form.reset();
      toast({ title: "Print agent updated" });
    },
    onError: () => {
      toast({ title: "Failed to update print agent", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/print-agents/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-agents", filterKeys] });
      toast({ title: "Print agent deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete print agent", variant: "destructive" });
    },
  });

  const regenerateTokenMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", "/api/print-agents/" + id + "/regenerate-token");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-agents", filterKeys] });
      setRegenerateConfirmOpen(false);
      setAgentToRegenerate(null);
      if (data.agentToken) {
        setRegeneratedToken(data.agentToken);
        setTokenDialogOpen(true);
      }
      toast({ title: "Token regenerated" });
    },
    onError: () => {
      toast({ title: "Failed to regenerate token", variant: "destructive" });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PATCH", "/api/print-agents/" + id, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-agents", filterKeys] });
      toast({ title: "Agent status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update agent status", variant: "destructive" });
    },
  });

  const handleEdit = (agent: PrintAgent) => {
    setEditingItem(agent);
    form.reset({
      name: agent.name,
      propertyId: agent.propertyId || undefined,
      description: agent.description || "",
    });
    setFormOpen(true);
  };

  const handleAdd = () => {
    setEditingItem(null);
    const defaultPropertyId = contextPropertyId || properties[0]?.id || undefined;
    form.reset({
      name: "",
      propertyId: defaultPropertyId,
      description: "",
    });
    setFormOpen(true);
  };

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    form.handleSubmit((data: FormData) => {
      if (editingItem) {
        updateMutation.mutate({ ...data, id: editingItem.id });
      } else {
        createMutation.mutate({ ...data, ...scopePayload });
      }
    })();
  };

  const handleCancel = () => {
    setFormOpen(false);
    setEditingItem(null);
    form.reset();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const handleRegenerateToken = (agent: PrintAgent) => {
    setAgentToRegenerate(agent);
    setRegenerateConfirmOpen(true);
  };

  const downloadAgentPackage = () => {
    window.open("/api/print-agents/download", "_blank");
  };

  const displayToken = newAgentToken || regeneratedToken;

  if (formOpen) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle>{editingItem ? "Edit Print Agent" : "Add Print Agent"}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel-agent">
                  Cancel
                </Button>
                <Button
                  data-testid="button-save-agent"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  onClick={onSubmit}
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  {editingItem ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Kitchen Agent" {...field} data-testid="input-agent-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="propertyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Property (Optional)</FormLabel>
                        <Select
                          value={field.value || "__global__"}
                          onValueChange={(val) => field.onChange(val === "__global__" ? undefined : val)}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-property">
                              <SelectValue placeholder="Global (all properties)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__global__">Global (all properties)</SelectItem>
                            {properties.map((prop) => (
                              <SelectItem key={prop.id} value={prop.id}>
                                {prop.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Optionally restrict this agent to a specific property
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe the agent's purpose or location..."
                            {...field}
                            value={field.value || ""}
                            data-testid="input-agent-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Dialog open={tokenDialogOpen} onOpenChange={(open) => {
          setTokenDialogOpen(open);
          if (!open) {
            setNewAgentToken(null);
            setRegeneratedToken(null);
          }
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Agent Token</DialogTitle>
              <DialogDescription>
                Copy this token now. It will not be shown again.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Alert>
                <AlertTitle>Important</AlertTitle>
                <AlertDescription>
                  Save this token securely. You will need it to configure the print agent.
                  If you lose it, you can regenerate a new token, but the old one will stop working.
                </AlertDescription>
              </Alert>
              <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                <code className="flex-1 text-sm break-all font-mono" data-testid="text-agent-token">
                  {displayToken}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => displayToken && copyToClipboard(displayToken)}
                  data-testid="button-copy-token"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <DialogFooter className="pt-4 border-t mt-4">
              <Button onClick={() => setTokenDialogOpen(false)} data-testid="button-close-token-dialog">
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={regenerateConfirmOpen} onOpenChange={setRegenerateConfirmOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Regenerate Token?</DialogTitle>
              <DialogDescription>
                This will invalidate the current token. Any agent using the old token will need to be updated.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="pt-4 border-t mt-4">
              <Button variant="outline" onClick={() => setRegenerateConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => agentToRegenerate && regenerateTokenMutation.mutate(agentToRegenerate.id)}
                disabled={regenerateTokenMutation.isPending}
                data-testid="button-confirm-regenerate"
              >
                {regenerateTokenMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Regenerate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-print-agents-title">Print Agents</h1>
        <p className="text-muted-foreground">
          Connect local printers to the cloud POS using print agents
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">How Print Agents Work</CardTitle>
            <CardDescription>
              Print agents bridge cloud POS to local network printers
            </CardDescription>
          </div>
          <Button onClick={downloadAgentPackage} variant="outline" data-testid="button-download-agent">
            <Download className="w-4 h-4 mr-2" />
            Download Agent Software
          </Button>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            1. Create a new agent below and copy the authentication token
          </p>
          <p>
            2. <strong>Windows POS:</strong> The print agent is built into the Cloud POS desktop app. Enter the agent token in Settings to connect automatically.
          </p>
          <p>
            3. <strong>Standalone:</strong> Download the agent software for computers that only need printing (no POS).
          </p>
          <p>
            4. Configure printer IP addresses in the agent. It will connect to this cloud server and relay print jobs to your local network printers.
          </p>
          <p>
            5. The agent works both online and offline. Print jobs queue locally when cloud is unreachable.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button 
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleAdd();
          }} 
          data-testid="button-create-agent"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Agent
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={agents}
        isLoading={isLoading}
        searchPlaceholder="Search agents..."
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={(agent) => deleteMutation.mutate(agent.id)}
        customActions={[
          {
            label: "Regenerate Token",
            icon: KeyRound,
            onClick: (agent) => handleRegenerateToken(agent),
          },
          {
            label: "Toggle Status",
            icon: RefreshCw,
            onClick: (agent) => {
              if (agent.status === "disabled") {
                toggleStatusMutation.mutate({ id: agent.id, status: "offline" });
              } else {
                toggleStatusMutation.mutate({ id: agent.id, status: "disabled" });
              }
            },
          },
        ]}
      />

      <Dialog open={tokenDialogOpen} onOpenChange={(open) => {
        setTokenDialogOpen(open);
        if (!open) {
          setNewAgentToken(null);
          setRegeneratedToken(null);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agent Token</DialogTitle>
            <DialogDescription>
              Copy this token now. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertTitle>Important</AlertTitle>
              <AlertDescription>
                Save this token securely. You will need it to configure the print agent.
                If you lose it, you can regenerate a new token, but the old one will stop working.
              </AlertDescription>
            </Alert>
            <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
              <code className="flex-1 text-sm break-all font-mono" data-testid="text-agent-token">
                {displayToken}
              </code>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => displayToken && copyToClipboard(displayToken)}
                data-testid="button-copy-token"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <DialogFooter className="pt-4 border-t mt-4">
            <Button onClick={() => setTokenDialogOpen(false)} data-testid="button-close-token-dialog">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={regenerateConfirmOpen} onOpenChange={setRegenerateConfirmOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Regenerate Token?</DialogTitle>
            <DialogDescription>
              This will invalidate the current token. Any agent using the old token will need to be updated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 border-t mt-4">
            <Button variant="outline" onClick={() => setRegenerateConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => agentToRegenerate && regenerateTokenMutation.mutate(agentToRegenerate.id)}
              disabled={regenerateTokenMutation.isPending}
              data-testid="button-confirm-regenerate"
            >
              {regenerateTokenMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
