import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { 
  insertPrintClassSchema, 
  type PrintClass, 
  type InsertPrintClass, 
  type OrderDevice,
  type PrintClassRouting,
  type Property
} from "@shared/schema";
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
import { getScopeColumn, getZoneColumn, getInheritanceColumn } from "@/components/admin/scope-column";
import { useScopeLookup } from "@/hooks/use-scope-lookup";
import { useConfigOverride } from "@/hooks/use-config-override";

export default function PrintClassesPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PrintClass | null>(null);
  const [selectedOrderDevices, setSelectedOrderDevices] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const { data: printClasses = [], isLoading } = useQuery<PrintClass[]>({
    queryKey: ["/api/print-classes", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/print-classes${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { getOverrideActions, filterOverriddenInherited, canDeleteItem, getScopeQueryParams } = useConfigOverride<PrintClass>("print_class", ["/api/print-classes"]);
  const displayedPrintClasses = filterOverriddenInherited(printClasses);

  const { data: orderDevices = [] } = useQuery<OrderDevice[]>({
    queryKey: ["/api/order-devices", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/order-devices${filterParam}`, { headers: getAuthHeaders() });
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

  const { data: allRoutings = [] } = useQuery<PrintClassRouting[]>({
    queryKey: ["/api/print-class-routing", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/print-class-routing${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const columns: Column<PrintClass>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "code", header: "Code", sortable: true },
    {
      key: "id",
      header: "Order Devices",
      render: (value) => {
        const linkedDevices = allRoutings
          .filter(r => r.printClassId === value)
          .map(r => orderDevices.find(od => od.id === r.orderDeviceId)?.name)
          .filter(Boolean);
        
        if (linkedDevices.length === 0) {
          return <span className="text-muted-foreground">None</span>;
        }
        
        return (
          <div className="flex flex-wrap gap-1">
            {linkedDevices.map((name, i) => (
              <Badge key={i} variant="secondary">{name}</Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: "active",
      header: "Active",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
    getScopeColumn(),
    getZoneColumn<PrintClass>(scopeLookup),
    getInheritanceColumn<PrintClass>(selectedPropertyId, selectedRvcId),
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertPrintClass) => {
      const response = await apiRequest("POST", "/api/print-classes", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-classes", filterKeys] });
      queryClient.invalidateQueries({ queryKey: ["/api/print-class-routing", filterKeys] });
    },
    onError: () => {
      toast({ title: "Failed to create print class", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: PrintClass) => {
      const response = await apiRequest("PUT", "/api/print-classes/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-classes", filterKeys] });
      queryClient.invalidateQueries({ queryKey: ["/api/print-class-routing", filterKeys] });
    },
    onError: () => {
      toast({ title: "Failed to update print class", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/print-classes/" + id + getScopeQueryParams());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-classes", filterKeys] });
      queryClient.invalidateQueries({ queryKey: ["/api/print-class-routing", filterKeys] });
      toast({ title: "Print class deleted" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete print class", 
        description: error?.message || "This print class may still be in use.",
        variant: "destructive" 
      });
    },
  });

  const form = useForm<InsertPrintClass>({
    resolver: zodResolver(insertPrintClassSchema),
    defaultValues: {
      name: "",
      code: "",
      active: true,
    },
  });

  const resetForm = () => {
    form.reset({
      name: "",
      code: "",
      active: true,
    });
    setSelectedOrderDevices([]);
  };

  const openAdd = () => {
    setEditingItem(null);
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (item: PrintClass) => {
    setEditingItem(item);
    const initialOrderDevices = allRoutings.filter(r => r.printClassId === item.id).map(r => r.orderDeviceId);
    setSelectedOrderDevices(initialOrderDevices);
    form.reset({
      name: item.name,
      code: item.code,
      enterpriseId: item.enterpriseId,
      propertyId: item.propertyId,
      rvcId: item.rvcId,
      active: item.active ?? true,
    });
    setFormOpen(true);
  };

  const handleCancel = () => {
    setFormOpen(false);
    setEditingItem(null);
    resetForm();
  };

  const toggleOrderDevice = (orderDeviceId: string) => {
    setSelectedOrderDevices(prev => 
      prev.includes(orderDeviceId)
        ? prev.filter(id => id !== orderDeviceId)
        : [...prev, orderDeviceId]
    );
  };

  const getPropertyName = (propertyId: string) => {
    return properties.find(p => p.id === propertyId)?.name || "Unknown";
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSaving) return;

    const valid = await form.trigger();
    if (!valid) return;

    const data = form.getValues();
    setIsSaving(true);
    try {
      let printClassId: string;
      
      if (editingItem) {
        await updateMutation.mutateAsync({ ...editingItem, ...data });
        printClassId = editingItem.id;
      } else {
        const result = await createMutation.mutateAsync({ ...data, ...scopePayload });
        printClassId = result.id;
      }

      const existingRoutingsForClass = allRoutings.filter(r => r.printClassId === printClassId);
      const existingOrderDeviceIds = existingRoutingsForClass.map(r => r.orderDeviceId);

      const toAdd = selectedOrderDevices.filter(id => !existingOrderDeviceIds.includes(id));
      const toRemove = existingRoutingsForClass.filter(r => !selectedOrderDevices.includes(r.orderDeviceId));

      for (const orderDeviceId of toAdd) {
        await apiRequest("POST", "/api/print-class-routing", {
          printClassId,
          orderDeviceId,
        });
      }

      for (const routing of toRemove) {
        await apiRequest("DELETE", `/api/print-class-routing/${routing.id}`);
      }

      queryClient.invalidateQueries({ queryKey: ["/api/print-class-routing", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      resetForm();
      toast({ title: editingItem ? "Print class updated" : "Print class created" });
    } catch (error) {
      toast({ title: "Failed to save print class", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const isFormLoading = createMutation.isPending || updateMutation.isPending || isSaving;

  if (formOpen) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle data-testid="text-form-title">
                {editingItem ? "Edit Print Class" : "Add Print Class"}
              </CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="print-class-form"
                  data-testid="button-save"
                  disabled={isFormLoading}
                >
                  {isFormLoading ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form id="print-class-form" onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Print Class Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Hot/Cold" {...field} data-testid="input-name" />
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
                          <Input placeholder="e.g., HOT_COLD" {...field} data-testid="input-code" />
                        </FormControl>
                        <FormDescription>Short code for identification</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="active"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between pt-6">
                        <FormLabel>Active</FormLabel>
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
                </div>

                <div className="border rounded-md p-4 space-y-3">
                  <div>
                    <h4 className="font-medium text-sm">Order Devices</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Select which Order Devices should receive orders for menu items using this Print Class.
                    </p>
                  </div>

                  {orderDevices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No order devices configured. Please create order devices first.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {orderDevices.map((device) => (
                        <div 
                          key={device.id} 
                          className="flex items-center space-x-3 p-2 rounded-md hover-elevate cursor-pointer"
                          onClick={() => toggleOrderDevice(device.id)}
                          data-testid={`row-orderdevice-${device.id}`}
                        >
                          <Checkbox 
                            checked={selectedOrderDevices.includes(device.id)}
                            onCheckedChange={() => {}}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleOrderDevice(device.id);
                            }}
                            data-testid={`checkbox-orderdevice-${device.id}`}
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{device.name}</span>
                              <Badge variant="outline" className="text-xs">{device.code}</Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {getPropertyName(device.propertyId)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedOrderDevices.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground">
                        Selected: {selectedOrderDevices.length} device(s)
                      </p>
                    </div>
                  )}
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
        data={displayedPrintClasses}
        columns={columns}
        title="Print Classes"
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(item) => deleteMutation.mutate(item.id)}
        canDelete={canDeleteItem}
        customActions={getOverrideActions()}
        isLoading={isLoading}
        searchPlaceholder="Search print classes..."
        emptyMessage="No print classes configured"
      />
    </div>
  );
}
