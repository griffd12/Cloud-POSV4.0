import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { getScopeColumn, getZoneColumn, getInheritanceColumn } from "@/components/admin/scope-column";
import { useScopeLookup } from "@/hooks/use-scope-lookup";
import { insertDiscountSchema, type Discount, type InsertDiscount } from "@shared/schema";
import { useConfigOverride } from "@/hooks/use-config-override";

export default function DiscountsPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Discount | null>(null);
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();

  const { data: discounts = [], isLoading } = useQuery<Discount[]>({
    queryKey: ["/api/discounts", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/discounts${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { getOverrideActions, filterOverriddenInherited, canDeleteItem, getScopeQueryParams } = useConfigOverride<Discount>("discount", ["/api/discounts"]);
  const displayedDiscounts = filterOverriddenInherited(discounts);

  const columns: Column<Discount>[] = [
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
      key: "requiresManagerApproval",
      header: "Manager Approval",
      render: (value) => (value ? <Badge>Required</Badge> : "-"),
    },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
    getScopeColumn(),
    getZoneColumn<Discount>(scopeLookup),
    getInheritanceColumn<Discount>(selectedPropertyId, selectedRvcId),
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "Discount Name", type: "text", placeholder: "e.g., Senior Discount", required: true },
    { name: "code", label: "Code", type: "text", placeholder: "e.g., SEN10", required: true },
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
    { name: "value", label: "Value", type: "decimal", placeholder: "e.g., 10 for 10% or $10", required: true },
    { name: "requiresManagerApproval", label: "Requires Manager Approval", type: "switch", defaultValue: false },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertDiscount) => {
      const response = await apiRequest("POST", "/api/discounts", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discounts", filterKeys] });
      setFormOpen(false);
      toast({ title: "Discount created" });
    },
    onError: () => {
      toast({ title: "Failed to create discount", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Discount) => {
      const response = await apiRequest("PUT", "/api/discounts/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discounts", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Discount updated" });
    },
    onError: () => {
      toast({ title: "Failed to update discount", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/discounts/" + id + getScopeQueryParams());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discounts", filterKeys] });
      toast({ title: "Discount deleted" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete discount", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertDiscount) => {
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
        data={displayedDiscounts}
        columns={columns}
        title="Discounts"
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
        searchPlaceholder="Search discounts..."
        emptyMessage="No discounts configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertDiscountSchema}
        fields={formFields}
        title={editingItem ? "Edit Discount" : "Add Discount"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
