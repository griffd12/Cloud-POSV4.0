import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEmcFilter } from "@/lib/emc-context";

import {
  insertTerminalDeviceSchema,
  type TerminalDevice,
  type Property,
  type Workstation,
  type PaymentProcessor,
} from "@shared/schema";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Wifi,
  WifiOff,
  CreditCard,
  Loader2,
  Search,
} from "lucide-react";

const MODEL_LABELS: Record<string, string> = {
  pax_a920: "PAX A920",
  pax_s300: "PAX S300",
  pax_a35: "PAX A35 (Heartland)",
  pax_a77: "PAX A77 (Heartland)",
  verifone_vx520: "Verifone VX520",
  verifone_vx820: "Verifone VX820",
  verifone_p400: "Verifone P400",
  verifone_t650c: "Verifone Trinity T650c (Heartland)",
  verifone_t650p: "Verifone Trinity T650p (Heartland)",
  verifone_p630: "Verifone P630 (Heartland)",
  ingenico_lane_3000: "Ingenico Lane 3000",
  ingenico_lane_5000: "Ingenico Lane 5000",
  ingenico_ipp350: "Ingenico iPP 350 (Heartland OPI)",
  ingenico_isc_touch_250: "Ingenico iSC Touch 250 (Heartland OPI)",
  stripe_s700: "Stripe S700",
  stripe_m2: "Stripe M2",
  stripe_wisepos_e: "Stripe WisePOS E",
  bbpos_chipper: "BBPOS Chipper",
  generic: "Generic Terminal",
};

const CONNECTION_TYPES: Record<string, string> = {
  ethernet: "Ethernet",
  wifi: "WiFi",
  usb: "USB",
  bluetooth: "Bluetooth",
  cloud: "Cloud",
};

const formSchema = insertTerminalDeviceSchema.extend({
  name: z.string().min(1, "Name is required"),
  model: z.string().min(1, "Model is required"),
});

type FormData = z.infer<typeof formSchema>;

