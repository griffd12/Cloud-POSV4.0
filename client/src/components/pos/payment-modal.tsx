import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, fetchWithTimeout, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import type { Tender, Check, TerminalDevice, TerminalSession, CheckPayment } from "@shared/schema";
import { Banknote, CreditCard, Gift, DollarSign, Check as CheckIcon, X, ArrowLeft, Loader2, Wifi, WifiOff, Smartphone, Monitor, Clock, Receipt, Star, ChevronDown, ChevronUp, User } from "lucide-react";
import { StripeCardForm } from "./stripe-card-form";

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  onPayment: (tenderId: string, amount: number, isCashOverTender?: boolean, paymentTransactionId?: string, tipAmount?: number) => void;
  tenders: Tender[];
  check: Check | null;
  remainingBalance: number;
  isLoading?: boolean;
  changeDue?: number | null;
  onReadyForNextOrder?: () => void;
  propertyId?: string;
  workstationId?: string;
  employeeId?: string;
}

type PaymentMethod = "select" | "manual" | "terminal" | "external";
type CardPaymentStep = "amount" | "method" | "entry" | "terminal" | "external";

const TENDER_ICONS: Record<string, typeof Banknote> = {
  cash: Banknote,
  credit: CreditCard,
  gift: Gift,
  other: DollarSign,
};

function getSmartCashAmounts(remainingBalance: number): number[] {
  const ceil = Math.ceil(remainingBalance);
  const roundUps = [1, 2, 5, 10, 20, 50, 100];
  const amounts: number[] = [];

  if (ceil > remainingBalance) {
    amounts.push(ceil);
  }

  for (const denom of roundUps) {
    const rounded = Math.ceil(remainingBalance / denom) * denom;
    if (rounded > remainingBalance && !amounts.includes(rounded)) {
      amounts.push(rounded);
    }
  }

  amounts.sort((a, b) => a - b);
  return amounts.slice(0, 6);
}

