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
import { insertMajorGroupSchema, type MajorGroup, type InsertMajorGroup } from "@shared/schema";
import { useConfigOverride } from "@/hooks/use-config-override";

export default function MajorGroupsPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MajorGroup | null>(null);
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();

  const { data: majorGroups = [], isLoading } = useQuery<MajorGroup[]>({
    queryKey: ["/api/major-groups", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/major-groups${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { getOverrideActions, filterOverriddenInherited, canDeleteItem, getScopeQueryParams } = useConfigOverride<MajorGroup>("major_group", ["/api/major-groups"]);
  const displayedMajorGroups = filterOverriddenInherited(majorGroups);

  const columns: Column<MajorGroup>[] = [
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
    getZoneColumn<MajorGroup>(scopeLookup),
    getInheritanceColumn<MajorGroup>(selectedPropertyId, selectedRvcId),
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "Major Group Name", type: "text", placeholder: "e.g., Food", required: true },
    { name: "code", label: "Code", type: "text", placeholder: "e.g., FOOD", required: true },
    { name: "displayOrder", label: "Display Order", type: "number", defaultValue: 0 },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertMajorGroup) => {
      const response = await apiRequest("POST", "/api/major-groups", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/major-groups", filterKeys] });
      setFormOpen(false);
      toast({ title: "Major group created" });
    },
    onError: () => {
      toast({ title: "Failed to create major group", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: MajorGroup) => {
      const response = await apiRequest("PUT", "/api/major-groups/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/major-groups", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Major group updated" });
    },
    onError: () => {
      toast({ title: "Failed to update major group", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/major-groups/" + id + getScopeQueryParams());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/major-groups", filterKeys] });
      toast({ title: "Major group deleted" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete major group", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertMajorGroup) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate({ ...data, ...scopePayload });
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={displayedMajorGroups}
        columns={columns}
        title="Major Groups"
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
        searchPlaceholder="Search major groups..."
        emptyMessage="No major groups configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertMajorGroupSchema}
        fields={formFields}
        title={editingItem ? "Edit Major Group" : "Add Major Group"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
