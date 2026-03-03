import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Split, Plus, Loader2, ArrowRight, Share2, X, Check as CheckIcon } from "lucide-react";
import type { CheckItem, Check } from "@shared/schema";

interface SplitOperation {
  type: "move" | "share";
  itemId: string;
  targetCheckIndex: number;
  shareRatio?: number;
  menuItemName: string;
  unitPrice: string;
}

interface NewCheckPanel {
  index: number;
  items: Array<{
    itemId: string;
    type: "move" | "share";
    shareRatio?: number;
    menuItemName: string;
    unitPrice: string;
  }>;
}

interface AdvancedSplitCheckModalProps {
  open: boolean;
  onClose: () => void;
  check: Check;
  items: CheckItem[];
  onSplit: (operations: SplitOperation[]) => void;
  isSplitting?: boolean;
}

export function AdvancedSplitCheckModal({
  open,
  onClose,
  check,
  items,
  onSplit,
  isSplitting,
}: AdvancedSplitCheckModalProps) {
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [newChecks, setNewChecks] = useState<NewCheckPanel[]>([{ index: 1, items: [] }]);
  const [shareMode, setShareMode] = useState(false);
  const [shareRatio, setShareRatio] = useState(50);

  const activeItems = items.filter((item) => !item.voided);

  const formatPrice = (price: string | number | null) => {
    const numPrice = typeof price === "string" ? parseFloat(price) : (price || 0);
    return `$${numPrice.toFixed(2)}`;
  };

  const getModifierTotal = (item: CheckItem) => {
    if (!item.modifiers || !Array.isArray(item.modifiers)) return 0;
    return item.modifiers.reduce((sum, mod) => sum + parseFloat(mod.priceDelta || "0"), 0);
  };

  const getItemTotal = (item: CheckItem) => {
    const unitPrice = parseFloat(item.unitPrice || "0");
    const modPrice = getModifierTotal(item);
    return (unitPrice + modPrice) * (item.quantity || 1);
  };

  const isItemMoved = (itemId: string) => {
    return newChecks.some((nc) => nc.items.some((i) => i.itemId === itemId && i.type === "move"));
  };

  const isItemShared = (itemId: string) => {
    return newChecks.some((nc) => nc.items.some((i) => i.itemId === itemId && i.type === "share"));
  };

  const addNewCheck = () => {
    const nextIndex = Math.max(...newChecks.map((nc) => nc.index)) + 1;
    setNewChecks([...newChecks, { index: nextIndex, items: [] }]);
  };

  const removeNewCheck = (index: number) => {
    if (newChecks.length > 1) {
      setNewChecks(newChecks.filter((nc) => nc.index !== index));
    }
  };

  const handleTargetCheckClick = useCallback((checkIndex: number) => {
    if (selectedItemIds.size === 0) return;

    if (shareMode && selectedItemIds.size === 1) {
      const itemId = Array.from(selectedItemIds)[0];
      const item = activeItems.find((i) => i.id === itemId);
      if (!item) return;

      setNewChecks((prev) =>
        prev.map((nc) =>
          nc.index === checkIndex
            ? {
                ...nc,
                items: [
                  ...nc.items,
                  {
                    itemId,
                    type: "share" as const,
                    shareRatio: shareRatio / 100,
                    menuItemName: item.menuItemName,
                    unitPrice: item.unitPrice || "0",
                  },
                ],
              }
            : nc
        )
      );
    } else {
      const idsToMove = Array.from(selectedItemIds);
      setNewChecks((prev) =>
        prev.map((nc) => {
          if (nc.index === checkIndex) {
            const existingFiltered = nc.items.filter((i) => !idsToMove.includes(i.itemId));
            const newItems = idsToMove
              .map((itemId) => {
                const item = activeItems.find((i) => i.id === itemId);
                if (!item) return null;
                return {
                  itemId,
                  type: "move" as const,
                  menuItemName: item.menuItemName,
                  unitPrice: item.unitPrice || "0",
                };
              })
              .filter(Boolean) as NewCheckPanel["items"];
            return { ...nc, items: [...existingFiltered, ...newItems] };
          }
          return { ...nc, items: nc.items.filter((i) => !idsToMove.includes(i.itemId)) };
        })
      );
    }

    setSelectedItemIds(new Set());
    setShareMode(false);
    setShareRatio(50);
  }, [selectedItemIds, shareMode, shareRatio, activeItems]);

  const removeItemFromCheck = (checkIndex: number, itemId: string) => {
    setNewChecks((prev) =>
      prev.map((nc) =>
        nc.index === checkIndex
          ? { ...nc, items: nc.items.filter((i) => i.itemId !== itemId) }
          : nc
      )
    );
  };

  const handleConfirmSplit = () => {
    const operations: SplitOperation[] = [];
    for (const nc of newChecks) {
      for (const item of nc.items) {
        operations.push({
          type: item.type,
          itemId: item.itemId,
          targetCheckIndex: nc.index,
          shareRatio: item.shareRatio,
          menuItemName: item.menuItemName,
          unitPrice: item.unitPrice,
        });
      }
    }
    if (operations.length > 0) {
      onSplit(operations);
    }
  };

  const getCheckTotal = (checkIndex: number) => {
    const checkPanel = newChecks.find((nc) => nc.index === checkIndex);
    if (!checkPanel) return 0;

    return checkPanel.items.reduce((sum, panelItem) => {
      const item = activeItems.find((i) => i.id === panelItem.itemId);
      if (!item) return sum;
      const total = getItemTotal(item);
      if (panelItem.type === "share") {
        return sum + total * (panelItem.shareRatio || 0.5);
      }
      return sum + total;
    }, 0);
  };

  const getRemainingSourceTotal = () => {
    let total = 0;
    for (const item of activeItems) {
      const itemTotal = getItemTotal(item);
      if (isItemMoved(item.id)) {
        continue;
      }
      if (isItemShared(item.id)) {
        const sharedItem = newChecks
          .flatMap((nc) => nc.items)
          .find((i) => i.itemId === item.id && i.type === "share");
        if (sharedItem) {
          total += itemTotal * (1 - (sharedItem.shareRatio || 0.5));
        }
      } else {
        total += itemTotal;
      }
    }
    return total;
  };

  const totalOperations = newChecks.reduce((sum, nc) => sum + nc.items.length, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Split className="w-5 h-5" />
            Split Check #{check.checkNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex gap-4 overflow-hidden">
          <Card className="flex-1 flex flex-col p-4 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-semibold">Original Check #{check.checkNumber}</h3>
              <Badge variant="outline">{formatPrice(getRemainingSourceTotal())}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Click items to select (multi-select), then click a target check
            </p>
            <ScrollArea className="flex-1">
              <div className="space-y-2 pr-2">
                {activeItems.map((item) => {
                  const isMoved = isItemMoved(item.id);
                  const isShared = isItemShared(item.id);
                  const isSelected = selectedItemIds.has(item.id);

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-md border cursor-pointer transition-colors ${
                        isMoved
                          ? "opacity-40 bg-muted"
                          : isShared
                          ? "bg-yellow-500/10 border-yellow-500/50 dark:bg-yellow-500/10"
                          : isSelected
                          ? "bg-primary/20 border-primary ring-2 ring-primary"
                          : "hover-elevate"
                      }`}
                      onClick={() => {
                        if (!isMoved) {
                          setSelectedItemIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.id)) {
                              next.delete(item.id);
                            } else {
                              next.add(item.id);
                            }
                            return next;
                          });
                          if (shareMode && selectedItemIds.size !== 1) {
                            setShareMode(false);
                          }
                        }
                      }}
                      data-testid={`source-item-${item.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{item.menuItemName}</span>
                            {item.sent && <Badge variant="outline" className="text-xs">Sent</Badge>}
                            {isMoved && <Badge variant="secondary" className="text-xs">Moved</Badge>}
                            {isShared && <Badge className="text-xs bg-yellow-500 text-black">Shared</Badge>}
                          </div>
                          {(item.quantity || 1) > 1 && (
                            <span className="text-sm text-muted-foreground">Qty: {item.quantity}</span>
                          )}
                        </div>
                        <span className="font-semibold tabular-nums shrink-0">
                          {formatPrice(getItemTotal(item))}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {selectedItemIds.size > 0 && (
              <div className="mt-4 p-3 bg-muted/50 rounded-md border space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ArrowRight className="w-4 h-4" />
                  {selectedItemIds.size === 1
                    ? `Item Selected: ${activeItems.find((i) => i.id === Array.from(selectedItemIds)[0])?.menuItemName}`
                    : `${selectedItemIds.size} Items Selected`}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant={!shareMode ? "default" : "outline"}
                    onClick={() => setShareMode(false)}
                    data-testid="button-move-mode"
                  >
                    Move {selectedItemIds.size > 1 ? "Items" : "Item"}
                  </Button>
                  <Button
                    size="sm"
                    variant={shareMode ? "default" : "outline"}
                    onClick={() => setShareMode(true)}
                    disabled={selectedItemIds.size !== 1}
                    data-testid="button-share-mode"
                  >
                    <Share2 className="w-4 h-4 mr-1" />
                    Share Item
                  </Button>
                </div>
                {shareMode && selectedItemIds.size === 1 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Share Ratio:</span>
                      <span className="font-semibold">{shareRatio}% to new check</span>
                    </div>
                    <Slider
                      value={[shareRatio]}
                      onValueChange={([val]) => setShareRatio(val)}
                      min={10}
                      max={90}
                      step={10}
                      className="w-full"
                      data-testid="slider-share-ratio"
                    />
                    <p className="text-xs text-muted-foreground">
                      Original keeps {100 - shareRatio}%, new check gets {shareRatio}%
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>

          <div className="flex flex-col gap-2 items-center justify-center">
            <ArrowRight className="w-6 h-6 text-muted-foreground" />
          </div>

          <div className="flex-1 flex flex-col gap-3 min-w-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">New Checks</h3>
              <Button size="sm" variant="outline" onClick={addNewCheck} data-testid="button-add-check">
                <Plus className="w-4 h-4 mr-1" />
                Add Check
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-3 pr-2">
                {newChecks.map((nc) => (
                  <Card
                    key={nc.index}
                    className={`p-3 cursor-pointer transition-colors ${
                      selectedItemIds.size > 0 ? "hover:border-primary hover:bg-primary/5" : ""
                    }`}
                    onClick={() => handleTargetCheckClick(nc.index)}
                    data-testid={`target-check-${nc.index}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">New Check {nc.index}</span>
                        <Badge variant="outline">{formatPrice(getCheckTotal(nc.index))}</Badge>
                      </div>
                      {newChecks.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeNewCheck(nc.index);
                          }}
                          data-testid={`button-remove-check-${nc.index}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    {nc.items.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        {selectedItemIds.size > 0 ? "Click here to transfer item(s)" : "No items yet"}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {nc.items.map((panelItem) => {
                          const item = activeItems.find((i) => i.id === panelItem.itemId);
                          if (!item) return null;
                          const displayPrice =
                            panelItem.type === "share"
                              ? getItemTotal(item) * (panelItem.shareRatio || 0.5)
                              : getItemTotal(item);

                          return (
                            <div
                              key={panelItem.itemId}
                              className="flex items-center justify-between gap-2 p-2 rounded bg-muted/50"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="truncate">{panelItem.menuItemName}</span>
                                {panelItem.type === "share" && (
                                  <Badge className="text-xs bg-yellow-500 text-black shrink-0">
                                    {Math.round((panelItem.shareRatio || 0.5) * 100)}%
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="tabular-nums text-sm">{formatPrice(displayPrice)}</span>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeItemFromCheck(nc.index, panelItem.itemId);
                                  }}
                                  data-testid={`button-remove-item-${panelItem.itemId}`}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {totalOperations > 0
              ? `${totalOperations} item(s) to split across ${newChecks.filter((nc) => nc.items.length > 0).length} new check(s)`
              : "Select items from the original check to split"}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} data-testid="button-cancel-split">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSplit}
              disabled={totalOperations === 0 || isSplitting}
              data-testid="button-confirm-split"
            >
              {isSplitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Splitting...
                </>
              ) : (
                <>
                  <CheckIcon className="w-4 h-4 mr-2" />
                  Confirm Split
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
