import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { useToast } from "@/hooks/use-toast";
import type { CustomAction } from "@/components/admin/data-table";
import { Copy, Undo2 } from "lucide-react";

interface ScopeableItem {
  id: string;
  enterpriseId?: string | null;
  propertyId?: string | null;
  rvcId?: string | null;
}

interface ConfigOverrideRecord {
  id: string;
  entityType: string;
  sourceItemId: string;
  overrideItemId: string;
  overrideLevel: string;
  overrideScopeId: string;
  enterpriseId: string | null;
}

type ScopeLevel = "enterprise" | "property" | "rvc";

function getItemLevel(item: ScopeableItem): ScopeLevel {
  if (item.rvcId) return "rvc";
  if (item.propertyId) return "property";
  return "enterprise";
}

export function useConfigOverride<T extends ScopeableItem>(
  entityType: string,
  invalidateKeys: string[]
) {
  const { toast } = useToast();
  const { selectedPropertyId, selectedRvcId, selectedEnterpriseId } = useEmcFilter();

  const currentLevel: ScopeLevel = selectedRvcId ? "rvc" : selectedPropertyId ? "property" : "enterprise";
  const currentScopeId = selectedRvcId || selectedPropertyId || null;

  const { data: overrideRecords = [] } = useQuery<ConfigOverrideRecord[]>({
    queryKey: ["/api/config/overrides", { entityType, enterpriseId: selectedEnterpriseId, propertyId: selectedPropertyId, rvcId: selectedRvcId }],
    queryFn: async () => {
      const params = new URLSearchParams({ entityType });
      if (selectedEnterpriseId) params.set("enterpriseId", selectedEnterpriseId);
      const res = await failoverFetch(`/api/config/overrides?${params}`, { headers: getAuthHeaders() });
      if (!res.ok) return [];
      const allOverrides: ConfigOverrideRecord[] = await res.json();
      const scopeIds = new Set<string>();
      if (selectedPropertyId) scopeIds.add(selectedPropertyId);
      if (selectedRvcId) scopeIds.add(selectedRvcId);
      return allOverrides.filter(r => scopeIds.has(r.overrideScopeId));
    },
    enabled: !!selectedEnterpriseId && currentLevel !== "enterprise",
  });

  const overrideSourceIds = new Set(overrideRecords.map(r => r.sourceItemId));
  const overrideItemIds = new Set(overrideRecords.map(r => r.overrideItemId));

  const createOverrideMutation = useMutation({
    mutationFn: async (sourceItemId: string) => {
      if (!currentScopeId) throw new Error("No scope selected");
      const res = await apiRequest("POST", "/api/config/override", {
        entityType,
        sourceItemId,
        overrideLevel: currentLevel,
        overrideScopeId: currentScopeId,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateKeys.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));
      queryClient.invalidateQueries({ queryKey: ["/api/config/overrides"] });
      toast({ title: "Override created", description: "Local copy created at current scope level" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create override", description: error.message, variant: "destructive" });
    },
  });

  const deleteOverrideMutation = useMutation({
    mutationFn: async (overrideItemId: string) => {
      const res = await apiRequest("DELETE", `/api/config/override/${overrideItemId}`);
      return res.json();
    },
    onSuccess: () => {
      invalidateKeys.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));
      queryClient.invalidateQueries({ queryKey: ["/api/config/overrides"] });
      toast({ title: "Override removed", description: "Inherited configuration restored" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove override", description: error.message, variant: "destructive" });
    },
  });

  function isInherited(item: T): boolean {
    if (currentLevel === "enterprise") return false;
    const itemLevel = getItemLevel(item);
    if (currentLevel === "property") return itemLevel === "enterprise";
    if (currentLevel === "rvc") return itemLevel === "enterprise" || itemLevel === "property";
    return false;
  }

  function isOverride(item: T): boolean {
    return overrideItemIds.has(item.id);
  }

  function isOverridden(item: T): boolean {
    return overrideSourceIds.has(item.id);
  }

  function getOverrideActions(): CustomAction<T>[] {
    if (currentLevel === "enterprise") return [];

    return [
      {
        label: "Override",
        icon: Copy,
        hidden: (item: T) => !isInherited(item) || isOverridden(item),
        onClick: (item: T) => {
          createOverrideMutation.mutate(item.id);
        },
      },
      {
        label: "Remove Override",
        icon: Undo2,
        variant: "destructive" as const,
        hidden: (item: T) => !isOverride(item),
        onClick: (item: T) => {
          deleteOverrideMutation.mutate(item.id);
        },
      },
    ];
  }

  function filterOverriddenInherited(items: T[]): T[] {
    return items.filter(item => {
      if (isInherited(item) && isOverridden(item)) return false;
      return true;
    });
  }

  function canDeleteItem(item: T): boolean {
    return !isInherited(item);
  }

  function getScopeQueryParams(): string {
    const params = new URLSearchParams();
    if (selectedPropertyId) params.set("scopePropertyId", selectedPropertyId);
    if (selectedRvcId) params.set("scopeRvcId", selectedRvcId);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  return {
    isInherited,
    isOverride,
    isOverridden,
    getOverrideActions,
    filterOverriddenInherited,
    canDeleteItem,
    getScopeQueryParams,
    currentLevel,
    isPending: createOverrideMutation.isPending || deleteOverrideMutation.isPending,
  };
}
