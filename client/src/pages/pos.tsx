import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { formatDateTimeInTimezone } from "@/lib/timezone";
import { useInactivityLogout } from "@/hooks/use-inactivity-logout";
import { useWorkstationHeartbeat } from "@/hooks/use-workstation-heartbeat";
import { useDeviceHeartbeat } from "@/hooks/use-device-heartbeat";
import { useDeviceReload } from "@/hooks/use-device-reload";
import { useConfigSync } from "@/hooks/use-config-sync";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SluGrid } from "@/components/pos/slu-grid";
import { MenuItemGrid } from "@/components/pos/menu-item-grid";
import { CheckPanel } from "@/components/pos/check-panel";
import { ModifierModal } from "@/components/pos/modifier-modal";
import { ManagerApprovalModal } from "@/components/pos/manager-approval-modal";
import { OrderTypeModal } from "@/components/pos/order-type-modal";
import { PaymentModal } from "@/components/pos/payment-modal";
import { OpenChecksModal } from "@/components/pos/open-checks-modal";
import { TransactionLookupModal } from "@/components/pos/transaction-lookup-modal";
import { RefundModal } from "@/components/pos/refund-modal";
import { FunctionsModal } from "@/components/pos/functions-modal";
import { EditClosedCheckModal } from "@/components/pos/edit-closed-check-modal";
import { POSReportsModal } from "@/components/pos/pos-reports-modal";
import { TransferCheckModal } from "@/components/pos/transfer-check-modal";
import { AdvancedSplitCheckModal } from "@/components/pos/advanced-split-check-modal";
import { MergeChecksModal } from "@/components/pos/merge-checks-modal";
import { ReopenCheckModal } from "@/components/pos/reopen-check-modal";
import { PriceOverrideModal } from "@/components/pos/price-override-modal";
import { CustomerModal } from "@/components/pos/customer-modal";
import { GiftCardModal } from "@/components/pos/gift-card-modal";
import { DiscountPickerModal } from "@/components/pos/discount-picker-modal";
import { ItemOptionsPopup } from "@/components/pos/item-options-popup";
import { ConversationalOrderPanel } from "@/components/pos/conversational-order-panel";
import { HorizontalCOMPanel } from "@/components/pos/horizontal-com-panel";
import { SetAvailabilityDialog } from "@/components/pos/set-availability-dialog";
import { StressTestOverlay } from "@/components/pos/stress-test-overlay";
import { SoldOutConfirmDialog } from "@/components/pos/sold-out-confirm-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { SyncNotificationCenter } from "@/components/sync-notification-center";
import { useToast } from "@/hooks/use-toast";
import { useItemAvailability } from "@/hooks/use-item-availability";
import { queryClient, apiRequest, getAuthHeaders, fetchWithTimeout, failoverFetch } from "@/lib/queryClient";
import { usePosContext } from "@/lib/pos-context";
import { useDeviceContext } from "@/lib/device-context";
import type { Slu, MenuItem, Check, CheckItem, CheckPayment, ModifierGroup, Modifier, Tender, OrderType, TaxGroup, PosLayout, PosLayoutCell, Discount } from "@shared/schema";
import { LogOut, User, Receipt, Clock, Settings, Search, Square, UtensilsCrossed, Plus, List, Grid3X3, CreditCard, Star, Wifi, WifiOff, X, Printer, Maximize, Minimize, CircleDollarSign } from "lucide-react";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useDocumentFontScale } from "@/hooks/use-font-scale";
import { Link, Redirect, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


interface MenuItemWithModifiers extends MenuItem {
  hasRequiredModifiers?: boolean;
  modifierGroups?: (ModifierGroup & { modifiers: Modifier[] })[];
}

interface SelectedModifier {
  id: string;
  name: string;
  priceDelta: string;
}

export default function PosPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { isFullscreen, isSupported: fullscreenSupported, toggleFullscreen } = useFullscreen();
  
  // Enable real-time updates via WebSocket for menu changes, gift cards, etc.
  usePosWebSocket();
  
  // Get device context for reload filtering
  const { registeredDeviceId, propertyId } = useDeviceContext();
  
  // Listen for remote reload commands from EMC
  useDeviceReload({ registeredDeviceId: registeredDeviceId || undefined, propertyId: propertyId || undefined });
  
  // Send periodic device heartbeats to maintain online status
  useDeviceHeartbeat(true);
  
  // Real-time EMC config sync - invalidates React Query cache when EMC changes
  useConfigSync();
  
  const {
    currentEmployee,
    currentRvc,
    currentCheck,
    checkItems,
    selectedSlu,
    pendingItem,
    privileges,
    workstationId,
    setCurrentCheck,
    setCheckItems,
    setSelectedSlu,
    setPendingItem,
    setCurrentRvc,
    setWorkstationId,
    hasPrivilege,
    logout,
  } = usePosContext();

  const wsHeaders = (extra?: Record<string, string>): Record<string, string> => {
    const h: Record<string, string> = {};
    if (workstationId) h["x-workstation-id"] = workstationId;
    if (extra) Object.assign(h, extra);
    return h;
  };

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Fetch workstation context (always fetch when workstationId is available for settings like auto-logout)
  const { data: wsContext } = useQuery<{ workstation: any; rvcs: any[]; property: any; enterprise: any }>({
    queryKey: ["/api/workstations", workstationId, "context"],
    queryFn: async () => {
      const res = await fetchWithTimeout(`/api/workstations/${workstationId}/context`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) {
        throw new Error("Failed to fetch workstation context");
      }
      return res.json();
    },
    enabled: !!workstationId,
    staleTime: 60000,
  });

  const fontScale = useDocumentFontScale(wsContext?.workstation?.fontScale);

  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const { showWarning: showTimeoutWarning, warningSecondsLeft, dismissWarning } = useInactivityLogout({
    timeoutMinutes: wsContext?.workstation?.autoLogoutMinutes,
    enabled: !!currentEmployee && !!wsContext?.workstation?.autoLogoutMinutes && !showPaymentModal,
  });

  // Send periodic heartbeat to track workstation status
  useWorkstationHeartbeat({
    workstationId,
    employeeId: currentEmployee?.id,
  });
  
  // Release lock on the current check (call before clearing check or signing out)
  const releaseCurrentCheckLock = useCallback(async (checkId?: string) => {
    const idToRelease = checkId || currentCheck?.id;
    if (!idToRelease || !workstationId) return;
    
    try {
      await apiRequest("POST", `/api/checks/${idToRelease}/unlock`, { workstationId }, wsHeaders());
    } catch (error) {
      console.error("Failed to release check lock:", error);
    }
  }, [currentCheck?.id, workstationId]);

  // Release check lock on page unload or component unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentCheck?.id && workstationId) {
        const blob = new Blob(
          [JSON.stringify({ workstationId })],
          { type: "application/json" }
        );
        navigator.sendBeacon(`/api/checks/${currentCheck.id}/unlock`, blob);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      releaseCurrentCheckLock();
    };
  }, [currentCheck?.id, workstationId, releaseCurrentCheckLock]);

  // Enhanced logout that releases locks first
  const handleLogout = useCallback(async () => {
    if (currentCheck?.id && workstationId) {
      await releaseCurrentCheckLock();
    }
    logout();
  }, [currentCheck?.id, workstationId, releaseCurrentCheckLock, logout]);

  // Auto-set RVC from workstation if not already set
  useEffect(() => {
    if (!currentRvc && wsContext?.rvcs && wsContext.rvcs.length > 0) {
      // Find the RVC that matches the workstation's rvc_id, or use the first one
      const workstationRvcId = wsContext.workstation?.rvcId;
      const matchingRvc = workstationRvcId 
        ? wsContext.rvcs.find((r: any) => r.id === workstationRvcId)
        : wsContext.rvcs[0];
      if (matchingRvc) {
        setCurrentRvc(matchingRvc);
      }
    }
  }, [currentRvc, wsContext, setCurrentRvc]);

  const [showModifierModal, setShowModifierModal] = useState(false);
  const [showManagerApproval, setShowManagerApproval] = useState(false);
  const [showOrderTypeModal, setShowOrderTypeModal] = useState(false);
  const [showOpenChecksModal, setShowOpenChecksModal] = useState(false);
  const [showTransactionLookup, setShowTransactionLookup] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [selectedRefundCheck, setSelectedRefundCheck] = useState<Check | null>(null);
  const [refundManagerApprovalId, setRefundManagerApprovalId] = useState<string | undefined>(undefined);
  const [pendingRefundAction, setPendingRefundAction] = useState(false);
  const [pendingVoidItem, setPendingVoidItem] = useState<CheckItem | null>(null);
  const [editingItem, setEditingItem] = useState<CheckItem | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [cashChangeDue, setCashChangeDue] = useState<number | null>(null);
  const [pendingCashOverTender, setPendingCashOverTender] = useState<{ tenderId: string; amount: number } | null>(null);
  const [showFunctionsModal, setShowFunctionsModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showEditClosedCheckModal, setShowEditClosedCheckModal] = useState(false);
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [pendingReopenCheckId, setPendingReopenCheckId] = useState<string | null>(null);
  const [editingClosedCheckId, setEditingClosedCheckId] = useState<string | null>(null);
  const [originalPaymentState, setOriginalPaymentState] = useState<{ paymentId: string; amount: string } | null>(null);
  const [isLoadingClosedCheck, setIsLoadingClosedCheck] = useState(false);
  const [showPriceOverrideModal, setShowPriceOverrideModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showGiftCardModal, setShowGiftCardModal] = useState(false);
  const [showTipCaptureDialog, setShowTipCaptureDialog] = useState(false);
  const [tipCapturePayment, setTipCapturePayment] = useState<CheckPayment | null>(null);
  const [tipAmount, setTipAmount] = useState("");
  const [isCapturingTip, setIsCapturingTip] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountItem, setDiscountItem] = useState<CheckItem | null>(null);
  const [showStressTest, setShowStressTest] = useState(false);
  
  // Item availability state for custom layout long-press
  const [longPressItem, setLongPressItem] = useState<MenuItem | null>(null);
  const [showItemOptionsPopup, setShowItemOptionsPopup] = useState(false);
  const [showSetAvailabilityDialog, setShowSetAvailabilityDialog] = useState(false);
  const [soldOutConfirmItem, setSoldOutConfirmItem] = useState<MenuItem | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  
  // Conversational Ordering state (Menu Build)
  const [conversationalOrderItem, setConversationalOrderItem] = useState<MenuItem | null>(null);
  const [editingCOMCheckItem, setEditingCOMCheckItem] = useState<CheckItem | null>(null);
  const [pendingStandardModifiers, setPendingStandardModifiers] = useState<SelectedModifier[]>([]);
  
  // Item availability hook
  const { getQuantityRemaining, isItemAvailable, setAvailability, decrementQuantity, isUpdating: isAvailabilityUpdating } = useItemAvailability();
  
  // Health check query to verify API connection when RVC is already set
  const healthQuery = useQuery({
    queryKey: ["/api/health"],
    queryFn: async () => {
      const res = await fetchWithTimeout("/api/health", { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("API health check failed");
      return res.json();
    },
    enabled: !!currentRvc,
    refetchInterval: 30000, // Check every 30 seconds
    retry: 2,
    staleTime: 25000, // Consider data fresh for 25 seconds
  });
  
  // Derive connection status from query state
  const apiConnected = healthQuery.isSuccess ? true : healthQuery.isError ? false : null;

  // Fetch EMC option-bit flags from CAPS for runtime gating
  const { data: optionBits } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/config/workstation-options", currentRvc?.id, currentRvc?.propertyId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (currentRvc?.id) params.append("rvcId", currentRvc.id);
      if (currentRvc?.propertyId) params.append("propertyId", currentRvc.propertyId);
      const res = await fetchWithTimeout(`/api/config/workstation-options?${params.toString()}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!currentRvc,
    staleTime: 60000,
  });

  const checkOptionAllowed = useCallback((key: string): boolean => {
    if (!optionBits) return true;
    return optionBits[key] !== false;
  }, [optionBits]);

  const { data: paymentInfo, isLoading: paymentsLoading } = useQuery<{ payments: any[]; paidAmount: number }>({
    queryKey: ["/api/checks", currentCheck?.id, "payments"],
    queryFn: async () => {
      if (!currentCheck?.id) return { payments: [], paidAmount: 0 };
      const res = await fetchWithTimeout(`/api/checks/${currentCheck.id}/payments`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch payments");
      return res.json();
    },
    enabled: !!currentCheck?.id,
  });

  const paidAmount = paymentInfo?.paidAmount || 0;
  const paymentsReady = !paymentsLoading && paymentInfo !== undefined;
  
  // Filter authorized payments awaiting tip/capture
  const authorizedPayments = (paymentInfo?.payments || []).filter(
    (p: CheckPayment) => p.paymentStatus === "authorized"
  );

  // Fetch customer details when a customer is attached to the check
  const { data: attachedCustomer } = useQuery<{ firstName: string; lastName: string } | null>({
    queryKey: ["/api/loyalty-members", currentCheck?.customerId],
    queryFn: async () => {
      if (!currentCheck?.customerId) return null;
      const res = await fetchWithTimeout(`/api/loyalty-members/${currentCheck.customerId}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!currentCheck?.customerId,
  });

  const customerName = attachedCustomer 
    ? `${attachedCustomer.firstName} ${attachedCustomer.lastName}` 
    : null;

  // Mutation to remove customer from check
  const removeCustomerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/pos/checks/${currentCheck?.id}/customer`, undefined, wsHeaders());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Customer Removed", description: "Customer removed from this check" });
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-members", currentCheck?.customerId] });
    },
    onError: (error: any) => {
      const detail = error?.message || String(error);
      console.error("[POS] Remove customer failed:", detail, error);
      toast({ title: "Error", description: detail || "Failed to remove customer", variant: "destructive" });
    },
  });

  // Mutation to void a payment
  const voidPaymentMutation = useMutation({
    mutationFn: async (payment: CheckPayment) => {
      // If this is a pending reopen check and the payment belongs to this check, reopen it first
      if (pendingReopenCheckId && currentCheck?.id === pendingReopenCheckId) {
        // First, fetch fresh check status to see if it's actually still closed
        const checkRes = await fetchWithTimeout(`/api/checks/${pendingReopenCheckId}`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          // Only attempt reopen if check is still closed
          if (checkData.check?.status === "closed") {
            try {
              await apiRequest("POST", `/api/checks/${pendingReopenCheckId}/reopen`, {
                employeeId: currentEmployee?.id,
              }, wsHeaders());
            } catch (reopenError: any) {
              throw new Error(`Failed to reopen check: ${reopenError.message}`);
            }
          }
        }
        // Clear pending state since we've handled the reopen check
        setPendingReopenCheckId(null);
      }
      
      const res = await fetchWithTimeout(`/api/check-payments/${payment.id}/void`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          reason: "Payment voided",
          employeeId: currentEmployee?.id,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to void payment");
      }
      // Return payment info so onSuccess can use it
      return { ...await res.json(), voidedPaymentId: payment.id, voidedAmount: payment.amount };
    },
    onSuccess: (result) => {
      toast({ title: "Payment Voided", description: "Payment has been voided and balance restored" });
      setSelectedPaymentId(null);
      // Clear pending reopen state (should already be cleared in mutationFn, but just in case)
      setPendingReopenCheckId(null);
      
      // Track original payment for potential restore only AFTER successful void
      if (editingClosedCheckId && currentCheck?.id === editingClosedCheckId) {
        setOriginalPaymentState({ paymentId: result.voidedPaymentId, amount: result.voidedAmount });
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id, "payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/rvcs", currentRvc?.id, "closed-checks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
    },
    onError: (error: any) => {
      const detail = error?.message || String(error);
      console.error("[POS] Void payment failed:", detail, error);
      toast({ title: "Error", description: detail, variant: "destructive" });
    },
  });

  // Handler for opening tip capture dialog
  const handleTipCapture = (payment: CheckPayment) => {
    // Block tip capture on a closed check being viewed
    if (pendingReopenCheckId) {
      toast({ title: "Cannot capture tip", description: "Void a payment first to reopen this check", variant: "destructive" });
      return;
    }
    setTipCapturePayment(payment);
    setTipAmount("");
    setShowTipCaptureDialog(true);
  };
  
  // Handle capture with tip
  const handleConfirmTipCapture = async () => {
    if (!tipCapturePayment) return;
    
    setIsCapturingTip(true);
    try {
      const tipValue = parseFloat(tipAmount) || 0;
      const res = await apiRequest("POST", "/api/pos/capture-with-tip", {
        checkPaymentId: tipCapturePayment.id,
        tipAmount: tipValue,
        employeeId: currentEmployee?.id,
      }, wsHeaders());
      
      const result = await res.json();
      if (result.success) {
        toast({
          title: "Payment Captured",
          description: `$${result.finalAmount.toFixed(2)} captured (includes $${tipValue.toFixed(2)} tip)`,
        });
        setShowTipCaptureDialog(false);
        setTipCapturePayment(null);
        setTipAmount("");
        // Invalidate queries to update UI
        queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
        queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id, "payments"] });
      } else {
        toast({
          title: "Capture Failed",
          description: result.message || "Could not capture payment",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Capture Failed",
        description: "An error occurred while capturing",
        variant: "destructive",
      });
    } finally {
      setIsCapturingTip(false);
    }
  };

  const { data: slus = [], isLoading: slusLoading } = useQuery<Slu[]>({
    queryKey: ["/api/slus", currentRvc?.id],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (currentRvc?.id) params.append("rvcId", currentRvc.id);
      const res = await fetchWithTimeout(`/api/slus?${params.toString()}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch SLUs");
      return res.json();
    },
    enabled: !!currentRvc,
  });

  const { data: menuItems = [], isLoading: itemsLoading } = useQuery<MenuItemWithModifiers[]>({
    queryKey: ["/api/menu-items", { sluId: selectedSlu?.id, rvcId: currentRvc?.id }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedSlu?.id) params.append("sluId", selectedSlu.id);
      if (currentRvc?.id) params.append("rvcId", currentRvc.id);
      const res = await fetchWithTimeout(`/api/menu-items?${params.toString()}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) {
        throw new Error("Failed to fetch menu items");
      }
      return res.json();
    },
    enabled: !!selectedSlu && !!currentRvc?.id,
  });

  const { data: tenders = [] } = useQuery<Tender[]>({
    queryKey: ["/api/tenders", currentRvc?.id],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (currentRvc?.id) params.append("rvcId", currentRvc.id);
      const res = await fetchWithTimeout(`/api/tenders?${params.toString()}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch tenders");
      return res.json();
    },
    enabled: !!currentRvc,
  });

  // Create a mapping of tender IDs to tender names
  const tenderNames: Record<string, string> = useMemo(() => {
    const mapping: Record<string, string> = {};
    for (const tender of tenders) {
      mapping[tender.id] = tender.name;
    }
    return mapping;
  }, [tenders]);

  const { data: modifierMap } = useQuery<Record<string, (ModifierGroup & { modifiers: Modifier[] })[]>>({
    queryKey: ["/api/pos/modifier-map", currentRvc?.id],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (currentRvc?.id) params.append("rvcId", currentRvc.id);
      const res = await fetchWithTimeout(`/api/pos/modifier-map?${params.toString()}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!currentRvc?.id,
    staleTime: 300000,
  });

  const [itemModifierGroups, setItemModifierGroups] = useState<(ModifierGroup & { modifiers: Modifier[] })[]>([]);

  const { data: taxGroups = [] } = useQuery<TaxGroup[]>({
    queryKey: ["/api/tax-groups", currentRvc?.id],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (currentRvc?.id) params.append("rvcId", currentRvc.id);
      const res = await fetchWithTimeout(`/api/tax-groups?${params.toString()}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch tax groups");
      return res.json();
    },
    enabled: !!currentRvc?.id,
  });

  const { data: discounts = [] } = useQuery<Discount[]>({
    queryKey: ["/api/discounts", currentRvc?.id],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (currentRvc?.id) params.append("rvcId", currentRvc.id);
      const res = await fetchWithTimeout(`/api/discounts?${params.toString()}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch discounts");
      return res.json();
    },
    enabled: !!currentRvc?.id,
  });

  const { data: allMenuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["/api/menu-items", "all", currentRvc?.id],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (currentRvc?.id) params.append("rvcId", currentRvc.id);
      const res = await fetchWithTimeout(`/api/menu-items?${params.toString()}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch menu items");
      return res.json();
    },
    enabled: !!currentRvc?.id,
  });

  const { data: activeLayout } = useQuery<PosLayout | null>({
    queryKey: ["/api/pos-layouts/default", currentRvc?.id],
    queryFn: async () => {
      const res = await fetchWithTimeout(`/api/pos-layouts/default/${currentRvc?.id}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!currentRvc?.id,
  });

  const { data: layoutCells = [] } = useQuery<PosLayoutCell[]>({
    queryKey: ["/api/pos-layouts", activeLayout?.id, "cells"],
    queryFn: async () => {
      if (!activeLayout?.id) return [];
      const res = await fetchWithTimeout(`/api/pos-layouts/${activeLayout.id}/cells`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeLayout?.id && activeLayout.mode === "custom_grid",
  });

  const createCheckMutation = useMutation({
    mutationFn: async (orderType: OrderType) => {
      const response = await apiRequest("POST", "/api/checks", {
        rvcId: currentRvc?.id,
        employeeId: currentEmployee?.id,
        orderType,
      }, wsHeaders({ "Idempotency-Key": crypto.randomUUID() }));
      return response.json();
    },
    onSuccess: (check: Check) => {
      setCurrentCheck(check);
      setCheckItems([]);
      queryClient.invalidateQueries({ queryKey: ["/api/checks"] });
    },
    onError: (error: any) => {
      const detail = error?.message || String(error);
      console.error("[POS] Create check failed:", detail, error);
      toast({ title: "Failed to create check", description: detail, variant: "destructive" });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (data: { menuItem: MenuItem; modifiers: SelectedModifier[] }) => {
      const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const optimisticItem = {
        id: optimisticId,
        checkId: currentCheck?.id,
        menuItemId: data.menuItem.id,
        menuItemName: data.menuItem.name,
        unitPrice: data.menuItem.price,
        modifiers: data.modifiers,
        quantity: 1,
        itemStatus: "active",
        sent: false,
        voided: false,
      } as any;
      setCheckItems((prev) => [...prev, optimisticItem]);
      setShowModifierModal(false);
      setPendingItem(null);
      setItemModifierGroups([]);
      decrementQuantity(data.menuItem.id);

      const response = await apiRequest("POST", "/api/checks/" + currentCheck?.id + "/items", {
        menuItemId: data.menuItem.id,
        menuItemName: data.menuItem.name,
        unitPrice: data.menuItem.price,
        modifiers: data.modifiers,
        quantity: 1,
      }, wsHeaders());
      const newItem = await response.json();
      return { newItem, optimisticId };
    },
    onSuccess: ({ newItem, optimisticId }) => {
      setCheckItems((prev) => prev.map(ci => ci.id === optimisticId ? newItem : ci));
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
      if (currentRvc?.domSendMode === "fire_on_fly" && currentCheck?.id) {
        apiRequest("POST", "/api/checks/" + currentCheck.id + "/send", {
          employeeId: currentEmployee?.id,
        }, wsHeaders({ "Idempotency-Key": crypto.randomUUID() })).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
        }).catch((err: any) => {
          console.warn("[POS] fire_on_fly auto-send failed:", err?.message);
        });
      }
    },
    onError: (error: any, variables) => {
      const detail = error?.message || String(error);
      console.error("[POS] Add item failed:", detail, error);
      setCheckItems((prev) => prev.filter(ci => !String(ci.id).startsWith("optimistic-")));
      queryClient.invalidateQueries({ queryKey: ["/api/item-availability"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      toast({ title: "Failed to add item", description: detail, variant: "destructive" });
      apiRequest("POST", `/api/item-availability/increment`, {
        menuItemId: variables?.menuItem?.id,
        propertyId: currentRvc?.propertyId,
        delta: 1,
      }).catch(() => {});
    },
  });

  const sendCheckMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/checks/" + currentCheck?.id + "/send", {
        employeeId: currentEmployee?.id,
      }, wsHeaders({ "Idempotency-Key": crypto.randomUUID() }));
      return response.json();
    },
    onSuccess: (data: { round: any; updatedItems: CheckItem[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
      // Release lock and clear check state - check remains open for later pickup
      releaseCurrentCheckLock();
      setCurrentCheck(null);
      setCheckItems([]);
      logout();
    },
    onError: (error: any) => {
      const detail = error?.message || String(error);
      console.error("[POS] Send order failed:", detail, error);
      toast({ title: "Failed to send order", description: detail, variant: "destructive" });
    },
  });

  // Cancel transaction - voids all unsent items without sending to KDS, then signs out
  const cancelTransactionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/checks/" + currentCheck?.id + "/cancel-transaction", {
        employeeId: currentEmployee?.id,
        reason: "Transaction cancelled by cashier",
      }, wsHeaders());
      return response.json();
    },
    onSuccess: (data: { success: boolean; voidedCount: number; remainingActiveItems: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
      // Invalidate item availability cache so restored quantities show immediately
      if (currentRvc?.propertyId) {
        queryClient.invalidateQueries({ queryKey: ["/api/item-availability", currentRvc.propertyId] });
      }
      // Release lock, clear check state and sign out
      releaseCurrentCheckLock();
      setCurrentCheck(null);
      setCheckItems([]);
      if (data.voidedCount > 0) {
        toast({ title: `Transaction cancelled - ${data.voidedCount} item(s) voided` });
      }
      logout();
    },
    onError: (error: any) => {
      const detail = error?.message || String(error);
      console.error("[POS] Cancel transaction failed:", detail, error);
      toast({ title: "Failed to cancel transaction", description: detail, variant: "destructive" });
    },
  });

  const voidItemMutation = useMutation({
    mutationFn: async (data: { itemId: string; reason?: string; managerPin?: string }) => {
      const response = await apiRequest("POST", "/api/check-items/" + data.itemId + "/void", {
        employeeId: currentEmployee?.id,
        reason: data.reason,
        managerPin: data.managerPin,
      }, wsHeaders());
      return response.json();
    },
    onSuccess: (voidedItem: CheckItem) => {
      setCheckItems((prev) => prev.map((item) => (item.id === voidedItem.id ? voidedItem : item)));
      setShowManagerApproval(false);
      setPendingVoidItem(null);
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
      // Invalidate item availability cache so restored quantities show immediately
      if (currentRvc?.propertyId) {
        queryClient.invalidateQueries({ queryKey: ["/api/item-availability", currentRvc.propertyId] });
      }
    },
    onError: (error: any) => {
      const detail = error?.message || String(error);
      console.error("[POS] Void item failed:", detail, error);
      if (showManagerApproval) {
        setApprovalError("Invalid manager PIN or insufficient privileges");
      } else {
        toast({ title: "Failed to void item", description: detail, variant: "destructive" });
      }
    },
  });

  const applyDiscountMutation = useMutation({
    mutationFn: async (data: { 
      discountId: string; 
      managerPin?: string;
    }) => {
      if (!discountItem) throw new Error("No item selected");
      const response = await apiRequest("POST", `/api/check-items/${discountItem.id}/discount`, {
        discountId: data.discountId,
        employeeId: currentEmployee?.id,
        managerPin: data.managerPin,
      }, wsHeaders());
      return response.json();
    },
    onSuccess: (data: { item: CheckItem; check: Check }) => {
      setCheckItems((prev) => prev.map((item) => (item.id === data.item.id ? data.item : item)));
      setCurrentCheck(data.check);
      setShowDiscountModal(false);
      setDiscountItem(null);
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      toast({ title: "Discount applied" });
    },
    onError: (error: any) => {
      const detail = error?.message || String(error);
      console.error("[POS] Apply discount failed:", detail, error);
      toast({ 
        title: "Failed to apply discount", 
        description: error.message || "Invalid manager PIN or insufficient privileges",
        variant: "destructive" 
      });
    },
  });

  const removeDiscountMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiRequest("DELETE", `/api/check-items/${itemId}/discount`, {
        employeeId: currentEmployee?.id,
      }, wsHeaders());
      return response.json();
    },
    onSuccess: (data: { item: CheckItem; check: Check }) => {
      setCheckItems((prev) => prev.map((item) => (item.id === data.item.id ? data.item : item)));
      setCurrentCheck(data.check);
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      toast({ title: "Discount removed" });
    },
    onError: (error: any) => {
      const detail = error?.message || String(error);
      console.error("[POS] Remove discount failed:", detail, error);
      toast({ title: "Failed to remove discount", description: detail, variant: "destructive" });
    },
  });

  const removeCheckDiscountsMutation = useMutation({
    mutationFn: async () => {
      if (!currentCheck?.id) throw new Error("No check");
      const discountsRes = await apiRequest("GET", `/api/checks/${currentCheck.id}/discounts`, undefined, wsHeaders());
      const discounts = await discountsRes.json();
      for (const d of discounts) {
        await apiRequest("DELETE", `/api/check-discounts/${d.id}`, { employeeId: currentEmployee?.id }, wsHeaders());
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      toast({ title: "Check discounts removed" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove check discounts", description: error?.message || String(error), variant: "destructive" });
    },
  });

  const checkServiceChargesQuery = useQuery<any[]>({
    queryKey: ["/api/checks", currentCheck?.id, "service-charges"],
    queryFn: async () => {
      if (!currentCheck?.id) return [];
      const scController = new AbortController();
      const scTimeout = setTimeout(() => scController.abort(), 5000);
      try {
        const res = await failoverFetch(`/api/checks/${currentCheck.id}/service-charges`, { signal: scController.signal });
        clearTimeout(scTimeout);
        if (!res.ok) return [];
        return res.json();
      } catch {
        clearTimeout(scTimeout);
        return [];
      }
    },
    enabled: !!currentCheck?.id,
  });

  const voidServiceChargeMutation = useMutation({
    mutationFn: async () => {
      const charges = checkServiceChargesQuery.data || [];
      const activeCharges = charges.filter((sc: any) => !sc.voided);
      for (const sc of activeCharges) {
        await apiRequest("POST", `/api/check-service-charges/${sc.id}/void`, { employeeId: currentEmployee?.id }, wsHeaders());
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id, "service-charges"] });
      toast({ title: "Service charges voided" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to void service charges", description: error?.message || String(error), variant: "destructive" });
    },
  });

  const updateModifiersMutation = useMutation({
    mutationFn: async (data: { itemId: string; modifiers: SelectedModifier[]; finalize?: boolean }) => {
      const response = await apiRequest("PATCH", "/api/check-items/" + data.itemId + "/modifiers", {
        employeeId: currentEmployee?.id,
        modifiers: data.modifiers,
        itemStatus: data.finalize ? "active" : undefined,
      }, wsHeaders());
      return response.json();
    },
    onSuccess: (updatedItem: CheckItem) => {
      // Use functional update to get current state (avoids stale closure issue)
      setCheckItems((prevItems: CheckItem[]) => {
        const exists = prevItems.some((item: CheckItem) => item.id === updatedItem.id);
        if (exists) {
          return prevItems.map((item: CheckItem) => (item.id === updatedItem.id ? updatedItem : item));
        }
        // If item doesn't exist yet (race condition), add it
        return [...prevItems, updatedItem];
      });
      setEditingItem(null);
      setShowModifierModal(false);
      setPendingItem(null);
      setItemModifierGroups([]);
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
    },
    onError: (error: any) => {
      const detail = error?.message || String(error);
      console.error("[POS] Update modifiers failed:", detail, error);
      toast({ title: "Failed to update modifiers", description: detail, variant: "destructive" });
    },
  });

  const triggerCashDrawerKick = async () => {
    if (!workstationId) return;
    try {
      const ws = wsContext?.workstation;
      if (!ws?.cashDrawerEnabled) return;
      await apiRequest("POST", "/api/cash-drawer-kick", { workstationId }, wsHeaders());
    } catch (err) {
      console.error("Cash drawer kick failed:", err);
      toast({ title: "Cash Drawer", description: "Drawer kick failed — check printer connection", variant: "destructive" });
    }
  };

  const paymentMutation = useMutation({
    mutationFn: async (data: { tenderId: string; amount: number; isCashOverTender?: boolean; paymentTransactionId?: string; tipAmount?: number; storeAndForward?: boolean }) => {
      const response = await apiRequest("POST", "/api/checks/" + currentCheck?.id + "/payments", {
        tenderId: data.tenderId,
        amount: data.amount.toString(),
        tipAmount: data.tipAmount?.toString(),
        employeeId: currentEmployee?.id,
        paymentTransactionId: data.paymentTransactionId,
        ...(data.storeAndForward ? { storeAndForward: true } : {}),
      }, wsHeaders({ "Idempotency-Key": crypto.randomUUID() }));
      const result = await response.json();
      return { ...result, isCashOverTender: data.isCashOverTender, tenderedAmount: data.amount, appliedTenderId: data.tenderId };
    },
    onSuccess: async (result: Check & { paidAmount: number; isCashOverTender?: boolean; tenderedAmount?: number; appliedTenderId?: string; autoPrintStatus?: { success: boolean; message?: string } }) => {
      console.log("Payment result:", result, "status:", result.status);
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id, "payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });

      const appliedTender = tenders.find(t => t.id === result.appliedTenderId);
      const isCashTender = appliedTender?.popDrawer === true;
      const shouldKickDrawer = isCashTender && wsContext?.workstation?.cashDrawerAutoOpenOnCash;
      if (shouldKickDrawer && result.status !== "closed") {
        triggerCashDrawerKick();
      }
      if (result.status === "closed") {
        console.log("Check is closed, clearing state");
        
        // Notify if auto-print failed
        if (result.autoPrintStatus && !result.autoPrintStatus.success) {
          toast({
            title: "Receipt Print Failed",
            description: result.autoPrintStatus.message || "Could not print receipt automatically. Use Print Check to reprint.",
            variant: "destructive",
          });
        }
        
        // Earn loyalty points if customer is attached
        if (result.customerId) {
          try {
            const earnRes = await apiRequest("POST", "/api/pos/loyalty/earn", {
              checkId: result.id,
              customerId: result.customerId,
              employeeId: currentEmployee?.id,
            }, wsHeaders());
            const earnData = await earnRes.json();
            if (earnData.pointsEarned > 0) {
              toast({
                title: "Loyalty Points Earned",
                description: `${earnData.pointsEarned} points added. New balance: ${earnData.newBalance}`,
              });
            }
            // Invalidate customer queries so profile shows updated points
            queryClient.invalidateQueries({ queryKey: ["/api/pos/customers", result.customerId] });
            queryClient.invalidateQueries({ queryKey: ["/api/loyalty-members", result.customerId] });
          } catch (error) {
            console.error("Failed to earn loyalty points:", error);
          }
        }
        
        if (result.isCashOverTender && result.tenderedAmount && total > 0) {
          const changeAmount = result.tenderedAmount - total;
          if (changeAmount > 0) {
            setCashChangeDue(changeAmount);
            return;
          }
        }
        // Clear edit closed check state if payment completed
        setEditingClosedCheckId(null);
        setOriginalPaymentState(null);
        setShowPaymentModal(false);
        releaseCurrentCheckLock();
        setCurrentCheck(null);
        setCheckItems([]);
      } else {
        setCurrentCheck(result);
      }
    },
    onError: (error: any) => {
      const detail = error?.message || String(error);
      console.error("[POS] Payment failed:", detail, error);
      setCashChangeDue(null);
      toast({ title: "Payment failed", description: detail, variant: "destructive" });
    },
  });

  const handleReadyForNextOrder = () => {
    setCashChangeDue(null);
    // Clear edit closed check state
    setEditingClosedCheckId(null);
    setOriginalPaymentState(null);
    setShowPaymentModal(false);
    releaseCurrentCheckLock();
    setCurrentCheck(null);
    setCheckItems([]);
  };

  // Load closed check for viewing (does NOT reopen it yet)
  const loadClosedCheckForViewing = useCallback(async (checkId: string) => {
    setIsLoadingClosedCheck(true);
    try {
      const res = await fetchWithTimeout(`/api/checks/${checkId}`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCurrentCheck(data.check);
        setCheckItems(data.items);
        setPendingReopenCheckId(checkId);
        queryClient.invalidateQueries({ queryKey: ["/api/checks", checkId, "payments"] });
        setShowReopenModal(false);
      } else {
        toast({ title: "Failed to load check", variant: "destructive" });
      }
    } catch (e) {
      console.error("Error loading closed check:", e);
      toast({ title: "Failed to load check", variant: "destructive" });
    } finally {
      setIsLoadingClosedCheck(false);
    }
  }, [toast]);

  // Clear pending reopen state - used when exiting without changes
  const clearPendingReopenCheck = useCallback(() => {
    if (pendingReopenCheckId) {
      setPendingReopenCheckId(null);
      setCurrentCheck(null);
      setCheckItems([]);
    }
  }, [pendingReopenCheckId]);

  const handleCancelEditClosedCheck = useCallback(async () => {
    if (editingClosedCheckId && originalPaymentState) {
      try {
        const res = await apiRequest("PATCH", `/api/check-payments/${originalPaymentState.paymentId}/restore`, {
          employeeId: currentEmployee?.id,
        }, wsHeaders());
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || "Failed to restore payment");
        }
        toast({ title: "Edit Cancelled", description: "Original payment has been restored" });
      } catch (error: any) {
        toast({ title: "Error", description: error.message || "Failed to restore payment", variant: "destructive" });
        return;
      }
    }
    setEditingClosedCheckId(null);
    setOriginalPaymentState(null);
    setCurrentCheck(null);
    setCheckItems([]);
    queryClient.invalidateQueries({ queryKey: ["/api/rvcs", currentRvc?.id, "closed-checks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
  }, [editingClosedCheckId, originalPaymentState, currentEmployee?.id, toast, currentRvc?.id]);

  // Smart send handler - handles pending reopen checks specially
  const handleSmartSend = useCallback(async () => {
    const unsentItems = (checkItems || []).filter(item => !item.sent && !item.voided);
    
    // If viewing a pending reopen check with no unsent items, just exit without changes
    if (pendingReopenCheckId && unsentItems.length === 0) {
      clearPendingReopenCheck();
      return;
    }
    
    // Handle Edit Closed Check mode - if payment was voided but no new payment, restore it
    if (editingClosedCheckId && originalPaymentState) {
      // Check if there's still a balance due (no new payment was added)
      const balanceDue = paymentInfo?.balanceDue || 0;
      if (balanceDue > 0) {
        try {
          // Restore the voided payment using apiRequest
          const res = await apiRequest("PATCH", `/api/check-payments/${originalPaymentState.paymentId}/restore`, {
            employeeId: currentEmployee?.id,
          }, wsHeaders());
          if (!res.ok) {
            const error = await res.json();
            throw new Error(error.message || "Failed to restore payment");
          }
          toast({ title: "Edit Cancelled", description: "Original payment has been restored" });
          // Clear edit mode state
          setEditingClosedCheckId(null);
          setOriginalPaymentState(null);
          setCurrentCheck(null);
          setCheckItems([]);
          queryClient.invalidateQueries({ queryKey: ["/api/rvcs", currentRvc?.id, "closed-checks"] });
          queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
          return;
        } catch (error: any) {
          toast({ title: "Error", description: error.message || "Failed to restore payment", variant: "destructive" });
          // Keep user in edit mode so they can try again or add a payment
          return;
        }
      } else {
        // Payment was replaced, clear edit mode state and proceed normally
        setEditingClosedCheckId(null);
        setOriginalPaymentState(null);
      }
    }
    
    // If there are unsent items on a pending reopen check, actually reopen it first
    if (pendingReopenCheckId && unsentItems.length > 0) {
      try {
        await apiRequest("POST", `/api/checks/${pendingReopenCheckId}/reopen`, {
          employeeId: currentEmployee?.id,
        }, wsHeaders());
        toast({ title: "Check Reopened", description: "Check has been reopened for editing" });
        setPendingReopenCheckId(null);
        queryClient.invalidateQueries({ queryKey: ["/api/rvcs", currentRvc?.id, "closed-checks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
      } catch (error: any) {
        toast({ title: "Failed to reopen check", description: error.message, variant: "destructive" });
        return; // Don't proceed with send if reopen failed
      }
    }
    
    // Proceed with normal send
    sendCheckMutation.mutate();
  }, [pendingReopenCheckId, checkItems, clearPendingReopenCheck, currentEmployee?.id, toast, currentRvc?.id, sendCheckMutation, editingClosedCheckId, originalPaymentState, paymentInfo]);

  const transferCheckMutation = useMutation({
    mutationFn: async (toEmployeeId: string) => {
      if (!currentCheck) throw new Error("No check selected");
      const response = await apiRequest("POST", `/api/checks/${currentCheck.id}/transfer`, {
        employeeId: currentEmployee?.id,
        toEmployeeId,
      }, wsHeaders());
      return response.json();
    },
    onSuccess: (updatedCheck: Check) => {
      setShowTransferModal(false);
      toast({ title: "Check Transferred", description: `Check #${updatedCheck.checkNumber} transferred successfully` });
      releaseCurrentCheckLock();
      setCurrentCheck(null);
      setCheckItems([]);
      queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
    },
    onError: (error: any) => {
      const detail = error?.message || String(error);
      console.error("[POS] Transfer check failed:", detail, error);
      toast({ title: "Failed to transfer check", description: detail, variant: "destructive" });
    },
  });

  const splitCheckMutation = useMutation({
    mutationFn: async (operations: Array<{ type: "move" | "share"; itemId: string; targetCheckIndex: number; shareRatio?: number }>) => {
      if (!currentCheck) throw new Error("No check selected");
      const response = await apiRequest("POST", `/api/checks/${currentCheck.id}/split`, {
        employeeId: currentEmployee?.id,
        operations,
      }, wsHeaders());
      return response.json();
    },
    onSuccess: (result: any) => {
      setShowSplitModal(false);
      const newCheckCount = result.newChecks?.length || 0;
      toast({ 
        title: "Check Split", 
        description: `Created ${newCheckCount} new check(s) from split` 
      });
      if (result.sourceCheck) {
        setCurrentCheck(result.sourceCheck.check);
        setCheckItems(result.sourceCheck.items);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
    },
    onError: (error: any) => {
      const detail = error?.message || String(error);
      console.error("[POS] Split check failed:", detail, error);
      toast({ title: "Failed to split check", description: detail, variant: "destructive" });
    },
  });

  const mergeChecksMutation = useMutation({
    mutationFn: async (sourceCheckIds: string[]) => {
      if (!currentCheck) throw new Error("No check selected");
      const response = await apiRequest("POST", "/api/checks/merge", {
        targetCheckId: currentCheck.id,
        sourceCheckIds,
        employeeId: currentEmployee?.id,
      }, wsHeaders());
      return response.json();
    },
    onSuccess: (result: any) => {
      setShowMergeModal(false);
      toast({ title: "Checks Merged", description: "All items combined into current check" });
      if (result.check && result.items) {
        setCurrentCheck(result.check);
        setCheckItems(result.items);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
    },
    onError: (error: any) => {
      const detail = error?.message || String(error);
      console.error("[POS] Merge checks failed:", detail, error);
      toast({ title: "Failed to merge checks", description: detail, variant: "destructive" });
    },
  });

  const priceOverrideMutation = useMutation({
    mutationFn: async ({ itemId, newPrice, reason, managerPin }: { itemId: string; newPrice: number; reason: string; managerPin?: string }) => {
      const response = await apiRequest("POST", `/api/check-items/${itemId}/price-override`, {
        newPrice,
        reason,
        employeeId: currentEmployee?.id,
        managerPin,
      }, wsHeaders());
      return response.json();
    },
    onSuccess: async () => {
      setShowPriceOverrideModal(false);
      toast({ title: "Price Updated", description: "Item price has been overridden" });
      if (currentCheck) {
        try {
          const res = await fetchWithTimeout(`/api/checks/${currentCheck.id}`, { credentials: "include", headers: getAuthHeaders() });
          if (res.ok) {
            const data = await res.json();
            setCurrentCheck(data.check);
            setCheckItems(data.items);
          }
        } catch (e) {
          console.error("Error reloading check:", e);
        }
      }
    },
    onError: (error: any) => {
      const detail = error?.message || String(error);
      console.error("[POS] Price override failed:", detail, error);
      toast({ title: "Failed to override price", description: detail, variant: "destructive" });
    },
  });

  const printCheckMutation = useMutation({
    mutationFn: async (checkId: string) => {
      const unsentItems = (checkItems || []).filter(item => !item.sent && !item.voided);
      if (unsentItems.length > 0) {
        await apiRequest("POST", `/api/checks/${checkId}/send`, {
          employeeId: currentEmployee?.id,
        }, wsHeaders({ "Idempotency-Key": crypto.randomUUID() }));
      }

      const response = await apiRequest("POST", `/api/checks/${checkId}/print`, {
        employeeId: currentEmployee?.id,
        workstationId,
      }, wsHeaders());
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Receipt Printed", description: "Check has been sent to the printer" });
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
      releaseCurrentCheckLock();
      setCurrentCheck(null);
      setCheckItems([]);
      logout();
    },
    onError: (error: any) => {
      const detail = error?.message || String(error);
      console.error("[POS] Print check failed:", detail, error);
      let errorMessage = "Could not print receipt";
      if (error.message) {
        const match = error.message.match(/\{.*"message"\s*:\s*"([^"]+)".*\}/);
        if (match) {
          errorMessage = match[1];
        } else if (error.message.includes(":")) {
          errorMessage = error.message.split(":").slice(1).join(":").trim();
        } else {
          errorMessage = error.message;
        }
      }
      toast({ title: "Print Failed", description: errorMessage, variant: "destructive" });
    },
  });

  const handlePrintCheck = () => {
    if (currentCheck) {
      printCheckMutation.mutate(currentCheck.id);
    }
  };

  const handlePickupCheck = async (checkId: string) => {
    try {
      // First try to acquire a lock on the check
      if (workstationId && currentEmployee?.id) {
        const lockRes = await apiRequest("POST", `/api/checks/${checkId}/lock`, {
          workstationId,
          employeeId: currentEmployee.id,
          lockMode: "cloud",
        }, wsHeaders());
        
        if (!lockRes.ok) {
          const errorData = await lockRes.json();
          if (lockRes.status === 409) {
            toast({ 
              title: "Check locked by another workstation", 
              description: `Locked by ${errorData.lockedByName || 'Unknown'}`,
              variant: "destructive" 
            });
            return;
          }
        }
      }

      const res = await fetchWithTimeout(`/api/checks/${checkId}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to load check");
      const data = await res.json();
      setCurrentCheck(data.check);
      setCheckItems(data.items);
    } catch (error) {
      toast({ title: "Failed to pick up check", variant: "destructive" });
    }
  };

  const handleLookupClick = () => {
    if (!checkOptionAllowed("allow_refunds")) {
      toast({ title: "Refund operations are disabled", variant: "destructive" });
      return;
    }
    if (!hasPrivilege("refund") && !hasPrivilege("process_refunds") && !hasPrivilege("admin_access")) {
      toast({ title: "You do not have permission to process refunds", variant: "destructive" });
      return;
    }
    setShowTransactionLookup(true);
  };

  const handleSelectCheckForRefund = (check: Check) => {
    setSelectedRefundCheck(check);
    setShowTransactionLookup(false);
    setPendingRefundAction(true);
    setShowManagerApproval(true);
  };

  const handleRefundManagerApproval = async (managerPin: string) => {
    try {
      const res = await fetchWithTimeout("/api/auth/manager-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          pin: managerPin,
          requiredPrivilege: "approve_refund",
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        setApprovalError(error.message || "Manager approval failed");
        return;
      }
      const { approvedById } = await res.json();
      setRefundManagerApprovalId(approvedById);
      setShowManagerApproval(false);
      setPendingRefundAction(false);
      setApprovalError(null);
      setShowRefundModal(true);
    } catch {
      setApprovalError("Failed to verify manager credentials");
    }
  };

  const handleRefundComplete = () => {
    setSelectedRefundCheck(null);
    setRefundManagerApprovalId(undefined);
    toast({ title: "Refund processed successfully" });
  };

  const handleSelectSlu = (slu: Slu) => {
    setSelectedSlu(slu);
  };

  const handleSelectItem = async (item: MenuItemWithModifiers, skipAvailabilityCheck?: boolean) => {
    if (editingClosedCheckId) {
      toast({ title: "Cannot add items", description: "Only tender changes are allowed when editing a closed check", variant: "destructive" });
      return;
    }
    if (pendingReopenCheckId) {
      toast({ title: "Cannot add items", description: "Void a payment first to reopen this check", variant: "destructive" });
      return;
    }
    
    // Check availability unless explicitly skipped (e.g., user confirmed sold-out item)
    if (!skipAvailabilityCheck && !isItemAvailable(item.id)) {
      setSoldOutConfirmItem(item);
      return;
    }
    
    // Conversational Ordering: If RVC has it enabled and item has menu build enabled,
    // check for linked modifier groups FIRST, then open COM panel after
    if (currentRvc?.conversationalOrderingEnabled && item.menuBuildEnabled) {
      // Ensure we have a check first
      let checkToUse = currentCheck;
      if (!checkToUse) {
        if (hasPrivilege("fast_transaction")) {
          const defaultOrderType = (currentRvc?.defaultOrderType as OrderType) || "dine_in";
          checkToUse = await createCheckMutation.mutateAsync(defaultOrderType);
        } else {
          setShowOrderTypeModal(true);
          setPendingItem(item);
          return;
        }
      }
      // Check for linked modifier groups using pre-fetched map (instant, no network call)
      const groups = modifierMap?.[item.id] || [];
      const hasRequiredModifiers = groups.some(g => g.modifiers.length > 0 && (g.required || (g.minSelect && g.minSelect > 0)));
      
      if (hasRequiredModifiers) {
        setItemModifierGroups(groups);
        setPendingItem(item);
        setShowModifierModal(true);
        return;
      }
      // No required modifiers — go straight to COM panel
      setPendingStandardModifiers([]);
      setConversationalOrderItem(item);
      return;
    }
    
    // Detect "Create Your Own Pizza" items and navigate to Pizza Builder
    const itemName = item.name.toLowerCase();
    const isPizzaBuilderItem = itemName.includes("classic pizza") || 
                               (itemName.includes("gluten") && itemName.includes("crust")) ||
                               itemName.includes("build your own pizza") ||
                               itemName.includes("create your own pizza");
    
    if (isPizzaBuilderItem) {
      // Ensure we have a check first
      let checkToUse = currentCheck;
      if (!checkToUse) {
        if (hasPrivilege("fast_transaction")) {
          const defaultOrderType = (currentRvc?.defaultOrderType as OrderType) || "dine_in";
          checkToUse = await createCheckMutation.mutateAsync(defaultOrderType);
        } else {
          setShowOrderTypeModal(true);
          setPendingItem(item);
          return;
        }
      }
      // Navigate to Pizza Builder page
      navigate(`/pos/pizza-builder/${item.id}`);
      return;
    }
    
    let checkToUse = currentCheck;
    
    if (!checkToUse) {
      if (hasPrivilege("fast_transaction")) {
        const defaultOrderType = (currentRvc?.defaultOrderType as OrderType) || "dine_in";
        checkToUse = await createCheckMutation.mutateAsync(defaultOrderType);
      } else {
        setShowOrderTypeModal(true);
        setPendingItem(item);
        return;
      }
    }

    // Use pre-fetched modifier map (instant lookup, no network call)
    try {
      const groups = modifierMap?.[item.id] || [];
      
      // Check if any groups have modifiers AND are required (or have at least minSelect > 0)
      const hasRequiredModifiers = groups.some(g => g.modifiers.length > 0 && (g.required || (g.minSelect && g.minSelect > 0)));
      
      if (hasRequiredModifiers) {
        setItemModifierGroups(groups);
        setPendingItem(item);
        setShowModifierModal(true);
        
        if (currentRvc?.dynamicOrderMode) {
          apiRequest("POST", "/api/checks/" + checkToUse.id + "/items", {
            menuItemId: item.id,
            menuItemName: item.name,
            unitPrice: item.price,
            modifiers: [],
            quantity: 1,
            itemStatus: "pending",
          }, wsHeaders()).then(async (response) => {
            const pendingCheckItem = await response.json();
            setCheckItems((prev) => [...prev, pendingCheckItem]);
            setEditingItem(pendingCheckItem);
            queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
            decrementQuantity(item.id);
          }).catch(() => {
            toast({ title: "Warning", description: "KDS pending item could not be created", variant: "destructive" });
          });
        }
      } else {
        const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const optimisticItem = {
          id: optimisticId,
          checkId: checkToUse.id,
          menuItemId: item.id,
          menuItemName: item.name,
          unitPrice: item.price,
          modifiers: [],
          quantity: 1,
          itemStatus: "active",
          sent: false,
          voided: false,
        } as any;
        setCheckItems((prev) => [...prev, optimisticItem]);
        decrementQuantity(item.id);

        try {
          const response = await apiRequest("POST", "/api/checks/" + checkToUse.id + "/items", {
            menuItemId: item.id,
            menuItemName: item.name,
            unitPrice: item.price,
            modifiers: [],
            quantity: 1,
          }, wsHeaders());
          const newItem = await response.json();
          setCheckItems((prev) => prev.map(ci => ci.id === optimisticId ? newItem : ci));
          queryClient.invalidateQueries({ queryKey: ["/api/checks", checkToUse.id] });
          queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
        } catch {
          setCheckItems((prev) => prev.filter(ci => ci.id !== optimisticId));
          queryClient.invalidateQueries({ queryKey: ["/api/item-availability"] });
          toast({ title: "Failed to add item", variant: "destructive" });
          apiRequest("POST", `/api/item-availability/increment`, {
            menuItemId: item.id,
            propertyId: currentRvc?.propertyId,
            delta: 1,
          }).catch(() => {});
        }
      }
    } catch {
      toast({ title: "Failed to add item", variant: "destructive" });
    }
  };

  const handleConfirmModifiers = (modifiers: SelectedModifier[]) => {
    if (editingItem) {
      // Check if this is a pending item being finalized
      const isPendingItem = editingItem.itemStatus === "pending";
      updateModifiersMutation.mutate({ 
        itemId: editingItem.id, 
        modifiers, 
        finalize: isPendingItem 
      });
      // Modal is closed and state cleaned up in onSuccess
    } else if (pendingItem) {
      // If this is a COM-enabled item, store modifiers and open COM panel next
      if (currentRvc?.conversationalOrderingEnabled && pendingItem.menuBuildEnabled) {
        setPendingStandardModifiers(modifiers);
        setShowModifierModal(false);
        setItemModifierGroups([]);
        setConversationalOrderItem(pendingItem);
        setPendingItem(null);
        return;
      }
      addItemMutation.mutate({ menuItem: pendingItem, modifiers });
      // Modal is closed and state cleaned up in onSuccess
    }
  };

  const handleModifierModalClose = () => {
    // If there's a pending item being edited (created in dynamic mode), void it on cancel
    if (editingItem && editingItem.itemStatus === "pending" && currentRvc?.dynamicOrderMode) {
      voidItemMutation.mutate({ itemId: editingItem.id });
    }
    setShowModifierModal(false);
    setPendingItem(null);
    setEditingItem(null);
    setItemModifierGroups([]);
    setPendingStandardModifiers([]);
  };

  const handleVoidItem = (item: CheckItem) => {
    if (editingClosedCheckId) {
      toast({ title: "Cannot void items", description: "Only tender changes are allowed when editing a closed check", variant: "destructive" });
      return;
    }
    if (pendingReopenCheckId) {
      toast({ title: "Cannot void items", description: "Void a payment first to reopen this check", variant: "destructive" });
      return;
    }
    
    if (item.sent) {
      setPendingVoidItem(item);
      setApprovalError(null);
      setShowManagerApproval(true);
    } else {
      voidItemMutation.mutate({ itemId: item.id });
    }
  };

  const handleManagerApproval = (managerPin: string, reasonCode: string) => {
    if (pendingVoidItem) {
      voidItemMutation.mutate({
        itemId: pendingVoidItem.id,
        reason: reasonCode,
        managerPin,
      });
    }
  };

  const handleEditModifiers = async (item: CheckItem) => {
    console.log('[POS] handleEditModifiers called for item:', item.menuItemName, 'id:', item.id);
    if (editingClosedCheckId || pendingReopenCheckId) {
      toast({ title: "Cannot edit modifiers", description: "Only tender changes are allowed", variant: "destructive" });
      return;
    }
    if (item.sent) {
      toast({ title: "Cannot modify sent items", variant: "destructive" });
      return;
    }
    const menuItem = allMenuItems.find((mi) => mi.id === item.menuItemId);
    if (!menuItem) {
      toast({ title: "Menu item not found", variant: "destructive" });
      return;
    }
    
    console.log('[POS] Found menu item:', menuItem.name, 'menuBuildEnabled:', menuItem.menuBuildEnabled, 'conversationalOrderingEnabled:', currentRvc?.conversationalOrderingEnabled);
    
    // Check if this is a COM item (Menu Build enabled)
    if (currentRvc?.conversationalOrderingEnabled && menuItem.menuBuildEnabled) {
      setPendingStandardModifiers([]);
      setEditingCOMCheckItem(item);
      setConversationalOrderItem(menuItem);
      return;
    }
    
    // Check if this is a Pizza item
    const itemName = menuItem.name.toLowerCase();
    const isPizzaBuilderItem = itemName.includes("classic pizza") || 
                               itemName.includes("gluten crust") ||
                               itemName.includes("build your own pizza") ||
                               itemName.includes("create your own pizza");
    if (isPizzaBuilderItem) {
      // Navigate to pizza builder with the check item ID for editing
      navigate(`/pos/pizza-builder/${menuItem.id}?editCheckItemId=${item.id}`);
      return;
    }
    
    // Standard modifier editing flow - use pre-fetched modifier map (instant, no network call)
    setEditingItem(item);
    try {
      const groups = modifierMap?.[menuItem.id] || [];
      
      setItemModifierGroups(groups);
      setPendingItem(menuItem as any);
      setShowModifierModal(true);
    } catch (error) {
      console.error("Failed to fetch modifier groups:", error);
      toast({ title: "Failed to load modifiers", variant: "destructive" });
      setEditingItem(null);
    }
  };

  const handleSelectCheckItem = (item: CheckItem | null) => {
    setSelectedItemId(item?.id || null);
  };

  const handleOrderTypeSelect = async (orderType: OrderType) => {
    await createCheckMutation.mutateAsync(orderType);
    if (pendingItem) {
      // For COM-enabled items, re-enter the full item flow (modifier check then COM)
      if (currentRvc?.conversationalOrderingEnabled && pendingItem.menuBuildEnabled) {
        const itemToProcess = pendingItem;
        setPendingItem(null);
        handleSelectItem(itemToProcess, true);
        return;
      }
      addItemMutation.mutate({ menuItem: pendingItem, modifiers: [] });
      setPendingItem(null);
    }
  };

  const calculateTotals = () => {
    const activeItems = (checkItems || []).filter((item) => !item.voided);
    let displaySubtotal = 0;  // Pre-discount subtotal (what items would cost without discounts)
    let discountTotalCalc = 0;  // Total of all discounts
    let addOnTax = 0;

    activeItems.forEach((item) => {
      const unitPrice = parseFloat(item.unitPrice || "0");
      const modifierTotal = (item.modifiers || []).reduce(
        (mSum, mod) => mSum + parseFloat(mod.priceDelta || "0"),
        0
      );
      const itemTotal = (unitPrice + modifierTotal) * (item.quantity || 1);
      const itemDiscount = parseFloat(item.discountAmount || "0");
      const taxableAmount = itemTotal - itemDiscount;

      // Track discounts
      discountTotalCalc += itemDiscount;

      // Find the menu item and its tax group
      const menuItem = allMenuItems.find((mi) => mi.id === item.menuItemId);
      const taxGroup = menuItem?.taxGroupId
        ? taxGroups.find((tg) => tg.id === menuItem.taxGroupId)
        : null;

      if (taxGroup) {
        const rate = parseFloat(taxGroup.rate || "0");
        if (taxGroup.taxMode === "inclusive") {
          // For inclusive, item price already contains tax
          // Customer sees the full price, no separate tax line
          displaySubtotal += taxableAmount;
        } else {
          // For add-on, add the item total and calculate tax separately
          // Tax is calculated on the discounted amount
          displaySubtotal += taxableAmount;
          addOnTax += taxableAmount * rate;
        }
      } else {
        displaySubtotal += taxableAmount;
      }
    });

    // Round to 2 decimal places for financial accuracy
    const roundedSubtotal = Math.round(displaySubtotal * 100) / 100;
    const roundedTax = Math.round(addOnTax * 100) / 100;
    const roundedTotal = Math.round((displaySubtotal + addOnTax) * 100) / 100;
    const roundedDiscountTotal = Math.round(discountTotalCalc * 100) / 100;
    
    return { subtotal: roundedSubtotal, tax: roundedTax, total: roundedTotal, discountTotal: roundedDiscountTotal };
  };

  const { subtotal, tax, total, discountTotal } = calculateTotals();

  const serviceChargeTotal = (checkServiceChargesQuery.data || [])
    .filter((sc: any) => !sc.voided)
    .reduce((sum: number, sc: any) => sum + parseFloat(sc.amount || "0"), 0);

  if (!currentEmployee || !currentRvc) {
    return <Redirect to="/" />;
  }

  return (
    <div className="flex flex-col bg-background h-screen">
      <header className="flex-shrink-0 bg-card border-b px-3 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <UtensilsCrossed className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-semibold leading-tight" data-testid="text-rvc-name">
                {wsContext?.enterprise?.name && (
                  <span className="font-semibold">{wsContext.enterprise.name} - </span>
                )}
                {currentRvc.name}
                {wsContext?.workstation?.name && (
                  <span className="text-muted-foreground font-normal"> - {wsContext.workstation.name}</span>
                )}
              </span>
              <span className="text-sm text-muted-foreground leading-tight" data-testid="text-pos-title">
                {formatDateTimeInTimezone(currentTime, wsContext?.property?.timezone)}
              </span>
            </div>
          </div>
          <Separator orientation="vertical" className="h-8" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
              <User className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-medium leading-tight" data-testid="text-employee-name">
                {currentEmployee.firstName} {currentEmployee.lastName}
              </span>
              <span className="text-xs text-muted-foreground leading-tight">
                #{currentEmployee.employeeNumber || "---"}
              </span>
            </div>
          </div>
          <Separator orientation="vertical" className="h-8" />
          <Badge 
            variant={apiConnected === true ? "default" : apiConnected === false ? "destructive" : "secondary"}
            className="text-xs"
            data-testid="status-api-connection"
          >
            {apiConnected === true ? (
              <><Wifi className="w-3 h-3 mr-1" /> API</>
            ) : apiConnected === false ? (
              <><WifiOff className="w-3 h-3 mr-1" /> API</>
            ) : (
              "Connecting..."
            )}
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasPrivilege("admin_access") && (
            <Link href="/admin">
              <Button variant="ghost" size="icon" data-testid="button-admin">
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
          )}
          {hasPrivilege("kds_access") && (
            <Link href="/kds">
              <Button variant="ghost" size="icon" data-testid="button-kds">
                <Receipt className="w-4 h-4" />
              </Button>
            </Link>
          )}
          {fullscreenSupported && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              data-testid="button-fullscreen"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </Button>
          )}
          <SyncNotificationCenter propertyId={wsContext?.property?.id} />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            data-testid="button-sign-out"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>


      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeLayout?.mode === "custom_grid" && layoutCells.length > 0 ? (
            <>
              <div
                className="flex-1 grid gap-2 p-4 overflow-hidden"
                style={{
                  gridTemplateColumns: `repeat(${activeLayout.gridCols || 6}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${activeLayout.gridRows || 4}, 1fr)`,
                }}
              >
                  {layoutCells.map((cell) => {
                    const menuItem = allMenuItems.find(m => m.id === cell.menuItemId);
                    if (!menuItem) return null;
                    // Font size classes based on layout setting
                    const fontSizeClasses = {
                      small: "text-xs",
                      medium: "text-sm",
                      large: "text-base",
                      xlarge: "text-lg",
                    };
                    const priceFontSizeClasses = {
                      small: "text-[10px]",
                      medium: "text-xs",
                      large: "text-sm",
                      xlarge: "text-base",
                    };
                    const layoutFontSize = (activeLayout?.fontSize as keyof typeof fontSizeClasses) || "medium";
                    
                    // Availability info
                    const quantity = getQuantityRemaining(menuItem.id);
                    const available = isItemAvailable(menuItem.id);
                    const showQuantityBadge = quantity !== null && quantity > 0;
                    const is86ed = !available;
                    
                    const handlePointerDown = () => {
                      isLongPressRef.current = false;
                      longPressTimerRef.current = setTimeout(() => {
                        isLongPressRef.current = true;
                        setLongPressItem(menuItem);
                        setShowItemOptionsPopup(true);
                      }, 500);
                    };
                    
                    const handlePointerUp = () => {
                      if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                      }
                      if (!isLongPressRef.current) {
                        handleSelectItem(menuItem);
                      }
                    };
                    
                    const handlePointerLeave = () => {
                      if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                      }
                    };
                    
                    const handlePointerCancel = () => {
                      if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                      }
                    };
                    
                    return (
                      <div
                        key={cell.id}
                        className="relative"
                        style={{
                          gridRow: `${cell.rowIndex + 1} / span ${cell.rowSpan || 1}`,
                          gridColumn: `${cell.colIndex + 1} / span ${cell.colSpan || 1}`,
                        }}
                      >
                        <Button
                          className={`h-full w-full flex flex-col items-center justify-center font-medium overflow-hidden ${fontSizeClasses[layoutFontSize]} ${is86ed ? "opacity-60" : ""}`}
                          style={{
                            backgroundColor: cell.backgroundColor || "#3B82F6",
                            color: cell.textColor || "#FFFFFF",
                          }}
                          onPointerDown={handlePointerDown}
                          onPointerUp={handlePointerUp}
                          onPointerLeave={handlePointerLeave}
                          onPointerCancel={handlePointerCancel}
                          onContextMenu={(e) => e.preventDefault()}
                          data-testid={`button-layout-cell-${cell.id}`}
                        >
                          <span className="truncate max-w-full">
                            {cell.displayLabel || menuItem.shortName || menuItem.name}
                          </span>
                          <span className={`${priceFontSizeClasses[layoutFontSize]} opacity-70`}>
                            ${parseFloat(menuItem.price || "0").toFixed(2)}
                          </span>
                          
                          {is86ed && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <X className="w-12 h-12 text-white opacity-50" strokeWidth={3} />
                            </div>
                          )}
                        </Button>
                        
                        {showQuantityBadge && (
                          <span
                            className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-sm z-10"
                            data-testid={`badge-quantity-layout-${menuItem.id}`}
                          >
                            {quantity}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

              <div className="flex-shrink-0 border-t bg-card p-2">
                <div className="flex gap-2 flex-wrap">
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={() => setShowOrderTypeModal(true)}
                      data-testid="button-new-check-fn-grid"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      New Check
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={() => setShowOpenChecksModal(true)}
                      data-testid="button-open-checks-grid"
                    >
                      <List className="w-4 h-4 mr-2" />
                      Open Checks
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={handleLookupClick}
                      data-testid="button-transaction-lookup-grid"
                    >
                      <Search className="w-4 h-4 mr-2" />
                      Lookup
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={() => {
                        if (currentCheck) {
                          cancelTransactionMutation.mutate();
                        }
                      }}
                      disabled={!currentCheck || cancelTransactionMutation.isPending || !!editingClosedCheckId || !!pendingReopenCheckId}
                      data-testid="button-cancel-transaction-grid"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      disabled={!!editingClosedCheckId || !!pendingReopenCheckId}
                      onClick={() => setShowFunctionsModal(true)}
                      data-testid="button-functions-grid"
                    >
                      <Grid3X3 className="w-4 h-4 mr-2" />
                      Functions
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      disabled={!!editingClosedCheckId || !!pendingReopenCheckId}
                      onClick={() => setShowCustomerModal(true)}
                      data-testid="button-customer-grid"
                    >
                      <Star className="w-4 h-4 mr-2" />
                      Loyalty
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      disabled={!!editingClosedCheckId || !!pendingReopenCheckId}
                      onClick={() => setShowGiftCardModal(true)}
                      data-testid="button-gift-card-grid"
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      Gift Card
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={() => handlePrintCheck()}
                      disabled={!currentCheck || printCheckMutation.isPending}
                      data-testid="button-print-check-grid"
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      {printCheckMutation.isPending ? "Printing..." : "Print Check"}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex-shrink-0 border-b bg-card px-3 py-2 overflow-x-auto">
                <div className="flex gap-2">
                  {slusLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-12 w-32 bg-muted animate-pulse rounded-md flex-shrink-0" />
                    ))
                  ) : slus.length === 0 ? (
                    <span className="text-sm text-muted-foreground px-2 py-3">No categories configured</span>
                  ) : (
                    slus.map((slu) => (
                      <div key={slu.id} className="h-12 flex-shrink-0">
                        <Button
                          variant={selectedSlu?.id === slu.id ? "default" : "secondary"}
                          size="lg"
                          className="h-full px-5 whitespace-nowrap text-sm font-semibold"
                          onClick={() => handleSelectSlu(slu)}
                          data-testid={`button-slu-tab-${slu.id}`}
                        >
                          {slu.buttonLabel || slu.name}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <MenuItemGrid
                items={[...menuItems].sort((a, b) => a.name.localeCompare(b.name))}
                onSelectItem={handleSelectItem}
                isLoading={itemsLoading && !!selectedSlu}
              />

              <div className="flex-shrink-0 border-t bg-card p-2">
                <div className="flex gap-2 flex-wrap">
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={() => setShowOrderTypeModal(true)}
                      data-testid="button-new-check-fn"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      New Check
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={() => setShowOpenChecksModal(true)}
                      data-testid="button-open-checks"
                    >
                      <List className="w-4 h-4 mr-2" />
                      Open Checks
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={handleLookupClick}
                      data-testid="button-transaction-lookup"
                    >
                      <Search className="w-4 h-4 mr-2" />
                      Lookup
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={() => {
                        if (currentCheck) {
                          cancelTransactionMutation.mutate();
                        }
                      }}
                      disabled={!currentCheck || cancelTransactionMutation.isPending || !!editingClosedCheckId || !!pendingReopenCheckId}
                      data-testid="button-cancel-transaction"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      disabled={!!editingClosedCheckId || !!pendingReopenCheckId}
                      onClick={() => setShowFunctionsModal(true)}
                      data-testid="button-functions"
                    >
                      <Grid3X3 className="w-4 h-4 mr-2" />
                      Functions
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      disabled={!!editingClosedCheckId || !!pendingReopenCheckId}
                      onClick={() => setShowCustomerModal(true)}
                      data-testid="button-customer"
                    >
                      <Star className="w-4 h-4 mr-2" />
                      Loyalty
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      disabled={!!editingClosedCheckId || !!pendingReopenCheckId}
                      onClick={() => setShowGiftCardModal(true)}
                      data-testid="button-gift-card"
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      Gift Card
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={() => handlePrintCheck()}
                      disabled={!currentCheck || printCheckMutation.isPending}
                      data-testid="button-print-check"
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      {printCheckMutation.isPending ? "Printing..." : "Print Check"}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {currentRvc?.conversationalOrderingEnabled && conversationalOrderItem && (
            <HorizontalCOMPanel
              enterpriseId={wsContext?.property?.enterpriseId || ""}
              activeMenuItem={conversationalOrderItem}
              editingCheckItem={editingCOMCheckItem}
              onConfirmItem={async (menuItemId, modifications) => {
                if (!currentCheck) {
                  toast({ title: "No check open", description: "Start a new check first", variant: "destructive" });
                  return;
                }
                try {
                  const comModifiers: (SelectedModifier & { prefix?: string })[] = modifications.map(m => ({
                    id: m.ingredientName,
                    name: m.prefixName ? `${m.prefixName} ${m.ingredientName}` : m.ingredientName,
                    priceDelta: "0.00",
                    prefix: m.prefixName || undefined,
                  }));
                  const allModifiers = [...pendingStandardModifiers, ...comModifiers];
                  if (editingCOMCheckItem) {
                    const res = await fetchWithTimeout(`/api/check-items/${editingCOMCheckItem.id}/modifiers`, {
                      method: "PUT",
                      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                      body: JSON.stringify({ modifiers: allModifiers }),
                    });
                    if (!res.ok) throw new Error("Failed to update item");
                    const updatedItem = await res.json();
                    setCheckItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
                    toast({ title: "Item updated" });
                  } else {
                    await addItemMutation.mutateAsync({
                      menuItem: conversationalOrderItem!,
                      modifiers: allModifiers,
                    });
                    toast({ title: "Item added to order" });
                  }
                  setConversationalOrderItem(null);
                  setEditingCOMCheckItem(null);
                  setPendingStandardModifiers([]);
                } catch (error: any) {
                  toast({ title: "Failed to save item", description: error.message, variant: "destructive" });
                }
              }}
              onCancelItem={() => {
                setConversationalOrderItem(null);
                setEditingCOMCheckItem(null);
                setPendingStandardModifiers([]);
              }}
            />
          )}
        </div>

        <div className="w-80 lg:w-96 flex-shrink-0 border-l">
          <CheckPanel
            check={currentCheck}
            items={checkItems}
            orderType={currentCheck?.orderType as OrderType}
            onSend={handleSmartSend}
            onVoidItem={(item) => {
              handleVoidItem(item);
              setSelectedItemId(null);
            }}
            onEditModifiers={handleEditModifiers}
            onSelectItem={handleSelectCheckItem}
            selectedItemId={selectedItemId}
            onPay={() => {
              setShowPaymentModal(true);
            }}
            onNewCheck={() => {
              if (editingClosedCheckId || pendingReopenCheckId) return;
              setShowOrderTypeModal(true);
            }}
            onChangeOrderType={() => {
              if (editingClosedCheckId || pendingReopenCheckId) return;
              setShowOrderTypeModal(true);
            }}
            onPriceOverride={(item) => {
              if (pendingReopenCheckId || editingClosedCheckId) {
                toast({ title: "Cannot modify price", description: "Only tender changes are allowed", variant: "destructive" });
                return;
              }
              setSelectedItemId(item.id);
              setShowPriceOverrideModal(true);
            }}
            onDiscountItem={(item) => {
              if (pendingReopenCheckId || editingClosedCheckId) {
                toast({ title: "Cannot apply discount", description: "Only tender changes are allowed", variant: "destructive" });
                return;
              }
              setDiscountItem(item);
              setShowDiscountModal(true);
            }}
            canSend={hasPrivilege("send_to_kitchen")}
            canVoid={(hasPrivilege("void_unsent") || hasPrivilege("void_sent")) && checkOptionAllowed("allow_voids")}
            canPriceOverride={hasPrivilege("modify_price") && checkOptionAllowed("allow_price_override")}
            canDiscount={hasPrivilege("apply_discount") && checkOptionAllowed("allow_discounts")}
            isSending={sendCheckMutation.isPending}
            subtotal={subtotal}
            tax={tax}
            total={total}
            discountTotal={discountTotal}
            paidAmount={paidAmount}
            paymentsReady={paymentsReady}
            authorizedPayments={authorizedPayments}
            onTipCapture={handleTipCapture}
            customerName={customerName}
            onRemoveCustomer={currentCheck?.customerId ? () => removeCustomerMutation.mutate() : undefined}
            payments={paymentInfo?.payments || []}
            selectedPaymentId={selectedPaymentId}
            onSelectPayment={(payment) => setSelectedPaymentId(payment?.id || null)}
            onVoidPayment={(payment) => voidPaymentMutation.mutate(payment)}
            canVoidPayment={(hasPrivilege("void_sent") || hasPrivilege("void_unsent")) && checkOptionAllowed("allow_voids")}
            tenderNames={tenderNames}
            onRemoveCheckDiscounts={currentCheck?.status === "open" ? () => removeCheckDiscountsMutation.mutate() : undefined}
            serviceChargeTotal={serviceChargeTotal}
            onVoidServiceCharge={currentCheck?.status === "open" && serviceChargeTotal > 0 ? () => voidServiceChargeMutation.mutate() : undefined}
            isEditingClosedCheck={!!editingClosedCheckId}
            onCancelEditClosedCheck={handleCancelEditClosedCheck}
            isPendingReopen={!!pendingReopenCheckId}
          />
        </div>
      </div>

      <ModifierModal
        open={showModifierModal}
        onClose={handleModifierModalClose}
        menuItem={pendingItem}
        modifierGroups={itemModifierGroups}
        onConfirm={handleConfirmModifiers}
        initialModifiers={editingItem?.modifiers as SelectedModifier[] | undefined}
        pendingItemId={editingItem?.itemStatus === "pending" ? editingItem.id : undefined}
        employeeId={currentEmployee?.id}
      />

      <ManagerApprovalModal
        open={showManagerApproval}
        onClose={() => {
          setShowManagerApproval(false);
          setPendingVoidItem(null);
          setPendingRefundAction(false);
          setSelectedRefundCheck(null);
          setApprovalError(null);
        }}
        onApprove={pendingRefundAction ? handleRefundManagerApproval : handleManagerApproval}
        action={pendingRefundAction ? "Process Refund" : "Void Sent Item"}
        targetDescription={pendingRefundAction 
          ? `Check #${selectedRefundCheck?.checkNumber}` 
          : pendingVoidItem ? `${pendingVoidItem.menuItemName}` : ""}
        isLoading={pendingRefundAction ? false : voidItemMutation.isPending}
        error={approvalError}
      />

      <AlertDialog open={showTimeoutWarning}>
        <AlertDialogContent data-testid="timeout-warning-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Session Expiring</AlertDialogTitle>
            <AlertDialogDescription>
              You will be signed out in {warningSecondsLeft} second{warningSecondsLeft !== 1 ? "s" : ""} due to inactivity.
              Any unsent items will be removed from the current transaction.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={dismissWarning} data-testid="button-need-more-time">
              Need More Time
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <OrderTypeModal
        open={showOrderTypeModal}
        onClose={() => setShowOrderTypeModal(false)}
        onSelect={handleOrderTypeSelect}
        currentOrderType={currentCheck?.orderType as OrderType}
      />

      <PaymentModal
        open={showPaymentModal}
        onClose={() => {
          if (!cashChangeDue) {
            setShowPaymentModal(false);
          }
        }}
        onPayment={(tenderId, amount, isCashOverTender, paymentTransactionId, tipAmount, storeAndForward) => {
          if (currentCheck?.id && !paymentMutation.isPending) {
            paymentMutation.mutate({ tenderId, amount, isCashOverTender, paymentTransactionId, tipAmount, storeAndForward });
          }
        }}
        tenders={tenders}
        check={currentCheck}
        remainingBalance={Math.max(0, total - paidAmount)}
        isLoading={paymentMutation.isPending}
        changeDue={cashChangeDue}
        onReadyForNextOrder={handleReadyForNextOrder}
        propertyId={currentRvc?.propertyId}
        workstationId={workstationId ?? undefined}
        employeeId={currentEmployee?.id}
      />

      <OpenChecksModal
        open={showOpenChecksModal}
        onClose={() => setShowOpenChecksModal(false)}
        onSelect={handlePickupCheck}
        rvcId={currentRvc?.id}
        workstationId={workstationId}
      />

      <TransactionLookupModal
        open={showTransactionLookup}
        onOpenChange={setShowTransactionLookup}
        rvcId={currentRvc?.id || ""}
        onSelectCheck={handleSelectCheckForRefund}
        timezone={wsContext?.property?.timezone || "America/New_York"}
      />

      <RefundModal
        open={showRefundModal}
        onOpenChange={setShowRefundModal}
        check={selectedRefundCheck}
        rvcId={currentRvc?.id || ""}
        employeeId={currentEmployee?.id || ""}
        managerApprovalId={refundManagerApprovalId}
        onComplete={handleRefundComplete}
        timezone={wsContext?.property?.timezone || "America/New_York"}
      />

      <FunctionsModal
        open={showFunctionsModal}
        onClose={() => setShowFunctionsModal(false)}
        hasActiveCheck={!!currentCheck}
        onTransferCheck={() => {
          const hasUnsentItems = checkItems.some(item => !item.sent);
          if (hasUnsentItems) {
            toast({
              title: "Cannot Transfer Check",
              description: "All items must be sent to KDS before transferring. Please send the order first.",
              variant: "destructive",
            });
            setShowFunctionsModal(false);
            return;
          }
          setShowFunctionsModal(false);
          setShowTransferModal(true);
        }}
        onSplitCheck={() => {
          const hasUnsentItems = checkItems.some(item => !item.sent);
          if (hasUnsentItems) {
            toast({
              title: "Cannot Split Check",
              description: "All items must be sent to KDS before splitting. Please send the order first.",
              variant: "destructive",
            });
            setShowFunctionsModal(false);
            return;
          }
          setShowFunctionsModal(false);
          setShowSplitModal(true);
        }}
        onMergeChecks={() => {
          const hasUnsentItems = checkItems.some(item => !item.sent);
          if (hasUnsentItems) {
            toast({
              title: "Cannot Merge Checks",
              description: "All items must be sent to KDS before merging. Please send the order first.",
              variant: "destructive",
            });
            setShowFunctionsModal(false);
            return;
          }
          setShowFunctionsModal(false);
          setShowMergeModal(true);
        }}
        onReopenCheck={() => {
          setShowFunctionsModal(false);
          setShowReopenModal(true);
        }}
        onEditClosedCheck={() => {
          setShowFunctionsModal(false);
          setShowEditClosedCheckModal(true);
        }}
        onOpenReports={() => {
          setShowFunctionsModal(false);
          setShowReportsModal(true);
        }}
        onStressTest={() => {
          setShowFunctionsModal(false);
          setShowStressTest(true);
        }}
        onPriceOverride={() => {
          setShowFunctionsModal(false);
          if (selectedItemId) {
            setShowPriceOverrideModal(true);
          } else {
            toast({
              title: "No item selected",
              description: "Select an item on the check first",
              variant: "destructive",
            });
          }
        }}
        onAssignTable={() => {
          toast({
            title: "Coming Soon",
            description: "Table assignment will be available in a future update",
          });
        }}
        privileges={{
          canTransfer: hasPrivilege("transfer_check") && checkOptionAllowed("allow_transfer"),
          canSplit: hasPrivilege("split_check") && checkOptionAllowed("allow_split"),
          canMerge: hasPrivilege("merge_checks") && checkOptionAllowed("allow_merge"),
          canReopen: hasPrivilege("reopen_check") && checkOptionAllowed("allow_reopen"),
          canPriceOverride: hasPrivilege("modify_price") && checkOptionAllowed("allow_price_override"),
        }}
        propertyId={currentRvc?.propertyId}
        onOpenDrawer={() => {
          setShowFunctionsModal(false);
          triggerCashDrawerKick();
          toast({ title: "Cash Drawer", description: "Open drawer command sent" });
        }}
        cashDrawerEnabled={!!wsContext?.workstation?.cashDrawerEnabled}
        workstation={wsContext?.workstation ? {
          name: wsContext.workstation.name,
          ipAddress: wsContext.workstation.ipAddress,
        } : null}
      />

      {currentCheck && currentEmployee && currentRvc && (
        <TransferCheckModal
          open={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          checkNumber={currentCheck.checkNumber}
          currentEmployeeId={currentEmployee.id}
          rvcId={currentRvc.id}
          onTransfer={(toEmployeeId) => {
            transferCheckMutation.mutate(toEmployeeId);
          }}
          isTransferring={transferCheckMutation.isPending}
        />
      )}

      {currentCheck && (
        <AdvancedSplitCheckModal
          open={showSplitModal}
          onClose={() => setShowSplitModal(false)}
          check={currentCheck}
          items={checkItems}
          onSplit={(operations) => {
            splitCheckMutation.mutate(operations);
          }}
          isSplitting={splitCheckMutation.isPending}
        />
      )}

      {currentCheck && currentRvc && (
        <MergeChecksModal
          open={showMergeModal}
          onClose={() => setShowMergeModal(false)}
          currentCheckId={currentCheck.id}
          currentCheckNumber={currentCheck.checkNumber}
          rvcId={currentRvc.id}
          onMerge={(checkIds) => {
            mergeChecksMutation.mutate(checkIds);
          }}
          isMerging={mergeChecksMutation.isPending}
        />
      )}

      {currentRvc && (
        <ReopenCheckModal
          open={showReopenModal}
          onClose={() => setShowReopenModal(false)}
          rvcId={currentRvc.id}
          onReopen={(checkId) => {
            loadClosedCheckForViewing(checkId);
          }}
          isReopening={isLoadingClosedCheck}
          timezone={wsContext?.property?.timezone || "America/New_York"}
        />
      )}

      {currentRvc && (
        <EditClosedCheckModal
          open={showEditClosedCheckModal}
          onClose={() => setShowEditClosedCheckModal(false)}
          rvcId={currentRvc.id}
          onSelectCheck={(checkId) => {
            setEditingClosedCheckId(checkId);
            loadClosedCheckForViewing(checkId);
          }}
          timezone={wsContext?.property?.timezone || "America/New_York"}
        />
      )}

      {currentRvc && (
        <POSReportsModal
          open={showReportsModal}
          onClose={() => setShowReportsModal(false)}
          rvcId={currentRvc.id}
          rvcName={currentRvc.name}
          propertyId={currentRvc.propertyId}
        />
      )}

      <PriceOverrideModal
        key={selectedItemId || 'none'}
        open={showPriceOverrideModal}
        onClose={() => setShowPriceOverrideModal(false)}
        item={checkItems.find(i => i.id === selectedItemId) || null}
        onOverride={(itemId, newPrice, reason, managerPin) => {
          priceOverrideMutation.mutate({ itemId, newPrice, reason, managerPin });
        }}
        isOverriding={priceOverrideMutation.isPending}
      />

      <DiscountPickerModal
        open={showDiscountModal}
        onClose={() => {
          setShowDiscountModal(false);
          setDiscountItem(null);
        }}
        item={discountItem}
        discounts={discounts}
        onApplyDiscount={(discountId, managerPin) => {
          applyDiscountMutation.mutate({ discountId, managerPin });
        }}
        onRemoveDiscount={(itemId) => {
          removeDiscountMutation.mutate(itemId);
        }}
        isApplying={applyDiscountMutation.isPending || removeDiscountMutation.isPending}
      />

      <CustomerModal
        open={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        currentCheck={currentCheck}
        currentCustomerId={currentCheck?.customerId || null}
        employeeId={currentEmployee?.id}
        enterpriseId={wsContext?.property?.enterpriseId || ""}
        propertyId={wsContext?.property?.id || ""}
        timezone={wsContext?.property?.timezone || "America/New_York"}
        onCustomerAttached={(customer) => {
          toast({
            title: "Customer Attached",
            description: `${customer.firstName} ${customer.lastName} linked to check`,
          });
          // Update local check state with the new customerId so the UI shows the customer name
          if (currentCheck) {
            setCurrentCheck({ ...currentCheck, customerId: customer.id });
          }
          queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
        }}
        onReorderRequested={async (items, customer) => {
          try {
            let checkToUse = currentCheck;
            if (!checkToUse) {
              const newCheckRes = await apiRequest("POST", "/api/checks", {
                rvcId: currentRvc?.id,
                employeeId: currentEmployee?.id,
                orderType: "dine_in",
              }, wsHeaders({ "Idempotency-Key": crypto.randomUUID() }));
              const newCheck = await newCheckRes.json();
              checkToUse = newCheck;
              setCurrentCheck(newCheck);
              setCheckItems([]);
            }
            
            if (customer && !checkToUse?.customerId) {
              try {
                await apiRequest("POST", `/api/pos/checks/${checkToUse?.id}/customer`, {
                  customerId: customer.id,
                }, wsHeaders());
                if (checkToUse) {
                  checkToUse = { ...checkToUse, customerId: customer.id };
                }
              } catch (e) {
              }
            }
            
            for (const item of items) {
              await apiRequest("POST", `/api/checks/${checkToUse?.id}/items`, {
                menuItemId: item.menuItemId,
                menuItemName: item.menuItemName,
                unitPrice: item.unitPrice,
                quantity: item.quantity,
                modifiers: item.modifiers || [],
              }, wsHeaders());
            }
            
            const refreshRes = await fetchWithTimeout(`/api/checks/${checkToUse?.id}`, { credentials: "include", headers: getAuthHeaders() });
            if (refreshRes.ok) {
              const data = await refreshRes.json();
              setCurrentCheck(data.check);
              setCheckItems(data.items);
            }
            
            queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
            queryClient.invalidateQueries({ queryKey: ["/api/loyalty-members", customer?.id] });
            toast({
              title: "Repeat Order Complete",
              description: `${items.length} item(s) added to check${customer ? ` for ${customer.firstName} ${customer.lastName}` : ""}`,
            });
          } catch (error) {
            toast({
              title: "Error",
              description: "Failed to repeat order",
              variant: "destructive",
            });
          }
        }}
      />

      <GiftCardModal
        open={showGiftCardModal}
        onClose={() => setShowGiftCardModal(false)}
        checkId={currentCheck?.id}
        propertyId={currentRvc?.propertyId}
        employeeId={currentEmployee?.id}
        rvcId={currentRvc?.id}
        timezone={wsContext?.property?.timezone || "America/New_York"}
        onGiftCardRedeemed={(amount) => {
          toast({
            title: "Gift Card Applied",
            description: `$${amount} redeemed from gift card`,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
        }}
        onGiftCardSold={(checkItem, createdCheck) => {
          // If a new check was auto-created for the gift card sale, set it as current
          if (createdCheck) {
            setCurrentCheck(createdCheck);
            setCheckItems([checkItem]);
            // Refresh checks list
            queryClient.invalidateQueries({ queryKey: ["/api/checks"] });
          } else if (checkItem) {
            // Add the gift card sale item to existing check items
            setCheckItems((prev) => [...prev, checkItem]);
            // Refresh check to update totals
            queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
          }
        }}
      />

      <Dialog open={showTipCaptureDialog} onOpenChange={setShowTipCaptureDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleDollarSign className="w-5 h-5 text-amber-600" />
              Add Tip & Capture
            </DialogTitle>
            <DialogDescription>
              {`Enter tip amount for this $${tipCapturePayment ? parseFloat(tipCapturePayment.amount).toFixed(2) : "0.00"} authorization`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tip-amount">Tip Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="tip-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  className="pl-7"
                  data-testid="input-tip-amount"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[15, 18, 20, 25].map((pct) => {
                const baseAmount = tipCapturePayment ? parseFloat(tipCapturePayment.amount) : 0;
                const tipValue = (baseAmount * pct) / 100;
                return (
                  <Button
                    key={pct}
                    variant="outline"
                    size="sm"
                    onClick={() => setTipAmount(tipValue.toFixed(2))}
                    data-testid={`button-tip-${pct}`}
                  >
                    {pct}% (${tipValue.toFixed(2)})
                  </Button>
                );
              })}
            </div>
            {tipAmount && tipCapturePayment && (
              <div className="p-3 bg-muted rounded-md">
                <div className="flex justify-between text-sm">
                  <span>Authorization:</span>
                  <span>${parseFloat(tipCapturePayment.amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Tip:</span>
                  <span>${(parseFloat(tipAmount) || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t mt-2 pt-2">
                  <span>Total to Capture:</span>
                  <span>${(parseFloat(tipCapturePayment.amount) + (parseFloat(tipAmount) || 0)).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowTipCaptureDialog(false)}
              disabled={isCapturingTip}
              data-testid="button-cancel-tip-capture"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmTipCapture}
              disabled={isCapturingTip}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-confirm-tip-capture"
            >
              {isCapturingTip ? "Capturing..." : "Capture Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Availability Dialogs (for custom layout long-press) */}
      <ItemOptionsPopup
        open={showItemOptionsPopup}
        onOpenChange={setShowItemOptionsPopup}
        item={longPressItem}
        onSetAvailability={() => setShowSetAvailabilityDialog(true)}
        onQuick86={() => {
          if (!longPressItem) return;
          const is86ed = !isItemAvailable(longPressItem.id);
          if (is86ed) {
            setAvailability({ menuItemId: longPressItem.id, quantity: null, is86ed: false });
          } else {
            setAvailability({ menuItemId: longPressItem.id, quantity: 0, is86ed: true });
          }
        }}
        is86ed={longPressItem ? !isItemAvailable(longPressItem.id) : false}
      />

      <SetAvailabilityDialog
        open={showSetAvailabilityDialog}
        onOpenChange={setShowSetAvailabilityDialog}
        item={longPressItem}
        currentQuantity={longPressItem ? getQuantityRemaining(longPressItem.id) : null}
        onSave={(quantity) => {
          if (longPressItem) {
            setAvailability({ menuItemId: longPressItem.id, quantity });
          }
        }}
        isSaving={isAvailabilityUpdating}
      />

      <SoldOutConfirmDialog
        open={!!soldOutConfirmItem}
        onOpenChange={(open) => !open && setSoldOutConfirmItem(null)}
        item={soldOutConfirmItem}
        onConfirm={() => {
          if (soldOutConfirmItem) {
            handleSelectItem(soldOutConfirmItem, true);
            setSoldOutConfirmItem(null);
          }
        }}
      />

      {currentRvc && currentEmployee && (
        <StressTestOverlay
          open={showStressTest}
          onClose={() => setShowStressTest(false)}
          rvcId={currentRvc.id}
          employeeId={currentEmployee.id}
          tenders={tenders}
          menuItems={allMenuItems}
          setCurrentCheck={setCurrentCheck}
          setCheckItems={setCheckItems}
          onLogout={logout}
        />
      )}
    </div>
  );
}
