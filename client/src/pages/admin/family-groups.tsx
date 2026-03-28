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
import { insertFamilyGroupSchema, type FamilyGroup, type InsertFamilyGroup } from "@shared/schema";
import { useConfigOverride } from "@/hooks/use-config-override";

export default function FamilyGroupsPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FamilyGroup | null>(null);
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();

  const { data: familyGroups = [], isLoading } = useQuery<FamilyGroup[]>({
    queryKey: ["/api/family-groups", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/family-groups${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { getOverrideActions, filterOverriddenInherited, canDeleteItem, getScopeQueryParams } = useConfigOverride<FamilyGroup>("family_group", ["/api/family-groups"]);
  const displayedFamilyGroups = filterOverriddenInherited(familyGroups);

  const columns: Column<FamilyGroup>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "code", header: "Code", sortable: true },
    {
      key: "displayOrder",
      header: "Order",
      sortable: true,
    },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
    getScopeColumn(),
    getZoneColumn<FamilyGroup>(scopeLookup),
    getInheritanceColumn<FamilyGroup>(selectedPropertyId, selectedRvcId),
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "Family Group Name", type: "text", placeholder: "e.g., Appetizers", required: true },
    { name: "code", label: "Code", type: "text", placeholder: "e.g., APPS", required: true },
    { name: "displayOrder", label: "Display Order", type: "number", defaultValue: 0 },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertFamilyGroup) => {
      const response = await apiRequest("POST", "/api/family-groups", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/family-groups", filterKeys] });
      setFormOpen(false);
      toast({ title: "Family group created" });
    },
    onError: () => {
      toast({ title: "Failed to create family group", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FamilyGroup) => {
      const response = await apiRequest("PUT", "/api/family-groups/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/family-groups", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Family group updated" });
    },
    onError: () => {
      toast({ title: "Failed to update family group", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/family-groups/" + id + getScopeQueryParams());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/family-groups", filterKeys] });
      toast({ title: "Family group deleted" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete family group", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertFamilyGroup) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate({ ...data, ...scopePayload });
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={displayedFamilyGroups}
        columns={columns}
        title="Family Groups"
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
        searchPlaceholder="Search family groups..."
        emptyMessage="No family groups configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertFamilyGroupSchema}
        fields={formFields}
        title={editingItem ? "Edit Family Group" : "Add Family Group"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
