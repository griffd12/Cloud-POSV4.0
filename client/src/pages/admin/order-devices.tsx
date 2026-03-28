import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { insertOrderDeviceSchema, type OrderDevice, type InsertOrderDevice, type Property, type KdsDevice } from "@shared/schema";
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
import { useConfigOverride } from "@/hooks/use-config-override";

export default function OrderDevicesPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OrderDevice | null>(null);

  const { data: orderDevices = [], isLoading } = useQuery<OrderDevice[]>({
    queryKey: ["/api/order-devices", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/order-devices${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { getOverrideActions, filterOverriddenInherited, canDeleteItem, getScopeQueryParams } = useConfigOverride<OrderDevice>("order_device", ["/api/order-devices"]);
  const displayedOrderDevices = filterOverriddenInherited(orderDevices);

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
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

  const columns: Column<OrderDevice>[] = useMemo(() => [
    { key: "name", header: "Name", sortable: true },
    { key: "code", header: "Code" },
    {
      key: "propertyId",
      header: "Property",
      render: (value: any) => properties.find((p) => p.id === value)?.name || "-",
    },
    {
      key: "kdsDeviceId",
      header: "Controller KDS",
      render: (value: any) => {
        const kds = kdsDevices.find((k) => k.id === value);
        if (!kds) return <span className="text-muted-foreground">None</span>;
        return (
          <Badge variant="outline">
            {kds.name} ({kds.stationType})
          </Badge>
        );
      },
    },
    {
      key: "sendOn",
      header: "Send On",
      render: (value: any) => (
        <Badge variant="secondary">
          {value === "send_button" ? "Send Button" : "Dynamic"}
        </Badge>
      ),
    },
    {
      key: "sendVoids",
      header: "Send Voids",
      render: (value: any) => (value ? <Badge variant="secondary">Yes</Badge> : "-"),
    },
    {
      key: "active",
      header: "Status",
      render: (value: any) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
    getScopeColumn(),
    getZoneColumn<OrderDevice>(scopeLookup),
    getInheritanceColumn<OrderDevice>(contextPropertyId, selectedRvcId),
  ], [properties, kdsDevices, scopeLookup, contextPropertyId, selectedRvcId]);

  const kdsOptions = useMemo(() => {
    const getPropertyName = (propertyId: string) => {
      const prop = properties.find(p => p.id === propertyId);
      return prop?.name || "Unknown";
    };
    return [
      { value: "__none__", label: "None (No Controller)" },
      ...kdsDevices.map((k) => ({ 
        value: k.id, 
        label: `${k.name} (${k.stationType}) - ${getPropertyName(k.propertyId)}` 
      })),
    ];
  }, [kdsDevices, properties]);

  const form = useForm<InsertOrderDevice>({
    resolver: zodResolver(insertOrderDeviceSchema),
    defaultValues: {
      name: "",
      code: "",
      propertyId: "",
      kdsDeviceId: null,
      sendOn: "send_button",
      sendVoids: true,
      sendReprints: true,
      active: true,
    },
  });

  useEffect(() => {
    if (formOpen) {
      if (editingItem) {
        form.reset({
          name: editingItem.name,
          code: editingItem.code,
          propertyId: editingItem.propertyId,
          kdsDeviceId: editingItem.kdsDeviceId || "__none__",
          sendOn: editingItem.sendOn || "send_button",
          sendVoids: editingItem.sendVoids ?? true,
          sendReprints: editingItem.sendReprints ?? true,
          active: editingItem.active ?? true,
        });
      } else {
        const defaultPropertyId = contextPropertyId || properties[0]?.id || "";
        form.reset({
          name: "",
          code: "",
          propertyId: defaultPropertyId,
          kdsDeviceId: null,
          sendOn: "send_button",
          sendVoids: true,
          sendReprints: true,
          active: true,
        });
      }
    }
  }, [formOpen, editingItem, properties]);

  const cleanKdsDeviceId = (value: string | null | undefined): string | null => {
    if (!value || value === "__none__") return null;
    return value;
  };

  const createMutation = useMutation({
    mutationFn: async (data: InsertOrderDevice) => {
      const response = await apiRequest("POST", "/api/order-devices", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/order-devices", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      form.reset();
      toast({ title: "Order device created" });
    },
    onError: () => {
      toast({ title: "Failed to create order device", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: OrderDevice) => {
      const response = await apiRequest("PUT", "/api/order-devices/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/order-devices", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      form.reset();
      toast({ title: "Order device updated" });
    },
    onError: () => {
      toast({ title: "Failed to update order device", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/order-devices/" + id + getScopeQueryParams());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/order-devices", filterKeys] });
      toast({ title: "Order device deleted" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete order device", variant: "destructive" });
    },
  });

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    form.handleSubmit((data: InsertOrderDevice) => {
      const cleanedData = {
        ...data,
        kdsDeviceId: cleanKdsDeviceId(data.kdsDeviceId),
      };
      if (editingItem) {
        updateMutation.mutate({ ...editingItem, ...cleanedData });
      } else {
        createMutation.mutate({ ...cleanedData, ...scopePayload });
      }
    })();
  };

  const handleCancel = () => {
    setFormOpen(false);
    setEditingItem(null);
    form.reset();
  };

  if (formOpen) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle data-testid="text-form-title">{editingItem ? "Edit Order Device" : "Add Order Device"}</CardTitle>
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
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Device Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Hot Line Expo" {...field} data-testid="input-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Code</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., HOTLINE" {...field} data-testid="input-code" />
                        </FormControl>
                        <FormDescription className="text-xs">Short code for routing</FormDescription>
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
                </div>

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

                <div className="border rounded-md p-4 space-y-3">
                  <h4 className="font-medium text-sm">Routing Configuration</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="kdsDeviceId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Controller KDS Device</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value || "__none__"}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-kdsDeviceId">
                                <SelectValue placeholder="Select KDS device" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {kdsOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-xs">The KDS device that controls this order device's display and behavior settings</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="sendOn"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Send On</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || "send_button"}>
                            <FormControl>
                              <SelectTrigger data-testid="select-sendOn">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="send_button">Send Button - Manual send</SelectItem>
                              <SelectItem value="dynamic">Dynamic - Auto-send when ready</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-xs">When should orders be sent to this device</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="border rounded-md p-4 space-y-3">
                  <h4 className="font-medium text-sm">Device Behavior</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="sendVoids"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <div>
                            <FormLabel className="text-sm">Send Voids</FormLabel>
                            <FormDescription className="text-xs">Send void notifications to this device</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-sendVoids" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="sendReprints"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <div>
                            <FormLabel className="text-sm">Send Reprints</FormLabel>
                            <FormDescription className="text-xs">Allow reprints on this device</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-sendReprints" />
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
        data={displayedOrderDevices}
        columns={columns}
        title="Order Devices"
        onAdd={() => {
          setEditingItem(null);
          setFormOpen(true);
        }}
        onEdit={(item) => {
          setEditingItem(item);
          setFormOpen(true);
        }}
        onDelete={(item) => deleteMutation.mutate(item.id)}
        canDelete={canDeleteItem}
        customActions={getOverrideActions()}
        isLoading={isLoading}
        searchPlaceholder="Search order devices..."
        emptyMessage="No order devices configured"
      />
    </div>
  );
}
