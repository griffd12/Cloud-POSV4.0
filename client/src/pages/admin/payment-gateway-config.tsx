import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ContextHelpWrapper } from "@/components/ui/context-help";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { getConnectionFields, isFieldSupported, getFieldOverride, getSuggestedDefaults, isSemiIntegrated, getIntegrationModel, TERMINAL_CONNECTION_TYPES } from "@/lib/gateway-field-registry";
import type { GatewayFieldKey } from "@/lib/gateway-field-registry";
import type { PaymentGatewayConfig } from "@shared/schema";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Save,
  RotateCcw,
  Building2,
  Store,
  Monitor,
  CreditCard,
  Shield,
  Receipt,
  Bug,
  Banknote,
  Clock,
  Info,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

const GATEWAY_TYPES = [
  { value: "heartland", label: "Heartland (Global Payments)" },
  { value: "elavon_converge", label: "Elavon Converge" },
  { value: "elavon_fusebox", label: "Elavon Fusebox" },
  { value: "stripe", label: "Stripe" },
  { value: "north_ingenico", label: "North (Ingenico SI)" },
  { value: "shift4", label: "Shift4" },
  { value: "freedompay", label: "FreedomPay" },
  { value: "eigen", label: "Eigen" },
];

interface ConfigFieldProps {
  fieldName?: string;
  label: string;
  description?: string;
  inherited?: boolean;
  inheritedFrom?: string;
  children: React.ReactNode;
}

