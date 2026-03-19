import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Check, CheckItem, CheckPayment, OrderType } from "@shared/schema";
import { Trash2, Send, CreditCard, Check as CheckIcon, Clock, DollarSign, CircleDollarSign, User, X, Percent, XCircle } from "lucide-react";

interface CheckPanelProps {
  check: Check | null;
  items: CheckItem[];
  orderType?: OrderType;
  onSend: () => void;
  onVoidItem: (item: CheckItem) => void;
  onEditModifiers?: (item: CheckItem) => void;
  onSelectItem?: (item: CheckItem | null) => void;
  selectedItemId?: string | null;
  onPay: () => void;
  onNewCheck: () => void;
  onChangeOrderType: () => void;
  onPriceOverride?: (item: CheckItem) => void;
  onDiscountItem?: (item: CheckItem) => void;
  canSend: boolean;
  canVoid: boolean;
  canPriceOverride?: boolean;
  canDiscount?: boolean;
  isSending?: boolean;
  subtotal?: number;
  tax?: number;
  total?: number;
  discountTotal?: number;
  paidAmount?: number;
  paymentsReady?: boolean;
  authorizedPayments?: CheckPayment[];
  onTipCapture?: (payment: CheckPayment) => void;
  customerName?: string | null;
  onRemoveCustomer?: () => void;
  payments?: CheckPayment[];
  selectedPaymentId?: string | null;
  onSelectPayment?: (payment: CheckPayment | null) => void;
  onVoidPayment?: (payment: CheckPayment) => void;
  canVoidPayment?: boolean;
  tenderNames?: Record<string, string>;
  onRemoveCheckDiscounts?: () => void;
  serviceChargeTotal?: number;
  onVoidServiceCharge?: () => void;
  isEditingClosedCheck?: boolean;
  onCancelEditClosedCheck?: () => void;
  isPendingReopen?: boolean;
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: "Dine In",
  take_out: "Take Out",
  delivery: "Delivery",
  pickup: "Pickup",
};

interface SwipeableItemProps {
  item: CheckItem;
  isSelected: boolean;
  itemTotal: number;
  canVoid: boolean;
  canPriceOverride?: boolean;
  canDiscount?: boolean;
  onSelect?: () => void;
  onVoid: () => void;
  onPriceOverride?: () => void;
  onDiscount?: () => void;
  onEditModifiers?: () => void;
  formatPrice: (price: string | number | null) => string;
}

