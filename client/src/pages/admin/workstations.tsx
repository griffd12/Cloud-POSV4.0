import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { type Workstation, type InsertWorkstation, type Property, type Rvc, type Printer, type OrderDevice } from "@shared/schema";
import { getScopeColumn, getZoneColumn, getInheritanceColumn } from "@/components/admin/scope-column";
import { useScopeLookup } from "@/hooks/use-scope-lookup";
import { WorkstationForm } from "./workstation-form";

export default function WorkstationsPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedPropertyId: contextPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Workstation | null>(null);

  const { data: workstations = [], isLoading } = useQuery<Workstation[]>({
    queryKey: ["/api/workstations", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/workstations${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch workstations");
      return res.json();
    },
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: rvcs = [] } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/rvcs${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch rvcs");
      return res.json();
    },
  });

  const { data: printers = [] } = useQuery<Printer[]>({
    queryKey: ["/api/printers", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/printers${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch printers");
      return res.json();
    },
  });

  const { data: orderDevices = [] } = useQuery<OrderDevice[]>({
    queryKey: ["/api/order-devices", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/order-devices${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch order devices");
      return res.json();
    },
  });

  const capsWorkstationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const prop of properties) {
      if (prop.capsWorkstationId) ids.add(prop.capsWorkstationId);
    }
    return ids;
  }, [properties]);

  const columns: Column<Workstation>[] = useMemo(() => [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (value: any, row: Workstation) => (
        <span className="flex items-center gap-2">
          {value}
          {capsWorkstationIds.has(row.id) && (
            <Badge data-testid={`badge-caps-ws-${row.id}`} className="bg-blue-600 text-white text-[10px] px-1.5 py-0">CAPS</Badge>
          )}
        </span>
      ),
    },
    {
      key: "deviceType",
      header: "Type",
      render: (value: any) => (
        <Badge variant="outline">
          {value === "pos_terminal" ? "POS Terminal" : value === "kiosk" ? "Kiosk" : "Manager Station"}
        </Badge>
      ),
    },
    {
      key: "propertyId",
      header: "Property",
      render: (value: any) => properties.find((p) => p.id === value)?.name || "-",
    },
    {
      key: "rvcId",
      header: "RVC",
      render: (value: any) => rvcs.find((r) => r.id === value)?.name || "-",
    },
    { key: "ipAddress", header: "IP Address" },
    {
      key: "defaultReceiptPrinterId",
      header: "Receipt Printer",
      render: (value: any) => printers.find((p) => p.id === value)?.name || "-",
    },
    {
      key: "fastTransactionEnabled",
      header: "Fast Transaction",
      render: (value: any) => (value ? <Badge variant="secondary">Yes</Badge> : "-"),
    },
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
    getZoneColumn<Workstation>(scopeLookup),
    getInheritanceColumn<Workstation>(contextPropertyId, selectedRvcId),
  ], [properties, rvcs, printers, capsWorkstationIds, scopeLookup, contextPropertyId, selectedRvcId]);

  const printerOptions = useMemo(() => {
    const getPropertyName = (propertyId: string) => {
      const prop = properties.find(p => p.id === propertyId);
      return prop?.name || "Unknown";
    };
    return [
      { value: "__none__", label: "None" },
      ...printers.map((p) => ({
        value: p.id,
        label: `${p.name} (${p.printerType}) - ${getPropertyName(p.propertyId)}`,
      })),
    ];
  }, [printers, properties]);

  const rvcOptions = useMemo(() => [
    { value: "__none__", label: "None" },
    ...rvcs.map((r) => ({ value: r.id, label: r.name })),
  ], [rvcs]);

  const saveOrderDeviceAssignments = async (workstationId: string, orderDeviceIds: string[]) => {
    await apiRequest("PUT", `/api/workstations/${workstationId}/order-devices`, { orderDeviceIds });
  };

  const createMutation = useMutation({
    mutationFn: async ({ data, orderDeviceIds }: { data: InsertWorkstation; orderDeviceIds: string[] }) => {
      const response = await apiRequest("POST", "/api/workstations", { ...data, ...scopePayload });
      const ws = await response.json();
      await saveOrderDeviceAssignments(ws.id, orderDeviceIds);
      return ws;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workstations", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Workstation created" });
    },
    onError: () => {
      toast({ title: "Failed to create workstation", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ data, orderDeviceIds }: { data: Workstation; orderDeviceIds: string[] }) => {
      const response = await apiRequest("PUT", "/api/workstations/" + data.id, data);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
      const ws = await response.json();
      await saveOrderDeviceAssignments(data.id, orderDeviceIds);
      return ws;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workstations", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Workstation updated" });
    },
    onError: (error) => {
      toast({ title: "Failed to update workstation", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/workstations/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workstations", filterKeys] });
      toast({ title: "Workstation deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete workstation", variant: "destructive" });
    },
  });

  const handleFormSave = (data: InsertWorkstation | Workstation, orderDeviceIds: string[]) => {
    if (editingItem) {
      updateMutation.mutate({ data: data as Workstation, orderDeviceIds });
    } else {
      createMutation.mutate({ data: data as InsertWorkstation, orderDeviceIds });
    }
  };

  const handleFormCancel = () => {
    setFormOpen(false);
    setEditingItem(null);
  };

  if (formOpen) {
    const resolvedDefaultPropertyId = contextPropertyId || properties[0]?.id || "";
    const formKey = editingItem ? `edit-${editingItem.id}` : `new-${resolvedDefaultPropertyId}`;
    return (
      <WorkstationForm
        key={formKey}
        editingItem={editingItem}
        properties={properties}
        printers={printers}
        orderDevices={orderDevices}
        rvcOptions={rvcOptions}
        printerOptions={printerOptions}
        defaultPropertyId={resolvedDefaultPropertyId}
        isSaving={createMutation.isPending || updateMutation.isPending}
        onSave={handleFormSave}
        onCancel={handleFormCancel}
      />
    );
  }

  return (
    <div className="p-6">
      <DataTable
        data={workstations}
        columns={columns}
        title="Workstations"
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
        searchPlaceholder="Search workstations..."
        emptyMessage="No workstations configured"
      />
    </div>
  );
}