function ConfigField({ fieldName, label, description, inherited, inheritedFrom, children }: ConfigFieldProps) {
  return (
    <div className={`flex items-start justify-between gap-4 py-2 ${inherited ? 'opacity-70' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {fieldName ? (
            <ContextHelpWrapper fieldName={fieldName}>
              <span className="text-sm font-medium">{label}</span>
            </ContextHelpWrapper>
          ) : (
            <span className="text-sm font-medium">{label}</span>
          )}
          {inherited && inheritedFrom && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {inheritedFrom}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Inherited from {inheritedFrom} level</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="shrink-0">
        {children}
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function ConfigSection({ title, icon: Icon, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 hover:bg-muted/50 rounded-md px-2 transition-colors" data-testid={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}>
        <Icon className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold flex-1 text-left">{title}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-6 pr-2 pb-2 space-y-1">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function getConfigLevel(selectedPropertyId: string | null, selectedRvcId: string | null): string {
  if (selectedRvcId) return "workstation";
  if (selectedPropertyId) return "property";
  return "enterprise";
}

function getLevelIcon(level: string) {
  switch (level) {
    case "enterprise": return Building2;
    case "property": return Store;
    case "workstation": return Monitor;
    default: return Building2;
  }
}

function getLevelLabel(level: string) {
  switch (level) {
    case "enterprise": return "Enterprise";
    case "property": return "Property";
    case "workstation": return "Workstation";
    default: return level;
  }
}

export default function PaymentGatewayConfigPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, selectedRvcId } = useEmcFilter();

  const configLevel = getConfigLevel(selectedPropertyId, selectedRvcId);
  const LevelIcon = getLevelIcon(configLevel);
  const levelLabel = getLevelLabel(configLevel);

  const workstationId = selectedRvcId;

  const { data: allConfigs = [], isLoading } = useQuery<PaymentGatewayConfig[]>({
    queryKey: ["/api/payment-gateway-config", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/payment-gateway-config${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!selectedEnterpriseId,
  });

  const currentLevelConfig = useMemo(() => {
    return allConfigs.find(c => {
      if (c.configLevel !== configLevel) return false;
      if (configLevel === "property") return c.propertyId === selectedPropertyId;
      if (configLevel === "workstation") return c.workstationId === workstationId;
      return c.configLevel === "enterprise";
    });
  }, [allConfigs, configLevel, selectedPropertyId, workstationId]);

  const parentConfigs = useMemo(() => {
    const parents: Record<string, PaymentGatewayConfig> = {};
    if (configLevel !== "enterprise") {
      const entConfig = allConfigs.find(c => c.configLevel === "enterprise");
      if (entConfig) parents.enterprise = entConfig;
    }
    if (configLevel === "workstation" && selectedPropertyId) {
      const propConfig = allConfigs.find(c => c.configLevel === "property" && c.propertyId === selectedPropertyId);
      if (propConfig) parents.property = propConfig;
    }
    return parents;
  }, [allConfigs, configLevel, selectedPropertyId]);

  function getInheritedValue(field: string): { value: any; from: string } | null {
    if (configLevel === "workstation" && parentConfigs.property) {
      const val = (parentConfigs.property as any)[field];
      if (val !== null && val !== undefined) return { value: val, from: "Property" };
    }
    if (configLevel !== "enterprise" && parentConfigs.enterprise) {
      const val = (parentConfigs.enterprise as any)[field];
      if (val !== null && val !== undefined) return { value: val, from: "Enterprise" };
    }
    return null;
  }

  function getEffectiveValue(field: string, currentValue: any): any {
    if (currentValue !== null && currentValue !== undefined) return currentValue;
    const inherited = getInheritedValue(field);
    return inherited?.value ?? null;
  }

  const form = useForm({
    values: currentLevelConfig ? {
      gatewayType: currentLevelConfig.gatewayType || "",
      integrationModel: currentLevelConfig.integrationModel || "",
      environment: currentLevelConfig.environment || "",
      credentialKeyPrefix: currentLevelConfig.credentialKeyPrefix || "",
      merchantId: currentLevelConfig.merchantId || "",
      terminalId: currentLevelConfig.terminalId || "",
      siteId: currentLevelConfig.siteId || "",
      deviceId: currentLevelConfig.deviceId || "",
      licenseId: currentLevelConfig.licenseId || "",
      terminalIpAddress: currentLevelConfig.terminalIpAddress || "",
      terminalPort: currentLevelConfig.terminalPort || "",
      terminalConnectionType: currentLevelConfig.terminalConnectionType || "",
      enableSale: currentLevelConfig.enableSale ?? false,
      enableVoid: currentLevelConfig.enableVoid ?? false,
      enableRefund: currentLevelConfig.enableRefund ?? false,
      enableAuthCapture: currentLevelConfig.enableAuthCapture ?? false,
      enableManualEntry: currentLevelConfig.enableManualEntry ?? false,
      enableDebit: currentLevelConfig.enableDebit ?? false,
      enableEbt: currentLevelConfig.enableEbt ?? false,
      enableHealthcare: currentLevelConfig.enableHealthcare ?? false,
      enableContactless: currentLevelConfig.enableContactless ?? false,
      enableEmv: currentLevelConfig.enableEmv ?? false,
      enableMsr: currentLevelConfig.enableMsr ?? false,
      enablePartialApproval: currentLevelConfig.enablePartialApproval ?? false,
      enableTokenization: currentLevelConfig.enableTokenization ?? false,
      enableStoreAndForward: currentLevelConfig.enableStoreAndForward ?? false,
      enableSurcharge: currentLevelConfig.enableSurcharge ?? false,
      enableTipAdjust: currentLevelConfig.enableTipAdjust ?? false,
      enableIncrementalAuth: currentLevelConfig.enableIncrementalAuth ?? false,
      enableCashback: currentLevelConfig.enableCashback ?? false,
      surchargePercent: currentLevelConfig.surchargePercent || "",
      safFloorLimit: currentLevelConfig.safFloorLimit || "",
      safMaxTransactions: currentLevelConfig.safMaxTransactions ?? "",
      authHoldMinutes: currentLevelConfig.authHoldMinutes ?? "",
      enableAutoBatchClose: currentLevelConfig.enableAutoBatchClose ?? false,
      batchCloseTime: currentLevelConfig.batchCloseTime || "",
      enableManualBatchClose: currentLevelConfig.enableManualBatchClose ?? false,
      receiptShowEmvFields: currentLevelConfig.receiptShowEmvFields ?? false,
      receiptShowAid: currentLevelConfig.receiptShowAid ?? false,
      receiptShowTvr: currentLevelConfig.receiptShowTvr ?? false,
      receiptShowTsi: currentLevelConfig.receiptShowTsi ?? false,
      receiptShowAppLabel: currentLevelConfig.receiptShowAppLabel ?? false,
      receiptShowEntryMethod: currentLevelConfig.receiptShowEntryMethod ?? false,
      receiptPrintMerchantCopy: currentLevelConfig.receiptPrintMerchantCopy ?? false,
      receiptPrintCustomerCopy: currentLevelConfig.receiptPrintCustomerCopy ?? false,
      enableDebugLogging: currentLevelConfig.enableDebugLogging ?? false,
      logRawRequests: currentLevelConfig.logRawRequests ?? false,
      logRawResponses: currentLevelConfig.logRawResponses ?? false,
    } : {
      gatewayType: "",
      integrationModel: "",
      environment: "",
      credentialKeyPrefix: "",
      merchantId: "",
      terminalId: "",
      siteId: "",
      deviceId: "",
      licenseId: "",
      terminalIpAddress: "",
      terminalPort: "",
      terminalConnectionType: "",
      enableSale: false,
      enableVoid: false,
      enableRefund: false,
      enableAuthCapture: false,
      enableManualEntry: false,
      enableDebit: false,
      enableEbt: false,
      enableHealthcare: false,
      enableContactless: false,
      enableEmv: false,
      enableMsr: false,
      enablePartialApproval: false,
      enableTokenization: false,
      enableStoreAndForward: false,
      enableSurcharge: false,
      enableTipAdjust: false,
      enableIncrementalAuth: false,
      enableCashback: false,
      surchargePercent: "",
      safFloorLimit: "",
      safMaxTransactions: "",
      authHoldMinutes: "",
      enableAutoBatchClose: false,
      batchCloseTime: "",
      enableManualBatchClose: false,
      receiptShowEmvFields: false,
      receiptShowAid: false,
      receiptShowTvr: false,
      receiptShowTsi: false,
      receiptShowAppLabel: false,
      receiptShowEntryMethod: false,
      receiptPrintMerchantCopy: false,
      receiptPrintCustomerCopy: false,
      enableDebugLogging: false,
      logRawRequests: false,
      logRawResponses: false,
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const model = data.gatewayType ? getIntegrationModel(data.gatewayType) : null;
      const payload = {
        ...data,
        configLevel,
        integrationModel: model,
        propertyId: selectedPropertyId || null,
        workstationId: workstationId || null,
        safMaxTransactions: data.safMaxTransactions ? parseInt(data.safMaxTransactions) : null,
        authHoldMinutes: data.authHoldMinutes ? parseInt(data.authHoldMinutes) : null,
      };

      if (currentLevelConfig) {
        return apiRequest("PATCH", `/api/payment-gateway-config/${currentLevelConfig.id}`, payload);
      } else {
        return apiRequest("POST", "/api/payment-gateway-config", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-gateway-config"] });
      toast({ title: `${levelLabel} config saved` });
    },
    onError: () => {
      toast({ title: "Failed to save config", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!currentLevelConfig) return;
      return apiRequest("DELETE", `/api/payment-gateway-config/${currentLevelConfig.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-gateway-config"] });
      toast({ title: `${levelLabel} overrides removed — will inherit from parent` });
    },
  });

  const lastAppliedGateway = useRef<string>("");

  const selectedGateway = form.watch("gatewayType") || "";

  const fieldSupported = useCallback((field: GatewayFieldKey) => {
    if (!selectedGateway) return true;
    return isFieldSupported(selectedGateway, field);
  }, [selectedGateway]);

  const getFieldLabel = useCallback((field: GatewayFieldKey, defaultLabel: string) => {
    if (!selectedGateway) return defaultLabel;
    const override = getFieldOverride(selectedGateway, field);
    return override?.label || defaultLabel;
  }, [selectedGateway]);

  const getFieldDesc = useCallback((field: GatewayFieldKey, defaultDesc: string) => {
    if (!selectedGateway) return defaultDesc;
    const override = getFieldOverride(selectedGateway, field);
    return override?.description || defaultDesc;
  }, [selectedGateway]);

  const applyGatewayDefaults = useCallback(() => {
    if (!selectedGateway) return;
    const defaults = getSuggestedDefaults(selectedGateway);
    const allBoolFields: GatewayFieldKey[] = [
      "enableSale", "enableVoid", "enableRefund", "enableAuthCapture", "enableManualEntry",
      "enableDebit", "enableEbt", "enableHealthcare",
      "enableEmv", "enableContactless", "enableMsr",
      "enablePartialApproval", "enableTokenization", "enableStoreAndForward",
      "enableSurcharge", "enableTipAdjust", "enableIncrementalAuth", "enableCashback",
      "enableAutoBatchClose", "enableManualBatchClose",
      "receiptShowEmvFields", "receiptShowAid", "receiptShowTvr", "receiptShowTsi",
      "receiptShowAppLabel", "receiptShowEntryMethod", "receiptPrintMerchantCopy", "receiptPrintCustomerCopy",
      "enableDebugLogging", "logRawRequests", "logRawResponses",
    ];
    for (const field of allBoolFields) {
      if (!isFieldSupported(selectedGateway, field)) continue;
      const val = defaults[field] ?? false;
      form.setValue(field as any, val);
    }
    lastAppliedGateway.current = selectedGateway;
    toast({ title: `Applied recommended defaults for ${GATEWAY_TYPES.find(g => g.value === selectedGateway)?.label || selectedGateway}` });
  }, [selectedGateway, form, toast]);

  const showApplyDefaults = selectedGateway && (!currentLevelConfig || lastAppliedGateway.current !== selectedGateway);

  const onSubmit = form.handleSubmit((data) => {
    saveMutation.mutate(data);
  });

  if (!selectedEnterpriseId) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground" />
            <div>
              <h2 className="text-xl font-semibold">Select an Enterprise</h2>
              <p className="text-muted-foreground mt-2">
                Select an enterprise from the hierarchy tree to configure payment gateway settings.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasOverride = !!currentLevelConfig;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-payment-gateway-title">
            <CreditCard className="w-6 h-6" />
            Payment Gateway Configuration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure payment processing options at each hierarchy level
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
        <LevelIcon className="w-5 h-5 text-primary" />
        <div className="flex-1">
          <div className="text-sm font-medium">
            Editing: <span className="text-primary">{levelLabel}</span> Level
          </div>
          <div className="text-xs text-muted-foreground">
            {hasOverride
              ? "This level has its own configuration overrides"
              : `No overrides set — inheriting from parent levels`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasOverride && configLevel !== "enterprise" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              data-testid="button-revert-to-inherited"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Revert to Inherited
            </Button>
          )}
          <Badge variant={hasOverride ? "default" : "secondary"}>
            {hasOverride ? "Override Active" : "Inherited"}
          </Badge>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-2">
              <ConfigSection title="Gateway Connection" icon={CreditCard} defaultOpen={true}>
                <FormField
                  control={form.control}
                  name="gatewayType"
                  render={({ field }) => {
                    const inherited = getInheritedValue("gatewayType");
                    return (
                      <ConfigField fieldName="gatewayType" label="Gateway Type" description="Payment processor to use" inherited={!field.value && !!inherited} inheritedFrom={inherited?.from}>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <SelectTrigger className="w-[240px]" data-testid="select-gateway-type">
                            <SelectValue placeholder={inherited ? `${inherited.value} (inherited)` : "Select gateway"} />
                          </SelectTrigger>
                          <SelectContent>
                            {GATEWAY_TYPES.map(g => (
                              <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </ConfigField>
                    );
                  }}
                />

                {showApplyDefaults && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/20">
                    <Sparkles className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-xs text-muted-foreground flex-1">
                      Apply recommended settings for {GATEWAY_TYPES.find(g => g.value === selectedGateway)?.label}?
                    </span>
                    <Button type="button" variant="outline" size="sm" onClick={applyGatewayDefaults} data-testid="button-apply-gateway-defaults">
                      Apply Defaults
                    </Button>
                  </div>
                )}

                {selectedGateway && isSemiIntegrated(selectedGateway) && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-blue-500/5 border border-blue-500/20" data-testid="banner-semi-integrated">
                    <Shield className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="text-xs text-muted-foreground flex-1">
                      <strong>Semi-Integrated Mode</strong> — The payment terminal handles card reading, EMV processing, and processor communication. Your POS sends commands (sale, void, refund) and receives results. No card data touches your system.
                    </span>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="environment"
                  render={({ field }) => {
                    const inherited = getInheritedValue("environment");
                    return (
                      <ConfigField fieldName="environment" label="Environment" description="Sandbox for testing, Production for live" inherited={!field.value && !!inherited} inheritedFrom={inherited?.from}>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <SelectTrigger className="w-[240px]" data-testid="select-environment">
                            <SelectValue placeholder={inherited ? `${inherited.value} (inherited)` : "Select"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sandbox">Sandbox / Test</SelectItem>
                            <SelectItem value="production">Production</SelectItem>
                          </SelectContent>
                        </Select>
                      </ConfigField>
                    );
                  }}
                />

                {getConnectionFields(selectedGateway || "_fallback").map(cf => (
                  <FormField key={cf.field} control={form.control} name={cf.field as any} render={({ field }) => {
                    const inherited = getInheritedValue(cf.field);
                    if (cf.field === "terminalConnectionType") {
                      return (
                        <ConfigField fieldName={cf.field} label={cf.label} description={cf.description} inherited={!field.value && !!inherited} inheritedFrom={inherited?.from}>
                          <Select value={field.value || ""} onValueChange={field.onChange}>
                            <SelectTrigger className="w-[240px]" data-testid="select-terminal-connection-type">
                              <SelectValue placeholder={inherited ? `${inherited.value} (inherited)` : "Select connection type"} />
                            </SelectTrigger>
                            <SelectContent>
                              {TERMINAL_CONNECTION_TYPES.map(ct => (
                                <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </ConfigField>
                      );
                    }
                    return (
                      <ConfigField fieldName={cf.field} label={cf.label} description={cf.description} inherited={!field.value && !!inherited} inheritedFrom={inherited?.from}>
                        <Input {...field} value={field.value ?? ""} className="w-[240px]" placeholder={inherited ? `${inherited.value} (inherited)` : cf.placeholder} data-testid={`input-${cf.field}`} />
                      </ConfigField>
                    );
                  }} />
                ))}
              </ConfigSection>

              <Separator />

              <ConfigSection title="Transaction Types" icon={Banknote} defaultOpen={true}>
                {([
                  { name: "enableSale" as const, label: "Sale", desc: "Standard credit/debit sale" },
                  { name: "enableVoid" as const, label: "Void", desc: "Void unsettled transactions" },
                  { name: "enableRefund" as const, label: "Refund", desc: "Credit refund by transaction ID" },
                  { name: "enableAuthCapture" as const, label: "Auth / Capture", desc: "Pre-auth with later capture (tip adjust)" },
                  { name: "enableManualEntry" as const, label: "Manual Entry (Keyed)", desc: "Allow manual card number entry" },
                  { name: "enableDebit" as const, label: "PIN Debit", desc: "PIN-based debit transactions" },
                  { name: "enableEbt" as const, label: "EBT", desc: "Electronic Benefits Transfer" },
                  { name: "enableHealthcare" as const, label: "Healthcare / FSA / HSA", desc: "Healthcare flexible spending" },
                ] as const).filter(item => fieldSupported(item.name)).map(item => (
                  <FormField key={item.name} control={form.control} name={item.name} render={({ field }) => {
                    const inherited = getInheritedValue(item.name);
                    return (
                      <ConfigField fieldName={item.name} label={getFieldLabel(item.name, item.label)} description={getFieldDesc(item.name, item.desc)} inherited={field.value === undefined && !!inherited} inheritedFrom={inherited?.from}>
                        <Switch checked={field.value ?? getEffectiveValue(item.name, field.value) ?? false} onCheckedChange={field.onChange} data-testid={`switch-${item.name}`} />
                      </ConfigField>
                    );
                  }} />
                ))}
              </ConfigSection>

              <Separator />

              {!isSemiIntegrated(selectedGateway) && (fieldSupported("enableEmv") || fieldSupported("enableContactless") || fieldSupported("enableMsr")) && (
              <ConfigSection title="Card Entry Methods" icon={CreditCard} defaultOpen={false}>
                {([
                  { name: "enableEmv" as const, label: "EMV (Chip)", desc: "Contact chip card reading" },
                  { name: "enableContactless" as const, label: "Contactless (NFC/Tap)", desc: "Tap-to-pay transactions" },
                  { name: "enableMsr" as const, label: "MSR (Swipe)", desc: "Magnetic stripe swipe" },
                ] as const).filter(item => fieldSupported(item.name)).map(item => (
                  <FormField key={item.name} control={form.control} name={item.name} render={({ field }) => {
                    const inherited = getInheritedValue(item.name);
                    return (
                      <ConfigField fieldName={item.name} label={getFieldLabel(item.name, item.label)} description={getFieldDesc(item.name, item.desc)} inherited={field.value === undefined && !!inherited} inheritedFrom={inherited?.from}>
                        <Switch checked={field.value ?? getEffectiveValue(item.name, field.value) ?? false} onCheckedChange={field.onChange} data-testid={`switch-${item.name}`} />
                      </ConfigField>
                    );
                  }} />
                ))}
              </ConfigSection>
              )}

              <Separator />

              <ConfigSection title="Payment Features" icon={Shield} defaultOpen={true}>
                {([
                  { name: "enablePartialApproval" as const, label: "Partial Approval", desc: "Required by Visa/Discover — handle partial auth with split tender" },
                  { name: "enableTokenization" as const, label: "Tokenization", desc: "Store card tokens for repeat payments" },
                  { name: "enableStoreAndForward" as const, label: "Store and Forward (SAF)", desc: "Queue transactions when offline for later upload" },
                  { name: "enableSurcharge" as const, label: "Surcharge", desc: "Add surcharge percentage to credit transactions" },
                  { name: "enableTipAdjust" as const, label: "Tip Adjust", desc: "Allow tip adjustment after auth/sale" },
                  { name: "enableIncrementalAuth" as const, label: "Incremental Auth", desc: "Add to existing authorization amount" },
                  { name: "enableCashback" as const, label: "Cashback", desc: "Allow cashback on debit transactions" },
                ] as const).filter(item => fieldSupported(item.name)).map(item => (
                  <FormField key={item.name} control={form.control} name={item.name} render={({ field }) => {
                    const inherited = getInheritedValue(item.name);
                    return (
                      <ConfigField fieldName={item.name} label={getFieldLabel(item.name, item.label)} description={getFieldDesc(item.name, item.desc)} inherited={field.value === undefined && !!inherited} inheritedFrom={inherited?.from}>
                        <Switch checked={field.value ?? getEffectiveValue(item.name, field.value) ?? false} onCheckedChange={field.onChange} data-testid={`switch-${item.name}`} />
                      </ConfigField>
                    );
                  }} />
                ))}

                {fieldSupported("surchargePercent") && (
                <FormField control={form.control} name="surchargePercent" render={({ field }) => (
                  <ConfigField fieldName="surchargePercent" label="Surcharge Percentage" description="e.g., 3.00 for 3%">
                    <Input {...field} className="w-[120px]" placeholder="0.00" data-testid="input-surcharge-percent" />
                  </ConfigField>
                )} />
                )}
                {fieldSupported("safFloorLimit") && (
                <FormField control={form.control} name="safFloorLimit" render={({ field }) => (
                  <ConfigField fieldName="safFloorLimit" label="SAF Floor Limit" description="Max offline transaction amount ($)">
                    <Input {...field} className="w-[120px]" placeholder="50.00" data-testid="input-saf-floor-limit" />
                  </ConfigField>
                )} />
                )}
                {fieldSupported("safMaxTransactions") && (
                <FormField control={form.control} name="safMaxTransactions" render={({ field }) => (
                  <ConfigField fieldName="safMaxTransactions" label="SAF Max Transactions" description="Max offline transactions before forced upload">
                    <Input {...field} className="w-[120px]" placeholder="50" data-testid="input-saf-max-transactions" />
                  </ConfigField>
                )} />
                )}
                {fieldSupported("authHoldMinutes") && (
                <FormField control={form.control} name="authHoldMinutes" render={({ field }) => (
                  <ConfigField fieldName="authHoldMinutes" label="Auth Hold Duration (min)" description="How long an auth remains valid before expiring">
                    <Input {...field} className="w-[120px]" placeholder="1440" data-testid="input-auth-hold-minutes" />
                  </ConfigField>
                )} />
                )}
              </ConfigSection>

              <Separator />

              <ConfigSection title="Batch / Settlement" icon={Clock} defaultOpen={false}>
                {fieldSupported("enableAutoBatchClose") && (
                <FormField control={form.control} name="enableAutoBatchClose" render={({ field }) => (
                  <ConfigField fieldName="enableAutoBatchClose" label={getFieldLabel("enableAutoBatchClose", "Auto Batch Close")} description="Automatically close batch at scheduled time">
                    <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-auto-batch-close" />
                  </ConfigField>
                )} />
                )}
                {fieldSupported("batchCloseTime") && (
                <FormField control={form.control} name="batchCloseTime" render={({ field }) => (
                  <ConfigField fieldName="batchCloseTime" label={getFieldLabel("batchCloseTime", "Batch Close Time")} description="HH:MM format (e.g., 02:00 for 2 AM)">
                    <Input {...field} className="w-[120px]" placeholder="02:00" data-testid="input-batch-close-time" />
                  </ConfigField>
                )} />
                )}
                {fieldSupported("enableManualBatchClose") && (
                <FormField control={form.control} name="enableManualBatchClose" render={({ field }) => (
                  <ConfigField fieldName="enableManualBatchClose" label={getFieldLabel("enableManualBatchClose", "Manual Batch Close (EOD)")} description="Allow manual EOD processing command">
                    <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-manual-batch-close" />
                  </ConfigField>
                )} />
                )}
              </ConfigSection>

              <Separator />

              <ConfigSection title="Receipt Options" icon={Receipt} defaultOpen={false}>
                {([
                  { name: "receiptShowEmvFields" as const, label: "Show EMV Fields", desc: "Include EMV data block on chip receipts" },
                  { name: "receiptShowAid" as const, label: "Show AID", desc: "Application Identifier" },
                  { name: "receiptShowTvr" as const, label: "Show TVR", desc: "Terminal Verification Results" },
                  { name: "receiptShowTsi" as const, label: "Show TSI", desc: "Transaction Status Information" },
                  { name: "receiptShowAppLabel" as const, label: "Show Application Label", desc: "e.g., 'US MASTERCARD'" },
                  { name: "receiptShowEntryMethod" as const, label: "Show Entry Method", desc: "Chip/Swipe/Contactless/Keyed" },
                  { name: "receiptPrintMerchantCopy" as const, label: "Print Merchant Copy", desc: "Print a copy for the merchant" },
                  { name: "receiptPrintCustomerCopy" as const, label: "Print Customer Copy", desc: "Print a copy for the customer" },
                ] as const).filter(item => fieldSupported(item.name)).map(item => (
                  <FormField key={item.name} control={form.control} name={item.name} render={({ field }) => {
                    const inherited = getInheritedValue(item.name);
                    return (
                      <ConfigField fieldName={item.name} label={getFieldLabel(item.name, item.label)} description={getFieldDesc(item.name, item.desc)} inherited={field.value === undefined && !!inherited} inheritedFrom={inherited?.from}>
                        <Switch checked={field.value ?? getEffectiveValue(item.name, field.value) ?? false} onCheckedChange={field.onChange} data-testid={`switch-${item.name}`} />
                      </ConfigField>
                    );
                  }} />
                ))}
              </ConfigSection>

              <Separator />

              <ConfigSection title="Debug / Certification" icon={Bug} defaultOpen={false}>
                <FormField control={form.control} name="enableDebugLogging" render={({ field }) => (
                  <ConfigField fieldName="enableDebugLogging" label="Debug Logging" description="Enable detailed payment transaction logging">
                    <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-debug-logging" />
                  </ConfigField>
                )} />
                <FormField control={form.control} name="logRawRequests" render={({ field }) => (
                  <ConfigField fieldName="logRawRequests" label="Log Raw Requests" description="Log raw API request payloads (for certification)">
                    <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-log-raw-requests" />
                  </ConfigField>
                )} />
                <FormField control={form.control} name="logRawResponses" render={({ field }) => (
                  <ConfigField fieldName="logRawResponses" label="Log Raw Responses" description="Log raw API response payloads (for certification)">
                    <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-log-raw-responses" />
                  </ConfigField>
                )} />
              </ConfigSection>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 sticky bottom-0 py-4 bg-background border-t">
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              data-testid="button-save-config"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save {levelLabel} Configuration
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
