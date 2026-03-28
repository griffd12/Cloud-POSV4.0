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
import { insertModifierSchema, type Modifier, type InsertModifier } from "@shared/schema";
import { useConfigOverride } from "@/hooks/use-config-override";

export default function ModifiersPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();
  usePosWebSocket();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Modifier | null>(null);

  const { data: modifiers = [], isLoading } = useQuery<Modifier[]>({
    queryKey: ["/api/modifiers", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/modifiers${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch modifiers");
      return res.json();
    },
  });

  const { getOverrideActions, filterOverriddenInherited, canDeleteItem, getScopeQueryParams } = useConfigOverride<Modifier>("modifier", ["/api/modifiers"]);
  const displayedModifiers = filterOverriddenInherited(modifiers);

  const columns: Column<Modifier>[] = [
    { key: "name", header: "Name", sortable: true },
    {
      key: "priceDelta",
      header: "Price Delta",
      render: (value) => {
        const num = parseFloat(value as string);
        if (num === 0) return <span className="text-muted-foreground">No charge</span>;
        return <span className={num > 0 ? "text-green-600" : "text-red-600"}>
          {num > 0 ? "+" : ""}{num.toFixed(2)}
        </span>;
      },
    },
    {
      key: "active",
      header: "Status",
      render: (value) => (
        value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>
      ),
    },
    getScopeColumn(),
    getZoneColumn<Modifier>(scopeLookup),
    getInheritanceColumn<Modifier>(selectedPropertyId, selectedRvcId),
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "Modifier Name", type: "text", placeholder: "e.g., Extra Cheese", required: true },
    { name: "priceDelta", label: "Price Delta", type: "decimal", placeholder: "0.00", defaultValue: "0" },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertModifier) => {
      const response = await apiRequest("POST", "/api/modifiers", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/modifiers", filterKeys] });
      setFormOpen(false);
      toast({ title: "Modifier created" });
    },
    onError: () => {
      toast({ title: "Failed to create modifier", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Modifier) => {
      const response = await apiRequest("PUT", "/api/modifiers/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/modifiers", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Modifier updated" });
    },
    onError: () => {
      toast({ title: "Failed to update modifier", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/modifiers/" + id + getScopeQueryParams());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/modifiers", filterKeys] });
      toast({ title: "Modifier deleted" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete modifier", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertModifier) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate({ ...data, ...scopePayload });
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={displayedModifiers}
        columns={columns}
        title="Modifiers"
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
        searchPlaceholder="Search modifiers..."
        emptyMessage="No modifiers configured. Create modifiers here, then link them to Modifier Groups."
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertModifierSchema}
        fields={formFields}
        title={editingItem ? "Edit Modifier" : "Add Modifier"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
