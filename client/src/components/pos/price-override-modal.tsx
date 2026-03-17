import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, Loader2, ShieldCheck } from "lucide-react";
import { NumPad } from "./num-pad";
import type { CheckItem } from "@shared/schema";

const PRESET_REASONS = [
  "Customer complaint",
  "Manager discount",
  "Price match",
  "Damaged item",
];

type ActiveField = "price" | "pin";

interface PriceOverrideModalProps {
  open: boolean;
  onClose: () => void;
  item: CheckItem | null;
  onOverride: (itemId: string, newPrice: number, reason: string, managerPin?: string) => void;
  isOverriding?: boolean;
  requireManagerApproval?: boolean;
}

export function PriceOverrideModal({
  open,
  onClose,
  item,
  onOverride,
  isOverriding,
  requireManagerApproval = true,
}: PriceOverrideModalProps) {
  const [newPrice, setNewPrice] = useState("");
  const [reason, setReason] = useState("");
  const [managerPin, setManagerPin] = useState("");
  const [activeField, setActiveField] = useState<ActiveField>("price");

  useEffect(() => {
    if (open) {
      setNewPrice("");
      setReason("");
      setManagerPin("");
      setActiveField("price");
    }
  }, [open, item?.id]);

  const currentPrice = item ? parseFloat(item.unitPrice || "0") : 0;

  const handleOverride = () => {
    if (item && newPrice && reason) {
      onOverride(item.id, parseFloat(newPrice), reason, requireManagerApproval ? managerPin : undefined);
    }
  };

  const applyDigit = (digit: string) => {
    if (activeField === "price") {
      setNewPrice((prev) => {
        const next = prev + digit;
        const parts = next.split(".");
        if (parts.length > 1 && parts[1].length > 2) return prev;
        return next;
      });
    } else {
      setManagerPin((prev) => prev + digit);
    }
  };

  const applyDecimal = () => {
    if (activeField === "price") {
      setNewPrice((prev) => {
        if (prev.includes(".")) return prev;
        return prev === "" ? "0." : prev + ".";
      });
    }
  };

  const applyBackspace = () => {
    if (activeField === "price") {
      setNewPrice((prev) => prev.slice(0, -1));
    } else {
      setManagerPin((prev) => prev.slice(0, -1));
    }
  };

  const applyClear = () => {
    if (activeField === "price") {
      setNewPrice("");
    } else {
      setManagerPin("");
    }
  };

  const fieldRingClass = (field: ActiveField) =>
    activeField === field
      ? "ring-2 ring-primary ring-offset-1"
      : "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Price Override
          </DialogTitle>
        </DialogHeader>

        {item && (
          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-md">
              <div className="font-medium">{item.menuItemName}</div>
              <div className="text-sm text-muted-foreground">
                Current price: ${currentPrice.toFixed(2)}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPrice">New Price</Label>
              <div
                className={`relative cursor-pointer rounded-md ${fieldRingClass("price")}`}
                onClick={() => setActiveField("price")}
                data-testid="field-new-price"
              >
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="newPrice"
                  type="text"
                  readOnly
                  placeholder="0.00"
                  value={newPrice}
                  className="pl-9 pointer-events-none"
                  data-testid="input-new-price"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reason (required)</Label>
              <div className="grid grid-cols-2 gap-1.5" data-testid="reason-buttons">
                {PRESET_REASONS.map((r) => (
                  <Button
                    key={r}
                    type="button"
                    variant={reason === r ? "default" : "outline"}
                    className="h-10 text-sm"
                    onClick={() => setReason(reason === r ? "" : r)}
                    data-testid={`button-reason-${r.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </div>

            {requireManagerApproval && (
              <div className="space-y-2">
                <Label htmlFor="managerPin" className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  Manager PIN (required)
                </Label>
                <div
                  className={`relative cursor-pointer rounded-md ${fieldRingClass("pin")}`}
                  onClick={() => setActiveField("pin")}
                  data-testid="field-manager-pin"
                >
                  <Input
                    id="managerPin"
                    type="password"
                    readOnly
                    placeholder="Enter manager PIN"
                    value={managerPin}
                    className="pointer-events-none"
                    data-testid="input-manager-pin"
                  />
                </div>
              </div>
            )}

            <div className="pt-2 border-t">
              <div className="text-xs text-muted-foreground mb-2 text-center">
                Entering: <span className="font-medium">{activeField === "price" ? "New Price" : "Manager PIN"}</span>
              </div>
              <NumPad
                onDigit={applyDigit}
                onDecimal={applyDecimal}
                onBackspace={applyBackspace}
                onClear={applyClear}
                showDecimal={activeField === "price"}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-4 border-t">
          <Button variant="secondary" onClick={onClose} data-testid="button-cancel-override">
            Cancel
          </Button>
          <Button
            onClick={handleOverride}
            disabled={!newPrice || !reason || (requireManagerApproval && !managerPin) || isOverriding}
            data-testid="button-confirm-override"
          >
            {isOverriding ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <DollarSign className="w-4 h-4 mr-2" />
                Apply Override
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
