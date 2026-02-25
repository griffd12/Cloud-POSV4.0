import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Settings2, RotateCcw, Plus } from "lucide-react";
import { getConfigHelp } from "@/lib/config-help-registry";

interface OptionFlag {
  id: string;
  enterpriseId: string;
  entityType: string;
  entityId: string;
  optionKey: string;
  valueText: string | null;
  scopeLevel: string;
  scopeId: string;
  createdAt: string;
  updatedAt: string;
}

interface ScopeChainEntry {
  level: string;
  id: string;
}

interface OptionBitsPanelProps {
  entityType: string;
  entityId: string;
  enterpriseId: string;
  currentScopeLevel: string;
  currentScopeId: string;
  scopeChain: ScopeChainEntry[];
  scopeLabel?: string;
}

const SCOPE_LABELS: Record<string, string> = {
  enterprise: "Enterprise",
  property: "Property",
  rvc: "RVC",
  workstation: "Workstation",
};

const SCOPE_ORDER = ["enterprise", "property", "rvc", "workstation"];

const CATEGORY_DISPLAY_LABELS: Record<string, string> = {
  pricing_flags: "Pricing",
  check_ops_flags: "Check Operations",
  tender_flags: "Refunds & Tenders",
  admin_flags: "Admin / Danger Zone",
};

const CATEGORY_DISPLAY_ORDER = [
  "pricing_flags",
  "check_ops_flags",
  "tender_flags",
  "admin_flags",
];

