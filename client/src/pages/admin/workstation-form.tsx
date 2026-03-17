import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback, memo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/queryClient";
import { insertWorkstationSchema, type Workstation, type InsertWorkstation, type Property, type Printer, type OrderDevice } from "@shared/schema";
import { Check } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
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

const PRINTER_FIELDS = [
  "defaultReceiptPrinterId",
  "backupReceiptPrinterId",
  "reportPrinterId",
  "backupReportPrinterId",
  "voidPrinterId",
  "backupVoidPrinterId",
] as const;

type PrinterFieldName = typeof PRINTER_FIELDS[number];

interface WorkstationFormProps {
  editingItem: Workstation | null;
  properties: Property[];
  printers: Printer[];
  orderDevices: OrderDevice[];
  rvcOptions: { value: string; label: string }[];
  printerOptions: { value: string; label: string }[];
  defaultPropertyId: string;
  isSaving: boolean;
  onSave: (data: InsertWorkstation | Workstation, orderDeviceIds: string[]) => void;
  onCancel: () => void;
}

function cleanPrinterId(val: any): string | null {
  if (!val || val === "__none__") return null;
  return val;
}

interface OrderDeviceRoutingHandle {
  getSelectedIds: () => string[];
  isLoaded: () => boolean;
}

interface OrderDeviceRoutingProps {
  editingItem: Workstation | null;
  orderDevices: OrderDevice[];
  properties: Property[];
}

