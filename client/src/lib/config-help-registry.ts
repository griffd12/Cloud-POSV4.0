export interface ConfigHelpEntry {
  label: string;
  description: string;
  category?: string;
}

const configHelpRegistry: Record<string, ConfigHelpEntry> = {
  // Payment Gateway Config — Gateway Connection
  gatewayType: {
    label: "Gateway Type",
    description: "Selects the payment processor used for card transactions at this level. All transaction routing, credential lookup, and protocol handling is determined by this setting. Changing this affects which gateway receives sale, void, and refund requests.",
    category: "Payment Gateway",
  },
  environment: {
    label: "Environment",
    description: "Controls whether transactions are sent to the processor's sandbox (test) or production (live) environment. Sandbox mode uses test credentials and does not process real payments. Always use Sandbox during certification and testing.",
    category: "Payment Gateway",
  },
  credentialKeyPrefix: {
    label: "Credential Key Prefix",
    description: "The prefix used to look up API keys and secrets for this gateway from the secrets store. For example, if set to 'HEARTLAND_MAIN', the system looks for secrets named HEARTLAND_MAIN_API_KEY, HEARTLAND_MAIN_SECRET, etc.",
    category: "Payment Gateway",
  },
  merchantId: {
    label: "Merchant ID (MID)",
    description: "The processor-assigned merchant identifier. This is provided by the payment gateway during account setup and is required for all transaction requests. Each property or location may have a different MID.",
    category: "Payment Gateway",
  },
  terminalId: {
    label: "Terminal ID (TID)",
    description: "The processor-assigned terminal identifier. Used to identify the specific POS terminal making the request. Required by most gateways for transaction routing and reporting.",
    category: "Payment Gateway",
  },
  siteId: {
    label: "Site ID",
    description: "A site-level identifier assigned by the payment processor (used by Heartland and some other gateways). Identifies the physical location or site within the merchant's account.",
    category: "Payment Gateway",
  },
  deviceId: {
    label: "Device ID",
    description: "A device-level identifier assigned by the payment processor. Used in conjunction with Site ID and License ID to authenticate and route transactions through the correct processing path.",
    category: "Payment Gateway",
  },
  licenseId: {
    label: "License ID",
    description: "A license identifier assigned by the payment processor. Part of the credential set required for some gateways (like Heartland) to authenticate API requests alongside Site ID and Device ID.",
    category: "Payment Gateway",
  },
  integrationModel: {
    label: "Integration Model",
    description: "Determines how the POS communicates with the payment processor. 'Direct' means the POS talks directly to the processor's API. 'Semi-Integrated' means the POS sends commands to a physical payment terminal, and the terminal handles card reading, EMV processing, and processor communication. 'Direct with Terminal' (like Stripe) uses the processor's own SDK for both online and terminal payments.",
    category: "Payment Gateway",
  },
  terminalIpAddress: {
    label: "Terminal IP Address",
    description: "The network IP address of the physical payment terminal. The POS connects to this address to send sale, void, refund, and other commands. Make sure the terminal and POS are on the same network. Example: 192.168.1.100",
    category: "Terminal Connection",
  },
  terminalPort: {
    label: "Terminal Port",
    description: "The TCP port number used to communicate with the payment terminal. Each terminal vendor uses a different default port. Heartland typically uses 12000, Shift4 UTG uses 5015. Check your terminal documentation for the correct port.",
    category: "Terminal Connection",
  },
  terminalConnectionType: {
    label: "Connection Type",
    description: "How the POS physically connects to the payment terminal. TCP/IP (Network) is the most common — the terminal and POS communicate over the local network. USB connects directly to the workstation. Cloud WebSocket routes through the processor's cloud service (used by Ingenico). Serial uses a COM port connection.",
    category: "Terminal Connection",
  },

  // Payment Gateway Config — Transaction Types
  enableSale: {
    label: "Sale",
    description: "When enabled, the POS can process standard credit and debit sale transactions through this gateway. This is the most common transaction type. When disabled, operators cannot charge cards at this level.",
    category: "Transaction Types",
  },
  enableVoid: {
    label: "Void",
    description: "When enabled, operators can void unsettled transactions (transactions that have not yet been batched/settled). Voiding removes the transaction before it reaches the cardholder's statement. When disabled, voids must be handled at a higher hierarchy level or as refunds after settlement.",
    category: "Transaction Types",
  },
  enableRefund: {
    label: "Refund",
    description: "When enabled, operators can process credit refunds against previously settled transactions. The refund is sent back to the original card. When disabled, refunds cannot be processed at this level.",
    category: "Transaction Types",
  },
  enableAuthCapture: {
    label: "Auth / Capture",
    description: "When enabled, the POS can perform pre-authorization (hold) followed by a separate capture (charge). This is used for tip-adjust workflows where the final amount isn't known at swipe time. The auth places a hold on the card, and capture finalizes the amount.",
    category: "Transaction Types",
  },
  enableManualEntry: {
    label: "Manual Entry (Keyed)",
    description: "When enabled, operators can manually type in a card number, expiration date, and CVV instead of using a chip reader or swipe. This is used for phone orders or when a card cannot be read. Note: keyed transactions typically have higher processing fees and fraud risk.",
    category: "Transaction Types",
  },
  enableDebit: {
    label: "PIN Debit",
    description: "When enabled, the terminal can process PIN-based debit card transactions. The customer enters their PIN on the terminal keypad. Debit transactions are typically lower cost than credit but require a PIN entry device.",
    category: "Transaction Types",
  },
  enableEbt: {
    label: "EBT",
    description: "When enabled, the terminal can process Electronic Benefits Transfer (EBT) transactions for government assistance programs like SNAP/food stamps. Requires specific merchant certification and eligible item tracking.",
    category: "Transaction Types",
  },
  enableHealthcare: {
    label: "Healthcare / FSA / HSA",
    description: "When enabled, the terminal can process healthcare-related card transactions including Flexible Spending Accounts (FSA) and Health Savings Accounts (HSA). Requires IIAS-compliant item categorization.",
    category: "Transaction Types",
  },

  // Payment Gateway Config — Card Entry Methods
  enableContactless: {
    label: "Contactless (NFC/Tap)",
    description: "When enabled, the terminal accepts contactless tap-to-pay transactions via NFC (Near Field Communication). This includes Apple Pay, Google Pay, Samsung Pay, and contactless-enabled cards. When disabled, customers must insert or swipe their card.",
    category: "Card Entry Methods",
  },
  enableEmv: {
    label: "EMV (Chip)",
    description: "When enabled, the terminal accepts EMV chip card transactions (card inserted into the chip reader). EMV is the most secure card-present method and provides liability shift protection. Disabling this forces fallback to swipe only.",
    category: "Card Entry Methods",
  },
  enableMsr: {
    label: "MSR (Swipe)",
    description: "When enabled, the terminal accepts magnetic stripe swipe transactions. This is the fallback method when chip reading fails. Note: MSR transactions do not provide EMV liability shift protection and may have higher fraud rates.",
    category: "Card Entry Methods",
  },

  // Payment Gateway Config — Payment Features
  enablePartialApproval: {
    label: "Partial Approval",
    description: "When enabled, the POS handles partial approvals from the issuer (response code 10). If a card has insufficient funds, the issuer approves the available amount and the POS prompts for a second payment method for the remaining balance. Required by Visa and Discover card brand rules.",
    category: "Payment Features",
  },
  enableTokenization: {
    label: "Tokenization",
    description: "When enabled, the gateway stores a secure token representing the card for future transactions. This allows repeat customers to pay without re-entering card details. Tokens are gateway-specific and do not contain actual card data.",
    category: "Payment Features",
  },
  enableStoreAndForward: {
    label: "Store and Forward (SAF)",
    description: "When enabled, the POS queues transactions locally when the network is unavailable and automatically uploads them when connectivity is restored. Transactions are held up to the SAF floor limit. This provides offline payment resilience but carries risk if cards are declined upon upload.",
    category: "Payment Features",
  },
  enableSurcharge: {
    label: "Surcharge",
    description: "When enabled, a surcharge percentage is added to credit card transactions to offset processing fees. The surcharge amount is shown on the receipt as a separate line item. Note: surcharging is prohibited in some states/jurisdictions and not allowed on debit transactions.",
    category: "Payment Features",
  },
  enableTipAdjust: {
    label: "Tip Adjust",
    description: "When enabled, operators can adjust the tip amount on a previously authorized transaction before batch settlement. The original auth amount is updated to include the tip. Commonly used in table-service restaurants.",
    category: "Payment Features",
  },
  enableIncrementalAuth: {
    label: "Incremental Auth",
    description: "When enabled, operators can increase the authorized amount on an existing open authorization. Used when the final transaction amount exceeds the original hold (e.g., additional items added after initial auth).",
    category: "Payment Features",
  },
  enableCashback: {
    label: "Cashback",
    description: "When enabled, customers can request cash back on PIN debit transactions. The cashback amount is added to the transaction total and dispensed from the cash drawer. Only available on debit cards with PIN entry.",
    category: "Payment Features",
  },
  surchargePercent: {
    label: "Surcharge Percentage",
    description: "The percentage added to credit card transactions as a surcharge (e.g., 3.00 for 3%). This is only applied when surcharging is enabled. Must comply with card brand rules (typically capped at 3-4%).",
    category: "Payment Features",
  },
  safFloorLimit: {
    label: "SAF Floor Limit",
    description: "The maximum dollar amount allowed for a single Store and Forward (offline) transaction. Transactions exceeding this amount will be declined when offline. Set lower for higher risk tolerance, higher for more offline flexibility.",
    category: "Payment Features",
  },
  safMaxTransactions: {
    label: "SAF Max Transactions",
    description: "The maximum number of transactions that can be queued in Store and Forward mode before the system forces an upload attempt. Once this limit is reached, new offline transactions will be declined until queued transactions are uploaded.",
    category: "Payment Features",
  },
  authHoldMinutes: {
    label: "Auth Hold Duration (minutes)",
    description: "How long a pre-authorization hold remains valid before it expires and the hold is released back to the cardholder. Typically 1440 minutes (24 hours) for restaurants. After expiration, the auth can no longer be captured.",
    category: "Payment Features",
  },

  // Payment Gateway Config — Batch / Settlement
  enableAutoBatchClose: {
    label: "Auto Batch Close",
    description: "When enabled, the system automatically closes the payment batch at the scheduled time each day. All unsettled transactions are submitted for settlement. When disabled, batch close must be performed manually.",
    category: "Batch / Settlement",
  },
  batchCloseTime: {
    label: "Batch Close Time",
    description: "The time of day (HH:MM format, 24-hour) when automatic batch close runs. For example, '02:00' closes the batch at 2:00 AM. Should be set to a low-traffic period. Only applies when Auto Batch Close is enabled.",
    category: "Batch / Settlement",
  },
  enableManualBatchClose: {
    label: "Manual Batch Close (EOD)",
    description: "When enabled, managers can manually trigger a batch close / End of Day (EOD) settlement from the POS. This submits all unsettled transactions for processing. Useful when you need to close a batch before the scheduled auto-close time.",
    category: "Batch / Settlement",
  },

  // Payment Gateway Config — Receipt Options
  receiptShowEmvFields: {
    label: "Show EMV Fields",
    description: "When enabled, EMV chip card data fields (AID, TVR, TSI, Application Label) are printed on the receipt. Required for EMV certification compliance. Some card brands mandate these fields on chip transaction receipts.",
    category: "Receipt Options",
  },
  receiptShowAid: {
    label: "Show AID",
    description: "When enabled, the Application Identifier (AID) is printed on EMV receipts. The AID identifies which card application was used (e.g., Visa Credit, Mastercard Debit). Required by most EMV certification programs.",
    category: "Receipt Options",
  },
  receiptShowTvr: {
    label: "Show TVR",
    description: "When enabled, the Terminal Verification Results (TVR) are printed on EMV receipts. The TVR is a 10-character hex string indicating the terminal's risk assessment of the transaction. Required for certification.",
    category: "Receipt Options",
  },
  receiptShowTsi: {
    label: "Show TSI",
    description: "When enabled, the Transaction Status Information (TSI) is printed on EMV receipts. The TSI indicates which processing steps were performed during the chip transaction. Required for certification.",
    category: "Receipt Options",
  },
  receiptShowAppLabel: {
    label: "Show Application Label",
    description: "When enabled, the EMV application label (e.g., 'US MASTERCARD', 'VISA CREDIT') is printed on the receipt. This human-readable label identifies the card brand and product used.",
    category: "Receipt Options",
  },
  receiptShowEntryMethod: {
    label: "Show Entry Method",
    description: "When enabled, the card entry method (Chip, Swipe, Contactless, Keyed) is printed on the receipt. Helps identify how the card was read for dispute resolution and audit purposes.",
    category: "Receipt Options",
  },
  receiptPrintMerchantCopy: {
    label: "Print Merchant Copy",
    description: "When enabled, a merchant copy of the receipt is printed for the store's records. The merchant copy typically includes a signature line. When disabled, only the customer copy prints (if enabled).",
    category: "Receipt Options",
  },
  receiptPrintCustomerCopy: {
    label: "Print Customer Copy",
    description: "When enabled, a customer copy of the receipt is printed and given to the cardholder. When disabled, no customer receipt is printed (the customer may receive a digital receipt instead, if configured).",
    category: "Receipt Options",
  },

  // Payment Gateway Config — Debug / Certification
  enableDebugLogging: {
    label: "Debug Logging",
    description: "When enabled, detailed payment transaction logs are written for every gateway communication. Includes request/response timing, status codes, and parsed results. Use during development and certification testing. Disable in production to reduce log volume.",
    category: "Debug / Certification",
  },
  logRawRequests: {
    label: "Log Raw Requests",
    description: "When enabled, the full raw API request payload sent to the payment gateway is logged. Used during certification to capture exact request data for submission to the gateway's certification team. Contains sensitive data — disable after certification.",
    category: "Debug / Certification",
  },
  logRawResponses: {
    label: "Log Raw Responses",
    description: "When enabled, the full raw API response payload received from the payment gateway is logged. Used during certification to capture exact response data. Contains transaction details — disable after certification.",
    category: "Debug / Certification",
  },
  isCashMedia: {
    label: "Is Cash Media",
    description: "When enabled, this tender is treated as cash for all reporting and cash drawer reconciliation calculations. Cash media tenders are included in cash drawer totals, change due calculations, and cash over/short reporting. Only enable this for tenders that represent physical cash or cash equivalents.",
    category: "Tender Media Classification",
  },
  isCardMedia: {
    label: "Is Card Media",
    description: "When enabled, this tender is treated as a card payment for reporting purposes. Card media tenders appear in card settlement totals, and their tips are included in card tip pools and tip reporting. Enable this for credit cards, debit cards, and other electronic payment methods that go through a payment processor.",
    category: "Tender Media Classification",
  },
  isGiftMedia: {
    label: "Is Gift Media",
    description: "When enabled, this tender is treated as a gift card for reporting and liability tracking. Gift media tenders are separated in gift card liability reports and redemption summaries. Enable this for gift cards, store credit, and similar prepaid instruments.",
    category: "Tender Media Classification",
  },

  APPLY_ITEM_DISCOUNT: {
    label: "Apply Item Discount",
    description: "When enabled, the role can apply a discount to an individual menu item on a check. The discount may be a percentage or flat amount, subject to the role's configured maximum discount limits.",
    category: "pricing_flags",
  },
  APPLY_CHECK_DISCOUNT: {
    label: "Apply Check Discount",
    description: "When enabled, the role can apply a discount to the entire check (all items). The discount may be a percentage or flat amount, subject to the role's configured maximum check-level discount limits.",
    category: "pricing_flags",
  },
  REMOVE_DISCOUNT: {
    label: "Remove Discount",
    description: "When enabled, the role can remove a previously applied discount from an item or check. Without this permission, discounts once applied can only be removed by a manager or higher-privilege role.",
    category: "pricing_flags",
  },
  PRICE_OVERRIDE_ITEM: {
    label: "Price Override Item",
    description: "When enabled, the role can manually change the price of a standard menu item. The override is subject to the role's maximum price override percentage and amount limits.",
    category: "pricing_flags",
  },
  PRICE_OVERRIDE_OPEN_ITEM: {
    label: "Price Override Open Item",
    description: "When enabled, the role can set or change the price of an open-priced (market price) item. Open items require a price to be entered at the time of order.",
    category: "pricing_flags",
  },
  OVERRIDE_BELOW_FLOOR: {
    label: "Override Below Floor Price",
    description: "When enabled, the role can override an item's price below its configured floor price. Floor prices represent the minimum acceptable selling price. This is a high-risk permission typically reserved for managers.",
    category: "pricing_flags",
  },
  REQUIRE_REASON_DISCOUNT: {
    label: "Require Reason for Discount",
    description: "When enabled, the role must provide a reason code when applying any discount. The reason is logged for audit and reporting purposes. This helps track why discounts are being given.",
    category: "pricing_flags",
  },
  REQUIRE_REASON_OVERRIDE: {
    label: "Require Reason for Price Override",
    description: "When enabled, the role must provide a reason code when performing a price override. The reason is logged for audit and reporting purposes. This helps track why prices are being changed.",
    category: "pricing_flags",
  },
  REQUIRE_MGR_DISCOUNT_ABOVE_LIMIT: {
    label: "Require Manager Approval for Discount Above Limit",
    description: "When enabled, discounts that exceed the role's configured maximum discount limit require manager approval before they can be applied. The manager must authenticate to authorize the discount.",
    category: "pricing_flags",
  },
  REQUIRE_MGR_OVERRIDE_ABOVE_LIMIT: {
    label: "Require Manager Approval for Override Above Limit",
    description: "When enabled, price overrides that exceed the role's configured maximum override limit require manager approval before they can be applied. The manager must authenticate to authorize the override.",
    category: "pricing_flags",
  },

  APPLY_SERVICE_CHARGE: {
    label: "Apply Service Charge",
    description: "When enabled, the role can manually apply a service charge (auto-gratuity, delivery fee, etc.) to a check. Service charges are separate from tips and are typically mandatory.",
    category: "check_ops_flags",
  },
  REMOVE_SERVICE_CHARGE: {
    label: "Remove Service Charge",
    description: "When enabled, the role can remove a previously applied service charge from a check. Without this permission, service charges once applied cannot be removed by this role.",
    category: "check_ops_flags",
  },
  OVERRIDE_SERVICE_CHARGE: {
    label: "Override Service Charge Amount",
    description: "When enabled, the role can change the amount of a service charge from its default configured value. This allows adjusting auto-gratuity percentages or flat service charge amounts on a per-check basis.",
    category: "check_ops_flags",
  },
  REQUIRE_REASON_SC: {
    label: "Require Reason for Service Charge Change",
    description: "When enabled, the role must provide a reason code when removing or overriding a service charge. The reason is logged for audit and reporting purposes.",
    category: "check_ops_flags",
  },
  SPLIT_CHECK: {
    label: "Split Check",
    description: "When enabled, the role can split a single check into multiple checks, dividing items or amounts among different guests or payment methods.",
    category: "check_ops_flags",
  },
  MERGE_CHECK: {
    label: "Merge Checks",
    description: "When enabled, the role can merge two or more open checks into a single check. All items from the source checks are combined into the destination check.",
    category: "check_ops_flags",
  },
  TRANSFER_CHECK: {
    label: "Transfer Check",
    description: "When enabled, the role can transfer an open check from one server/employee to another. The check moves to the new server's open check list.",
    category: "check_ops_flags",
  },
  MOVE_ITEMS_BETWEEN_CHECKS: {
    label: "Move Items Between Checks",
    description: "When enabled, the role can move individual items from one open check to another. This is useful for correcting order mistakes or accommodating guest requests to separate items.",
    category: "check_ops_flags",
  },
  VOID_ITEM_PREPAY: {
    label: "Void Item Before Payment",
    description: "When enabled, the role can void (remove) items from an open check before any payment has been applied. Voided items are removed from the check total.",
    category: "check_ops_flags",
  },
  VOID_CHECK_PREPAY: {
    label: "Void Entire Check Before Payment",
    description: "When enabled, the role can void an entire open check before any payment has been applied. All items are removed and the check is cancelled.",
    category: "check_ops_flags",
  },

  REOPEN_CLOSED_UNPAID: {
    label: "Reopen Closed Unpaid Check",
    description: "When enabled, the role can reopen a check that was closed without payment. Subject to the role's configured reopen window (in minutes). After the window expires, reopening requires a higher-privilege role.",
    category: "tender_flags",
  },
  EDIT_CLOSED_UNPAID: {
    label: "Edit Closed Unpaid Check",
    description: "When enabled, the role can edit items on a check that was closed without payment. Subject to the role's configured edit closed window (in minutes). Allows adding or removing items after closure.",
    category: "tender_flags",
  },
  REFUND_ITEM: {
    label: "Refund Individual Item",
    description: "When enabled, the role can issue a refund for a specific item on a paid check. The refund amount equals the item's price including any applicable taxes. Subject to the role's refund window.",
    category: "tender_flags",
  },
  REFUND_FULL: {
    label: "Refund Full Check",
    description: "When enabled, the role can issue a full refund for an entire paid check. All items and taxes are refunded. Subject to the role's configured refund window (in minutes).",
    category: "tender_flags",
  },
  REFUND_ORIGINAL_TENDER_ONLY: {
    label: "Refund to Original Tender Only",
    description: "When enabled, refunds issued by this role must go back to the original payment method used. For example, a card payment can only be refunded to the same card. This prevents cash refunds on card transactions.",
    category: "tender_flags",
  },
  REFUND_ALTERNATE_TENDER: {
    label: "Refund to Alternate Tender",
    description: "When enabled, the role can issue refunds to a different payment method than what was originally used. For example, refunding a card transaction as cash. This is a higher-risk permission.",
    category: "tender_flags",
  },
  CASH_REFUND_FOR_CARD_SALE: {
    label: "Cash Refund for Card Sale",
    description: "When enabled, the role can issue a cash refund for a transaction that was originally paid by credit or debit card. This is a high-risk permission as it can be used for fraud. Typically restricted to managers.",
    category: "tender_flags",
  },
  NO_RECEIPT_REFUND: {
    label: "No-Receipt Refund",
    description: "When enabled, the role can process a refund without a receipt or original transaction reference. This is a high-risk permission as refunds cannot be verified against original transactions. Typically restricted to managers.",
    category: "tender_flags",
  },

  REOPEN_PAID_CHECK: {
    label: "Reopen Paid Check",
    description: "When enabled, the role can reopen a check that has already been paid and closed. This reverses the payment and returns the check to an open state. This is a high-risk operation that affects cash reconciliation and card settlements.",
    category: "admin_flags",
  },
  EDIT_PAID_CHECK: {
    label: "Edit Paid Check",
    description: "When enabled, the role can modify items on a check that has already been paid. Changes may trigger refunds or additional charges. This is a high-risk operation typically restricted to managers and above.",
    category: "admin_flags",
  },
  BYPASS_WINDOWS: {
    label: "Bypass Time Windows",
    description: "When enabled, the role can bypass all configured time windows (reopen window, edit closed window, refund window). Operations that would normally be blocked after the time window expires are allowed regardless of timing.",
    category: "admin_flags",
  },
};

export function getConfigHelp(fieldName: string): ConfigHelpEntry | undefined {
  return configHelpRegistry[fieldName];
}

export function getAllConfigHelp(): Record<string, ConfigHelpEntry> {
  return configHelpRegistry;
}

export default configHelpRegistry;
