import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { getScopeColumn, getZoneColumn, getInheritanceColumn } from "@/components/admin/scope-column";
import { useScopeLookup } from "@/hooks/use-scope-lookup";
import { insertModifierGroupSchema, type ModifierGroup, type InsertModifierGroup, type Modifier, type ModifierGroupModifier } from "@shared/schema";
import { Link2 } from "lucide-react";
import { useConfigOverride } from "@/hooks/use-config-override";

export default function ModifierGroupsPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ModifierGroup | null>(null);
  const [linkingGroup, setLinkingGroup] = useState<ModifierGroup | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Set<string>>(new Set());

  const { data: modifierGroups = [], isLoading } = useQuery<ModifierGroup[]>({
    queryKey: ["/api/modifier-groups", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/modifier-groups${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch modifier groups");
      return res.json();
    },
  });

  const { getOverrideActions, filterOverriddenInherited, canDeleteItem, getScopeQueryParams } = useConfigOverride<ModifierGroup>("modifier_group", ["/api/modifier-groups"]);
  const displayedModifierGroups = filterOverriddenInherited(modifierGroups);

  const { data: allModifiers = [] } = useQuery<Modifier[]>({
    queryKey: ["/api/modifiers", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/modifiers${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch modifiers");
      return res.json();
    },
  });

  const { data: linkedModifiersData, refetch: refetchLinked } = useQuery<ModifierGroupModifier[]>({
    queryKey: ["/api/modifier-groups", linkingGroup?.id, "modifiers"],
    queryFn: async () => {
      if (!linkingGroup) return [];
      const res = await failoverFetch(`/api/modifier-groups/${linkingGroup.id}/modifiers`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!linkingGroup,
  });
  
  const linkedModifiers = Array.isArray(linkedModifiersData) ? linkedModifiersData : [];

  const columns: Column<ModifierGroup>[] = [
    { key: "name", header: "Name", sortable: true },
    {
      key: "required",
      header: "Required",
      render: (value) => (value ? <Badge>Required</Badge> : <Badge variant="secondary">Optional</Badge>),
    },
    { key: "minSelect", header: "Min", sortable: true },
    { key: "maxSelect", header: "Max", sortable: true },
    { key: "displayOrder", header: "Order" },
    getScopeColumn(),
    getZoneColumn<ModifierGroup>(scopeLookup),
    getInheritanceColumn<ModifierGroup>(selectedPropertyId, selectedRvcId),
  ];

  const form = useForm<InsertModifierGroup>({
    resolver: zodResolver(insertModifierGroupSchema),
    defaultValues: {
      name: "",
      required: false,
      minSelect: 0,
      maxSelect: 99,
      displayOrder: 0,
    },
  });

  useEffect(() => {
    if (formOpen && editingItem) {
      form.reset({
        name: editingItem.name,
        required: editingItem.required ?? false,
        minSelect: editingItem.minSelect ?? 0,
        maxSelect: editingItem.maxSelect ?? 99,
        displayOrder: editingItem.displayOrder ?? 0,
      });
    } else if (formOpen && !editingItem) {
      form.reset({
        name: "",
        required: false,
        minSelect: 0,
        maxSelect: 99,
        displayOrder: 0,
      });
    }
  }, [formOpen, editingItem]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertModifierGroup) => {
      const response = await apiRequest("POST", "/api/modifier-groups", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/modifier-groups", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Modifier group created" });
    },
    onError: () => {
      toast({ title: "Failed to create modifier group", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ModifierGroup) => {
      const response = await apiRequest("PUT", "/api/modifier-groups/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/modifier-groups", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Modifier group updated" });
    },
    onError: () => {
      toast({ title: "Failed to update modifier group", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/modifier-groups/" + id + getScopeQueryParams());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/modifier-groups", filterKeys] });
      toast({ title: "Modifier group deleted" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete modifier group", variant: "destructive" });
    },
  });

  const linkMutation = useMutation({
    mutationFn: async ({ groupId, modifierId }: { groupId: string; modifierId: string }) => {
      await apiRequest("POST", `/api/modifier-groups/${groupId}/modifiers`, { modifierId });
    },
    onSuccess: () => {
      refetchLinked();
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async ({ groupId, modifierId }: { groupId: string; modifierId: string }) => {
      await apiRequest("DELETE", `/api/modifier-groups/${groupId}/modifiers/${modifierId}`);
    },
    onSuccess: () => {
      refetchLinked();
    },
  });

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    form.handleSubmit((data: InsertModifierGroup) => {
      if (editingItem) {
        updateMutation.mutate({ ...editingItem, ...data });
      } else {
        createMutation.mutate({ ...data, ...scopePayload });
      }
    })();
  };

  const handleCancel = () => {
    form.reset();
    setFormOpen(false);
    setEditingItem(null);
  };

  const handleOpenLinkDialog = (group: ModifierGroup) => {
    setLinkingGroup(group);
  };

  const handleToggleModifier = (modifierId: string) => {
    if (!linkingGroup) return;
    
    const isLinked = linkedModifiers.some((lm) => lm.modifierId === modifierId);
    
    if (isLinked) {
      unlinkMutation.mutate({ groupId: linkingGroup.id, modifierId });
    } else {
      linkMutation.mutate({ groupId: linkingGroup.id, modifierId });
    }
  };

  const handleCloseLinkDialog = () => {
    setLinkingGroup(null);
    queryClient.invalidateQueries({ queryKey: ["/api/modifier-groups", filterKeys] });
  };

  if (formOpen) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle data-testid="text-form-title">{editingItem ? "Edit Modifier Group" : "Add Modifier Group"}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel-modifier-group">
                  Cancel
                </Button>
                <Button
                  data-testid="button-form-submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  onClick={handleSubmit}
                >
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : (editingItem ? "Save Changes" : "Create")}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Group Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Meat Temperature" {...field} data-testid="input-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="minSelect"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Minimum Selections</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              field.onChange(val === "" ? null : parseFloat(val));
                            }}
                            data-testid="input-minSelect"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="maxSelect"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Maximum Selections</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="99"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              field.onChange(val === "" ? null : parseFloat(val));
                            }}
                            data-testid="input-maxSelect"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="displayOrder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Order</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              field.onChange(val === "" ? null : parseFloat(val));
                            }}
                            data-testid="input-displayOrder"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="required"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between pt-6">
                        <FormLabel>Required Selection</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value ?? false}
                            onCheckedChange={field.onChange}
                            data-testid="switch-required"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
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
        data={displayedModifierGroups}
        columns={columns}
        title="Modifier Groups"
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
        customActions={[
          {
            label: "Manage Modifiers",
            icon: Link2,
            onClick: handleOpenLinkDialog,
          },
          ...getOverrideActions(),
        ]}
        isLoading={isLoading}
        searchPlaceholder="Search modifier groups..."
        emptyMessage="No modifier groups configured"
      />

      <Dialog open={!!linkingGroup} onOpenChange={(open) => !open && handleCloseLinkDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Modifiers in "{linkingGroup?.name}"</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 pr-2">
            {allModifiers.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">
                No modifiers available. Create modifiers first in the Modifiers section.
              </p>
            ) : (
              <div className="space-y-3">
                {allModifiers.map((modifier) => {
                  const isLinked = linkedModifiers.some((lm) => lm.modifierId === modifier.id);
                  return (
                    <div
                      key={modifier.id}
                      className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                      onClick={() => handleToggleModifier(modifier.id)}
                      data-testid={`row-modifier-${modifier.id}`}
                    >
                      <Checkbox
                        checked={isLinked}
                        onCheckedChange={() => {}}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleModifier(modifier.id);
                        }}
                        data-testid={`checkbox-modifier-${modifier.id}`}
                      />
                      <div className="flex-1 flex items-center justify-between">
                        <span>{modifier.name}</span>
                        {modifier.priceDelta && parseFloat(modifier.priceDelta) !== 0 && (
                          <span className="text-sm text-muted-foreground">
                            {parseFloat(modifier.priceDelta) > 0 ? "+" : ""}
                            {parseFloat(modifier.priceDelta).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t mt-4">
            <Button onClick={handleCloseLinkDialog} data-testid="button-close-link-dialog">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