export default function TerminalDevicesPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId, scopePayload } = useEmcFilter();
  const [formOpen, setFormOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<TerminalDevice | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingDevice, setDeletingDevice] = useState<TerminalDevice | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: devices = [], isLoading } = useQuery<TerminalDevice[]>({
    queryKey: ["/api/terminal-devices", filterKeys],
    queryFn: async () => {
      const res = await fetch(`/api/terminal-devices${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await fetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: workstations = [] } = useQuery<Workstation[]>({
    queryKey: ["/api/workstations", filterKeys],
    queryFn: async () => {
      const res = await fetch(`/api/workstations${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: processors = [] } = useQuery<PaymentProcessor[]>({
    queryKey: ["/api/payment-processors", filterKeys],
    queryFn: async () => {
      const res = await fetch(`/api/payment-processors${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      model: "generic",
      workstationId: undefined,
      paymentProcessorId: undefined,
      serialNumber: "",
      terminalId: "",
      connectionType: "ethernet",
      networkAddress: "",
      port: undefined,
      cloudDeviceId: "",
      status: "offline",
      capabilities: { contactless: true, chip: true, swipe: true, pinDebit: true },
      active: true,
    },
  });

  const connectionType = form.watch("connectionType");

  const filteredWorkstations = useMemo(() => {
    if (!contextPropertyId) return [];
    return workstations.filter((w) => w.propertyId === contextPropertyId);
  }, [contextPropertyId, workstations]);

  const filteredProcessors = useMemo(() => {
    if (!contextPropertyId) return [];
    return processors.filter((p) => p.propertyId === contextPropertyId);
  }, [contextPropertyId, processors]);

  const filteredDevices = useMemo(() => {
    if (!searchQuery) return devices;
    const query = searchQuery.toLowerCase();
    return devices.filter(
      (d) =>
        d.name.toLowerCase().includes(query) ||
        d.model.toLowerCase().includes(query) ||
        d.networkAddress?.toLowerCase().includes(query)
    );
  }, [devices, searchQuery]);

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await apiRequest("POST", "/api/terminal-devices", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/terminal-devices", filterKeys] });
      handleCancel();
      toast({ title: "Terminal device created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create terminal", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FormData & { id: string }) => {
      const response = await apiRequest("PATCH", `/api/terminal-devices/${data.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/terminal-devices", filterKeys] });
      handleCancel();
      toast({ title: "Terminal device updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update terminal", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/terminal-devices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/terminal-devices", filterKeys] });
      setDeleteDialogOpen(false);
      setDeletingDevice(null);
      toast({ title: "Terminal device deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete terminal", description: error.message, variant: "destructive" });
    },
  });

  const pingMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/terminal-devices/${id}/heartbeat`, { status: "online" });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/terminal-devices", filterKeys] });
      toast({ title: "Terminal pinged successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to ping terminal", description: error.message, variant: "destructive" });
    },
  });

  const syncStatusMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      const response = await apiRequest("POST", `/api/terminal-devices/${deviceId}/sync-status`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/terminal-devices", filterKeys] });
      if (data.stripeReader) {
        toast({ 
          title: "Status synced from Stripe", 
          description: `${data.stripeReader.label || 'Terminal'} is ${data.stripeReader.status}` 
        });
      } else {
        toast({ title: "Status synced" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to sync status", description: error.message, variant: "destructive" });
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const propertyIds = Array.from(new Set(devices.map(d => d.propertyId)));
      const results = [];
      for (const propertyId of propertyIds) {
        const response = await apiRequest("POST", "/api/terminal-devices/sync-all", { propertyId });
        results.push(await response.json());
      }
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["/api/terminal-devices", filterKeys] });
      const totalSynced = results.reduce((sum, r) => sum + (r.synced || 0), 0);
      toast({ title: "Status sync complete", description: `${totalSynced} terminal(s) updated from Stripe` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to sync statuses", description: error.message, variant: "destructive" });
    },
  });

  function resetForm() {
    form.reset({
      name: "",
      model: "generic",
      workstationId: undefined,
      paymentProcessorId: undefined,
      serialNumber: "",
      terminalId: "",
      connectionType: "ethernet",
      networkAddress: "",
      port: undefined,
      cloudDeviceId: "",
      status: "offline",
      capabilities: { contactless: true, chip: true, swipe: true, pinDebit: true },
      active: true,
    });
  }

  function openAddForm() {
    setEditingDevice(null);
    resetForm();
    setFormOpen(true);
  }

  function openEditForm(device: TerminalDevice) {
    setEditingDevice(device);
    form.reset({
      propertyId: device.propertyId,
      name: device.name,
      model: device.model,
      workstationId: device.workstationId || undefined,
      paymentProcessorId: device.paymentProcessorId || undefined,
      serialNumber: device.serialNumber || "",
      terminalId: device.terminalId || "",
      connectionType: device.connectionType || "ethernet",
      networkAddress: device.networkAddress || "",
      port: device.port || undefined,
      cloudDeviceId: device.cloudDeviceId || "",
      status: device.status || "offline",
      capabilities: (device.capabilities as any) || { contactless: true, chip: true, swipe: true, pinDebit: true },
      active: device.active ?? true,
    });
    setFormOpen(true);
  }

  function openDeleteDialog(device: TerminalDevice) {
    setDeletingDevice(device);
    setDeleteDialogOpen(true);
  }

  function handleCancel() {
    setFormOpen(false);
    setEditingDevice(null);
    resetForm();
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    form.handleSubmit(onSubmit)();
  }

  function onSubmit(data: FormData) {
    if (editingDevice) {
      updateMutation.mutate({ ...data, id: editingDevice.id });
    } else {
      createMutation.mutate({ ...data, ...scopePayload });
    }
  }

  function getPropertyName(id: string) {
    return properties.find((p) => p.id === id)?.name || "-";
  }

  function getWorkstationName(id: string | null) {
    if (!id) return "-";
    return workstations.find((w) => w.id === id)?.name || "-";
  }

  function getProcessorName(id: string | null) {
    if (!id) return "-";
    const proc = processors.find((p) => p.id === id);
    return proc ? `${proc.name} (${proc.gatewayType})` : "-";
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (formOpen) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>{editingDevice ? "Edit Terminal Device" : "Add Terminal Device"}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button
                  data-testid="button-submit"
                  disabled={isSubmitting}
                  onClick={handleSubmit}
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingDevice ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Front Counter Terminal" data-testid="input-name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="model"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Model</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-model">
                              <SelectValue placeholder="Select model" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(MODEL_LABELS).map(([key, label]) => (
                              <SelectItem key={key} value={key}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="workstationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Workstation (Optional)</FormLabel>
                        <Select 
                          onValueChange={(val) => field.onChange(val === "__none__" ? undefined : val)} 
                          value={field.value || "__none__"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-workstation">
                              <SelectValue placeholder="Assign to workstation" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">None (Floating)</SelectItem>
                            {filteredWorkstations.map((ws) => (
                              <SelectItem key={ws.id} value={ws.id}>
                                {ws.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>Leave blank for roaming terminals</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="paymentProcessorId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Processor (Optional)</FormLabel>
                      <Select 
                        onValueChange={(val) => field.onChange(val === "__none__" ? undefined : val)} 
                        value={field.value || "__none__"}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-processor">
                            <SelectValue placeholder="Use property default" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">Use property default</SelectItem>
                          {filteredProcessors.map((proc) => (
                            <SelectItem key={proc.id} value={proc.id}>
                              {proc.name} ({proc.gatewayType})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Override the property's default processor for this terminal</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="connectionType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Connection Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "ethernet"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-connection">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(CONNECTION_TYPES).map(([key, label]) => (
                              <SelectItem key={key} value={key}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {(connectionType === "ethernet" || connectionType === "wifi") && (
                    <FormField
                      control={form.control}
                      name="networkAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>IP Address</FormLabel>
                          <FormControl>
                            <Input placeholder="192.168.1.100" data-testid="input-ip" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {(connectionType === "ethernet" || connectionType === "wifi") && (
                    <FormField
                      control={form.control}
                      name="port"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Port (Optional)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="9100" 
                              data-testid="input-port" 
                              {...field} 
                              value={field.value || ""} 
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            />
                          </FormControl>
                          <FormDescription>Network port for terminal communication</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="serialNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Serial Number</FormLabel>
                        <FormControl>
                          <Input placeholder="SN12345678" data-testid="input-serial" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="terminalId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Terminal ID</FormLabel>
                        <FormControl>
                          <Input placeholder="TID from processor" data-testid="input-tid" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormDescription>Processor-assigned terminal ID</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {connectionType === "cloud" && (
                    <FormField
                      control={form.control}
                      name="cloudDeviceId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cloud Device ID</FormLabel>
                          <FormControl>
                            <Input placeholder="tmr_xxxxx" data-testid="input-cloud-id" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormDescription>Device ID from cloud payment provider</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <div className="space-y-3">
                  <FormLabel>Capabilities</FormLabel>
                  <div className="grid grid-cols-4 gap-3">
                    <FormField
                      control={form.control}
                      name="capabilities"
                      render={({ field }) => {
                        const caps = (field.value as any) || {};
                        const updateCap = (key: string, val: boolean) => {
                          field.onChange({ ...caps, [key]: val });
                        };
                        return (
                          <>
                            <div className="flex items-center justify-between rounded-lg border p-3">
                              <span className="text-sm">Contactless (NFC)</span>
                              <Switch
                                checked={caps.contactless ?? true}
                                onCheckedChange={(val) => updateCap("contactless", val)}
                                data-testid="switch-contactless"
                              />
                            </div>
                            <div className="flex items-center justify-between rounded-lg border p-3">
                              <span className="text-sm">Chip (EMV)</span>
                              <Switch
                                checked={caps.chip ?? true}
                                onCheckedChange={(val) => updateCap("chip", val)}
                                data-testid="switch-chip"
                              />
                            </div>
                            <div className="flex items-center justify-between rounded-lg border p-3">
                              <span className="text-sm">Swipe (Magstripe)</span>
                              <Switch
                                checked={caps.swipe ?? true}
                                onCheckedChange={(val) => updateCap("swipe", val)}
                                data-testid="switch-swipe"
                              />
                            </div>
                            <div className="flex items-center justify-between rounded-lg border p-3">
                              <span className="text-sm">PIN Debit</span>
                              <Switch
                                checked={caps.pinDebit ?? true}
                                onCheckedChange={(val) => updateCap("pinDebit", val)}
                                data-testid="switch-pin-debit"
                              />
                            </div>
                          </>
                        );
                      }}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <FormLabel>Active</FormLabel>
                        <FormDescription>Enable this terminal for payment processing</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value ?? true}
                          onCheckedChange={field.onChange}
                          data-testid="switch-active"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </CardContent>
        </Card>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Terminal Device</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingDevice?.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingDevice && deleteMutation.mutate(deletingDevice.id)}
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Terminal Devices</h1>
          <p className="text-muted-foreground">Manage payment terminals and card readers</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            type="button" 
            variant="outline"
            onClick={() => syncAllMutation.mutate()} 
            disabled={syncAllMutation.isPending || devices.length === 0}
            data-testid="button-sync-all"
          >
            {syncAllMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sync Status
          </Button>
          <Button type="button" onClick={openAddForm} data-testid="button-add-terminal">
            <Plus className="w-4 h-4 mr-2" />
            Add Terminal
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search terminals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredDevices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {devices.length === 0 ? "No terminal devices configured" : "No terminals match your search"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Workstation</TableHead>
                  <TableHead>Processor</TableHead>
                  <TableHead>Connection</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDevices.map((device) => (
                  <TableRow key={device.id} data-testid={`row-terminal-${device.id}`}>
                    <TableCell className="font-medium">{device.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-muted-foreground" />
                        {MODEL_LABELS[device.model] || device.model}
                      </div>
                    </TableCell>
                    <TableCell>{getPropertyName(device.propertyId)}</TableCell>
                    <TableCell>{getWorkstationName(device.workstationId)}</TableCell>
                    <TableCell>{getProcessorName(device.paymentProcessorId)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {CONNECTION_TYPES[device.connectionType || "ethernet"] || device.connectionType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {device.status === "online" ? (
                          <Wifi className="w-4 h-4 text-green-500" />
                        ) : (
                          <WifiOff className="w-4 h-4 text-muted-foreground" />
                        )}
                        <Badge
                          className={
                            device.status === "online"
                              ? "bg-green-600"
                              : device.status === "busy"
                              ? "bg-yellow-500"
                              : device.status === "error"
                              ? "bg-red-500"
                              : "bg-gray-500"
                          }
                        >
                          {(device.status || "offline").charAt(0).toUpperCase() + (device.status || "offline").slice(1)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      {device.active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => pingMutation.mutate(device.id)}
                          disabled={pingMutation.isPending}
                          data-testid={`button-ping-${device.id}`}
                        >
                          {pingMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => openEditForm(device)}
                          data-testid={`button-edit-${device.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => openDeleteDialog(device)}
                          data-testid={`button-delete-${device.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Terminal Device</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingDevice?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingDevice && deleteMutation.mutate(deletingDevice.id)}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
