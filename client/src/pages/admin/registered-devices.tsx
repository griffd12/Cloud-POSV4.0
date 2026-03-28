import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { 
  type RegisteredDevice, 
  type Property, 
  type Workstation,
  type KdsDevice,
  REGISTERED_DEVICE_TYPES,
  REGISTERED_DEVICE_STATUSES,
} from "@shared/schema";
import {
  Dialog,
  DialogContent,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Monitor, Tv, Key, Copy, RefreshCw, Loader2, CheckCircle, XCircle, Clock, AlertTriangle, Shield } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getScopeColumn, getZoneColumn, getInheritanceColumn } from "@/components/admin/scope-column";
import { useScopeLookup } from "@/hooks/use-scope-lookup";

const DEVICE_TYPE_LABELS: Record<string, { label: string; icon: typeof Monitor }> = {
  pos_workstation: { label: "POS Workstation", icon: Monitor },
  kds_display: { label: "KDS Display", icon: Tv },
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle }> = {
  pending: { label: "Pending Enrollment", variant: "outline", icon: Clock },
  enrolled: { label: "Enrolled", variant: "default", icon: CheckCircle },
  disabled: { label: "Disabled", variant: "secondary", icon: XCircle },
  revoked: { label: "Revoked", variant: "destructive", icon: AlertTriangle },
};

interface FormData {
  deviceType: string;
  workstationId?: string;
  kdsDeviceId?: string;
  name: string;
  serialNumber?: string;
  assetTag?: string;
  macAddress?: string;
  notes?: string;
}

