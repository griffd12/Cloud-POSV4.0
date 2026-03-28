import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { getScopeColumn, getZoneColumn, getInheritanceColumn } from "@/components/admin/scope-column";
import { useScopeLookup } from "@/hooks/use-scope-lookup";
import { insertServiceChargeSchema, type ServiceCharge, type InsertServiceCharge } from "@shared/schema";
import { useConfigOverride } from "@/hooks/use-config-override";

export default function ServiceChargesPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ServiceCharge | null>(null);
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();

  const { data: serviceCharges = [], isLoading } = useQuery<ServiceCharge[]>({
    queryKey: ["/api/service-charges", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/service-charges${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { getOverrideActions, filterOverriddenInherited, canDeleteItem, getScopeQueryParams } = useConfigOverride<ServiceCharge>("service_charge", ["/api/service-charges"]);
  const displayedServiceCharges = filterOverriddenInherited(serviceCharges);

  const { data: taxGroups = [] } = useQuery<any[]>({
    queryKey: ["/api/tax-groups", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/tax-groups${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const columns: Column<ServiceCharge>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "code", header: "Code", sortable: true },
    {
      key: "type",
      header: "Type",
      render: (value) => <Badge variant="outline">{value}</Badge>,
    },
    {
      key: "value",
      header: "Value",
      render: (value, row) =>
        row.type === "percent" ? `${value}%` : `$${parseFloat(value || "0").toFixed(2)}`,
    },
    {
      key: "autoApply",
      header: "Auto Apply",
      render: (value) => (value ? <Badge>Yes</Badge> : "-"),
    },
    {
      key: "isTaxable",
      header: "Taxable",
      render: (value) => (value ? <Badge>Yes</Badge> : "-"),
    },
    {
      key: "revenueCategory",
      header: "Revenue",
      render: (value) => <Badge variant="outline">{value === "non_revenue" ? "Non-Revenue" : "Revenue"}</Badge>,
    },
    {
      key: "postToTipPool",
      header: "Tip Pool",
      render: (value) => (value ? <Badge>Yes</Badge> : "-"),
    },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
    getScopeColumn(),
    getZoneColumn<ServiceCharge>(scopeLookup),
    getInheritanceColumn<ServiceCharge>(selectedPropertyId, selectedRvcId),
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "Charge Name", type: "text", placeholder: "e.g., Delivery Fee", required: true },
    { name: "code", label: "Code", type: "text", placeholder: "e.g., DELFEE", required: true },
    {
      name: "type",
      label: "Type",
      type: "select",
      options: [
        { value: "percent", label: "Percentage" },
        { value: "amount", label: "Fixed Amount" },
      ],
      required: true,
    },
    { name: "value", label: "Value", type: "decimal", placeholder: "e.g., 5.00", required: true },
    { name: "autoApply", label: "Auto Apply", type: "switch", description: "Automatically apply to applicable orders", defaultValue: false },
    { name: "isTaxable", label: "Taxable", type: "switch", description: "Subject to tax", defaultValue: false },
    {
      name: "taxGroupId",
      label: "Tax Group",
      type: "select",
      options: [
        { value: "", label: "None" },
        ...taxGroups.map((tg: any) => ({ value: tg.id, label: `${tg.name} (${tg.rate}%)` })),
      ],
    },
    {
      name: "revenueCategory",
      label: "Revenue Category",
      type: "select",
      options: [
        { value: "revenue", label: "Revenue" },
        { value: "non_revenue", label: "Non-Revenue" },
      ],
      required: true,
    },
    { name: "postToTipPool", label: "Post to Tip Pool", type: "switch", description: "Include in tip pool calculations", defaultValue: false },
    { name: "tipEligible", label: "Tip Eligible", type: "switch", description: "Distributed to employees as tips", defaultValue: false },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertServiceCharge) => {
      const response = await apiRequest("POST", "/api/service-charges", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-charges", filterKeys] });
      setFormOpen(false);
      toast({ title: "Service charge created" });
    },
    onError: () => {
      toast({ title: "Failed to create service charge", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ServiceCharge) => {
      const response = await apiRequest("PUT", "/api/service-charges/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-charges", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Service charge updated" });
    },
    onError: () => {
      toast({ title: "Failed to update service charge", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/service-charges/" + id + getScopeQueryParams());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-charges", filterKeys] });
      toast({ title: "Service charge deleted" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete service charge", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertServiceCharge) => {
    // Convert value to string for decimal field
    const formattedData = {
      ...data,
      value: String(data.value),
    };
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...formattedData });
    } else {
      createMutation.mutate({ ...formattedData, ...scopePayload });
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={displayedServiceCharges}
        columns={columns}
        title="Service Charges"
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
        searchPlaceholder="Search service charges..."
        emptyMessage="No service charges configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertServiceChargeSchema}
        fields={formFields}
        title={editingItem ? "Edit Service Charge" : "Add Service Charge"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
