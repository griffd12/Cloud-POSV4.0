import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Percent, DollarSign, ShieldCheck, Loader2, Trash2 } from "lucide-react";
import type { CheckItem } from "@shared/schema";

interface Discount {
  id: string;
  name: string;
  type?: string;
  discountType?: string;
  value?: string | number;
  amount?: string | number;
  requiresManager?: boolean;
  requires_manager?: boolean;
  requiresManagerApproval?: boolean;
  requires_manager_approval?: boolean;
  active?: boolean;
  [key: string]: unknown;
}

function getDiscountType(d: Discount): string {
  return d.type || d.discountType || "amount";
}
function getDiscountValue(d: Discount): string {
  return String(d.value ?? d.amount ?? "0");
}

interface DiscountPickerModalProps {
  open: boolean;
  onClose: () => void;
  item: CheckItem | null;
  discounts: Discount[];
  onApplyDiscount: (discountId: string, managerPin?: string) => void;
  onRemoveDiscount: (itemId: string) => void;
  isApplying?: boolean;
}

export function DiscountPickerModal({
  open,
  onClose,
  item,
  discounts,
  onApplyDiscount,
  onRemoveDiscount,
  isApplying = false,
}: DiscountPickerModalProps) {
  const [selectedDiscount, setSelectedDiscount] = useState<Discount | null>(null);
  const [managerPin, setManagerPin] = useState("");
  const [showPinInput, setShowPinInput] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setSelectedDiscount(null);
      setManagerPin("");
      setShowPinInput(false);
    }
  }, [open]);

  const activeDiscounts = discounts.filter((d) => d.active);
  
  // Calculate item's base amount for discount preview
  const itemAmount = item ? (() => {
    const unitPrice = parseFloat(item.unitPrice || "0");
    const modifierTotal = (item.modifiers || []).reduce(
      (sum, mod) => sum + parseFloat(mod.priceDelta || "0"),
      0
    );
    return (unitPrice + modifierTotal) * (item.quantity || 1);
  })() : 0;

  // Check if item already has a discount
  const hasExistingDiscount = item?.discountId && parseFloat(item.discountAmount || "0") > 0;

  const calculateDiscountAmount = (discount: Discount): number => {
    const dType = getDiscountType(discount);
    const dValue = getDiscountValue(discount);
    if (dType === "percent") {
      return itemAmount * (parseFloat(dValue) / 100);
    }
    return Math.min(parseFloat(dValue), itemAmount);
  };

  const formatDiscountValue = (discount: Discount): string => {
    const dType = getDiscountType(discount);
    const dValue = getDiscountValue(discount);
    if (dType === "percent") {
      return `${dValue}%`;
    }
    return `$${parseFloat(dValue).toFixed(2)}`;
  };

  const handleSelect = (discount: Discount) => {
    setSelectedDiscount(discount);
    // If requires manager approval, show PIN input
    if (discount.requiresManagerApproval) {
      setShowPinInput(true);
    } else {
      setShowPinInput(false);
      setManagerPin("");
    }
  };

  const handleApply = () => {
    if (selectedDiscount) {
      if (selectedDiscount.requiresManagerApproval && !managerPin) {
        setShowPinInput(true);
        return;
      }
      onApplyDiscount(
        selectedDiscount.id, 
        selectedDiscount.requiresManagerApproval ? managerPin : undefined
      );
    }
  };

  const handleRemove = () => {
    if (item) {
      onRemoveDiscount(item.id);
    }
  };

  const handleClose = () => {
    setSelectedDiscount(null);
    setManagerPin("");
    setShowPinInput(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle data-testid="text-discount-picker-title">
            {hasExistingDiscount ? "Manage Item Discount" : "Apply Item Discount"}
          </DialogTitle>
          <DialogDescription>
            {item ? `${item.menuItemName}` : "Select a discount"}
            {itemAmount > 0 && (
              <span className="block mt-1 font-medium text-foreground">
                Item Total: ${itemAmount.toFixed(2)}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Show existing discount if present */}
        {hasExistingDiscount && (
          <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-md border border-purple-200 dark:border-purple-800">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-purple-700 dark:text-purple-300">
                  Current Discount: {item?.discountName || "Discount Applied"}
                </div>
                <div className="text-sm text-purple-600 dark:text-purple-400">
                  -${parseFloat(item?.discountAmount || "0").toFixed(2)}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemove}
                disabled={isApplying}
                className="text-destructive border-destructive/50"
                data-testid="button-remove-discount"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Remove
              </Button>
            </div>
          </div>
        )}

        {!hasExistingDiscount && (
          <>
            <ScrollArea className="max-h-[300px]">
              {activeDiscounts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No discounts available
                </div>
              ) : (
                <div className="space-y-2 pr-4">
                  {activeDiscounts.map((discount) => {
                    const discountAmount = calculateDiscountAmount(discount);
                    const isSelected = selectedDiscount?.id === discount.id;

                    return (
                      <button
                        key={discount.id}
                        type="button"
                        onClick={() => handleSelect(discount)}
                        className={`w-full p-3 rounded-md border text-left transition-colors hover-elevate ${
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card"
                        }`}
                        data-testid={`button-discount-${discount.id}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              getDiscountType(discount) === "percent" ? "bg-blue-500/10" : "bg-green-500/10"
                            }`}>
                              {getDiscountType(discount) === "percent" ? (
                                <Percent className="w-4 h-4 text-blue-500" />
                              ) : (
                                <DollarSign className="w-4 h-4 text-green-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{discount.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {formatDiscountValue(discount)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {discount.requiresManagerApproval && (
                              <Badge variant="outline" className="text-xs">
                                <ShieldCheck className="w-3 h-3 mr-1" />
                                Approval
                              </Badge>
                            )}
                            {itemAmount > 0 && (
                              <span className="text-sm font-medium text-destructive">
                                -${discountAmount.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {/* Manager PIN input for discounts requiring approval */}
            {showPinInput && selectedDiscount?.requiresManagerApproval && (
              <div className="space-y-2 pt-2 border-t">
                <Label htmlFor="manager-pin">Manager PIN Required</Label>
                <Input
                  id="manager-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Enter manager PIN"
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value)}
                  className="text-center text-lg tracking-widest"
                  data-testid="input-manager-pin"
                />
              </div>
            )}
          </>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            data-testid="button-cancel-discount"
          >
            {hasExistingDiscount ? "Close" : "Cancel"}
          </Button>
          {!hasExistingDiscount && (
            <Button
              onClick={handleApply}
              disabled={!selectedDiscount || isApplying || (showPinInput && !managerPin)}
              data-testid="button-apply-discount"
            >
              {isApplying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                "Apply Discount"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