export function OptionBitsPanel({
  entityType,
  entityId,
  enterpriseId,
  currentScopeLevel,
  currentScopeId,
  scopeChain,
  scopeLabel,
}: OptionBitsPanelProps) {
  const { toast } = useToast();
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newValueType, setNewValueType] = useState<"text" | "bool">("bool");

  const validScopeIds = new Set(scopeChain.map(s => s.id));

  const { data: flags = [], isLoading } = useQuery<OptionFlag[]>({
    queryKey: ["/api/option-flags", enterpriseId, entityType, entityId],
    queryFn: async () => {
      const params = new URLSearchParams({
        enterpriseId,
        entityType,
        entityId,
      });
      const res = await fetch(`/api/option-flags?${params}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch option flags");
      return res.json();
    },
    enabled: !!enterpriseId && !!entityId,
  });

  const setFlagMutation = useMutation({
    mutationFn: async (data: {
      optionKey: string;
      valueText: string;
      scopeLevel: string;
      scopeId: string;
    }) => {
      return apiRequest("PUT", "/api/option-flags", {
        enterpriseId,
        entityType,
        entityId,
        ...data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/option-flags", enterpriseId, entityType, entityId] });
      toast({ title: "Option flag saved" });
    },
    onError: (err: any) => {
      toast({ title: "Error saving option flag", description: err.message, variant: "destructive" });
    },
  });

  const deleteFlagMutation = useMutation({
    mutationFn: async (data: {
      optionKey: string;
      scopeLevel: string;
      scopeId: string;
    }) => {
      return apiRequest("DELETE", "/api/option-flags", {
        enterpriseId,
        entityType,
        entityId,
        ...data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/option-flags", enterpriseId, entityType, entityId] });
      toast({ title: "Option flag reset" });
    },
    onError: (err: any) => {
      toast({ title: "Error resetting option flag", description: err.message, variant: "destructive" });
    },
  });

  const chainFlags = flags.filter(f => validScopeIds.has(f.scopeId));

  const groupedByKey = chainFlags.reduce((acc, flag) => {
    if (!acc[flag.optionKey]) acc[flag.optionKey] = [];
    acc[flag.optionKey].push(flag);
    return acc;
  }, {} as Record<string, OptionFlag[]>);

  const optionKeys = Object.keys(groupedByKey).sort();

  const categorizedGroups = useMemo(() => {
    const groups: Record<string, string[]> = {};
    const uncategorized: string[] = [];

    for (const key of optionKeys) {
      const help = getConfigHelp(key);
      const category = help?.category;
      if (category && CATEGORY_DISPLAY_LABELS[category]) {
        if (!groups[category]) groups[category] = [];
        groups[category].push(key);
      } else {
        uncategorized.push(key);
      }
    }

    const ordered: { categoryKey: string; label: string; keys: string[] }[] = [];
    for (const cat of CATEGORY_DISPLAY_ORDER) {
      if (groups[cat] && groups[cat].length > 0) {
        ordered.push({ categoryKey: cat, label: CATEGORY_DISPLAY_LABELS[cat], keys: groups[cat] });
      }
    }
    if (uncategorized.length > 0) {
      ordered.push({ categoryKey: "custom_other", label: "Custom / Other", keys: uncategorized });
    }

    return ordered;
  }, [optionKeys]);

  function getEffectiveValue(key: string): { value: string | null; scopeLevel: string; isOverride: boolean } {
    const keyFlags = groupedByKey[key] || [];
    let best: OptionFlag | null = null;
    let bestIdx = -1;
    for (const flag of keyFlags) {
      const idx = SCOPE_ORDER.indexOf(flag.scopeLevel);
      if (idx > bestIdx) {
        best = flag;
        bestIdx = idx;
      }
    }
    if (!best) return { value: null, scopeLevel: "none", isOverride: false };
    return {
      value: best.valueText,
      scopeLevel: best.scopeLevel,
      isOverride: best.scopeLevel === currentScopeLevel && best.scopeId === currentScopeId,
    };
  }

  function hasOverrideAtCurrentScope(key: string): boolean {
    const keyFlags = groupedByKey[key] || [];
    return keyFlags.some(f => f.scopeLevel === currentScopeLevel && f.scopeId === currentScopeId);
  }

  function handleToggle(key: string, currentVal: string | null) {
    const newVal = currentVal === "true" ? "false" : "true";
    setFlagMutation.mutate({
      optionKey: key,
      valueText: newVal,
      scopeLevel: currentScopeLevel,
      scopeId: currentScopeId,
    });
  }

  function handleSetValue(key: string, value: string) {
    setFlagMutation.mutate({
      optionKey: key,
      valueText: value,
      scopeLevel: currentScopeLevel,
      scopeId: currentScopeId,
    });
  }

  function handleReset(key: string) {
    deleteFlagMutation.mutate({
      optionKey: key,
      scopeLevel: currentScopeLevel,
      scopeId: currentScopeId,
    });
  }

  function handleAddNew() {
    if (!newKey.trim()) return;
    const value = newValueType === "bool" ? "false" : newValue;
    setFlagMutation.mutate({
      optionKey: newKey.trim(),
      valueText: value,
      scopeLevel: currentScopeLevel,
      scopeId: currentScopeId,
    });
    setNewKey("");
    setNewValue("");
  }

  function renderFlagRow(key: string) {
    const effective = getEffectiveValue(key);
    const isOverride = hasOverrideAtCurrentScope(key);
    const isBool = effective.value === "true" || effective.value === "false";
    const help = getConfigHelp(key);

    return (
      <div
        key={key}
        className="flex items-center justify-between gap-3 p-2 rounded-md border bg-card"
        data-testid={`option-flag-${key}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate" title={help?.description}>
              {help?.label || key}
            </span>
            {isOverride ? (
              <Badge variant="default" className="text-xs shrink-0">Override</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs shrink-0">
                Inherited ({SCOPE_LABELS[effective.scopeLevel] || effective.scopeLevel})
              </Badge>
            )}
          </div>
          {help?.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{help.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isBool ? (
            <Switch
              checked={effective.value === "true"}
              onCheckedChange={() => handleToggle(key, effective.value)}
              data-testid={`toggle-${key}`}
            />
          ) : (
            <Input
              className="w-32 text-xs"
              value={effective.value || ""}
              onChange={(e) => handleSetValue(key, e.target.value)}
              data-testid={`input-${key}`}
            />
          )}

          {isOverride && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleReset(key)}
              data-testid={`reset-${key}`}
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!entityId) {
    return null;
  }

  return (
    <Card data-testid="option-bits-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Settings2 className="w-4 h-4" />
          Option Bits
          {scopeLabel && (
            <Badge variant="outline" className="ml-2 text-xs">{scopeLabel}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : optionKeys.length === 0 ? (
          <div className="text-sm text-muted-foreground">No option flags configured</div>
        ) : categorizedGroups.length > 0 ? (
          <Accordion type="multiple" defaultValue={categorizedGroups.map(g => g.categoryKey)} className="space-y-1">
            {categorizedGroups.map((group) => (
              <AccordionItem key={group.categoryKey} value={group.categoryKey} data-testid={`category-${group.categoryKey}`}>
                <AccordionTrigger className="text-sm py-2" data-testid={`category-trigger-${group.categoryKey}`}>
                  <span className="flex items-center gap-2">
                    {group.label}
                    <Badge variant="secondary" className="text-xs">{group.keys.length}</Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 pt-1">
                    {group.keys.map((key) => renderFlagRow(key))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="space-y-2">
            {optionKeys.map((key) => renderFlagRow(key))}
          </div>
        )}

        <div className="border-t pt-3 mt-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1">
              <Label className="text-xs">New Option Key</Label>
              <Input
                className="text-sm"
                placeholder="e.g. popDrawer"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                data-testid="input-new-option-key"
              />
            </div>
            <div className="w-24">
              <Label className="text-xs">Type</Label>
              <Select value={newValueType} onValueChange={(v: "text" | "bool") => setNewValueType(v)}>
                <SelectTrigger className="text-xs" data-testid="select-new-option-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bool">Boolean</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newValueType === "text" && (
              <div className="w-32">
                <Label className="text-xs">Value</Label>
                <Input
                  className="text-sm"
                  placeholder="value"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  data-testid="input-new-option-value"
                />
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddNew}
              disabled={!newKey.trim()}
              data-testid="button-add-option"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