export function PaymentModal({
  open,
  onClose,
  onPayment,
  tenders,
  check,
  remainingBalance,
  isLoading = false,
  changeDue = null,
  onReadyForNextOrder,
  propertyId,
  workstationId,
  employeeId,
}: PaymentModalProps) {
  const { toast } = useToast();
  const [customAmount, setCustomAmount] = useState("");
  const [selectedTender, setSelectedTender] = useState<Tender | null>(null);
  const [tenderAmount, setTenderAmount] = useState("");
  
  // Credit card entry state
  const [showCardEntry, setShowCardEntry] = useState(false);
  const [cardTender, setCardTender] = useState<Tender | null>(null);
  const [cardAmount, setCardAmount] = useState(0);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardName, setCardName] = useState("");
  const [isProcessingCard, setIsProcessingCard] = useState(false);
  
  // Terminal device state
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("select");
  const [selectedTerminal, setSelectedTerminal] = useState<TerminalDevice | null>(null);
  const [terminalSession, setTerminalSession] = useState<TerminalSession | null>(null);
  const [terminalPolling, setTerminalPolling] = useState(false);
  
  // Card payment flow state
  const [cardPaymentStep, setCardPaymentStep] = useState<CardPaymentStep>("amount");
  const [cardPaymentAmount, setCardPaymentAmount] = useState("");
  const [isAuthOnly, setIsAuthOnly] = useState(false); // Pre-auth mode for full-service
  
  // Tip entry state for authorized payments
  const [showTipEntry, setShowTipEntry] = useState(false);
  const [tipEntryPayment, setTipEntryPayment] = useState<CheckPayment | null>(null);
  const [tipAmount, setTipAmount] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  
  // External terminal recording state
  const [externalApprovalCode, setExternalApprovalCode] = useState("");
  const [externalLast4, setExternalLast4] = useState("");
  const [externalTipAmount, setExternalTipAmount] = useState("");
  const [externalTotalCharged, setExternalTotalCharged] = useState("");
  const [isRecordingExternal, setIsRecordingExternal] = useState(false);
  
  // Gift card payment state
  const [showGiftCardEntry, setShowGiftCardEntry] = useState(false);
  const [giftCardTender, setGiftCardTender] = useState<Tender | null>(null);
  const [giftCardNumber, setGiftCardNumber] = useState("");
  const [giftCardPin, setGiftCardPin] = useState("");
  const [giftCardLookup, setGiftCardLookup] = useState<any | null>(null);
  const [giftCardAmount, setGiftCardAmount] = useState("");
  const [isLookingUpGiftCard, setIsLookingUpGiftCard] = useState(false);
  const [isProcessingGiftCard, setIsProcessingGiftCard] = useState(false);
  
  // Loyalty member state
  const [loyaltyPhone, setLoyaltyPhone] = useState("");
  const [loyaltyMember, setLoyaltyMember] = useState<any | null>(null);
  const [loyaltyProgram, setLoyaltyProgram] = useState<any | null>(null);
  const [isLookingUpLoyalty, setIsLookingUpLoyalty] = useState(false);
  const [isApplyingLoyalty, setIsApplyingLoyalty] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState("");
  const [showLoyaltySection, setShowLoyaltySection] = useState(false);
  const [loyaltyPointsEarned, setLoyaltyPointsEarned] = useState(false); // Prevent duplicate earning
  
  // Overage tip prompt state - when payment exceeds check total
  const [showOveragePrompt, setShowOveragePrompt] = useState(false);
  const [overageAmount, setOverageAmount] = useState(0);
  const [pendingPaymentAmount, setPendingPaymentAmount] = useState(0);
  const [confirmedTipAmount, setConfirmedTipAmount] = useState<number | undefined>(undefined);
  
  // Query authorized payments on this check (use distinct key to avoid cache collision with POS page)
  const { data: checkPayments = [], refetch: refetchPayments } = useQuery<CheckPayment[]>({
    queryKey: ["/api/checks", check?.id, "payments-modal"],
    queryFn: async () => {
      if (!check?.id) return [];
      const res = await fetchWithTimeout(`/api/checks/${check.id}/payments`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.payments || [];
    },
    enabled: !!check?.id && open,
  });
  
  // Filter to only authorized payments (awaiting tip/capture)
  const authorizedPayments = checkPayments.filter(
    (p) => p.paymentStatus === "authorized"
  );
  
  const [terminalFetchError, setTerminalFetchError] = useState<string | null>(null);
  
  // Query terminal devices for property when modal is open (using raw fetch to avoid apiRequest throwing)
  const { data: terminalDevices = [], isLoading: isLoadingTerminals } = useQuery<TerminalDevice[]>({
    queryKey: ["/api/terminal-devices", { propertyId }],
    queryFn: async () => {
      setTerminalFetchError(null);
      console.log("[PaymentModal] Fetching terminal devices for propertyId:", propertyId);
      if (!propertyId) {
        setTerminalFetchError("No propertyId");
        return [];
      }
      try {
        const authHeaders = getAuthHeaders();
        const url = `/api/terminal-devices?propertyId=${propertyId}`;
        console.log("[PaymentModal] Terminal devices request URL:", url, "headers:", JSON.stringify(authHeaders));
        const res = await failoverFetch(url, {
          method: "GET",
          headers: authHeaders,
          credentials: "include",
        });
        console.log("[PaymentModal] Terminal devices response status:", res.status, res.statusText);
        if (!res.ok) {
          const errorText = await res.text();
          const errMsg = `HTTP ${res.status}: ${errorText.substring(0, 100)}`;
          console.error("[PaymentModal] Terminal devices fetch failed:", errMsg);
          setTerminalFetchError(errMsg);
          return [];
        }
        const devices = await res.json();
        console.log("[PaymentModal] Terminal devices received:", devices.length, JSON.stringify(devices));
        if (devices.length === 0) {
          setTerminalFetchError("Server returned 0 devices");
        }
        return devices;
      } catch (error: any) {
        const errMsg = error?.message || String(error);
        console.error("[PaymentModal] Terminal devices fetch exception:", errMsg);
        setTerminalFetchError(`Exception: ${errMsg}`);
        return [];
      }
    },
    enabled: !!propertyId && open,
  });
  
  // Query property's active payment processor to determine which gateway to use
  const { data: paymentProcessor, isLoading: isLoadingProcessor } = useQuery<{ id: string; name: string; gateway_type: string; environment: string } | null>({
    queryKey: ["/api/payment-processors", { propertyId, active: true }],
    queryFn: async () => {
      if (!propertyId) return null;
      try {
        const res = await apiRequest("GET", `/api/payment-processors?propertyId=${propertyId}&active=true`);
        if (!res.ok) {
          console.error("[PaymentModal] Payment processors fetch failed:", res.status);
          return null;
        }
        const processors = await res.json();
        console.log("[PaymentModal] Payment processors received:", processors.length, JSON.stringify(processors));
        return processors.length > 0 ? processors[0] : null;
      } catch (error) {
        console.error("[PaymentModal] Payment processors fetch exception:", error);
        return null;
      }
    },
    enabled: !!propertyId && open,
  });
  
  // Determine if we should use Stripe Elements or keyed card entry based on processor type
  // If no processor is configured or still loading, default to keyed entry (which uses /api/pos/process-card-payment)
  // The backend will determine the correct processor based on property settings
  const useStripeElements = paymentProcessor?.gateway_type === "stripe";
  const hasPaymentProcessor = !!paymentProcessor;
  
  // Heartland semi-integrated EMV terminal support
  // These processor types require EMV terminal for card-present transactions
  const isHeartlandProcessor = paymentProcessor?.gateway_type?.startsWith("heartland") || false;
  const isHeartlandPayApp = paymentProcessor?.gateway_type === "heartland_pay_app";
  const isHeartlandOPI = paymentProcessor?.gateway_type === "heartland_opi";
  const isHeartlandPortico = paymentProcessor?.gateway_type === "heartland_portico";
  
  // North Ingenico SI terminal support (Cloud WebSocket API)
  const isNorthIngenico = paymentProcessor?.gateway_type === "north_ingenico";
  
  // Processor requires EMV terminal (no manual keyed entry for card-present)
  // Heartland Pay App, OPI, and North Ingenico SI are semi-integrated and must use physical terminals
  const isTerminalOnlyProcessor = isHeartlandPayApp || isHeartlandOPI || isNorthIngenico;
  
  // Filter to active terminals (show all active, not just online - display status indicator)
  const availableTerminals = terminalDevices.filter(
    (t) => t.active
  );
  const assignedTerminal = availableTerminals.find(
    (t) => t.workstationId === workstationId
  );
  const floatingTerminals = availableTerminals.filter(
    (t) => !t.workstationId || t.workstationId !== workstationId
  );

  const cashTender = tenders.find((t) => t.popDrawer === true);
  const nonCashTenders = tenders.filter((t) => t.popDrawer !== true);
  
  const showChangeDueScreen = changeDue !== null && changeDue > 0;

  const resetCardEntry = useCallback(() => {
    setShowCardEntry(false);
    setCardTender(null);
    setCardAmount(0);
    setCardNumber("");
    setCardExpiry("");
    setCardCvv("");
    setCardName("");
    setIsProcessingCard(false);
    setPaymentMethod("select");
    setSelectedTerminal(null);
    setTerminalSession(null);
    setTerminalPolling(false);
    setCardPaymentStep("amount");
    setCardPaymentAmount("");
    setIsAuthOnly(false);
    // Reset external terminal fields
    setExternalApprovalCode("");
    setExternalLast4("");
    setExternalTipAmount("");
    setExternalTotalCharged("");
    setIsRecordingExternal(false);
    // Reset overage tip prompt
    setShowOveragePrompt(false);
    setOverageAmount(0);
    setPendingPaymentAmount(0);
    setConfirmedTipAmount(undefined);
  }, []);
  
  const resetGiftCardEntry = useCallback(() => {
    setShowGiftCardEntry(false);
    setGiftCardTender(null);
    setGiftCardNumber("");
    setGiftCardPin("");
    setGiftCardLookup(null);
    setGiftCardAmount("");
    setIsLookingUpGiftCard(false);
    setIsProcessingGiftCard(false);
  }, []);
  
  // Lookup gift card balance
  const lookupGiftCard = async () => {
    if (!giftCardNumber.trim()) {
      toast({ title: "Enter gift card number", variant: "destructive" });
      return;
    }
    
    setIsLookingUpGiftCard(true);
    setGiftCardLookup(null);
    
    try {
      // Include PIN in lookup for validation if provided
      const lookupUrl = giftCardPin.trim() 
        ? `/api/gift-cards/lookup/${encodeURIComponent(giftCardNumber.trim())}?pin=${encodeURIComponent(giftCardPin.trim())}`
        : `/api/gift-cards/lookup/${encodeURIComponent(giftCardNumber.trim())}`;
      // Use apiRequest to include device token header
      const res = await apiRequest("GET", lookupUrl);
      
      if (!res.ok) {
        const error = await res.json();
        toast({ 
          title: "Card Not Found", 
          description: error.message || "Gift card not found or inactive",
          variant: "destructive" 
        });
        return;
      }
      
      const card = await res.json();
      
      if (card.status !== "active") {
        toast({ 
          title: "Card Not Active", 
          description: `This gift card is ${card.status}`,
          variant: "destructive" 
        });
        return;
      }
      
      const balance = parseFloat(card.currentBalance);
      if (balance <= 0) {
        toast({ 
          title: "Zero Balance", 
          description: "This gift card has no remaining balance",
          variant: "destructive" 
        });
        return;
      }
      
      setGiftCardLookup(card);
      // Pre-fill amount as the lesser of balance or remaining check balance
      const suggestedAmount = Math.min(balance, remainingBalance);
      setGiftCardAmount(suggestedAmount.toFixed(2));
      
    } catch (error: any) {
      console.error("Gift card lookup error:", error);
      toast({ 
        title: "Lookup Failed", 
        description: error.message || "Unable to lookup gift card",
        variant: "destructive" 
      });
    } finally {
      setIsLookingUpGiftCard(false);
    }
  };
  
  // Process gift card redemption
  const processGiftCardPayment = async () => {
    if (!check || !giftCardTender || !giftCardLookup) return;
    
    // Validate required identifiers
    if (!propertyId || !employeeId) {
      toast({ 
        title: "Session Error", 
        description: "Missing property or employee context. Please sign in again.",
        variant: "destructive" 
      });
      return;
    }
    
    const amount = parseFloat(giftCardAmount);
    const balance = parseFloat(giftCardLookup.currentBalance);
    
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    
    if (amount > balance) {
      toast({ 
        title: "Insufficient Balance", 
        description: `Card balance is $${balance.toFixed(2)}`,
        variant: "destructive" 
      });
      return;
    }
    
    if (amount > remainingBalance) {
      toast({ 
        title: "Amount Exceeds Balance", 
        description: `Check remaining balance is $${remainingBalance.toFixed(2)}`,
        variant: "destructive" 
      });
      return;
    }
    
    setIsProcessingGiftCard(true);
    
    try {
      // Redeem the gift card using POS endpoint with card number
      const res = await apiRequest("POST", "/api/pos/gift-cards/redeem", {
        cardNumber: giftCardLookup.cardNumber,
        amount: amount.toString(),
        propertyId,
        employeeId,
        checkId: check.id,
        pin: giftCardPin || undefined,
      });
      
      const result = await res.json();
      
      if (!res.ok || !result.success) {
        toast({ 
          title: "Redemption Failed", 
          description: result.message || "Unable to redeem gift card",
          variant: "destructive" 
        });
        return;
      }
      
      // Record the payment on the check
      onPayment(giftCardTender.id, result.amountRedeemed ? parseFloat(result.amountRedeemed) : amount, false);
      resetGiftCardEntry();
      
      const remainingCardBalance = parseFloat(result.remainingBalance || "0");
      toast({
        title: "Gift Card Applied",
        description: `$${amount.toFixed(2)} redeemed. Remaining card balance: $${remainingCardBalance.toFixed(2)}`,
      });
      
    } catch (error: any) {
      console.error("Gift card redemption error:", error);
      toast({ 
        title: "Redemption Failed", 
        description: error.message || "Unable to process gift card",
        variant: "destructive" 
      });
    } finally {
      setIsProcessingGiftCard(false);
    }
  };
  
  // Reset loyalty state
  const resetLoyalty = useCallback(() => {
    setLoyaltyPhone("");
    setLoyaltyMember(null);
    setLoyaltyProgram(null);
    setPointsToRedeem("");
    setIsLookingUpLoyalty(false);
    setIsApplyingLoyalty(false);
    setLoyaltyPointsEarned(false);
  }, []);
  
  // Lookup loyalty member by phone
  const lookupLoyaltyMember = async () => {
    if (!loyaltyPhone.trim()) {
      toast({ title: "Enter phone number", variant: "destructive" });
      return;
    }
    
    setIsLookingUpLoyalty(true);
    
    try {
      // First get active loyalty programs for this property
      const programsRes = await fetchWithTimeout(`/api/loyalty-programs?active=true`, {
        credentials: "include",
      });
      
      if (!programsRes.ok) {
        toast({ title: "No loyalty program available", variant: "destructive" });
        return;
      }
      
      const programs = await programsRes.json();
      const activeProgram = programs.find((p: any) => p.active);
      
      if (!activeProgram) {
        toast({ title: "No active loyalty program", variant: "destructive" });
        return;
      }
      
      setLoyaltyProgram(activeProgram);
      
      // Now look up the member by phone
      const membersRes = await fetchWithTimeout(`/api/loyalty-members?programId=${activeProgram.id}&phone=${encodeURIComponent(loyaltyPhone.trim())}`, {
        credentials: "include",
      });
      
      if (!membersRes.ok) {
        toast({ title: "Member lookup failed", variant: "destructive" });
        return;
      }
      
      const members = await membersRes.json();
      const member = members.find((m: any) => m.phone === loyaltyPhone.trim());
      
      if (!member) {
        toast({ 
          title: "Member Not Found", 
          description: "No loyalty account found with this phone number",
          variant: "destructive" 
        });
        return;
      }
      
      setLoyaltyMember(member);
      toast({
        title: "Member Found",
        description: `${member.firstName || ""} ${member.lastName || ""} - ${parseFloat(member.currentPoints || "0").toFixed(0)} points`,
      });
      
    } catch (error: any) {
      console.error("Loyalty lookup error:", error);
      toast({ 
        title: "Lookup Failed", 
        description: error.message || "Unable to lookup loyalty member",
        variant: "destructive" 
      });
    } finally {
      setIsLookingUpLoyalty(false);
    }
  };
  
  // Earn points for the current check
  const earnLoyaltyPoints = async () => {
    if (!check || !loyaltyMember || !loyaltyProgram) return;
    
    // Prevent duplicate earning
    if (loyaltyPointsEarned) {
      toast({ 
        title: "Points Already Earned", 
        description: "Points have already been earned for this transaction",
        variant: "destructive" 
      });
      return;
    }
    
    setIsApplyingLoyalty(true);
    
    try {
      const res = await apiRequest("POST", `/api/loyalty-members/${loyaltyMember.id}/earn`, {
        amount: remainingBalance.toString(),
        checkId: check.id,
        referenceNumber: `CHK-${check.id}`,
      });
      
      const result = await res.json();
      
      if (!res.ok) {
        toast({ 
          title: "Failed to Earn Points", 
          description: result.message || "Could not add loyalty points",
          variant: "destructive" 
        });
        return;
      }
      
      // Mark as earned and update member with new balance
      setLoyaltyPointsEarned(true);
      setLoyaltyMember({ ...loyaltyMember, currentPoints: result.member.currentPoints });
      
      toast({
        title: "Points Earned",
        description: `+${result.pointsEarned.toFixed(0)} points added. New balance: ${parseFloat(result.member.currentPoints).toFixed(0)} points`,
      });
      
    } catch (error: any) {
      console.error("Earn points error:", error);
      toast({ 
        title: "Failed to Earn Points", 
        description: error.message || "Unable to add loyalty points",
        variant: "destructive" 
      });
    } finally {
      setIsApplyingLoyalty(false);
    }
  };
  
  // Redeem points
  const redeemLoyaltyPoints = async () => {
    if (!check || !loyaltyMember || !loyaltyProgram) return;
    
    const points = parseFloat(pointsToRedeem);
    const currentPoints = parseFloat(loyaltyMember.currentPoints || "0");
    
    if (isNaN(points) || points <= 0) {
      toast({ title: "Enter valid points amount", variant: "destructive" });
      return;
    }
    
    if (points > currentPoints) {
      toast({ 
        title: "Insufficient Points", 
        description: `Only ${currentPoints.toFixed(0)} points available`,
        variant: "destructive" 
      });
      return;
    }
    
    setIsApplyingLoyalty(true);
    
    try {
      const res = await apiRequest("POST", `/api/loyalty-members/${loyaltyMember.id}/redeem`, {
        points: points.toString(),
        checkId: check.id,
        referenceNumber: `CHK-${check.id}`,
      });
      
      const result = await res.json();
      
      if (!res.ok) {
        toast({ 
          title: "Redemption Failed", 
          description: result.message || "Could not redeem points",
          variant: "destructive" 
        });
        return;
      }
      
      // Update member with new balance
      setLoyaltyMember({ ...loyaltyMember, currentPoints: result.member.currentPoints });
      setPointsToRedeem("");
      
      toast({
        title: "Points Redeemed",
        description: `${points.toFixed(0)} points redeemed. Remaining: ${parseFloat(result.member.currentPoints).toFixed(0)} points`,
      });
      
    } catch (error: any) {
      console.error("Redeem points error:", error);
      toast({ 
        title: "Redemption Failed", 
        description: error.message || "Unable to redeem points",
        variant: "destructive" 
      });
    } finally {
      setIsApplyingLoyalty(false);
    }
  };
  
  // Handle capturing an authorized payment with tip
  const handleCaptureWithTip = async () => {
    if (!tipEntryPayment) return;
    
    setIsCapturing(true);
    try {
      const tipValue = parseFloat(tipAmount) || 0;
      const res = await apiRequest("POST", "/api/pos/capture-with-tip", {
        checkPaymentId: tipEntryPayment.id,
        tipAmount: tipValue,
        employeeId,
      });
      
      const result = await res.json();
      if (result.success) {
        toast({
          title: "Payment Captured",
          description: `$${result.finalAmount.toFixed(2)} captured (includes $${tipValue.toFixed(2)} tip)`,
        });
        setShowTipEntry(false);
        setTipEntryPayment(null);
        setTipAmount("");
        refetchPayments();
        // Invalidate check and payments queries to update balance
        queryClient.invalidateQueries({ queryKey: ["/api/checks", check?.id] });
        queryClient.invalidateQueries({ queryKey: ["/api/checks", check?.id, "payments"] });
      } else {
        toast({
          title: "Capture Failed",
          description: result.message || "Could not capture payment",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Capture error:", error);
      toast({
        title: "Capture Failed",
        description: error.message || "Could not capture payment",
        variant: "destructive",
      });
    } finally {
      setIsCapturing(false);
    }
  };
  
  // Open tip entry dialog for an authorized payment
  const openTipEntry = (payment: CheckPayment) => {
    setTipEntryPayment(payment);
    setTipAmount("");
    setShowTipEntry(true);
  };
  
  // Record payment from external terminal (Elavon, etc.)
  const recordExternalTerminalPayment = async () => {
    if (!check || !cardTender) return;
    
    const totalCharged = parseFloat(externalTotalCharged);
    const tipValue = parseFloat(externalTipAmount) || 0;
    
    if (!externalApprovalCode.trim()) {
      toast({ title: "Approval code required", variant: "destructive" });
      return;
    }
    if (!externalTotalCharged.trim() || isNaN(totalCharged) || totalCharged <= 0) {
      toast({ title: "Valid total charged amount required", variant: "destructive" });
      return;
    }
    if (isNaN(tipValue) || tipValue < 0) {
      toast({ title: "Tip amount must be zero or positive", variant: "destructive" });
      return;
    }
    
    setIsRecordingExternal(true);
    
    try {
      const response = await apiRequest("POST", "/api/pos/record-external-payment", {
        checkId: check.id,
        tenderId: cardTender.id,
        totalCharged: totalCharged.toString(),
        tipAmount: tipValue.toString(),
        approvalCode: externalApprovalCode.trim(),
        last4: externalLast4.trim() || null,
        employeeId,
      });
      
      const result = await response.json();
      
      if (result.success) {
        onPayment(cardTender.id, totalCharged, false, result.paymentId);
        resetCardEntry();
        toast({
          title: "Payment Recorded",
          description: `$${totalCharged.toFixed(2)} recorded${tipValue > 0 ? ` (includes $${tipValue.toFixed(2)} tip)` : ""}`,
        });
      } else {
        toast({
          title: "Failed to Record Payment",
          description: result.message || "Could not record payment",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("External payment recording error:", error);
      toast({
        title: "Recording Failed",
        description: error.message || "Unable to record payment",
        variant: "destructive",
      });
    } finally {
      setIsRecordingExternal(false);
    }
  };
  
  // Poll terminal session status
  useEffect(() => {
    if (!terminalSession || !terminalPolling) return;
    
    const pollSession = async () => {
      try {
        // Use apiRequest to include device token for authentication
        const res = await apiRequest("GET", `/api/terminal-sessions/${terminalSession.id}`);
        if (!res.ok) return;
        const session = await res.json() as TerminalSession;
        
        const normalizedStatus = session.status === "completed" || session.status === "completed_offline"
          ? "approved"
          : session.status === "failed"
            ? "declined"
            : session.status;
        if (normalizedStatus === "approved") {
          setTerminalPolling(false);
          if (cardTender && !session.paymentRecorded) {
            const emvTipDollars = session.tipAmount ? session.tipAmount / 100 : 0;
            const effectiveTip = emvTipDollars > 0 ? emvTipDollars : confirmedTipAmount;
            onPayment(cardTender.id, cardAmount, false, session.paymentTransactionId || undefined, effectiveTip);
          }
          const emvTipDollars = session.tipAmount ? session.tipAmount / 100 : 0;
          const effectiveTipDisplay = emvTipDollars > 0 ? emvTipDollars : confirmedTipAmount;
          const tipDisplay = effectiveTipDisplay ? ` (includes $${effectiveTipDisplay.toFixed(2)} tip)` : "";
          resetCardEntry();
          toast({
            title: "Payment Approved",
            description: `$${cardAmount.toFixed(2)} charged via terminal${tipDisplay}`,
          });
        } else if (normalizedStatus === "declined") {
          setTerminalPolling(false);
          toast({
            title: "Payment Declined",
            description: "Card was declined. Try another card.",
            variant: "destructive",
          });
          setPaymentMethod("select");
          setTerminalSession(null);
        } else if (normalizedStatus === "cancelled" || normalizedStatus === "timeout" || normalizedStatus === "error") {
          setTerminalPolling(false);
          toast({
            title: "Payment Cancelled",
            description: session.statusMessage || "Payment was cancelled",
            variant: "destructive",
          });
          setPaymentMethod("select");
          setTerminalSession(null);
        } else {
          // Still processing
          setTerminalSession(session);
        }
      } catch (error) {
        console.error("Error polling terminal session:", error);
      }
    };
    
    const interval = setInterval(pollSession, 1500);
    return () => clearInterval(interval);
  }, [terminalSession, terminalPolling, cardTender, cardAmount, confirmedTipAmount, onPayment, resetCardEntry, toast]);
  
  // Start terminal payment (from manual selection)
  const startTerminalPayment = async (terminal: TerminalDevice) => {
    if (!check || !cardTender) return;
    
    setSelectedTerminal(terminal);
    setIsProcessingCard(true);
    
    try {
      const res = await apiRequest("POST", "/api/terminal-sessions", {
        terminalDeviceId: terminal.id,
        checkId: check.id,
        tenderId: cardTender.id,
        amount: Math.round(cardAmount * 100), // Amount in cents for backend
        employeeId,
        workstationId,
      });
      
      const session = await res.json() as TerminalSession;
      setTerminalSession(session);
      setCardPaymentStep("terminal");
      setPaymentMethod("terminal");
      setTerminalPolling(true);
      
      toast({
        title: "Present Card",
        description: `Waiting for card on ${terminal.name}`,
      });
    } catch (error: any) {
      console.error("Failed to start terminal session:", error);
      toast({
        title: "Terminal Error",
        description: error.message || "Failed to connect to terminal",
        variant: "destructive",
      });
      setSelectedTerminal(null);
    } finally {
      setIsProcessingCard(false);
    }
  };
  
  // Cancel terminal session
  const cancelTerminalSession = async () => {
    if (!terminalSession) return;
    
    try {
      await apiRequest("POST", `/api/terminal-sessions/${terminalSession.id}/cancel`, {
        reason: "Cancelled by cashier",
      });
      
      setTerminalPolling(false);
      setTerminalSession(null);
      setPaymentMethod("select");
      queryClient.invalidateQueries({ queryKey: ["/api/terminal-devices"] });
      
      toast({ title: "Payment Cancelled" });
    } catch (error) {
      console.error("Failed to cancel terminal session:", error);
    }
  };
  
  // Simulate terminal approval (for demo/testing)
  const simulateTerminalApproval = async (action: "approve" | "decline") => {
    if (!terminalSession) return;
    
    try {
      await apiRequest("POST", `/api/terminal-sessions/${terminalSession.id}/simulate-callback`, {
        action,
      });
    } catch (error) {
      console.error("Failed to simulate terminal callback:", error);
    }
  };

  const handleClose = async () => {
    if (terminalSession) {
      await cancelTerminalSession();
    }
    setCustomAmount("");
    setSelectedTender(null);
    setTenderAmount("");
    resetCardEntry();
    resetGiftCardEntry();
    resetLoyalty();
    setShowLoyaltySection(false);
    onClose();
  };

  const handleExactCash = () => {
    if (cashTender) {
      onPayment(cashTender.id, remainingBalance, false);
    }
  };

  const handleQuickCash = (amount: number) => {
    if (cashTender) {
      const isOverTender = amount > remainingBalance;
      onPayment(cashTender.id, amount, isOverTender);
    }
  };

  const handleCustomCashSubmit = () => {
    const amount = parseFloat(customAmount);
    if (cashTender && amount > 0) {
      const isOverTender = amount > remainingBalance;
      onPayment(cashTender.id, amount, isOverTender);
    }
  };
  
  const handleReadyForNextOrder = () => {
    setCustomAmount("");
    setSelectedTender(null);
    setTenderAmount("");
    resetCardEntry();
    resetGiftCardEntry();
    resetLoyalty();
    setShowLoyaltySection(false);
    if (onReadyForNextOrder) {
      onReadyForNextOrder();
    }
  };

  const handleNonCashExact = (tender: Tender) => {
    // Check if this is a credit/debit tender that needs card entry
    if (tender.requiresPaymentProcessor) {
      setCardTender(tender);
      setCardPaymentAmount(remainingBalance.toFixed(2));
      setCardPaymentStep("amount");
      setShowCardEntry(true);
    } else if (tender.type === "gift") {
      // Gift card tender - show gift card entry
      setGiftCardTender(tender);
      setShowGiftCardEntry(true);
    } else {
      // For other non-card tenders, proceed directly
      onPayment(tender.id, remainingBalance);
    }
  };

  const handleNonCashPartial = () => {
    const amount = parseFloat(tenderAmount);
    if (selectedTender && amount > 0) {
      // Check if this is a credit/debit tender that needs card entry
      if (selectedTender.requiresPaymentProcessor) {
        setCardTender(selectedTender);
        setCardPaymentAmount(amount.toFixed(2));
        setCardPaymentStep("amount");
        setShowCardEntry(true);
        setSelectedTender(null);
        setTenderAmount("");
      } else if (selectedTender.type === "gift") {
        // Gift card tender - show gift card entry
        setGiftCardTender(selectedTender);
        setShowGiftCardEntry(true);
        setSelectedTender(null);
        setTenderAmount("");
      } else {
        onPayment(selectedTender.id, amount);
        setSelectedTender(null);
        setTenderAmount("");
      }
    }
  };
  
  // Proceed from amount step to method selection
  const handleAmountConfirm = () => {
    const amount = parseFloat(cardPaymentAmount);
    if (amount > 0) {
      // Check for overage - if payment exceeds remaining balance, prompt for tip confirmation
      const overage = Math.round((amount - remainingBalance) * 100) / 100;
      if (overage > 0) {
        // Show overage tip prompt
        setOverageAmount(overage);
        setPendingPaymentAmount(amount);
        setShowOveragePrompt(true);
        return;
      }
      
      proceedWithCardPayment(amount);
    }
  };
  
  // Proceed with card payment after any overage confirmation
  const proceedWithCardPayment = (amount: number) => {
    setCardAmount(amount);
    
    // Auto-start terminal payment if there's an assigned terminal
    // This eliminates the extra step of selecting a terminal
    const terminal = assignedTerminal || (availableTerminals.length === 1 ? availableTerminals[0] : null);
    if (terminal) {
      // Directly start terminal payment
      startTerminalPaymentDirect(terminal, amount);
    } else {
      // Show terminal selection if multiple terminals or none assigned
      setCardPaymentStep("method");
      setPaymentMethod("select");
    }
  };
  
  // Handle overage tip confirmation
  const handleOverageTipConfirm = () => {
    setShowOveragePrompt(false);
    // Store the confirmed tip amount - use this exact value instead of recalculating later
    setConfirmedTipAmount(overageAmount);
    // Proceed with the full payment amount - overage will be recorded as tip
    proceedWithCardPayment(pendingPaymentAmount);
  };
  
  // Handle overage tip decline - reset and let user re-enter
  const handleOverageTipDecline = () => {
    setShowOveragePrompt(false);
    setOverageAmount(0);
    setPendingPaymentAmount(0);
    setConfirmedTipAmount(undefined);
    setCardPaymentAmount(remainingBalance.toFixed(2));
  };
  
  // Start terminal payment with specified amount (used for auto-start flow)
  const startTerminalPaymentDirect = async (terminal: TerminalDevice, amount: number) => {
    if (!check || !cardTender) return;
    
    setSelectedTerminal(terminal);
    setCardAmount(amount);
    setCardPaymentStep("terminal");
    setPaymentMethod("terminal");
    setIsProcessingCard(true);
    
    try {
      const res = await apiRequest("POST", "/api/terminal-sessions", {
        terminalDeviceId: terminal.id,
        checkId: check.id,
        tenderId: cardTender.id,
        amount: Math.round(amount * 100), // Amount in cents for backend
        employeeId,
        workstationId,
      });
      
      const session = await res.json() as TerminalSession;
      setTerminalSession(session);
      setTerminalPolling(true);
      
      toast({
        title: "Present Card",
        description: `Waiting for card on ${terminal.name}`,
      });
    } catch (error: any) {
      console.error("Failed to start terminal session:", error);
      
      // Check if this is an active session conflict (409)
      if (error.message?.includes("active payment session")) {
        // Parse the error to get activeSessionId
        // Error format: "409: {\"message\":\"...\",\"activeSessionId\":\"...\"}"
        let activeSessionId: string | null = null;
        try {
          const jsonPart = error.message.substring(error.message.indexOf("{"));
          const errorData = JSON.parse(jsonPart);
          activeSessionId = errorData?.activeSessionId;
        } catch (parseError) {
          console.error("Failed to parse error response:", parseError);
        }
        
        if (activeSessionId) {
          // Try to cancel the existing session and retry
          try {
            await apiRequest("POST", `/api/terminal-sessions/${activeSessionId}/cancel`);
            // Retry after canceling
            const retryRes = await apiRequest("POST", "/api/terminal-sessions", {
              terminalDeviceId: terminal.id,
              checkId: check.id,
              tenderId: cardTender.id,
              amount: Math.round(amount * 100),
              employeeId,
              workstationId,
            });
            const session = await retryRes.json() as TerminalSession;
            setTerminalSession(session);
            setTerminalPolling(true);
            toast({
              title: "Present Card",
              description: `Waiting for card on ${terminal.name}`,
            });
            return;
          } catch (cancelError) {
            console.error("Failed to cancel existing session:", cancelError);
          }
        }
        
        // If cancel/retry failed, show error but stay on method selection
        toast({
          title: "Terminal Busy",
          description: "Terminal has an active session. Please wait or try another terminal.",
          variant: "destructive",
        });
        setCardPaymentStep("method");
        setPaymentMethod("select");
        setSelectedTerminal(null);
      } else {
        // Other errors - go back to method selection
        toast({
          title: "Terminal Error",
          description: error.message || "Failed to connect to terminal",
          variant: "destructive",
        });
        setCardPaymentStep("method");
        setPaymentMethod("select");
        setSelectedTerminal(null);
      }
    } finally {
      setIsProcessingCard(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    const groups = digits.match(/.{1,4}/g);
    return groups ? groups.join(" ") : digits;
  };

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 3) {
      return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    return digits;
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardNumber(formatCardNumber(e.target.value));
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardExpiry(formatExpiry(e.target.value));
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4));
  };

  const processCardPayment = async () => {
    if (!check || !cardTender) return;

    const cleanCardNumber = cardNumber.replace(/\s/g, "");
    
    // Basic validation
    if (cleanCardNumber.length < 15) {
      toast({ title: "Invalid card number", variant: "destructive" });
      return;
    }
    if (cardExpiry.length < 5) {
      toast({ title: "Invalid expiry date", variant: "destructive" });
      return;
    }
    if (cardCvv.length < 3) {
      toast({ title: "Invalid CVV", variant: "destructive" });
      return;
    }

    setIsProcessingCard(true);

    try {
      // Call the unified POS card payment endpoint
      // This routes through the property's configured payment processor
      const response = await apiRequest("POST", "/api/pos/process-card-payment", {
        checkId: check.id,
        tenderId: cardTender.id,
        amount: cardAmount,
        authOnly: isAuthOnly, // Pre-auth mode for full-service
        cardData: {
          cardNumber: cleanCardNumber,
          expMonth: parseInt(cardExpiry.slice(0, 2)),
          expYear: parseInt("20" + cardExpiry.slice(3)),
          cvv: cardCvv,
          cardholderName: cardName || undefined,
        },
      });

      const result = await response.json();

      if (result.success) {
        // Payment approved - record it on the check
        // Use the confirmed tip amount (set when user confirmed overage prompt)
        // This ensures the tip is exactly what the user approved, not recalculated
        onPayment(cardTender.id, cardAmount, false, result.transactionId, confirmedTipAmount);
        resetCardEntry();
        
        const modeLabel = result.demoMode ? " (Demo)" : result.testMode ? " (Test)" : "";
        const authLabel = isAuthOnly ? " (Pre-Auth)" : "";
        const tipLabel = confirmedTipAmount ? ` (includes $${confirmedTipAmount.toFixed(2)} tip)` : "";
        toast({ 
          title: isAuthOnly ? "Card Pre-Authorized" : "Card Approved", 
          description: `$${cardAmount.toFixed(2)} ${isAuthOnly ? "authorized on" : "charged to"} ${result.cardBrand || "card"} ending ${result.cardLast4}${modeLabel}${authLabel}${tipLabel}` 
        });
      } else {
        // Payment declined
        toast({ 
          title: "Card Declined", 
          description: result.declineReason || result.message || "Please try another card", 
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      console.error("Card payment error:", error);
      toast({ 
        title: "Payment Failed", 
        description: error.message || "Unable to process card payment", 
        variant: "destructive" 
      });
    } finally {
      setIsProcessingCard(false);
    }
  };

  const relevantQuickAmounts = getSmartCashAmounts(remainingBalance);
  const customAmountNum = parseFloat(customAmount) || 0;
  const changeFromCustom = customAmountNum - remainingBalance;
  const tenderAmountNum = parseFloat(tenderAmount) || 0;

  // Get status label for terminal session
  const getTerminalStatusLabel = () => {
    if (!terminalSession) return "Initializing...";
    switch (terminalSession.status) {
      case "pending": return "Connecting to terminal...";
      case "processing": return "Processing...";
      case "awaiting_card": return "Present card or tap to pay";
      case "card_inserted": return "Reading card...";
      case "pin_entry": return "Enter PIN on terminal";
      default: return terminalSession.statusMessage || "Processing...";
    }
  };

  // Render terminal waiting screen
  if (showCardEntry && cardTender && paymentMethod === "terminal" && terminalSession) {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2" data-testid="text-terminal-title">
              <Smartphone className="w-5 h-5" />
              <span>{isHeartlandProcessor ? "Heartland EMV Payment" : "Terminal Payment"}</span>
              {isHeartlandPayApp && (
                <span className="text-xs bg-blue-500/20 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded">
                  Pay App
                </span>
              )}
              {isHeartlandOPI && (
                <span className="text-xs bg-purple-500/20 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded">
                  OPI
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="p-4 space-y-4">
            <div className="bg-primary text-primary-foreground rounded-lg p-4 text-center">
              <p className="text-sm opacity-90 mb-1">Charging</p>
              <p className="text-3xl font-bold tabular-nums" data-testid="text-terminal-charge-amount">
                ${cardAmount.toFixed(2)}
              </p>
            </div>

            <div className="bg-muted rounded-lg p-6 text-center space-y-4">
              <div className="flex justify-center">
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
              </div>
              <div>
                <p className="text-lg font-medium" data-testid="text-terminal-status">
                  {getTerminalStatusLabel()}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedTerminal?.name}
                </p>
              </div>
            </div>

            {import.meta.env.DEV && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground text-center">
              <p>Demo Mode: Click buttons below to simulate</p>
              <div className="flex gap-2 mt-2 justify-center">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => simulateTerminalApproval("approve")}
                  data-testid="button-simulate-approve"
                >
                  <CheckIcon className="w-4 h-4 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => simulateTerminalApproval("decline")}
                  data-testid="button-simulate-decline"
                >
                  <X className="w-4 h-4 mr-1" />
                  Decline
                </Button>
              </div>
            </div>
            )}

            <Separator />

            <Button
              variant="outline"
              className="w-full"
              onClick={cancelTerminalSession}
              data-testid="button-cancel-terminal"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Render external terminal recording screen
  if (showCardEntry && cardTender && paymentMethod === "external") {
    const totalCharged = parseFloat(externalTotalCharged) || 0;
    const tipValue = parseFloat(externalTipAmount) || 0;
    const baseAmount = totalCharged - tipValue;
    
    return (
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2" data-testid="text-external-terminal-title">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setPaymentMethod("select")}
                disabled={isRecordingExternal}
                data-testid="button-back-from-external"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <Smartphone className="w-5 h-5" />
              <span>Record External Terminal Payment</span>
            </DialogTitle>
          </DialogHeader>

          <div className="p-4 space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
              <p className="font-medium text-blue-800 dark:text-blue-200">
                Customer paid on external terminal
              </p>
              <p className="text-blue-600 dark:text-blue-400 mt-1">
                Enter the transaction details from the terminal receipt
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="externalApprovalCode">Approval Code *</Label>
                <Input
                  id="externalApprovalCode"
                  type="text"
                  placeholder="e.g. 123456"
                  value={externalApprovalCode}
                  onChange={(e) => setExternalApprovalCode(e.target.value.toUpperCase())}
                  disabled={isRecordingExternal}
                  className="uppercase tracking-wider"
                  data-testid="input-external-approval-code"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="externalTotalCharged">Total Charged *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="externalTotalCharged"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={externalTotalCharged}
                    onChange={(e) => setExternalTotalCharged(e.target.value)}
                    disabled={isRecordingExternal}
                    className="pl-7 tabular-nums"
                    data-testid="input-external-total-charged"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Full amount including any tip</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="externalTipAmount">Tip Amount (if any)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="externalTipAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={externalTipAmount}
                    onChange={(e) => setExternalTipAmount(e.target.value)}
                    disabled={isRecordingExternal}
                    className="pl-7 tabular-nums"
                    data-testid="input-external-tip-amount"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="externalLast4">Last 4 Digits (optional)</Label>
                <Input
                  id="externalLast4"
                  type="text"
                  maxLength={4}
                  placeholder="1234"
                  value={externalLast4}
                  onChange={(e) => setExternalLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  disabled={isRecordingExternal}
                  className="tabular-nums tracking-widest"
                  data-testid="input-external-last4"
                />
              </div>
            </div>

            {totalCharged > 0 && (
              <div className="bg-muted rounded-lg p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Base Amount:</span>
                  <span className="tabular-nums">${baseAmount.toFixed(2)}</span>
                </div>
                {tipValue > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tip:</span>
                    <span className="tabular-nums">${tipValue.toFixed(2)}</span>
                  </div>
                )}
                <Separator className="my-2" />
                <div className="flex justify-between font-medium">
                  <span>Total:</span>
                  <span className="tabular-nums">${totalCharged.toFixed(2)}</span>
                </div>
              </div>
            )}

            <Separator />

            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setPaymentMethod("select")}
                disabled={isRecordingExternal}
                data-testid="button-cancel-external"
              >
                Cancel
              </Button>
              <Button 
                className="flex-1"
                onClick={recordExternalTerminalPayment}
                disabled={isRecordingExternal || !externalApprovalCode.trim() || totalCharged <= 0}
                data-testid="button-record-external-payment"
              >
                {isRecordingExternal ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Recording...
                  </>
                ) : (
                  <>
                    <CheckIcon className="w-4 h-4 mr-2" />
                    Record Payment
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Render gift card entry screen
  if (showGiftCardEntry && giftCardTender) {
    const giftAmount = parseFloat(giftCardAmount) || 0;
    const giftBalance = giftCardLookup ? parseFloat(giftCardLookup.currentBalance) : 0;
    const isValidGiftAmount = giftCardLookup && giftAmount > 0 && giftAmount <= giftBalance && giftAmount <= remainingBalance;
    
    return (
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2" data-testid="text-gift-card-title">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={resetGiftCardEntry}
                data-testid="button-back-from-gift-card"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <Gift className="w-5 h-5" />
              <span>Gift Card Payment</span>
            </DialogTitle>
          </DialogHeader>

          <div className="p-4 space-y-4">
            <div className="bg-muted rounded-lg p-3 text-center">
              <p className="text-sm text-muted-foreground mb-1">Check Balance</p>
              <p className="text-2xl font-bold tabular-nums" data-testid="text-gift-check-balance">
                ${remainingBalance.toFixed(2)}
              </p>
            </div>

            {!giftCardLookup ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="giftCardNumber">Gift Card Number</Label>
                  <Input
                    id="giftCardNumber"
                    type="text"
                    value={giftCardNumber}
                    onChange={(e) => setGiftCardNumber(e.target.value)}
                    className="text-lg h-12 font-mono tracking-wider"
                    placeholder="Enter card number"
                    disabled={isLookingUpGiftCard}
                    data-testid="input-gift-card-number"
                    onKeyDown={(e) => e.key === "Enter" && lookupGiftCard()}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="giftCardPin">PIN (if required)</Label>
                  <Input
                    id="giftCardPin"
                    type="password"
                    value={giftCardPin}
                    onChange={(e) => setGiftCardPin(e.target.value)}
                    className="text-lg h-12"
                    placeholder="Optional"
                    disabled={isLookingUpGiftCard}
                    data-testid="input-gift-card-pin"
                  />
                </div>

                <Separator />

                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={resetGiftCardEntry}
                    disabled={isLookingUpGiftCard}
                    data-testid="button-cancel-gift-card"
                  >
                    Cancel
                  </Button>
                  <Button 
                    className="flex-1"
                    onClick={lookupGiftCard}
                    disabled={isLookingUpGiftCard || !giftCardNumber.trim()}
                    data-testid="button-lookup-gift-card"
                  >
                    {isLookingUpGiftCard ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Looking up...
                      </>
                    ) : (
                      "Look Up Card"
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Card Number</span>
                    <span className="font-mono" data-testid="text-gift-card-masked">
                      ****{giftCardLookup.cardNumber?.slice(-4) || "****"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Available Balance</span>
                    <span className="text-xl font-bold text-green-600 dark:text-green-400" data-testid="text-gift-card-balance">
                      ${giftBalance.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="giftCardAmount">Amount to Apply</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">$</span>
                    <Input
                      id="giftCardAmount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={Math.min(giftBalance, remainingBalance)}
                      value={giftCardAmount}
                      onChange={(e) => setGiftCardAmount(e.target.value)}
                      className="pl-8 text-2xl h-14 tabular-nums text-center font-bold"
                      placeholder="0.00"
                      disabled={isProcessingGiftCard}
                      data-testid="input-gift-card-amount"
                    />
                  </div>
                  {giftAmount > giftBalance && (
                    <p className="text-sm text-destructive">
                      Amount exceeds card balance
                    </p>
                  )}
                  {giftAmount > remainingBalance && (
                    <p className="text-sm text-destructive">
                      Amount exceeds check balance
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    className="h-10"
                    onClick={() => setGiftCardAmount(Math.min(giftBalance, remainingBalance).toFixed(2))}
                    disabled={isProcessingGiftCard}
                    data-testid="button-gift-max-amount"
                  >
                    Max (${Math.min(giftBalance, remainingBalance).toFixed(2)})
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-10"
                    onClick={() => {
                      setGiftCardLookup(null);
                      setGiftCardAmount("");
                    }}
                    disabled={isProcessingGiftCard}
                    data-testid="button-different-gift-card"
                  >
                    Different Card
                  </Button>
                </div>

                <Separator />

                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={resetGiftCardEntry}
                    disabled={isProcessingGiftCard}
                    data-testid="button-cancel-gift-redemption"
                  >
                    Cancel
                  </Button>
                  <Button 
                    className="flex-1"
                    onClick={processGiftCardPayment}
                    disabled={isProcessingGiftCard || !isValidGiftAmount}
                    data-testid="button-apply-gift-card"
                  >
                    {isProcessingGiftCard ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Gift className="w-4 h-4 mr-2" />
                        Apply ${giftAmount.toFixed(2)}
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Render overage tip confirmation dialog
  if (showOveragePrompt && cardTender) {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-center" data-testid="text-overage-title">
              Confirm Tip
            </DialogTitle>
          </DialogHeader>

          <div className="p-4 space-y-4">
            <div className="bg-muted rounded-lg p-4 text-center space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Payment Amount</p>
                <p className="text-2xl font-bold tabular-nums">${pendingPaymentAmount.toFixed(2)}</p>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">Check Total</p>
                <p className="text-lg tabular-nums">${remainingBalance.toFixed(2)}</p>
              </div>
              <div className="bg-primary/10 rounded-lg p-3">
                <p className="text-sm text-primary font-medium">Overage Amount</p>
                <p className="text-3xl font-bold text-primary tabular-nums" data-testid="text-overage-amount">
                  ${overageAmount.toFixed(2)}
                </p>
              </div>
            </div>

            <p className="text-center text-lg font-medium">
              Is ${overageAmount.toFixed(2)} your tip?
            </p>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-14"
                onClick={handleOverageTipDecline}
                data-testid="button-overage-no"
              >
                <X className="w-4 h-4 mr-2" />
                No, Change Amount
              </Button>
              <Button
                className="flex-1 h-14"
                onClick={handleOverageTipConfirm}
                data-testid="button-overage-yes"
              >
                <CheckIcon className="w-4 h-4 mr-2" />
                Yes, Add Tip
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Render amount entry screen (first step for card payments)
  if (showCardEntry && cardTender && cardPaymentStep === "amount") {
    const enteredAmount = parseFloat(cardPaymentAmount) || 0;
    const isOverage = enteredAmount > remainingBalance;
    const isValidAmount = enteredAmount > 0; // Allow overage - will prompt for tip confirmation
    
    return (
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2" data-testid="text-amount-entry-title">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={resetCardEntry}
                data-testid="button-back-from-amount"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <CreditCard className="w-5 h-5" />
              <span>{cardTender.name} - Enter Amount</span>
            </DialogTitle>
          </DialogHeader>

          <div className="p-4 space-y-4">
            <div className="bg-muted rounded-lg p-3 text-center">
              <p className="text-sm text-muted-foreground mb-1">Check Balance</p>
              <p className="text-2xl font-bold tabular-nums" data-testid="text-check-balance">
                ${remainingBalance.toFixed(2)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cardPaymentAmount">Payment Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">$</span>
                <Input
                  id="cardPaymentAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={cardPaymentAmount}
                  onChange={(e) => setCardPaymentAmount(e.target.value)}
                  className="pl-8 text-2xl h-14 tabular-nums text-center font-bold"
                  placeholder="0.00"
                  data-testid="input-card-payment-amount"
                />
              </div>
              {isOverage && (
                <p className="text-sm text-primary">
                  ${(enteredAmount - remainingBalance).toFixed(2)} will be added as tip
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                className="h-12"
                onClick={() => setCardPaymentAmount(remainingBalance.toFixed(2))}
                data-testid="button-full-amount"
              >
                Full Amount (${remainingBalance.toFixed(2)})
              </Button>
              <Button
                variant="secondary"
                className="h-12"
                onClick={() => setCardPaymentAmount((remainingBalance / 2).toFixed(2))}
                data-testid="button-half-amount"
              >
                Half (${(remainingBalance / 2).toFixed(2)})
              </Button>
            </div>

            <Separator />

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <p className="font-medium">Pre-Authorization Only</p>
                <p className="text-sm text-muted-foreground">
                  For table service - add tip later
                </p>
              </div>
              <Button
                variant={isAuthOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setIsAuthOnly(!isAuthOnly)}
                data-testid="button-toggle-auth-only"
              >
                {isAuthOnly ? "On" : "Off"}
              </Button>
            </div>

            <Separator />

            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={resetCardEntry}
                data-testid="button-cancel-amount"
              >
                Cancel
              </Button>
              <Button 
                className="flex-1"
                onClick={handleAmountConfirm}
                disabled={!isValidAmount}
                data-testid="button-continue-to-card"
              >
                Continue
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Render card entry screen with payment method selection
  if (showCardEntry && cardTender && (cardPaymentStep === "method" || cardPaymentStep === "entry")) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2" data-testid="text-card-entry-title">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={paymentMethod === "manual" ? () => setPaymentMethod("select") : () => setCardPaymentStep("amount")}
                disabled={isProcessingCard}
                data-testid="button-back-to-payment"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <CreditCard className="w-5 h-5" />
              <span>{cardTender.name} Payment</span>
              {isAuthOnly && (
                <span className="text-xs bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded">
                  Pre-Auth
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="p-4 space-y-4">
            <div className="bg-primary text-primary-foreground rounded-lg p-4 text-center">
              <p className="text-sm opacity-90 mb-1">Charging</p>
              <p className="text-3xl font-bold tabular-nums" data-testid="text-card-charge-amount">
                ${cardAmount.toFixed(2)}
              </p>
            </div>

            {paymentMethod === "select" && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Choose payment method</p>
                
                {assignedTerminal && (
                  <Button
                    variant="outline"
                    className="w-full h-14 justify-start gap-3"
                    onClick={() => startTerminalPayment(assignedTerminal)}
                    disabled={isProcessingCard}
                    data-testid="button-assigned-terminal"
                  >
                    <div className="flex items-center gap-2">
                      {assignedTerminal.status === "online" ? (
                        <Wifi className="w-5 h-5 text-green-500" />
                      ) : (
                        <WifiOff className="w-5 h-5 text-yellow-500" />
                      )}
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">{assignedTerminal.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Assigned terminal {assignedTerminal.status !== "online" && `(${assignedTerminal.status})`}
                      </p>
                    </div>
                  </Button>
                )}
                
                {floatingTerminals.map((terminal) => (
                  <Button
                    key={terminal.id}
                    variant="outline"
                    className="w-full h-14 justify-start gap-3"
                    onClick={() => startTerminalPayment(terminal)}
                    disabled={isProcessingCard}
                    data-testid={`button-terminal-${terminal.id}`}
                  >
                    <div className="flex items-center gap-2">
                      {terminal.status === "online" ? (
                        <Wifi className="w-5 h-5 text-green-500" />
                      ) : (
                        <WifiOff className="w-5 h-5 text-yellow-500" />
                      )}
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">{terminal.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Available terminal {terminal.status !== "online" && `(${terminal.status})`}
                      </p>
                    </div>
                  </Button>
                ))}
                
                {availableTerminals.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    <WifiOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No terminals available</p>
                    <p className="text-xs mt-1 opacity-70">
                      Property: {propertyId ? propertyId.substring(0, 8) + "..." : "none"} | Devices: {terminalDevices.length} | Loading: {isLoadingTerminals ? "yes" : "no"}
                    </p>
                    {terminalFetchError && (
                      <p className="text-destructive mt-1 text-xs">
                        {terminalFetchError}
                      </p>
                    )}
                    {isTerminalOnlyProcessor && (
                      <p className="text-destructive mt-2 text-xs">
                        Heartland EMV requires a terminal device. Configure terminals in EMC.
                      </p>
                    )}
                  </div>
                )}
                
                <Separator />
                
                <Button
                  variant="default"
                  className="w-full h-14 justify-start gap-3"
                  onClick={() => {
                    setExternalTotalCharged(cardAmount.toFixed(2));
                    setPaymentMethod("external");
                  }}
                  disabled={isProcessingCard}
                  data-testid="button-external-terminal"
                >
                  <Smartphone className="w-5 h-5" />
                  <div className="text-left">
                    <p className="font-medium">External Terminal</p>
                    <p className="text-xs opacity-80">Record payment from standalone terminal</p>
                  </div>
                </Button>
                
                {!isTerminalOnlyProcessor && (
                  <>
                    <Separator />
                    
                    <Button
                      variant="secondary"
                      className="w-full h-12 justify-start gap-3"
                      onClick={() => setPaymentMethod("manual")}
                      disabled={isProcessingCard}
                      data-testid="button-manual-entry"
                    >
                      <Monitor className="w-5 h-5" />
                      <div className="text-left">
                        <p className="font-medium">Manual Card Entry</p>
                        <p className="text-xs text-muted-foreground">Type card details</p>
                      </div>
                    </Button>
                  </>
                )}
                
                {isTerminalOnlyProcessor && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
                    <p className="font-medium text-blue-800 dark:text-blue-200">
                      {isHeartlandPayApp ? "Heartland Pay App" : isHeartlandOPI ? "Heartland OPI" : "Semi-Integrated EMV"}
                    </p>
                    <p className="text-blue-600 dark:text-blue-400 mt-1">
                      This property uses EMV terminals for card payments. Select a terminal above.
                    </p>
                  </div>
                )}
              </div>
            )}

            {paymentMethod === "manual" && isLoadingProcessor && (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading payment processor...</span>
              </div>
            )}

            {paymentMethod === "manual" && !isLoadingProcessor && !hasPaymentProcessor && (
              <div className="space-y-4 text-center p-4">
                <div className="text-destructive">
                  <p className="font-medium">No Payment Processor Configured</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Please configure a payment processor for this property in EMC before processing card payments.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setPaymentMethod("select")}
                  data-testid="button-no-processor-back"
                >
                  Go Back
                </Button>
              </div>
            )}

            {paymentMethod === "manual" && !isLoadingProcessor && hasPaymentProcessor && useStripeElements && (
              <StripeCardForm
                amount={cardAmount}
                checkId={check?.id || ""}
                tenderId={cardTender?.id || ""}
                employeeId={employeeId}
                workstationId={workstationId}
                propertyId={propertyId}
                onSuccess={async (result) => {
                  try {
                    // Record the payment in our system
                    const recordRes = await apiRequest("POST", "/api/stripe/record-payment", {
                      paymentIntentId: result.paymentIntentId,
                      checkId: check?.id,
                      tenderId: cardTender?.id,
                      amount: cardAmount,
                      employeeId,
                      workstationId,
                      cardBrand: result.cardBrand,
                      cardLast4: result.cardLast4,
                    });

                    const recordData = await recordRes.json();
                    
                    if (recordData.success) {
                      toast({
                        title: "Payment Approved",
                        description: `$${cardAmount.toFixed(2)} charged successfully`,
                      });

                      // Invalidate check queries to refresh data
                      queryClient.invalidateQueries({ queryKey: ["/api/checks"] });
                      
                      // Notify parent and close
                      onPayment(cardTender!.id, cardAmount, false, recordData.checkPaymentId);
                      resetCardEntry();
                    } else {
                      throw new Error(recordData.message || "Failed to record payment");
                    }
                  } catch (error) {
                    toast({
                      variant: "destructive",
                      title: "Error",
                      description: error instanceof Error ? error.message : "Failed to record payment",
                    });
                  }
                }}
                onCancel={() => setPaymentMethod("select")}
                onError={(message) => {
                  toast({
                    variant: "destructive",
                    title: "Payment Failed",
                    description: message,
                  });
                }}
              />
            )}

            {paymentMethod === "manual" && !isLoadingProcessor && hasPaymentProcessor && !useStripeElements && (
              <div className="space-y-4" data-testid="keyed-card-entry-form">
                <div className="bg-primary text-primary-foreground rounded-lg p-4 text-center">
                  <p className="text-sm opacity-90 mb-1">Charging</p>
                  <p className="text-3xl font-bold tabular-nums" data-testid="text-keyed-charge-amount">
                    ${cardAmount.toFixed(2)}
                  </p>
                  {paymentProcessor && (
                    <p className="text-xs opacity-75 mt-1">
                      via {paymentProcessor.name} {paymentProcessor.environment !== "production" ? `(${paymentProcessor.environment})` : ""}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="cardNumber">Card Number</Label>
                    <Input
                      id="cardNumber"
                      placeholder="4111 1111 1111 1111"
                      value={cardNumber}
                      onChange={(e) => {
                        // Format card number with spaces
                        const value = e.target.value.replace(/\D/g, "").slice(0, 16);
                        const formatted = value.replace(/(.{4})/g, "$1 ").trim();
                        setCardNumber(formatted);
                      }}
                      className="font-mono text-lg"
                      data-testid="input-card-number"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="cardExpiry">Expiry (MM/YY)</Label>
                      <Input
                        id="cardExpiry"
                        placeholder="MM/YY"
                        value={cardExpiry}
                        onChange={(e) => {
                          let value = e.target.value.replace(/\D/g, "").slice(0, 4);
                          if (value.length >= 2) {
                            value = value.slice(0, 2) + "/" + value.slice(2);
                          }
                          setCardExpiry(value);
                        }}
                        className="font-mono"
                        data-testid="input-card-expiry"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cardCvv">CVV</Label>
                      <Input
                        id="cardCvv"
                        type="password"
                        placeholder="123"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        className="font-mono"
                        data-testid="input-card-cvv"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="cardName">Cardholder Name (optional)</Label>
                    <Input
                      id="cardName"
                      placeholder="John Smith"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      data-testid="input-card-name"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setPaymentMethod("select")}
                    disabled={isProcessingCard}
                    data-testid="button-cancel-keyed-entry"
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={processCardPayment}
                    disabled={isProcessingCard || cardNumber.replace(/\s/g, "").length < 15 || cardExpiry.length < 5 || cardCvv.length < 3}
                    data-testid="button-process-keyed-payment"
                  >
                    {isProcessingCard ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      `Charge $${cardAmount.toFixed(2)}`
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !showChangeDueScreen && handleClose()}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center justify-between" data-testid="text-payment-title">
            <span>{showChangeDueScreen ? "Change Due" : "Payment"}</span>
            {check && (
              <span className="text-muted-foreground text-base font-normal">
                Check #{check.checkNumber}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {showChangeDueScreen ? (
          <div className="p-4">
            <div className="bg-green-600 text-white rounded-lg p-8 text-center mb-6">
              <p className="text-lg opacity-90 mb-2">Change Due</p>
              <p className="text-6xl font-bold tabular-nums" data-testid="text-change-due">
                ${changeDue.toFixed(2)}
              </p>
            </div>
            
            <Button
              variant="default"
              className="w-full h-16 text-xl font-semibold"
              onClick={handleReadyForNextOrder}
              data-testid="button-ready-next-order"
            >
              Ready for Next Order
            </Button>
          </div>
        ) : remainingBalance <= 0 ? (
        <div className="p-4">
          <div className="bg-green-600 text-white rounded-lg p-4 text-center mb-4">
            <p className="text-sm opacity-90 mb-1">Balance</p>
            <p className="text-4xl font-bold tabular-nums" data-testid="text-amount-due">
              $0.00
            </p>
          </div>

          <Button
            variant="default"
            className="w-full h-16 text-xl font-semibold"
            onClick={() => {
              if (cashTender) {
                onPayment(cashTender.id, 0, false);
              }
            }}
            disabled={isLoading || !cashTender}
            data-testid="button-close-check"
          >
            <CheckIcon className="w-6 h-6 mr-2" />
            Close Check
          </Button>
        </div>
        ) : (
        <div className="p-4">
          <div className="bg-primary text-primary-foreground rounded-lg p-4 text-center mb-4">
            <p className="text-sm opacity-90 mb-1">Amount Due</p>
            <p className="text-4xl font-bold tabular-nums" data-testid="text-amount-due">
              ${remainingBalance.toFixed(2)}
            </p>
          </div>

          {authorizedPayments.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Pending Authorizations
              </p>
              {authorizedPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg"
                  data-testid={`pending-auth-${payment.id}`}
                >
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="font-medium tabular-nums">
                        ${parseFloat(payment.amount || "0").toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {payment.tenderName} - Awaiting tip
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => openTipEntry(payment)}
                    data-testid={`button-add-tip-${payment.id}`}
                  >
                    <Receipt className="w-4 h-4 mr-1" />
                    Add Tip
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="mb-4">
            <Button
              variant="ghost"
              className="w-full justify-between h-10"
              onClick={() => setShowLoyaltySection(!showLoyaltySection)}
              data-testid="button-toggle-loyalty"
            >
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-500" />
                <span className="text-sm font-medium">
                  {loyaltyMember 
                    ? `${loyaltyMember.firstName || ""} ${loyaltyMember.lastName || ""} - ${parseFloat(loyaltyMember.currentPoints || "0").toFixed(0)} pts`
                    : "Loyalty Program"
                  }
                </span>
              </div>
              {showLoyaltySection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
            
            {showLoyaltySection && (
              <div className="mt-2 p-3 border rounded-lg space-y-3">
                {!loyaltyMember ? (
                  <>
                    <div className="flex gap-2">
                      <Input
                        type="tel"
                        value={loyaltyPhone}
                        onChange={(e) => setLoyaltyPhone(e.target.value)}
                        placeholder="Phone number"
                        className="flex-1"
                        disabled={isLookingUpLoyalty}
                        data-testid="input-loyalty-phone"
                        onKeyDown={(e) => e.key === "Enter" && lookupLoyaltyMember()}
                      />
                      <Button
                        onClick={lookupLoyaltyMember}
                        disabled={isLookingUpLoyalty || !loyaltyPhone.trim()}
                        data-testid="button-lookup-loyalty"
                      >
                        {isLookingUpLoyalty ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          "Look Up"
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Enter phone to look up loyalty account
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                      <div className="flex items-center gap-2">
                        <User className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                        <div>
                          <p className="font-medium text-sm">
                            {loyaltyMember.firstName} {loyaltyMember.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {loyaltyMember.phone}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">
                          {parseFloat(loyaltyMember.currentPoints || "0").toFixed(0)}
                        </p>
                        <p className="text-xs text-muted-foreground">points</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={loyaltyPointsEarned ? "secondary" : "outline"}
                        size="sm"
                        onClick={earnLoyaltyPoints}
                        disabled={isApplyingLoyalty || loyaltyPointsEarned}
                        data-testid="button-earn-points"
                      >
                        {isApplyingLoyalty ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : loyaltyPointsEarned ? (
                          <CheckIcon className="w-4 h-4 mr-1 text-green-600" />
                        ) : (
                          <Star className="w-4 h-4 mr-1" />
                        )}
                        {loyaltyPointsEarned ? "Earned" : "Earn Points"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={resetLoyalty}
                        disabled={isApplyingLoyalty}
                        data-testid="button-clear-loyalty"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Clear
                      </Button>
                    </div>
                    
                    {parseFloat(loyaltyMember.currentPoints || "0") > 0 && (
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          value={pointsToRedeem}
                          onChange={(e) => setPointsToRedeem(e.target.value)}
                          placeholder="Points to redeem"
                          className="flex-1"
                          min="1"
                          max={parseFloat(loyaltyMember.currentPoints || "0")}
                          disabled={isApplyingLoyalty}
                          data-testid="input-redeem-points"
                        />
                        <Button
                          variant="secondary"
                          onClick={redeemLoyaltyPoints}
                          disabled={isApplyingLoyalty || !pointsToRedeem || parseFloat(pointsToRedeem) <= 0}
                          data-testid="button-redeem-points"
                        >
                          Redeem
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Cash</p>
              
              {cashTender && (
                <Button
                  variant="default"
                  className="w-full h-14 text-lg font-semibold"
                  onClick={handleExactCash}
                  disabled={isLoading}
                  data-testid="button-exact-cash"
                >
                  <Banknote className="w-5 h-5 mr-2" />
                  Exact ${remainingBalance.toFixed(2)}
                </Button>
              )}

              {cashTender && (
                <div className="grid grid-cols-3 gap-2">
                  {relevantQuickAmounts.map((amount) => (
                    <Button
                      key={amount}
                      variant="secondary"
                      className="h-11"
                      onClick={() => handleQuickCash(amount)}
                      disabled={isLoading}
                      data-testid={`button-quick-cash-${amount}`}
                    >
                      ${amount}
                    </Button>
                  ))}
                </div>
              )}

              {cashTender && (
                <div className="pt-1">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        className="pl-7 h-10 tabular-nums"
                        placeholder="Custom"
                        data-testid="input-custom-cash-amount"
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleCustomCashSubmit}
                      disabled={isLoading || customAmountNum <= 0}
                      data-testid="button-custom-cash-submit"
                    >
                      <CheckIcon className="w-4 h-4" />
                    </Button>
                  </div>
                  {customAmountNum >= remainingBalance && (
                    <p className="text-sm text-green-600 dark:text-green-400 mt-1 tabular-nums">
                      Change: ${changeFromCustom.toFixed(2)}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Card / Other</p>
              
              {nonCashTenders.map((tender) => {
                const Icon = TENDER_ICONS[tender.type] || DollarSign;
                const isSelected = selectedTender?.id === tender.id;
                const isCardTender = tender.requiresPaymentProcessor === true;
                
                return (
                  <div key={tender.id} className="space-y-2">
                    <div className="flex gap-2">
                      <Button
                        variant={isSelected ? "secondary" : "outline"}
                        className="flex-1 h-12 justify-start gap-3"
                        onClick={() => handleNonCashExact(tender)}
                        disabled={isLoading}
                        data-testid={`button-tender-exact-${tender.id}`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{tender.name}</span>
                        <span className="ml-auto text-muted-foreground tabular-nums text-sm">
                          ${remainingBalance.toFixed(2)}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedTender(isSelected ? null : tender)}
                        disabled={isLoading}
                        data-testid={`button-tender-split-${tender.id}`}
                        title="Split payment"
                      >
                        <DollarSign className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    {isSelected && (
                      <div className="flex gap-2 pl-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                            $
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max={remainingBalance}
                            value={tenderAmount}
                            onChange={(e) => setTenderAmount(e.target.value)}
                            className="pl-7 h-9 tabular-nums text-sm"
                            placeholder="Partial amount"
                            autoFocus
                            data-testid={`input-tender-amount-${tender.id}`}
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={handleNonCashPartial}
                          disabled={isLoading || tenderAmountNum <= 0 || tenderAmountNum > remainingBalance}
                          data-testid={`button-tender-submit-${tender.id}`}
                        >
                          {isCardTender ? "Enter Card" : "Apply"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <Separator className="my-4" />

          <div className="flex justify-end">
            <Button variant="ghost" onClick={handleClose} disabled={isLoading} data-testid="button-cancel-payment">
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
        )}
      </DialogContent>

      {/* Tip Entry Dialog */}
      <Dialog open={showTipEntry} onOpenChange={(isOpen) => !isOpen && setShowTipEntry(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Add Tip & Capture
            </DialogTitle>
          </DialogHeader>
          
          {tipEntryPayment && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3 text-center">
                <p className="text-sm text-muted-foreground mb-1">Authorization Amount</p>
                <p className="text-2xl font-bold tabular-nums" data-testid="text-auth-amount">
                  ${parseFloat(tipEntryPayment.amount || "0").toFixed(2)}
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="tipAmount">Tip Amount</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">$</span>
                  <Input
                    id="tipAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={tipAmount}
                    onChange={(e) => setTipAmount(e.target.value)}
                    className="pl-8 text-2xl h-14 tabular-nums text-center font-bold"
                    placeholder="0.00"
                    data-testid="input-tip-amount"
                    autoFocus
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-2">
                {[15, 18, 20, 25].map((percent) => {
                  const authAmount = parseFloat(tipEntryPayment.amount || "0");
                  const tipValue = (authAmount * percent / 100);
                  return (
                    <Button
                      key={percent}
                      variant="secondary"
                      size="sm"
                      onClick={() => setTipAmount(tipValue.toFixed(2))}
                      data-testid={`button-tip-${percent}`}
                    >
                      {percent}%
                    </Button>
                  );
                })}
              </div>
              
              <Separator />
              
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-sm text-muted-foreground mb-1">Total Capture</p>
                <p className="text-xl font-bold tabular-nums" data-testid="text-total-capture">
                  ${(parseFloat(tipEntryPayment.amount || "0") + (parseFloat(tipAmount) || 0)).toFixed(2)}
                </p>
              </div>
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowTipEntry(false);
                    setTipEntryPayment(null);
                    setTipAmount("");
                  }}
                  disabled={isCapturing}
                  data-testid="button-cancel-tip"
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCaptureWithTip}
                  disabled={isCapturing}
                  data-testid="button-capture-with-tip"
                >
                  {isCapturing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Capturing...
                    </>
                  ) : (
                    <>
                      <CheckIcon className="w-4 h-4 mr-2" />
                      Capture
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
