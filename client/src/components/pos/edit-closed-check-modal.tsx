import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, FileEdit, CreditCard } from "lucide-react";
import { formatShortTimeInTimezone } from "@/lib/timezone";

interface ClosedCheck {
  id: string;
  checkNumber: number;
  total: string;
  closedAt: string | null;
  tableNumber: string | null;
  employeeName?: string;
}

interface EditClosedCheckModalProps {
  open: boolean;
  onClose: () => void;
  rvcId: string;
  onSelectCheck: (checkId: string) => void;
  timezone?: string;
}

export function EditClosedCheckModal({
  open,
  onClose,
  rvcId,
  onSelectCheck,
  timezone,
}: EditClosedCheckModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: closedChecks = [], isLoading } = useQuery<ClosedCheck[]>({
    queryKey: ["/api/rvcs", rvcId, "closed-checks"],
    enabled: open && !!rvcId,
  });

  const filteredChecks = closedChecks.filter((check) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      check.checkNumber.toString().includes(query) ||
      check.tableNumber?.toLowerCase().includes(query) ||
      check.employeeName?.toLowerCase().includes(query)
    );
  });

  const formatPrice = (price: string | number) => {
    const num = typeof price === "string" ? parseFloat(price) : price;
    return `$${num.toFixed(2)}`;
  };

  const formatTime = (dateStr: string | null) => {
    return formatShortTimeInTimezone(dateStr, timezone);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileEdit className="w-5 h-5" />
            Edit Closed Check
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by check #, table, or employee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-closed-checks"
            />
          </div>

          <ScrollArea className="h-[300px]">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Loading closed checks...
              </div>
            ) : filteredChecks.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No closed checks found
              </div>
            ) : (
              <div className="space-y-2 pr-4">
                {filteredChecks.map((check) => (
                  <Button
                    key={check.id}
                    variant="outline"
                    className="w-full h-auto py-3 px-4 flex items-center justify-between"
                    onClick={() => {
                      onSelectCheck(check.id);
                      onClose();
                    }}
                    data-testid={`button-select-closed-check-${check.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <span className="font-bold">#{check.checkNumber}</span>
                      </div>
                      <div className="text-left">
                        <div className="font-medium">
                          Check #{check.checkNumber}
                          {check.tableNumber && (
                            <span className="text-muted-foreground ml-2">
                              Table {check.tableNumber}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {check.employeeName} • {formatTime(check.closedAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-green-600" />
                      <span className="font-semibold text-green-600">
                        {formatPrice(check.total)}
                      </span>
                    </div>
                  </Button>
                ))}
              </div>
            )}
          </ScrollArea>

          <p className="text-sm text-muted-foreground">
            Select a closed check to void its payment and apply a different payment method.
            If you exit without adding a new payment, the original payment will be restored.
          </p>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="secondary" onClick={onClose} data-testid="button-cancel-edit-closed">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
