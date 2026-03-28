import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { insertPropertySchema, type Property, type InsertProperty, type Enterprise, type Workstation } from "@shared/schema";

export default function PropertiesPage() {
  const { toast } = useToast();
  const { selectedEnterpriseId, selectedPropertyId: emcPropertyId, scopePayload, filterParam } = useEmcFilter();
  usePosWebSocket();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Property | null>(null);

  const { data: allProperties = [], isLoading } = useQuery<Property[]>({
    queryKey: ["/api/properties", selectedEnterpriseId],
    queryFn: async () => {
      const enterpriseOnlyParam = selectedEnterpriseId ? `?enterpriseId=${selectedEnterpriseId}` : "";
      const res = await failoverFetch(`/api/properties${enterpriseOnlyParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const properties = emcPropertyId
    ? allProperties.filter(p => p.id === emcPropertyId)
    : allProperties;

  const { data: enterprises = [] } = useQuery<Enterprise[]>({
    queryKey: ["/api/enterprises"],
  });

  const { data: allWorkstations = [] } = useQuery<Workstation[]>({
    queryKey: ["/api/workstations", selectedEnterpriseId],
    queryFn: async () => {
      const param = selectedEnterpriseId ? `?enterpriseId=${selectedEnterpriseId}` : "";
      const res = await failoverFetch(`/api/workstations${param}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch workstations");
      return res.json();
    },
  });

  const timezoneOptions = [
    { value: "America/New_York", label: "Eastern (New York)" },
    { value: "America/Chicago", label: "Central (Chicago)" },
    { value: "America/Denver", label: "Mountain (Denver)" },
    { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
    { value: "America/Anchorage", label: "Alaska" },
    { value: "Pacific/Honolulu", label: "Hawaii" },
  ];

  const rolloverTimeOptions = [
    { value: "00:00", label: "12:00 AM (Midnight)" },
    { value: "01:00", label: "1:00 AM" },
    { value: "02:00", label: "2:00 AM" },
    { value: "03:00", label: "3:00 AM" },
    { value: "04:00", label: "4:00 AM" },
    { value: "05:00", label: "5:00 AM" },
    { value: "06:00", label: "6:00 AM" },
  ];

  const rolloverModeOptions = [
    { value: "auto", label: "Automatic - System closes day at rollover time" },
    { value: "manual", label: "Manual - Manager must close day manually" },
  ];

  const getRolloverModeLabel = (mode: string | null | undefined) => {
    if (!mode) return "Automatic";
    const option = rolloverModeOptions.find(o => o.value === mode);
    return option?.label?.split(" - ")[0] || mode;
  };

  const getTimezoneLabel = (tz: string | null | undefined) => {
    if (!tz) return "Not Set";
    const option = timezoneOptions.find(o => o.value === tz);
    return option?.label || tz;
  };

  const getRolloverLabel = (time: string | null | undefined) => {
    if (!time) return "4:00 AM";
    const option = rolloverTimeOptions.find(o => o.value === time);
    return option?.label || time;
  };

  const getCapsWsName = (capsWsId: string | null | undefined) => {
    if (!capsWsId) return "None";
    const ws = allWorkstations.find(w => w.id === capsWsId);
    return ws ? ws.name : "Unknown";
  };

  const getWorkstationOptionsForProperty = (propertyId?: string) => {
    const filtered = propertyId
      ? allWorkstations.filter(w => w.propertyId === propertyId)
      : allWorkstations;
    return [
      { value: "__none__", label: "None" },
      ...filtered.map(w => ({ value: w.id, label: `${w.name}${w.ipAddress ? ` (${w.ipAddress})` : ""}` })),
    ];
  };

  const columns: Column<Property>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "code", header: "Code", sortable: true },
    {
      key: "enterpriseId",
      header: "Enterprise",
      render: (value) => enterprises.find((e) => e.id === value)?.name || "-",
    },
    { 
      key: "timezone", 
      header: "Timezone",
      render: (value) => getTimezoneLabel(value as string),
    },
    { 
      key: "businessDateRolloverTime", 
      header: "Day Rollover",
      render: (value) => getRolloverLabel(value as string),
    },
    { 
      key: "businessDateMode", 
      header: "Rollover Mode",
      render: (value) => getRolloverModeLabel(value as string),
    },
    {
      key: "capsWorkstationId",
      header: "CAPS Server",
      render: (value) => value ? (
        <Badge data-testid={`badge-caps-${value}`} variant="secondary">{getCapsWsName(value as string)}</Badge>
      ) : "-",
    },
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "Property Name", type: "text", placeholder: "Enter name", required: true },
    { name: "code", label: "Code", type: "text", placeholder: "e.g., PROP001", required: true },
    {
      name: "enterpriseId",
      label: "Enterprise",
      type: "select",
      options: enterprises.map((e) => ({ value: e.id, label: e.name })),
      required: true,
    },
    {
      name: "timezone",
      label: "Timezone",
      type: "select",
      options: timezoneOptions,
      required: true,
    },
    { name: "address", label: "Address", type: "textarea", placeholder: "Enter address" },
    {
      name: "businessDateRolloverTime",
      label: "Business Day Rollover Time",
      type: "select",
      options: rolloverTimeOptions,
      description: "When the business day ends (e.g., 1 AM means sales until 12:59 AM count as previous day)",
    },
    {
      name: "businessDateMode",
      label: "Rollover Mode",
      type: "select",
      options: rolloverModeOptions,
      description: "Auto: system closes day automatically. Manual: manager must close day via End of Day screen",
    },
    {
      name: "autoClockOutEnabled",
      label: "Auto Clock-Out at Rollover",
      type: "switch",
      description: "Automatically clock out all employees when the business date changes",
    },
    {
      name: "capsWorkstationId",
      label: "CAPS Workstation",
      type: "select",
      options: getWorkstationOptionsForProperty(editingItem?.id),
      description: "Select the workstation that will serve as the CAPS server for this property. All POS and KDS stations connect to this workstation on the local network for check processing.",
    },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertProperty) => {
      const response = await apiRequest("POST", "/api/properties", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      setFormOpen(false);
      toast({ title: "Property created" });
    },
    onError: () => {
      toast({ title: "Failed to create property", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Property) => {
      const response = await apiRequest("PUT", "/api/properties/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Property updated" });
    },
    onError: () => {
      toast({ title: "Failed to update property", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/properties/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({ title: "Property deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete property", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertProperty) => {
    const cleaned = {
      ...data,
      capsWorkstationId: data.capsWorkstationId === "__none__" ? null : data.capsWorkstationId || null,
    };
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...cleaned });
    } else {
      createMutation.mutate({ ...cleaned, ...scopePayload });
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={properties}
        columns={columns}
        title="Properties"
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
        searchPlaceholder="Search properties..."
        emptyMessage="No properties configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertPropertySchema}
        fields={formFields}
        title={editingItem ? "Edit Property" : "Add Property"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