export default function RegisteredDevicesPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RegisteredDevice | null>(null);
  const [enrollmentCodeDialog, setEnrollmentCodeDialog] = useState<{ device: RegisteredDevice } | null>(null);

  const { data: devices = [], isLoading } = useQuery<RegisteredDevice[]>({
    queryKey: ["/api/registered-devices", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/registered-devices${filterParam}`, { headers: getAuthHeaders() });
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

  const { data: workstations = [] } = useQuery<Workstation[]>({
    queryKey: ["/api/workstations", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/workstations${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: kdsDevices = [] } = useQuery<KdsDevice[]>({
    queryKey: ["/api/kds-devices", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/kds-devices${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const columns: Column<RegisteredDevice>[] = [
    { 
      key: "name", 
      header: "Device Name", 
      sortable: true,
      render: (value) => (
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">{value as string}</span>
        </div>
      ),
    },
    {
      key: "deviceType",
      header: "Type",
      render: (value) => {
        const config = DEVICE_TYPE_LABELS[value as string] || { label: value, icon: Monitor };
        const Icon = config.icon;
        return (
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <span>{config.label}</span>
          </div>
        );
      },
    },
    {
      key: "propertyId",
      header: "Property",
      render: (value) => properties.find((p) => p.id === value)?.name || "-",
    },
    {
      key: "workstationId",
      header: "Linked Device",
      render: (value, row) => {
        if (row.deviceType === "pos_workstation") {
          return workstations.find((w) => w.id === value)?.name || "-";
        }
        if (row.deviceType === "kds_display") {
          return kdsDevices.find((k) => k.id === row.kdsDeviceId)?.name || "-";
        }
        return "-";
      },
    },
    {
      key: "status",
      header: "Status",
      render: (value) => {
        const config = STATUS_CONFIG[value as string] || STATUS_CONFIG.pending;
        const Icon = config.icon;
        return (
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4" />
            <Badge variant={config.variant}>{config.label}</Badge>
          </div>
        );
      },
    },
    {
      key: "enrollmentCode",
      header: "Enrollment Code",
      render: (value, row) => {
        if (row.status === "enrolled") {
          return <span className="text-muted-foreground">-</span>;
        }
        if (value) {
          const isExpired = row.enrollmentCodeExpiresAt && new Date() > new Date(row.enrollmentCodeExpiresAt);
          return (
            <div className="flex items-center gap-2">
              <code className={`px-2 py-1 rounded text-sm font-mono ${isExpired ? "bg-red-100 dark:bg-red-900/20 text-red-600" : "bg-muted"}`}>
                {value as string}
              </code>
              {isExpired && <Badge variant="destructive">Expired</Badge>}
            </div>
          );
        }
        return <span className="text-muted-foreground">-</span>;
      },
    },
    {
      key: "lastAccessAt",
      header: "Last Access",
      render: (value) => value ? format(new Date(value as string), "MMM d, yyyy h:mm a") : "-",
    },
    { key: "serialNumber", header: "Serial Number", render: (value) => value || "-" },
    getScopeColumn(),
    getZoneColumn<RegisteredDevice>(scopeLookup),
    getInheritanceColumn<RegisteredDevice>(contextPropertyId, selectedRvcId),
  ];

  const form = useForm<FormData>({
    defaultValues: {
      name: "",
      deviceType: "pos_workstation",
      workstationId: undefined,
      kdsDeviceId: undefined,
      serialNumber: "",
      assetTag: "",
      macAddress: "",
      notes: "",
    },
  });

  const deviceType = form.watch("deviceType");

  const filteredWorkstations = useMemo(() => {
    if (!contextPropertyId) return [];
    return workstations.filter((w) => w.propertyId === contextPropertyId);
  }, [workstations, contextPropertyId]);

  const filteredKdsDevices = useMemo(() => {
    if (!contextPropertyId) return [];
    return kdsDevices.filter((k) => k.propertyId === contextPropertyId);
  }, [kdsDevices, contextPropertyId]);

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await apiRequest("POST", "/api/registered-devices", data);
      return response.json();
    },
    onSuccess: (newDevice: RegisteredDevice) => {
      queryClient.invalidateQueries({ queryKey: ["/api/registered-devices", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      form.reset();
      setEnrollmentCodeDialog({ device: newDevice });
      toast({ title: "Device registered successfully" });
    },
    onError: () => {
      toast({ title: "Failed to register device", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<FormData> }) => {
      const response = await apiRequest("PATCH", `/api/registered-devices/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registered-devices", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      form.reset();
      toast({ title: "Device updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update device", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/registered-devices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registered-devices", filterKeys] });
      toast({ title: "Device deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete device", variant: "destructive" });
    },
  });

  const generateCodeMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/registered-devices/${id}/generate-code`);
      return response.json();
    },
    onSuccess: (updatedDevice: RegisteredDevice) => {
      queryClient.invalidateQueries({ queryKey: ["/api/registered-devices", filterKeys] });
      setEnrollmentCodeDialog({ device: updatedDevice });
      toast({ title: "New enrollment code generated" });
    },
    onError: () => {
      toast({ title: "Failed to generate code", variant: "destructive" });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/registered-devices/${id}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registered-devices", filterKeys] });
      toast({ title: "Device status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update device status", variant: "destructive" });
    },
  });

  const replaceMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/registered-devices/${id}/replace`);
      return response.json();
    },
    onSuccess: (newDevice: RegisteredDevice) => {
      queryClient.invalidateQueries({ queryKey: ["/api/registered-devices", filterKeys] });
      setEnrollmentCodeDialog({ device: newDevice });
      toast({ title: "Device replaced", description: "A new enrollment code has been generated for the replacement device." });
    },
    onError: () => {
      toast({ title: "Failed to replace device", variant: "destructive" });
    },
  });

  const handleEdit = (device: RegisteredDevice) => {
    setEditingItem(device);
    form.reset({
      name: device.name,
      deviceType: device.deviceType,
      workstationId: device.workstationId || undefined,
      kdsDeviceId: device.kdsDeviceId || undefined,
      serialNumber: device.serialNumber || "",
      assetTag: device.assetTag || "",
      macAddress: device.macAddress || "",
      notes: device.notes || "",
    });
    setFormOpen(true);
  };

  const handleSubmit = (data: FormData) => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data });
    } else {
      createMutation.mutate({ ...data, ...scopePayload });
    }
  };

  const handleCancel = () => {
    setFormOpen(false);
    setEditingItem(null);
    form.reset();
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Enrollment code copied to clipboard" });
  };

  const actionButtons = (device: RegisteredDevice) => (
    <div className="flex items-center gap-1">
      {device.status !== "revoked" && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => replaceMutation.mutate(device.id)}
          disabled={replaceMutation.isPending}
          data-testid={`button-replace-${device.id}`}
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Replace
        </Button>
      )}
      {device.status === "pending" && (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleCopyCode(device.enrollmentCode || "")}
            disabled={!device.enrollmentCode}
            data-testid={`button-copy-code-${device.id}`}
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => generateCodeMutation.mutate(device.id)}
            disabled={generateCodeMutation.isPending}
            data-testid={`button-regenerate-${device.id}`}
          >
            <Key className="w-4 h-4" />
          </Button>
        </>
      )}
      {device.status === "enrolled" && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => disableMutation.mutate({ id: device.id, status: "disabled" })}
          data-testid={`button-disable-${device.id}`}
        >
          Disable
        </Button>
      )}
      {device.status === "disabled" && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => generateCodeMutation.mutate(device.id)}
          data-testid={`button-reenable-${device.id}`}
        >
          Re-enroll
        </Button>
      )}
    </div>
  );

  if (formOpen) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle>{editingItem ? "Edit Device" : "Register New Device"}</CardTitle>
                <CardDescription className="mt-1">
                  {editingItem
                    ? "Update device information and metadata."
                    : "Register a new device to allow it to access the POS or KDS system."}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  onClick={form.handleSubmit(handleSubmit)}
                  data-testid="button-submit"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {editingItem ? "Update Device" : "Register Device"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    rules={{ required: "Device name is required" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Device Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Front Counter PC" {...field} data-testid="input-name" />
                        </FormControl>
                        <FormDescription>A friendly name to identify this device</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="deviceType"
                    rules={{ required: "Device type is required" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Device Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={!!editingItem}>
                          <FormControl>
                            <SelectTrigger data-testid="select-device-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pos_workstation">
                              <div className="flex items-center gap-2">
                                <Monitor className="w-4 h-4" />
                                POS Workstation
                              </div>
                            </SelectItem>
                            <SelectItem value="kds_display">
                              <div className="flex items-center gap-2">
                                <Tv className="w-4 h-4" />
                                KDS Display
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {deviceType === "pos_workstation" && (
                    <FormField
                      control={form.control}
                      name="workstationId"
                      rules={{ required: "Workstation is required for POS devices" }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Linked Workstation</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-workstation">
                                <SelectValue placeholder="Select workstation" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {filteredWorkstations.map((ws) => (
                                <SelectItem key={ws.id} value={ws.id}>
                                  {ws.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>The workstation this device will operate as</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {deviceType === "kds_display" && (
                    <FormField
                      control={form.control}
                      name="kdsDeviceId"
                      rules={{ required: "KDS device is required for KDS displays" }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Linked KDS Device</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-kds-device">
                                <SelectValue placeholder="Select KDS device" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {filteredKdsDevices.map((kds) => (
                                <SelectItem key={kds.id} value={kds.id}>
                                  {kds.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>The KDS station this display will show</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-3">Optional Hardware Information</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="serialNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Serial Number</FormLabel>
                          <FormControl>
                            <Input placeholder="Device serial number" {...field} data-testid="input-serial" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="assetTag"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Asset Tag</FormLabel>
                          <FormControl>
                            <Input placeholder="Internal asset tag" {...field} data-testid="input-asset-tag" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="macAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>MAC Address</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., 00:1B:44:11:3A:B7" {...field} data-testid="input-mac" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Optional notes about this device" {...field} data-testid="input-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Registered Devices</h1>
          <p className="text-muted-foreground">
            Manage device enrollment for secure POS and KDS access
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingItem(null);
            form.reset({
              name: "",
              deviceType: "pos_workstation",
              workstationId: undefined,
              kdsDeviceId: undefined,
              serialNumber: "",
              assetTag: "",
              macAddress: "",
              notes: "",
            });
            setFormOpen(true);
          }}
          data-testid="button-add-device"
        >
          Register Device
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Device Security
          </CardTitle>
          <CardDescription>
            Only registered devices can access the POS and KDS systems. Generate an enrollment code, 
            then enter it on the device to complete registration.
          </CardDescription>
        </CardHeader>
      </Card>

      <DataTable
        data={devices}
        columns={columns}
        searchKey="name"
        isLoading={isLoading}
        onEdit={handleEdit}
        onDelete={(device) => deleteMutation.mutate(device.id)}
        actionButtons={actionButtons}
      />

      <Dialog open={!!enrollmentCodeDialog} onOpenChange={() => setEnrollmentCodeDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Enrollment Code Generated
            </DialogTitle>
            <DialogDescription>
              Enter this code on the device to complete registration. The code expires in 24 hours.
            </DialogDescription>
          </DialogHeader>

          {enrollmentCodeDialog?.device && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-6 text-center">
                <div className="text-sm text-muted-foreground mb-2">Enrollment Code</div>
                <div className="text-4xl font-mono font-bold tracking-wider" data-testid="text-enrollment-code">
                  {enrollmentCodeDialog.device.enrollmentCode}
                </div>
              </div>

              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>Device:</strong> {enrollmentCodeDialog.device.name}</p>
                <p><strong>Type:</strong> {DEVICE_TYPE_LABELS[enrollmentCodeDialog.device.deviceType]?.label}</p>
                {enrollmentCodeDialog.device.enrollmentCodeExpiresAt && (
                  <p><strong>Expires:</strong> {format(new Date(enrollmentCodeDialog.device.enrollmentCodeExpiresAt), "MMM d, yyyy h:mm a")}</p>
                )}
              </div>

              <Button
                className="w-full"
                onClick={() => handleCopyCode(enrollmentCodeDialog.device.enrollmentCode || "")}
                data-testid="button-copy-enrollment-code"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Code
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
