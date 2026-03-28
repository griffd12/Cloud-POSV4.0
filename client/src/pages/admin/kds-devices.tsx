import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { insertKdsDeviceSchema, type KdsDevice, type InsertKdsDevice, type Property } from "@shared/schema";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEmcFilter } from "@/lib/emc-context";
import { getScopeColumn, getZoneColumn, getInheritanceColumn } from "@/components/admin/scope-column";
import { useScopeLookup } from "@/hooks/use-scope-lookup";

export default function KdsDevicesPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();
  usePosWebSocket();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KdsDevice | null>(null);

  const { data: kdsDevices = [], isLoading } = useQuery<KdsDevice[]>({
    queryKey: ["/api/kds-devices", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/kds-devices${filterParam}`, { headers: getAuthHeaders() });
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

  const columns: Column<KdsDevice>[] = useMemo(() => [
    { key: "name", header: "Name", sortable: true },
    {
      key: "stationType",
      header: "Station Type",
      render: (value: any) => {
        const types: Record<string, string> = {
          hot: "Hot Line",
          cold: "Cold Line",
          prep: "Prep",
          expo: "Expo",
          bar: "Bar",
        };
        return <Badge variant="outline">{types[value as string] || value}</Badge>;
      },
    },
    {
      key: "propertyId",
      header: "Property",
      render: (value: any) => properties.find((p) => p.id === value)?.name || "-",
    },
    {
      key: "expoMode",
      header: "Expo Mode",
      render: (value: any) => (value ? <Badge variant="secondary">Yes</Badge> : "-"),
    },
    {
      key: "showTimers",
      header: "Timers",
      render: (value: any) => (value ? <Badge variant="secondary">Yes</Badge> : "-"),
    },
    { key: "ipAddress", header: "IP Address" },
    {
      key: "isOnline",
      header: "Status",
      render: (value: any) => (value ? <Badge className="bg-green-600">Online</Badge> : <Badge variant="secondary">Offline</Badge>),
    },
    {
      key: "active",
      header: "Active",
      render: (value: any) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
    getScopeColumn(),
    getZoneColumn<KdsDevice>(scopeLookup),
    getInheritanceColumn<KdsDevice>(contextPropertyId, selectedRvcId),
  ], [properties, scopeLookup, contextPropertyId, selectedRvcId]);

  const form = useForm<InsertKdsDevice>({
    resolver: zodResolver(insertKdsDeviceSchema),
    defaultValues: {
      name: "",
      stationType: "hot",
      propertyId: "",
      showDraftItems: false,
      showSentItemsOnly: true,
      groupBy: "order",
      showTimers: true,
      autoSortBy: "time",
      allowBump: true,
      allowRecall: true,
      allowVoidDisplay: true,
      expoMode: false,
      newOrderSound: true,
      newOrderBlinkSeconds: 5,
      colorAlert1Enabled: true,
      colorAlert1Seconds: 60,
      colorAlert1Color: "yellow",
      colorAlert2Enabled: true,
      colorAlert2Seconds: 180,
      colorAlert2Color: "red",
      colorAlert3Enabled: false,
      colorAlert3Seconds: 300,
      colorAlert3Color: "red",
      fontScale: 100,
      wsChannel: "",
      ipAddress: "",
      active: true,
    },
  });

  useEffect(() => {
    if (formOpen) {
      if (editingItem) {
        form.reset({
          name: editingItem.name,
          stationType: editingItem.stationType,
          propertyId: editingItem.propertyId,
          showDraftItems: editingItem.showDraftItems ?? false,
          showSentItemsOnly: editingItem.showSentItemsOnly ?? true,
          groupBy: editingItem.groupBy ?? "order",
          showTimers: editingItem.showTimers ?? true,
          autoSortBy: editingItem.autoSortBy ?? "time",
          allowBump: editingItem.allowBump ?? true,
          allowRecall: editingItem.allowRecall ?? true,
          allowVoidDisplay: editingItem.allowVoidDisplay ?? true,
          expoMode: editingItem.expoMode ?? false,
          newOrderSound: editingItem.newOrderSound ?? true,
          newOrderBlinkSeconds: editingItem.newOrderBlinkSeconds ?? 5,
          colorAlert1Enabled: editingItem.colorAlert1Enabled ?? true,
          colorAlert1Seconds: editingItem.colorAlert1Seconds ?? 60,
          colorAlert1Color: editingItem.colorAlert1Color ?? "yellow",
          colorAlert2Enabled: editingItem.colorAlert2Enabled ?? true,
          colorAlert2Seconds: editingItem.colorAlert2Seconds ?? 180,
          colorAlert2Color: editingItem.colorAlert2Color ?? "red",
          colorAlert3Enabled: false,
          colorAlert3Seconds: editingItem.colorAlert3Seconds ?? 300,
          colorAlert3Color: editingItem.colorAlert3Color ?? "red",
          fontScale: editingItem.fontScale ?? 100,
          wsChannel: editingItem.wsChannel ?? "",
          ipAddress: editingItem.ipAddress ?? "",
          active: editingItem.active ?? true,
        });
      } else {
        const defaultPropertyId = contextPropertyId || properties[0]?.id || "";
        form.reset({
          name: "",
          stationType: "hot",
          propertyId: defaultPropertyId,
          showDraftItems: false,
          showSentItemsOnly: true,
          groupBy: "order",
          showTimers: true,
          autoSortBy: "time",
          allowBump: true,
          allowRecall: true,
          allowVoidDisplay: true,
          expoMode: false,
          newOrderSound: true,
          newOrderBlinkSeconds: 5,
          colorAlert1Enabled: true,
          colorAlert1Seconds: 60,
          colorAlert1Color: "yellow",
          colorAlert2Enabled: true,
          colorAlert2Seconds: 180,
          colorAlert2Color: "red",
          colorAlert3Enabled: false,
          colorAlert3Seconds: 300,
          colorAlert3Color: "red",
          fontScale: 100,
          wsChannel: "",
          ipAddress: "",
          active: true,
        });
      }
    }
  }, [formOpen, editingItem, properties]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertKdsDevice) => {
      const response = await apiRequest("POST", "/api/kds-devices", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-devices", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      form.reset();
      toast({ title: "KDS device created" });
    },
    onError: () => {
      toast({ title: "Failed to create KDS device", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: KdsDevice) => {
      const response = await apiRequest("PUT", "/api/kds-devices/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-devices", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      form.reset();
      toast({ title: "KDS device updated" });
    },
    onError: () => {
      toast({ title: "Failed to update KDS device", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/kds-devices/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-devices", filterKeys] });
      toast({ title: "KDS device deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete KDS device", variant: "destructive" });
    },
  });

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    form.handleSubmit((data: InsertKdsDevice) => {
      const allowedColors = ["yellow", "red"];
      const processedData = {
        ...data,
        fontScale: data.fontScale ? Number(data.fontScale) : 100,
        newOrderBlinkSeconds: data.newOrderBlinkSeconds != null ? Number(data.newOrderBlinkSeconds) : 5,
        colorAlert1Seconds: data.colorAlert1Seconds != null ? Number(data.colorAlert1Seconds) : 60,
        colorAlert1Color: allowedColors.includes(data.colorAlert1Color || "") ? data.colorAlert1Color : "yellow",
        colorAlert2Seconds: data.colorAlert2Seconds != null ? Number(data.colorAlert2Seconds) : 180,
        colorAlert2Color: allowedColors.includes(data.colorAlert2Color || "") ? data.colorAlert2Color : "red",
        colorAlert3Enabled: false,
        colorAlert3Seconds: 300,
        colorAlert3Color: "red",
      };
      if (editingItem) {
        updateMutation.mutate({ ...editingItem, ...processedData } as KdsDevice);
      } else {
        createMutation.mutate({ ...processedData, ...scopePayload });
      }
    })();
  };

  const handleCancel = () => {
    setFormOpen(false);
    setEditingItem(null);
    form.reset();
  };

  const colorOptions = [
    { value: "yellow", label: "Yellow" },
    { value: "red", label: "Red" },
  ];

  if (formOpen) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle data-testid="text-form-title">{editingItem ? "Edit KDS Device" : "Add KDS Device"}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button
                  data-testid="button-save"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  onClick={handleSubmit}
                >
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Basic Info */}
                <div className="grid grid-cols-4 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>KDS Device Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Hot Line KDS 1" {...field} data-testid="input-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="stationType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Station Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-stationType">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="hot">Hot Line</SelectItem>
                            <SelectItem value="cold">Cold Line</SelectItem>
                            <SelectItem value="prep">Prep Station</SelectItem>
                            <SelectItem value="expo">Expo (Expediter)</SelectItem>
                            <SelectItem value="bar">Bar</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="propertyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Property</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-propertyId">
                              <SelectValue placeholder="Select property" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {properties.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="active"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <FormLabel className="text-sm">Active</FormLabel>
                        <FormControl>
                          <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-active" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Display Settings */}
                <div className="border rounded-md p-4 space-y-3">
                  <h4 className="font-medium text-sm">Display Settings</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="groupBy"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Group Items By</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || "order"}>
                            <FormControl>
                              <SelectTrigger data-testid="select-groupBy">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="order">Order</SelectItem>
                              <SelectItem value="item">Item</SelectItem>
                              <SelectItem value="course">Course</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="autoSortBy"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Auto-Sort By</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || "time"}>
                            <FormControl>
                              <SelectTrigger data-testid="select-autoSortBy">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="time">Time (Oldest First)</SelectItem>
                              <SelectItem value="priority">Priority</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="fontScale"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Display Font Size</FormLabel>
                          <Select
                            onValueChange={(v) => field.onChange(Number(v))}
                            value={String(field.value || 100)}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-fontScale">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="85">Small (85%)</SelectItem>
                              <SelectItem value="100">Medium (100%)</SelectItem>
                              <SelectItem value="120">Large (120%)</SelectItem>
                              <SelectItem value="140">Extra Large (140%)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-xs">Scale all text on this KDS display for readability</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Order Flow */}
                <div className="border rounded-md p-4 space-y-3">
                  <h4 className="font-medium text-sm">Order Flow</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="showDraftItems"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-sm">Show Draft (Unsent) Items</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-showDraftItems" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="showSentItemsOnly"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-sm">Show Sent Items Only</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-showSentItemsOnly" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="allowBump"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-sm">Allow Bump</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-allowBump" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="allowRecall"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-sm">Allow Recall</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-allowRecall" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="allowVoidDisplay"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-sm">Allow Void Display</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-allowVoidDisplay" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="expoMode"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-sm">Expo Mode</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-expoMode" />
                          </FormControl>
                          <FormDescription className="text-xs sr-only">Aggregates all items for final check before serving</FormDescription>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Notifications */}
                <div className="border rounded-md p-4 space-y-3">
                  <h4 className="font-medium text-sm">Notifications</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="newOrderSound"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-sm">New Order Sound</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-newOrderSound" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="newOrderBlinkSeconds"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Order Blink Duration (seconds)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              value={field.value ?? 5}
                              onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                              data-testid="input-newOrderBlinkSeconds"
                            />
                          </FormControl>
                          <FormDescription className="text-xs">How long new tickets flash (0 to disable)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Color Alerts */}
                <div className="border rounded-md p-4 space-y-3">
                  <h4 className="font-medium text-sm">Color Alerts</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="colorAlert1Enabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-sm">Enable First Alert</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-colorAlert1Enabled" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="colorAlert1Seconds"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Alert After (seconds)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              value={field.value ?? 60}
                              onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                              data-testid="input-colorAlert1Seconds"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="colorAlert1Color"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Alert Color</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || "yellow"}>
                            <FormControl>
                              <SelectTrigger data-testid="select-colorAlert1Color">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {colorOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="colorAlert2Enabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-sm">Enable Second Alert</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-colorAlert2Enabled" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="colorAlert2Seconds"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Second Alert After (seconds)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              value={field.value ?? 180}
                              onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                              data-testid="input-colorAlert2Seconds"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="colorAlert2Color"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Second Alert Color</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || "red"}>
                            <FormControl>
                              <SelectTrigger data-testid="select-colorAlert2Color">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {colorOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Network */}
                <div className="border rounded-md p-4 space-y-3">
                  <h4 className="font-medium text-sm">Network</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="wsChannel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>WebSocket Channel</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., kds-hot-1" {...field} value={field.value ?? ""} data-testid="input-wsChannel" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="ipAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>IP Address</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., 192.168.1.100" {...field} value={field.value ?? ""} data-testid="input-ipAddress" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="showTimers"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-sm">Show Timers</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-showTimers" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <DataTable
        data={kdsDevices}
        columns={columns}
        title="KDS Devices"
        onAdd={() => {
          setEditingItem(null);
          setFormOpen(true);
        }}
        onEdit={(item) => {
          setEditingItem(item);
          setFormOpen(true);
        }}
        onDelete={(item) => deleteMutation.mutate(item.id)}
        isLoading={isLoading}
        searchPlaceholder="Search KDS devices..."
        emptyMessage="No KDS devices configured"
      />
    </div>
  );
}
