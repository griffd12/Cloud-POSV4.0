import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { MenuItem, ModifierGroup, Modifier } from "@shared/schema";

interface SelectedModifier {
  id: string;
  name: string;
  priceDelta: string;
}

interface ModifierWithMeta extends Modifier {
  isDefault?: boolean;
  displayOrder?: number;
}

interface ModifierModalProps {
  open: boolean;
  onClose: () => void;
  menuItem: MenuItem | null;
  modifierGroups: (ModifierGroup & { modifiers: ModifierWithMeta[] })[];
  onConfirm: (modifiers: SelectedModifier[]) => void;
  initialModifiers?: SelectedModifier[];
  pendingItemId?: string; // For real-time updates in dynamic mode
  employeeId?: string; // For audit logging
}

export function ModifierModal({
  open,
  onClose,
  menuItem,
  modifierGroups,
  onConfirm,
  initialModifiers,
  pendingItemId,
  employeeId,
}: ModifierModalProps) {
  const [selectedModifiers, setSelectedModifiers] = useState<Map<string, SelectedModifier[]>>(
    new Map()
  );
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingItemIdRef = useRef<string | undefined>(pendingItemId);
  const hasPendingFlushRef = useRef(false);
  const latestModifiersRef = useRef<Map<string, SelectedModifier[]>>(new Map());

  useEffect(() => {
    pendingItemIdRef.current = pendingItemId;
    if (pendingItemId && hasPendingFlushRef.current) {
      hasPendingFlushRef.current = false;
      sendLiveUpdate(latestModifiersRef.current);
    }
  }, [pendingItemId]);

  const sendLiveUpdate = useCallback((modifiersMap: Map<string, SelectedModifier[]>) => {
    latestModifiersRef.current = modifiersMap;
    const itemId = pendingItemIdRef.current;
    if (!itemId) {
      hasPendingFlushRef.current = true;
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      const currentItemId = pendingItemIdRef.current;
      if (!currentItemId) {
        hasPendingFlushRef.current = true;
        return;
      }
      const allModifiers: SelectedModifier[] = [];
      modifiersMap.forEach((mods) => {
        allModifiers.push(...mods);
      });

      try {
        await apiRequest("PATCH", `/api/check-items/${currentItemId}/modifiers`, {
          modifiers: allModifiers,
          employeeId,
        });
      } catch (error) {
        console.error("Failed to send live modifier update:", error);
      }
    }, 300);
  }, [employeeId]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (open && modifierGroups.length > 0) {
      const newSelection = new Map<string, SelectedModifier[]>();
      
      if (initialModifiers && initialModifiers.length > 0) {
        modifierGroups.forEach((group) => {
          const groupModIds = new Set(group.modifiers.map((m) => m.id));
          const matchingMods = initialModifiers.filter((m) => groupModIds.has(m.id));
          if (matchingMods.length > 0) {
            newSelection.set(group.id, matchingMods);
          }
        });
      } else {
        modifierGroups.forEach((group) => {
          const defaultMods = group.modifiers
            .filter((m) => m.isDefault)
            .map((m) => ({
              id: m.id,
              name: m.name,
              priceDelta: m.priceDelta || "0",
            }));
          if (defaultMods.length > 0) {
            newSelection.set(group.id, defaultMods);
          }
        });
      }
      setSelectedModifiers(newSelection);
    } else {
      setSelectedModifiers(new Map());
    }
  }, [open, modifierGroups, initialModifiers]);

  const toggleModifier = (group: ModifierGroup & { modifiers: ModifierWithMeta[] }, modifier: ModifierWithMeta) => {
    setSelectedModifiers((prev) => {
      const updated = new Map(prev);
      const groupMods = updated.get(group.id) || [];
      const isSelected = groupMods.some((m) => m.id === modifier.id);

      if (isSelected) {
        updated.set(
          group.id,
          groupMods.filter((m) => m.id !== modifier.id)
        );
      } else {
        const maxSelect = group.maxSelect || 99;
        if (groupMods.length < maxSelect) {
          updated.set(group.id, [
            ...groupMods,
            {
              id: modifier.id,
              name: modifier.name,
              priceDelta: modifier.priceDelta || "0",
            },
          ]);
        } else if (maxSelect === 1) {
          updated.set(group.id, [
            {
              id: modifier.id,
              name: modifier.name,
              priceDelta: modifier.priceDelta || "0",
            },
          ]);
        }
      }

      sendLiveUpdate(updated);

      return updated;
    });
  };

  const isValid = () => {
    if (!modifierGroups || modifierGroups.length === 0) return true;
    return modifierGroups.every((group) => {
      const selected = selectedModifiers.get(group.id) || [];
      const minSelect = group.minSelect || 0;
      return selected.length >= minSelect;
    });
  };

  const handleConfirm = () => {
    const allModifiers: SelectedModifier[] = [];
    selectedModifiers.forEach((mods) => {
      allModifiers.push(...mods);
    });
    onConfirm(allModifiers);
    // Don't call onClose() here - let the parent handle closing
    // This prevents the race condition where onClose voids a pending item
    // before the confirm mutation completes
  };

  const formatPrice = (price: string | null) => {
    const numPrice = parseFloat(price || "0");
    if (numPrice === 0) return "";
    return numPrice > 0 ? `+$${numPrice.toFixed(2)}` : `-$${Math.abs(numPrice).toFixed(2)}`;
  };

  // Sort modifiers alphabetically within each group
  const sortedModifierGroups = useMemo(() => {
    return modifierGroups.map(group => ({
      ...group,
      modifiers: [...group.modifiers].sort((a, b) => 
        a.name.localeCompare(b.name)
      )
    }));
  }, [modifierGroups]);

  // Calculate dynamic width based on number of columns
  const dialogMaxWidth = useMemo(() => {
    const numGroups = sortedModifierGroups.length;
    if (numGroups <= 2) return "max-w-3xl";
    if (numGroups <= 3) return "max-w-4xl";
    if (numGroups <= 4) return "max-w-5xl";
    return "max-w-6xl";
  }, [sortedModifierGroups.length]);

  if (!menuItem || !modifierGroups || modifierGroups.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className={`${dialogMaxWidth}`}>
        <DialogHeader className="text-center pb-2">
          <DialogTitle className="text-xl" data-testid="text-modifier-modal-title">
            {menuItem.name}
          </DialogTitle>
          <p className="text-muted-foreground text-sm">
            Select your options
          </p>
        </DialogHeader>

        {/* Horizontal column layout - each modifier group is a column with horizontal scroll fallback */}
        <div className="overflow-x-auto">
          <div className="flex gap-4 min-h-[200px] min-w-max">
            {sortedModifierGroups.map((group) => {
              const groupSelected = selectedModifiers.get(group.id) || [];
              const minSelect = group.minSelect || 0;
              const maxSelect = group.maxSelect || 99;
              const isRequired = group.required || minSelect > 0;
              const isSatisfied = groupSelected.length >= minSelect;
              const modifiers = group.modifiers;
              const needsSubColumns = modifiers.length > 5;

              return (
                <div 
                  key={group.id} 
                  className="flex-1 min-w-[180px] flex flex-col border-r last:border-r-0 pr-4 last:pr-0"
                >
                  {/* Column header */}
                  <div className="flex items-center justify-between gap-2 pb-2 border-b mb-3">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-sm">{group.name}</span>
                      {isRequired && !isSatisfied && (
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {groupSelected.length}/{maxSelect === 99 ? "∞" : maxSelect}
                      {minSelect > 0 && ` min ${minSelect}`}
                    </Badge>
                  </div>

                  {/* Modifiers - vertical list, split to sub-columns if >5 */}
                  <div className={`flex-1 ${needsSubColumns ? "grid grid-cols-2 gap-x-2 gap-y-1 content-start" : "flex flex-col gap-1"}`}>
                    {modifiers.map((modifier) => {
                      const isSelected = groupSelected.some((m) => m.id === modifier.id);
                      const priceStr = formatPrice(modifier.priceDelta);

                      return (
                        <Button
                          key={modifier.id}
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          className="justify-start text-left w-full"
                          onClick={() => toggleModifier(group, modifier)}
                          data-testid={`button-modifier-${modifier.id}`}
                        >
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            {isSelected && <Check className="w-3 h-3 shrink-0" />}
                            <span className="truncate">{modifier.name}</span>
                          </div>
                          {priceStr && (
                            <span className="text-xs opacity-70 shrink-0 ml-1">{priceStr}</span>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer with Add to Check on the right */}
        <DialogFooter className="flex justify-end gap-2 pt-4 border-t sm:justify-end">
          <Button variant="outline" onClick={onClose} data-testid="button-modifier-cancel">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isValid()}
            data-testid="button-modifier-confirm"
          >
            Add to Check
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