function SwipeableItem({
  item,
  isSelected,
  itemTotal,
  canVoid,
  canPriceOverride,
  canDiscount,
  onSelect,
  onVoid,
  onPriceOverride,
  onDiscount,
  onEditModifiers,
  formatPrice,
}: SwipeableItemProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const isDragging = useRef(false);

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isDragging.current = false;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null || startY.current === null) return;
    
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = startX.current - endX;
    const deltaY = Math.abs(startY.current - endY);
    
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > deltaY) {
      isDragging.current = true;
      setIsRevealed(deltaX > 0);
    }
    
    startX.current = null;
    startY.current = null;
  };

  // Mouse handlers for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    startX.current = e.clientX;
    startY.current = e.clientY;
    isDragging.current = false;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (startX.current === null || startY.current === null) return;
    
    const deltaX = startX.current - e.clientX;
    const deltaY = Math.abs(startY.current - e.clientY);
    
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > deltaY) {
      isDragging.current = true;
      setIsRevealed(deltaX > 0);
    }
    
    startX.current = null;
    startY.current = null;
  };

  const handleClick = (e: React.MouseEvent) => {
    // If we just finished dragging, don't trigger click
    if (isDragging.current) {
      isDragging.current = false;
      return;
    }
    
    if (isRevealed) {
      setIsRevealed(false);
    } else {
      if (!item.sent && onEditModifiers) {
        onEditModifiers();
      } else if (onSelect) {
        onSelect();
      }
    }
  };

  return (
    <div
      className={`rounded-md transition-colors overflow-hidden ${
        isSelected 
          ? "bg-accent ring-1 ring-primary/20" 
          : item.sent 
            ? "bg-green-500/5 dark:bg-green-500/10" 
            : "bg-muted/50"
      }`}
      data-testid={`check-item-${item.id}`}
    >
      <div className="relative flex">
        {/* Main item content */}
        <div
          className={`flex-1 flex items-start gap-2 p-2.5 cursor-pointer hover-elevate active-elevate-2 transition-transform duration-200 ${
            isRevealed ? "-translate-x-24" : "translate-x-0"
          }`}
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          data-testid={`button-select-item-${item.id}`}
        >
          <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
            {item.sent ? (
              <CheckIcon className="w-4 h-4 text-green-500" />
            ) : (
              <div className="w-2 h-2 rounded-full bg-amber-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1">
              {item.quantity && item.quantity > 1 && (
                <span className="text-base font-semibold text-primary">{item.quantity}x</span>
              )}
              <span className="font-medium text-base truncate">
                {item.menuItemName}
              </span>
            </div>
            {item.modifiers && item.modifiers.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {item.modifiers.map((mod, idx) => {
                  let prefix = (mod as any).prefix?.toLowerCase() || '';
                  if (!prefix && mod.name) {
                    const nameLower = mod.name.toLowerCase();
                    if (nameLower.startsWith('no ')) prefix = 'no';
                    else if (nameLower.startsWith('extra ') || nameLower.startsWith('xtr ')) prefix = 'extra';
                    else if (nameLower.startsWith('lt ') || nameLower.startsWith('light ')) prefix = 'lt';
                    else if (nameLower.startsWith('sub ')) prefix = 'sub';
                  }
                  let symbol = '+';
                  if (prefix === 'no') symbol = '-';
                  else if (prefix === 'extra' || prefix === 'xtr') symbol = 'X';
                  else if (prefix === 'lt' || prefix === 'light') symbol = '/';
                  else if (prefix === 'sub') symbol = '+';
                  
                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`block text-left text-base rounded ${
                        !item.sent 
                          ? "cursor-pointer text-muted-foreground hover:text-foreground" 
                          : "text-muted-foreground/70 cursor-default"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!item.sent && onEditModifiers) {
                          onEditModifiers();
                        }
                      }}
                      disabled={!!item.sent}
                      data-testid={`button-modifier-${item.id}-${idx}`}
                    >
                      {symbol} {mod.name}
                      {parseFloat(mod.priceDelta) > 0 && (
                        <span className="ml-1 text-muted-foreground">
                          (+{formatPrice(mod.priceDelta)})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <span className="text-base font-semibold tabular-nums flex-shrink-0">
            {formatPrice(itemTotal)}
          </span>
        </div>
        
        {/* Swipe actions panel */}
        <div 
          className={`absolute right-0 top-0 bottom-0 flex items-stretch transition-opacity duration-200 ${
            isRevealed ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          {canDiscount && onDiscount && (
            <button
              className={`w-12 ${item.discountId ? "bg-orange-500 hover:bg-orange-600" : "bg-purple-500 hover:bg-purple-600"} text-white flex items-center justify-center`}
              onClick={(e) => {
                e.stopPropagation();
                setIsRevealed(false);
                onDiscount();
              }}
              data-testid={`button-discount-swipe-${item.id}`}
            >
              {item.discountId ? <X className="w-5 h-5" /> : <Percent className="w-5 h-5" />}
            </button>
          )}
          {canPriceOverride && onPriceOverride && !item.discountId && (
            <button
              className="w-12 bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                setIsRevealed(false);
                onPriceOverride();
              }}
              data-testid={`button-price-override-swipe-${item.id}`}
            >
              <DollarSign className="w-5 h-5" />
            </button>
          )}
          {canVoid && (
            <button
              className="w-12 bg-destructive hover:bg-destructive/90 text-destructive-foreground flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                setIsRevealed(false);
                onVoid();
              }}
              data-testid={`button-void-swipe-${item.id}`}
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
      {/* Discount indicator */}
      {item.discountId && item.discountAmount && (
        <div className="px-2.5 pb-2 flex items-center justify-between text-xs">
          <span className="text-purple-500 font-medium flex items-center gap-1">
            <Percent className="w-3 h-3" />
            {item.discountName || "Discount"}
          </span>
          <span className="text-destructive font-medium">
            -{formatPrice(item.discountAmount)}
          </span>
        </div>
      )}
    </div>
  );
}

export function CheckPanel({
  check,
  items,
  orderType,
  onSend,
  onVoidItem,
  onEditModifiers,
  onSelectItem,
  selectedItemId,
  onPay,
  onNewCheck,
  onChangeOrderType,
  onPriceOverride,
  onDiscountItem,
  canSend,
  canVoid,
  canPriceOverride = false,
  canDiscount = false,
  isSending,
  subtotal: propSubtotal,
  tax: propTax,
  total: propTotal,
  discountTotal: propDiscountTotal,
  paidAmount = 0,
  paymentsReady = true,
  authorizedPayments = [],
  onTipCapture,
  customerName,
  onRemoveCustomer,
  payments = [],
  selectedPaymentId,
  onSelectPayment,
  onVoidPayment,
  canVoidPayment = false,
  tenderNames = {},
  onRemoveCheckDiscounts,
  serviceChargeTotal = 0,
  onVoidServiceCharge,
  isEditingClosedCheck = false,
  onCancelEditClosedCheck,
  isPendingReopen = false,
}: CheckPanelProps) {
  const formatPrice = (price: string | number | null) => {
    const numPrice = typeof price === "string" ? parseFloat(price) : (price || 0);
    return `$${numPrice.toFixed(2)}`;
  };

  const activeItems = items.filter(item => !item.voided);
  const unsentItems = activeItems.filter(item => !item.sent);
  const sentItems = activeItems.filter(item => item.sent);
  const subtotal = propSubtotal ?? 0;
  const tax = propTax ?? 0;
  const discountTotal = propDiscountTotal ?? 0;
  const total = propTotal ?? (subtotal + tax);
  const balanceDue = Math.max(0, total - paidAmount);

  if (!check) {
    return (
      <div className="h-full flex flex-col bg-card">
        <div className="flex-shrink-0 px-4 py-3 border-b bg-muted/30">
          <span className="text-lg font-semibold text-muted-foreground">No Active Check</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center space-y-3">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground/50" />
            <p className="text-muted-foreground text-sm">
              Select an item to start a new check,<br />
              or use the function bar below
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex-shrink-0 px-4 py-3 border-b flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tabular-nums" data-testid="text-check-number">
            #{check.checkNumber}
          </span>
          <Badge
            variant="secondary"
            className="cursor-pointer font-medium"
            onClick={onChangeOrderType}
            data-testid="badge-order-type"
          >
            {ORDER_TYPE_LABELS[check.orderType] || check.orderType}
          </Badge>
        </div>
        {check.tableNumber && (
          <span className="text-base text-muted-foreground">
            Tbl {check.tableNumber}
          </span>
        )}
      </div>
      
      {isEditingClosedCheck && (
        <div className="flex-shrink-0 px-3 py-2 border-b bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-sm font-medium text-center" data-testid="banner-editing-closed-check">
          Editing Closed Check — Void payment to change tender
        </div>
      )}

      {customerName && (
        <div className="flex-shrink-0 px-4 py-2 border-b bg-blue-50 dark:bg-blue-950/30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <User className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <span className="text-base font-medium text-blue-700 dark:text-blue-300 truncate" data-testid="text-customer-name">
              {customerName}
            </span>
          </div>
          {onRemoveCustomer && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-blue-600 dark:text-blue-400 hover:text-red-600 dark:hover:text-red-400"
              onClick={onRemoveCustomer}
              data-testid="button-remove-customer"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}
      
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {activeItems.length === 0 ? (
            <p className="text-center text-muted-foreground text-base py-12">
              No items on this check
            </p>
          ) : (
            activeItems.map((item) => {
              const isSelected = selectedItemId === item.id;
              const itemTotal = (parseFloat(item.unitPrice || "0") +
                (item.modifiers || []).reduce(
                  (sum, m) => sum + parseFloat(m.priceDelta || "0"),
                  0
                )) * (item.quantity || 1);
              
              return (
                <SwipeableItem
                  key={item.id}
                  item={item}
                  isSelected={isSelected}
                  itemTotal={itemTotal}
                  canVoid={isEditingClosedCheck ? false : canVoid}
                  canPriceOverride={isEditingClosedCheck ? false : canPriceOverride}
                  canDiscount={isEditingClosedCheck ? false : canDiscount}
                  onSelect={isEditingClosedCheck ? undefined : () => onSelectItem?.(isSelected ? null : item)}
                  onVoid={() => onVoidItem(item)}
                  onPriceOverride={isEditingClosedCheck ? undefined : (onPriceOverride ? () => onPriceOverride(item) : undefined)}
                  onDiscount={isEditingClosedCheck ? undefined : (onDiscountItem ? () => onDiscountItem(item) : undefined)}
                  onEditModifiers={isEditingClosedCheck ? undefined : (onEditModifiers ? () => onEditModifiers(item) : undefined)}
                  formatPrice={formatPrice}
                />
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Payments Section - only show if there are completed/voided payments */}
      {payments.filter(p => p.paymentStatus === "completed" || p.paymentStatus === "voided").length > 0 && (
        <div className="flex-shrink-0 border-t bg-green-50 dark:bg-green-950/20">
          <div className="px-3 py-2">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-base font-medium text-green-700 dark:text-green-300">
                Payments
              </span>
            </div>
            <div className="space-y-1">
              {payments
                .filter(p => p.paymentStatus === "completed" || p.paymentStatus === "voided")
                .map((payment) => {
                  const isSelected = selectedPaymentId === payment.id;
                  const isVoided = payment.paymentStatus === "voided";
                  const tenderName = tenderNames[payment.tenderId] || "Payment";
                  
                  return (
                    <div
                      key={payment.id}
                      className={`flex items-center justify-between gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                        isVoided 
                          ? "bg-red-100 dark:bg-red-900/30 line-through opacity-60"
                          : isSelected 
                            ? "bg-accent ring-1 ring-primary/20" 
                            : "bg-white dark:bg-card hover-elevate"
                      }`}
                      onClick={() => !isVoided && onSelectPayment?.(isSelected ? null : payment)}
                      data-testid={`payment-row-${payment.id}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CreditCard className={`w-4 h-4 flex-shrink-0 ${isVoided ? "text-red-500" : "text-green-600 dark:text-green-400"}`} />
                        <span className={`text-sm font-medium truncate ${isVoided ? "text-red-600 dark:text-red-400" : ""}`}>
                          {tenderName}
                          {payment.tipAmount && parseFloat(payment.tipAmount) > 0 && (
                            <span className="text-muted-foreground ml-1">(incl. tip)</span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold tabular-nums ${isVoided ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                          {isVoided ? "" : "-"}{formatPrice(parseFloat(payment.amount || "0") + parseFloat(payment.tipAmount || "0"))}
                        </span>
                        {isSelected && canVoidPayment && !isVoided && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              onVoidPayment?.(payment);
                            }}
                            data-testid={`button-void-payment-${payment.id}`}
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            Void
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      <div className="flex-shrink-0 border-t bg-muted/30">
        <div className="px-4 py-3 space-y-1">
          <div className="flex justify-between text-base">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums font-medium">{formatPrice(subtotal + discountTotal)}</span>
          </div>
          {discountTotal > 0 && (
            <div className="flex justify-between items-center text-base text-purple-600 dark:text-purple-400">
              <span className="flex items-center gap-1">
                <Percent className="w-4 h-4" />
                Discounts
              </span>
              <span className="flex items-center gap-1.5">
                <span className="tabular-nums">-{formatPrice(discountTotal)}</span>
                {onRemoveCheckDiscounts && (
                  <button
                    onClick={onRemoveCheckDiscounts}
                    className="p-0.5 rounded hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-500"
                    data-testid="button-remove-check-discounts"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            </div>
          )}
          {serviceChargeTotal > 0 && (
            <div className="flex justify-between items-center text-base text-amber-600 dark:text-amber-400">
              <span className="flex items-center gap-1">
                <DollarSign className="w-4 h-4" />
                Service Charges
              </span>
              <span className="flex items-center gap-1.5">
                <span className="tabular-nums">{formatPrice(serviceChargeTotal)}</span>
                {onVoidServiceCharge && (
                  <button
                    onClick={onVoidServiceCharge}
                    className="p-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-500"
                    data-testid="button-void-service-charges"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            </div>
          )}
          {tax > 0 && (
            <div className="flex justify-between text-base">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">{formatPrice(tax)}</span>
            </div>
          )}
          {paidAmount > 0 && (
            <div className="flex justify-between text-base text-green-600 dark:text-green-400">
              <span>Paid</span>
              <span className="tabular-nums">-{formatPrice(paidAmount)}</span>
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t bg-card flex justify-between items-center">
          <span className="text-lg font-semibold">{paidAmount > 0 ? "Balance" : "Total"}</span>
          <span className="text-3xl font-bold tabular-nums" data-testid="text-check-total">
            {formatPrice(paidAmount > 0 ? balanceDue : total)}
          </span>
        </div>
      </div>

      {authorizedPayments.length > 0 && (
        <div className="flex-shrink-0 px-3 py-2 border-t bg-amber-50 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 mb-2">
            <CircleDollarSign className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-base font-medium text-amber-700 dark:text-amber-300">
              Pending Authorization{authorizedPayments.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-1.5">
            {authorizedPayments.map((payment) => (
              <div 
                key={payment.id}
                className="flex items-center justify-between gap-2 p-2 bg-white dark:bg-card rounded-md border border-amber-200 dark:border-amber-800"
              >
                <div className="flex flex-col">
                  <span className="text-base font-medium">{formatPrice(payment.amount)}</span>
                  <span className="text-xs text-muted-foreground">Awaiting tip</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                  onClick={() => onTipCapture?.(payment)}
                  data-testid={`button-tip-capture-${payment.id}`}
                >
                  <CircleDollarSign className="w-3.5 h-3.5 mr-1" />
                  Add Tip
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-shrink-0 p-3 border-t bg-muted/30">
        <div className="grid grid-cols-2 gap-2">
          {isEditingClosedCheck ? (
            <Button
              variant="destructive"
              size="lg"
              className="aspect-square min-h-20 text-base font-semibold flex flex-col items-center justify-center gap-1"
              onClick={onCancelEditClosedCheck}
              data-testid="button-cancel-edit-closed"
            >
              <XCircle className="w-6 h-6" />
              <span>Cancel Edit</span>
            </Button>
          ) : (
            <Button
              variant={isPendingReopen ? "secondary" : (unsentItems.length > 0 ? "default" : "secondary")}
              size="lg"
              className="aspect-square min-h-20 text-base font-semibold flex flex-col items-center justify-center gap-1"
              onClick={onSend}
              disabled={isSending}
              data-testid="button-send-order"
            >
              {isPendingReopen ? (
                <>
                  <XCircle className="w-6 h-6" />
                  <span>Exit</span>
                </>
              ) : (
                <>
                  <Send className="w-6 h-6" />
                  <span>{unsentItems.length > 0 ? `Send (${unsentItems.length})` : balanceDue > 0 ? "Send" : "Exit"}</span>
                </>
              )}
            </Button>
          )}
          <Button
            size="lg"
            className="aspect-square min-h-20 text-base font-semibold bg-green-600 hover:bg-green-700 text-white flex flex-col items-center justify-center gap-1"
            onClick={onPay}
            disabled={!paymentsReady}
            data-testid="button-pay"
          >
            <CreditCard className="w-6 h-6" />
            <span>{isEditingClosedCheck ? `Change Tender ${formatPrice(total)}` : (paidAmount > 0 ? `Pay ${formatPrice(balanceDue)}` : `Pay ${formatPrice(total)}`)}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