const OrderDeviceRouting = forwardRef<OrderDeviceRoutingHandle, OrderDeviceRoutingProps>(
  function OrderDeviceRouting({ editingItem, orderDevices, properties }, ref) {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [routingLoaded, setRoutingLoaded] = useState(!editingItem);
    const loadedForId = useRef<string | null>(null);

    useImperativeHandle(ref, () => ({
      getSelectedIds: () => selectedIds,
      isLoaded: () => routingLoaded,
    }), [selectedIds, routingLoaded]);

    useEffect(() => {
      const wsId = editingItem?.id ?? null;
      if (!wsId) {
        loadedForId.current = null;
        setRoutingLoaded(true);
        return;
      }
      if (wsId !== loadedForId.current) {
        loadedForId.current = wsId;
        setRoutingLoaded(false);
        let cancelled = false;
        fetch(`/api/workstations/${wsId}/order-devices`, { headers: getAuthHeaders() })
          .then(res => res.ok ? res.json() : [])
          .then((data) => {
            const ids: string[] = Array.isArray(data) ? data : (data?.orderDeviceIds ?? []);
            if (!cancelled) {
              setSelectedIds(prev => {
                const sorted = [...ids].sort();
                const prevSorted = [...prev].sort();
                if (sorted.length === prevSorted.length && sorted.every((v, i) => v === prevSorted[i])) return prev;
                return ids;
              });
              setRoutingLoaded(true);
            }
          })
          .catch(() => { if (!cancelled) { setSelectedIds(prev => prev.length === 0 ? prev : []); setRoutingLoaded(true); } });
        return () => { cancelled = true; };
      }
    }, [editingItem?.id]);

    const toggleDevice = useCallback((deviceId: string, checked: boolean) => {
      setSelectedIds((prev) => {
        const has = prev.includes(deviceId);
        if (checked && !has) return [...prev, deviceId];
        if (!checked && has) return prev.filter((id) => id !== deviceId);
        return prev;
      });
    }, []);

    return (
      <div className="border rounded-md p-4 space-y-3">
        <div>
          <h4 className="font-medium text-sm">Order Device Routing</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Select which Order Devices this workstation is allowed to send orders to. If none are selected, the workstation will send to all devices based on the menu item's Print Class.
          </p>
        </div>

        {orderDevices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No order devices configured. Please create order devices first.
          </p>
        ) : (
          <div className="space-y-2">
            {orderDevices.map((device) => {
              const isSelected = selectedIds.includes(device.id);
              return (
                <div
                  key={device.id}
                  className="flex items-center space-x-3 p-2 rounded-md hover-elevate cursor-pointer"
                  onClick={() => toggleDevice(device.id, !isSelected)}
                  data-testid={`row-ws-orderdevice-${device.id}`}
                >
                  <div
                    className={`h-4 w-4 shrink-0 rounded-sm border ${isSelected ? 'bg-primary border-primary' : 'border-primary'} flex items-center justify-center`}
                    data-testid={`checkbox-ws-orderdevice-${device.id}`}
                  >
                    {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{device.name}</span>
                      <Badge variant="outline" className="text-xs">{device.code}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {properties.find(p => p.id === device.propertyId)?.name || "Unknown Property"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selectedIds.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              Selected: {selectedIds.length} device(s) — orders will only route to these devices
            </p>
          </div>
        )}
      </div>
    );
  }
);

export function WorkstationForm({
  editingItem,
  properties,
  printers,
  orderDevices,
  rvcOptions,
  printerOptions,
  defaultPropertyId,
  isSaving,
  onSave,
  onCancel,
}: WorkstationFormProps) {
  const { toast } = useToast();

  const form = useForm<InsertWorkstation>({
    resolver: zodResolver(insertWorkstationSchema),
    defaultValues: editingItem
      ? {
          name: editingItem.name,
          deviceType: editingItem.deviceType,
          propertyId: editingItem.propertyId,
          rvcId: editingItem.rvcId || null,
          defaultOrderType: editingItem.defaultOrderType || "dine_in",
          fastTransactionEnabled: editingItem.fastTransactionEnabled ?? false,
          requireBeginCheck: editingItem.requireBeginCheck ?? true,
          allowPickupCheck: editingItem.allowPickupCheck ?? true,
          allowReopenClosedChecks: editingItem.allowReopenClosedChecks ?? false,
          allowOfflineOperation: editingItem.allowOfflineOperation ?? false,
          offlineCheckNumberStart: editingItem.offlineCheckNumberStart ?? null,
          offlineCheckNumberEnd: editingItem.offlineCheckNumberEnd ?? null,
          managerApprovalDevice: editingItem.managerApprovalDevice ?? false,
          clockInAllowed: editingItem.clockInAllowed ?? true,
          defaultReceiptPrinterId: editingItem.defaultReceiptPrinterId || null,
          backupReceiptPrinterId: editingItem.backupReceiptPrinterId || null,
          reportPrinterId: editingItem.reportPrinterId || null,
          backupReportPrinterId: editingItem.backupReportPrinterId || null,
          voidPrinterId: editingItem.voidPrinterId || null,
          backupVoidPrinterId: editingItem.backupVoidPrinterId || null,
          ipAddress: editingItem.ipAddress || "",
          hostname: editingItem.hostname || "",
          autoLogoutMinutes: editingItem.autoLogoutMinutes ?? null,
          active: editingItem.active ?? true,
          fontScale: editingItem.fontScale ?? 100,
          comPort: editingItem.comPort || null,
          comBaudRate: editingItem.comBaudRate ?? 9600,
          comDataBits: editingItem.comDataBits ?? 8,
          comStopBits: editingItem.comStopBits || "1",
          comParity: editingItem.comParity || "none",
          comFlowControl: editingItem.comFlowControl || "none",
          cashDrawerEnabled: editingItem.cashDrawerEnabled ?? false,
          cashDrawerPrinterId: editingItem.cashDrawerPrinterId || null,
          cashDrawerKickPin: editingItem.cashDrawerKickPin || "pin2",
          cashDrawerPulseDuration: editingItem.cashDrawerPulseDuration ?? 100,
          cashDrawerAutoOpenOnCash: editingItem.cashDrawerAutoOpenOnCash ?? true,
          cashDrawerAutoOpenOnDrop: editingItem.cashDrawerAutoOpenOnDrop ?? true,
        }
      : {
          name: "",
          deviceType: "pos_terminal",
          propertyId: defaultPropertyId,
          rvcId: null,
          defaultOrderType: "dine_in",
          fastTransactionEnabled: false,
          requireBeginCheck: true,
          allowPickupCheck: true,
          allowReopenClosedChecks: false,
          allowOfflineOperation: false,
          offlineCheckNumberStart: null,
          offlineCheckNumberEnd: null,
          managerApprovalDevice: false,
          clockInAllowed: true,
          defaultReceiptPrinterId: null,
          backupReceiptPrinterId: null,
          reportPrinterId: null,
          backupReportPrinterId: null,
          voidPrinterId: null,
          backupVoidPrinterId: null,
          ipAddress: "",
          hostname: "",
          autoLogoutMinutes: null,
          active: true,
          fontScale: 100,
          comPort: null,
          comBaudRate: 9600,
          comDataBits: 8,
          comStopBits: "1",
          comParity: "none",
          comFlowControl: "none",
          cashDrawerEnabled: false,
          cashDrawerPrinterId: null,
          cashDrawerKickPin: "pin2",
          cashDrawerPulseDuration: 100,
          cashDrawerAutoOpenOnCash: true,
          cashDrawerAutoOpenOnDrop: true,
        },
  });

  const [cashDrawerVisible, setCashDrawerVisible] = useState(editingItem?.cashDrawerEnabled ?? false);
  const orderDeviceRoutingRef = useRef<OrderDeviceRoutingHandle>(null);

  const guardedChange = (field: any, newValue: string) => {
    const currentDisplay = field.value || "__none__";
    if (newValue !== currentDisplay) {
      field.onChange(newValue);
    }
  };

  const handleSetForAll = (sourceField: PrinterFieldName) => {
    const sourceValue = form.getValues(sourceField);
    if (!sourceValue || sourceValue === "__none__") {
      toast({
        title: "No printer selected",
        description: "Please select a printer first before applying to all.",
        variant: "destructive",
      });
      return;
    }
    PRINTER_FIELDS.forEach(field => {
      if (field !== sourceField) {
        form.setValue(field, sourceValue);
      }
    });
    toast({
      title: "Applied to all printers",
      description: "The selected printer has been set for all printer types.",
    });
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (editingItem && orderDeviceRoutingRef.current && !orderDeviceRoutingRef.current.isLoaded()) {
      toast({ title: "Please wait", description: "Order device routing data is still loading", variant: "destructive" });
      return;
    }
    form.handleSubmit((data: InsertWorkstation) => {
      const cleanedData = {
        ...data,
        rvcId: cleanPrinterId(data.rvcId),
        defaultReceiptPrinterId: cleanPrinterId(data.defaultReceiptPrinterId),
        backupReceiptPrinterId: cleanPrinterId(data.backupReceiptPrinterId),
        reportPrinterId: cleanPrinterId(data.reportPrinterId),
        backupReportPrinterId: cleanPrinterId(data.backupReportPrinterId),
        voidPrinterId: cleanPrinterId(data.voidPrinterId),
        backupVoidPrinterId: cleanPrinterId(data.backupVoidPrinterId),
        cashDrawerPrinterId: cleanPrinterId(data.cashDrawerPrinterId),
        comPort: cleanPrinterId(data.comPort),
      };
      const currentOrderDeviceIds = orderDeviceRoutingRef.current?.getSelectedIds() ?? [];
      if (editingItem) {
        onSave({ ...editingItem, ...cleanedData } as Workstation, currentOrderDeviceIds);
      } else {
        onSave(cleanedData, currentOrderDeviceIds);
      }
    })();
  };

  const renderPrinterSelect = (name: PrinterFieldName, label: string, description: string) => (
    <FormField
      key={name}
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <div className="flex items-center justify-between gap-2">
            <FormLabel>{label}</FormLabel>
            <button
              type="button"
              onClick={() => handleSetForAll(name)}
              className="text-xs text-muted-foreground hover:text-primary underline"
              data-testid={`link-set-all-${name}`}
            >
              Set for all
            </button>
          </div>
          <Select
            onValueChange={(v) => guardedChange(field, v)}
            value={field.value || "__none__"}
          >
            <FormControl>
              <SelectTrigger data-testid={`select-${name}`}>
                <SelectValue placeholder="Select printer" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {printerOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormDescription className="text-xs">{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <div className="p-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle data-testid="text-form-title">{editingItem ? "Edit Workstation" : "Add Workstation"}</CardTitle>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel">
                Cancel
              </Button>
              <Button
                data-testid="button-save"
                disabled={isSaving}
                onClick={handleSubmit}
              >
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workstation Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Front Counter 1" {...field} data-testid="input-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deviceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Device Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-deviceType">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pos_terminal">POS Terminal</SelectItem>
                          <SelectItem value="kiosk">Self-Service Kiosk</SelectItem>
                          <SelectItem value="manager_station">Manager Station</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rvcId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Revenue Center (Optional)</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || "__none__"}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-rvcId">
                            <SelectValue placeholder="Select RVC" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {rvcOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="defaultOrderType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Order Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "dine_in"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-defaultOrderType">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="dine_in">Dine In</SelectItem>
                          <SelectItem value="take_out">Take Out</SelectItem>
                          <SelectItem value="delivery">Delivery</SelectItem>
                          <SelectItem value="drive_thru">Drive Thru</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="border rounded-md p-4 space-y-3">
                <h4 className="font-medium text-sm">Workstation Settings</h4>
                <div className="grid grid-cols-4 gap-3">
                  <FormField
                    control={form.control}
                    name="fastTransactionEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <FormLabel className="text-sm">Fast Transaction</FormLabel>
                        <FormControl>
                          <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-fastTransactionEnabled" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="requireBeginCheck"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <FormLabel className="text-sm">Require Begin Check</FormLabel>
                        <FormControl>
                          <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-requireBeginCheck" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="allowPickupCheck"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <FormLabel className="text-sm">Allow Pickup Check</FormLabel>
                        <FormControl>
                          <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-allowPickupCheck" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="allowReopenClosedChecks"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <FormLabel className="text-sm">Reopen Closed Checks</FormLabel>
                        <FormControl>
                          <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-allowReopenClosedChecks" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="allowOfflineOperation"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <FormLabel className="text-sm">Allow Offline</FormLabel>
                        <FormControl>
                          <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-allowOfflineOperation" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                {form.watch("allowOfflineOperation") && (
                  <div className="border border-dashed rounded-md p-3 mt-2 space-y-2">
                    <h5 className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Offline Check Number Range</h5>
                    <p className="text-xs text-muted-foreground">Assign a unique check number range for this workstation to prevent duplicates when operating offline.</p>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="offlineCheckNumberStart"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm">Range Start</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                placeholder="e.g. 1"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                                data-testid="input-offlineCheckNumberStart"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="offlineCheckNumberEnd"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm">Range End</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                placeholder="e.g. 999"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                                data-testid="input-offlineCheckNumberEnd"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    {form.watch("offlineCheckNumberStart") && form.watch("offlineCheckNumberEnd") && (
                      form.watch("offlineCheckNumberStart")! > form.watch("offlineCheckNumberEnd")! ? (
                        <p className="text-xs text-red-500 font-medium">Range Start must be less than or equal to Range End</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Capacity: {(form.watch("offlineCheckNumberEnd")! - form.watch("offlineCheckNumberStart")! + 1).toLocaleString()} checks
                        </p>
                      )
                    )}
                  </div>
                )}
                <div className="grid grid-cols-4 gap-3">
                  <FormField
                    control={form.control}
                    name="managerApprovalDevice"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <FormLabel className="text-sm">Manager Approval</FormLabel>
                        <FormControl>
                          <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-managerApprovalDevice" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="clockInAllowed"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <FormLabel className="text-sm">Clock-In Allowed</FormLabel>
                        <FormControl>
                          <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-clockInAllowed" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="active"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <FormLabel className="text-sm">Active</FormLabel>
                        <FormControl>
                          <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-active" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="autoLogoutMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Auto-Logout (minutes)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            placeholder="0 = disabled"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              field.onChange(val === "" ? null : parseInt(val, 10));
                            }}
                            data-testid="input-autoLogoutMinutes"
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Automatically sign out employee after this many minutes of inactivity. Unsent items will be cancelled. Set to 0 or leave empty to disable.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="fontScale"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Font Size</FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(parseInt(val, 10))}
                          value={String(field.value ?? 100)}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-fontScale">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="85">Small (85%)</SelectItem>
                            <SelectItem value="100">Medium (100%) - Default</SelectItem>
                            <SelectItem value="120">Large (120%)</SelectItem>
                            <SelectItem value="140">Extra Large (140%)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">
                          Controls the text size on POS screens, check details, popups, and KDS tickets for this workstation. Use Large or Extra Large for smaller touchscreens.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="border rounded-md p-4 space-y-4">
                <h4 className="font-medium text-sm">Printer Assignments</h4>
                <p className="text-xs text-muted-foreground">
                  Select a printer and click "Set for all" to apply it to all printer types.
                </p>

                <div className="grid grid-cols-3 gap-4">
                  {renderPrinterSelect("defaultReceiptPrinterId", "Receipt Printer", "Primary printer for guest checks")}
                  {renderPrinterSelect("backupReceiptPrinterId", "Backup Receipt Printer", "Fallback if primary is offline")}
                  {renderPrinterSelect("reportPrinterId", "Report Printer", "Printer for reports and summaries")}
                  {renderPrinterSelect("backupReportPrinterId", "Backup Report Printer", "Fallback for report printing")}
                  {renderPrinterSelect("voidPrinterId", "Void Printer", "Printer for void receipts")}
                  {renderPrinterSelect("backupVoidPrinterId", "Backup Void Printer", "Fallback for void printing")}
                </div>
              </div>

              <div className="border rounded-md p-4 space-y-4">
                <h4 className="font-medium text-sm">Serial Port Settings</h4>
                <p className="text-xs text-muted-foreground">
                  Configure the COM port for serial printers connected to this workstation. The serial adapter connects to a COM port on the workstation hardware.
                </p>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="comPort"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>COM Port</FormLabel>
                        <Select onValueChange={(v) => guardedChange(field, v)} value={field.value || "__none__"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-comPort">
                              <SelectValue placeholder="Select COM port" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">None (Not Used)</SelectItem>
                            <SelectItem value="COM1">COM1 (Standard)</SelectItem>
                            <SelectItem value="COM2">COM2</SelectItem>
                            <SelectItem value="COM3">COM3</SelectItem>
                            <SelectItem value="COM4">COM4</SelectItem>
                            <SelectItem value="COM5">COM5</SelectItem>
                            <SelectItem value="COM6">COM6</SelectItem>
                            <SelectItem value="COM7">COM7</SelectItem>
                            <SelectItem value="COM8">COM8</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">Physical COM port on the workstation</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="comBaudRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Baud Rate</FormLabel>
                        <Select onValueChange={(v) => { if (v !== String(field.value ?? 9600)) field.onChange(parseInt(v, 10)); }} value={String(field.value ?? 9600)}>
                          <FormControl>
                            <SelectTrigger data-testid="select-comBaudRate">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="2400">2400</SelectItem>
                            <SelectItem value="4800">4800</SelectItem>
                            <SelectItem value="9600">9600 (Standard)</SelectItem>
                            <SelectItem value="19200">19200</SelectItem>
                            <SelectItem value="38400">38400</SelectItem>
                            <SelectItem value="57600">57600</SelectItem>
                            <SelectItem value="115200">115200</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">Communication speed — 9600 is standard for most receipt printers</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="comDataBits"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data Bits</FormLabel>
                        <Select onValueChange={(v) => { if (v !== String(field.value ?? 8)) field.onChange(parseInt(v, 10)); }} value={String(field.value ?? 8)}>
                          <FormControl>
                            <SelectTrigger data-testid="select-comDataBits">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="7">7</SelectItem>
                            <SelectItem value="8">8 (Standard)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="comStopBits"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stop Bits</FormLabel>
                        <Select onValueChange={(v) => guardedChange(field, v)} value={field.value || "1"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-comStopBits">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1">1 (Standard)</SelectItem>
                            <SelectItem value="1.5">1.5</SelectItem>
                            <SelectItem value="2">2</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="comParity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Parity</FormLabel>
                        <Select onValueChange={(v) => guardedChange(field, v)} value={field.value || "none"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-comParity">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None (Standard)</SelectItem>
                            <SelectItem value="even">Even</SelectItem>
                            <SelectItem value="odd">Odd</SelectItem>
                            <SelectItem value="mark">Mark</SelectItem>
                            <SelectItem value="space">Space</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="comFlowControl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Flow Control</FormLabel>
                        <Select onValueChange={(v) => guardedChange(field, v)} value={field.value || "none"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-comFlowControl">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None (Standard)</SelectItem>
                            <SelectItem value="xon_xoff">XON/XOFF (Software)</SelectItem>
                            <SelectItem value="rts_cts">RTS/CTS (Hardware)</SelectItem>
                            <SelectItem value="dtr_dsr">DTR/DSR (Hardware)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="border rounded-md p-4 space-y-4">
                <h4 className="font-medium text-sm">Cash Drawer</h4>
                <p className="text-xs text-muted-foreground">
                  Configure a printer-driven cash drawer connected to one of this workstation's receipt printers.
                </p>

                <FormField
                  control={form.control}
                  name="cashDrawerEnabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div>
                        <FormLabel className="text-sm">Cash Drawer Enabled</FormLabel>
                        <FormDescription className="text-xs">Enable cash drawer kick commands for this workstation</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value ?? false} onCheckedChange={(checked) => { field.onChange(checked); setCashDrawerVisible(checked); }} data-testid="switch-cashDrawerEnabled" />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {cashDrawerVisible && (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="cashDrawerPrinterId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Drawer Printer</FormLabel>
                            <Select
                              onValueChange={(v) => guardedChange(field, v)}
                              value={field.value || "__none__"}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-cashDrawerPrinterId">
                                  <SelectValue placeholder="Select printer" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {printerOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription className="text-xs">
                              The receipt printer that controls the cash drawer via its kick connector
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="cashDrawerKickPin"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Kick Pin</FormLabel>
                            <Select onValueChange={(v) => guardedChange(field, v)} value={field.value || "pin2"}>
                              <FormControl>
                                <SelectTrigger data-testid="select-cashDrawerKickPin">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="pin2">Pin 2 (Standard)</SelectItem>
                                <SelectItem value="pin5">Pin 5 (Alternate)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription className="text-xs">
                              Most drawers (MMF, APG, Star) use Pin 2. Some dual-drawer setups use Pin 5.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="cashDrawerPulseDuration"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Pulse Duration (ms)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="50"
                                max="500"
                                {...field}
                                value={field.value ?? 100}
                                onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 100)}
                                data-testid="input-cashDrawerPulseDuration"
                              />
                            </FormControl>
                            <FormDescription className="text-xs">
                              Duration of the electronic kick pulse. 100ms works for most drawers.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="cashDrawerAutoOpenOnCash"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between">
                            <div>
                              <FormLabel className="text-sm">Auto-Open on Cash Tender</FormLabel>
                              <FormDescription className="text-xs">Automatically open the drawer when a cash payment is applied</FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-cashDrawerAutoOpenOnCash" />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="cashDrawerAutoOpenOnDrop"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between">
                            <div>
                              <FormLabel className="text-sm">Auto-Open on Drop/Pickup</FormLabel>
                              <FormDescription className="text-xs">Automatically open the drawer for cash drops and pickups</FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-cashDrawerAutoOpenOnDrop" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </>
                )}
              </div>

              <OrderDeviceRouting
                ref={orderDeviceRoutingRef}
                editingItem={editingItem}
                orderDevices={orderDevices}
                properties={properties}
              />

              <div className="border rounded-md p-4 space-y-4">
                <h4 className="font-medium text-sm">Network Settings</h4>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="ipAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IP Address</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 192.168.1.100" {...field} value={field.value || ""} data-testid="input-ipAddress" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="hostname"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hostname</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., pos-terminal-1" {...field} value={field.value || ""} data-testid="input-hostname" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
