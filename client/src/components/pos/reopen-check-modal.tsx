import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders, fetchWithTimeout } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Search, Loader2 } from "lucide-react";
import type { Check } from "@shared/schema";
import { formatInTimeZone } from "date-fns-tz";
import { formatShortTimeInTimezone } from "@/lib/timezone";

interface ReopenCheckModalProps {
  open: boolean;
  onClose: () => void;
  rvcId: string;
  onReopen: (checkId: string) => void;
  isReopening?: boolean;
  timezone?: string;
}

export function ReopenCheckModal({
  open,
  onClose,
  rvcId,
  onReopen,
  isReopening,
  timezone = "America/New_York",
}: ReopenCheckModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCheck, setSelectedCheck] = useState<string | null>(null);

  const { data: closedChecks = [], isLoading } = useQuery<Check[]>({
    queryKey: ["/api/rvcs", rvcId, "closed-checks"],
    queryFn: async () => {
      if (!rvcId) return [];
      const res = await fetchWithTimeout(`/api/rvcs/${rvcId}/closed-checks?limit=50`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch closed checks");
      return res.json();
    },
    enabled: open && !!rvcId,
  });

  const filteredChecks = closedChecks.filter((check) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      check.checkNumber.toString().includes(query) ||
      (check.tableNumber && check.tableNumber.toString().includes(query))
    );
  });

  const formatPrice = (price: string | number | null) => {
    const numPrice = typeof price === "string" ? parseFloat(price) : (price || 0);
    return `$${numPrice.toFixed(2)}`;
  };

  const formatTime = (dateVal: string | Date | null) => {
    if (!dateVal) return "";
    try {
      return formatInTimeZone(new Date(dateVal), timezone, "h:mm a");
    } catch {
      return formatShortTimeInTimezone(dateVal, timezone);
    }
  };

  const handleReopen = () => {
    if (selectedCheck) {
      onReopen(selectedCheck);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5" />
            Reopen Closed Check
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by check # or table..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-closed-checks"
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredChecks.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? "No matching closed checks" : "No closed checks found"}
            </p>
          ) : (
            <ScrollArea className="h-72">
              <div className="space-y-2">
                {filteredChecks.map((check) => (
                  <div key={check.id} className="h-16">
                    <Button
                      variant={selectedCheck === check.id ? "default" : "secondary"}
                      className="w-full h-full justify-between px-4"
                      onClick={() => setSelectedCheck(check.id)}
                      data-testid={`button-reopen-check-${check.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg">#{check.checkNumber}</span>
                        <Badge variant="outline">{check.orderType}</Badge>
                        {check.tableNumber && (
                          <span className="text-sm text-muted-foreground">
                            Table {check.tableNumber}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{formatPrice(check.subtotal)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatTime(check.closedAt)}
                        </div>
                      </div>
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-4 border-t">
          <Button variant="secondary" onClick={onClose} data-testid="button-cancel-reopen">
            Cancel
          </Button>
          <Button
            onClick={handleReopen}
            disabled={!selectedCheck || isReopening}
            data-testid="button-confirm-reopen"
          >
            {isReopening ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4 mr-2" />
                View Check
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
