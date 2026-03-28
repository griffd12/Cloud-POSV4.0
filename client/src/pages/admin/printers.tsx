import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DataTable, type Column, type CustomAction } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { insertPrinterSchema, type Printer, type InsertPrinter, type Property, type Workstation } from "@shared/schema";
import { Printer as PrinterIcon } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
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
import { getScopeColumn, getZoneColumn, getInheritanceColumn } from "@/components/admin/scope-column";
import { useScopeLookup } from "@/hooks/use-scope-lookup";

const EPSON_MODELS = [
  { value: "TM-T88VII", label: "TM-T88VII - Latest High-Speed" },
  { value: "TM-T88VI", label: "TM-T88VI - High-Speed" },
  { value: "TM-T88V", label: "TM-T88V - Industry Standard" },
  { value: "TM-T88IV", label: "TM-T88IV - Legacy" },
  { value: "TM-T20III", label: "TM-T20III - Budget" },
  { value: "TM-T20II", label: "TM-T20II - Cost-Effective" },
  { value: "TM-T70II", label: "TM-T70II - Under-Counter" },
  { value: "TM-T82III", label: "TM-T82III - Compact" },
  { value: "TM-m30III", label: "TM-m30III - mPOS Modern" },
  { value: "TM-m30II", label: "TM-m30II - mPOS Compact" },
  { value: "TM-m50II", label: "TM-m50II - mPOS Fast" },
  { value: "TM-U220A", label: "TM-U220A - Impact Auto-Cutter" },
  { value: "TM-U220B", label: "TM-U220B - Impact Standard" },
  { value: "TM-U220D", label: "TM-U220D - Impact No-Cutter" },
  { value: "TM-U230", label: "TM-U230 - Impact Kitchen" },
  { value: "TM-P20II", label: "TM-P20II - Mobile 2-inch" },
  { value: "TM-P80II", label: "TM-P80II - Mobile 3-inch" },
  { value: "TM-H6000V", label: "TM-H6000V - Hybrid" },
  { value: "TM-L90II", label: "TM-L90II - Label" },
  { value: "Custom-Epson", label: "Other Epson Model" },
];

const STAR_MODELS = [
  { value: "mC-Print3", label: "mC-Print3 - Premium 3-inch" },
  { value: "mC-Print31Ci", label: "mC-Print31Ci - LAN+USB" },
  { value: "mC-Print31CBi", label: "mC-Print31CBi - LAN+USB+BT" },
  { value: "mC-Print2", label: "mC-Print2 - Compact 2-inch" },
  { value: "TSP143IV", label: "TSP143IV - Best-Selling" },
  { value: "TSP143IIIU", label: "TSP143IIIU - USB" },
  { value: "TSP143IIIBI", label: "TSP143IIIBI - Bluetooth" },
  { value: "TSP143IIILAN", label: "TSP143IIILAN - Ethernet" },
  { value: "TSP654II", label: "TSP654II - 4-inch Wide" },
  { value: "TSP743II", label: "TSP743II - 3-inch" },
  { value: "SP700", label: "SP700 - Impact Kitchen" },
  { value: "SP712", label: "SP712 - Impact Ethernet" },
  { value: "SP742", label: "SP742 - Impact Serial" },
  { value: "SP500", label: "SP500 - Impact Fast" },
  { value: "SM-T300i", label: "SM-T300i - Mobile 3-inch" },
  { value: "SM-L200", label: "SM-L200 - Mobile Label" },
  { value: "mPOP", label: "mPOP - All-in-One + Cash Drawer" },
  { value: "Custom-Star", label: "Other Star Model" },
];

const CHARACTER_WIDTHS = [
  { value: "32", label: "32" },
  { value: "40", label: "40" },
  { value: "42", label: "42" },
  { value: "48", label: "48" },
  { value: "56", label: "56" },
  { value: "80", label: "80" },
];

export default function PrintersPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Printer | null>(null);

  const { data: printers = [], isLoading } = useQuery<Printer[]>({
    queryKey: ["/api/printers", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/printers${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch printers");
      return res.json();
    },
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: workstations = [] } = useQuery<Workstation[]>({
    queryKey: ["/api/workstations", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/workstations${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch workstations");
      return res.json();
    },
  });

  const columns: Column<Printer>[] = [
    { key: "name", header: "Name", sortable: true },
    {
      key: "printerType",
      header: "Type",
      render: (value) => {
        const types: Record<string, string> = {
          receipt: "Receipt",
          kitchen: "Kitchen",
          bar: "Bar",
          prep: "Prep",
          report: "Report",
        };
        return <Badge variant="outline">{types[value as string] || value}</Badge>;
      },
    },
    {
      key: "propertyId",
      header: "Property",
      render: (value) => properties.find((p) => p.id === value)?.name || "-",
    },
    {
      key: "driverProtocol",
      header: "Brand",
      render: (value) => value === "epson" ? "Epson" : value === "star" ? "Star" : value,
    },
    {
      key: "model",
      header: "Model",
      render: (value) => value || "-",
    },
    {
      key: "connectionType",
      header: "Connection",
      render: (value) => value === "network" ? "Network" : value === "windows_printer" ? "Windows USB" : value === "usb" ? "USB" : "Serial",
    },
    { key: "ipAddress", header: "IP Address" },
    {
      key: "hostWorkstationId" as any,
      header: "Host WS",
      render: (value: any) => {
        if (!value) return "-";
        const ws = workstations.find((w) => w.id === value);
        return ws?.name || "-";
      },
    },
    {
      key: "isOnline",
      header: "Status",
      render: (value) => (value ? <Badge className="bg-green-600">Online</Badge> : <Badge variant="secondary">Offline</Badge>),
    },
    {
      key: "active",
      header: "Active",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
    getScopeColumn(),
    getZoneColumn<Printer>(scopeLookup),
    getInheritanceColumn<Printer>(contextPropertyId, selectedRvcId),
  ];

  const form = useForm<InsertPrinter>({
    resolver: zodResolver(insertPrinterSchema),
    defaultValues: {
      name: "",
      printerType: "kitchen",
      propertyId: "",
      connectionType: "network",
      ipAddress: "",
      subnetMask: "255.255.255.0",
      port: 9100,
      comPort: "",
      baudRate: 9600,
      windowsPrinterName: "",
      hostWorkstationId: null,
      driverProtocol: "epson",
      model: "TM-T88VII",
      characterWidth: 42,
      autoCut: true,
      printLogo: false,
      printOrderHeader: true,
      printOrderFooter: true,
      printVoids: true,
      printReprints: true,
      retryAttempts: 3,
      failureHandlingMode: "alert_cashier",
      active: true,
    },
  });

  const selectedBrand = form.watch("driverProtocol");
  const watchedConnectionType = form.watch("connectionType");
  const modelOptions = selectedBrand === "star" ? STAR_MODELS : EPSON_MODELS;

  useEffect(() => {
    if (formOpen) {
      if (editingItem) {
        form.reset({
          name: editingItem.name,
          printerType: editingItem.printerType,
          propertyId: editingItem.propertyId,
          connectionType: editingItem.connectionType,
          ipAddress: editingItem.ipAddress || "",
          subnetMask: editingItem.subnetMask || "255.255.255.0",
          port: editingItem.port ?? 9100,
          comPort: editingItem.comPort || "",
          baudRate: editingItem.baudRate ?? 9600,
          windowsPrinterName: (editingItem as any).windowsPrinterName || "",
          hostWorkstationId: (editingItem as any).hostWorkstationId || null,
          driverProtocol: editingItem.driverProtocol || "epson",
          model: editingItem.model || "TM-T88VII",
          characterWidth: editingItem.characterWidth ?? 42,
          autoCut: editingItem.autoCut ?? true,
          printLogo: editingItem.printLogo ?? false,
          printOrderHeader: editingItem.printOrderHeader ?? true,
          printOrderFooter: editingItem.printOrderFooter ?? true,
          printVoids: editingItem.printVoids ?? true,
          printReprints: editingItem.printReprints ?? true,
          retryAttempts: editingItem.retryAttempts ?? 3,
          failureHandlingMode: editingItem.failureHandlingMode || "alert_cashier",
          active: editingItem.active ?? true,
        });
      } else {
        const defaultPropertyId = properties[0]?.id || "";
        form.reset({
          name: "",
          printerType: "kitchen",
          propertyId: defaultPropertyId,
          connectionType: "network",
          ipAddress: "",
          subnetMask: "255.255.255.0",
          port: 9100,
          comPort: "",
          baudRate: 9600,
          windowsPrinterName: "",
          hostWorkstationId: null,
          driverProtocol: "epson",
          model: "TM-T88VII",
          characterWidth: 42,
          autoCut: true,
          printLogo: false,
          printOrderHeader: true,
          printOrderFooter: true,
          printVoids: true,
          printReprints: true,
          retryAttempts: 3,
          failureHandlingMode: "alert_cashier",
          active: true,
        });
      }
    }
  }, [formOpen, editingItem, properties]);

  useEffect(() => {
    const currentModel = form.getValues("model");
    const isValidForBrand = modelOptions.some(m => m.value === currentModel);
    if (!isValidForBrand) {
      form.setValue("model", modelOptions[0]?.value || "");
    }
  }, [selectedBrand]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertPrinter) => {
      const response = await apiRequest("POST", "/api/printers", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      form.reset();
      toast({ title: "Printer created" });
    },
    onError: () => {
      toast({ title: "Failed to create printer", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Printer) => {
      const response = await apiRequest("PUT", "/api/printers/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      form.reset();
      toast({ title: "Printer updated" });
    },
    onError: () => {
      toast({ title: "Failed to update printer", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/printers/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers", filterKeys] });
      toast({ title: "Printer deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete printer", variant: "destructive" });
    },
  });

  const testPrintMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", "/api/printers/" + id + "/test");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers", filterKeys] });
      toast({ title: data.message || "Test print sent successfully" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Test print failed", variant: "destructive" });
    },
  });

  const customActions: CustomAction<Printer>[] = [
    {
      label: "Test Print",
      icon: PrinterIcon,
      onClick: (printer) => {
        if (printer.connectionType !== "network" || !printer.ipAddress) {
          toast({ 
            title: "Test print requires a network printer with IP address", 
            variant: "destructive" 
          });
          return;
        }
        testPrintMutation.mutate(printer.id);
      },
    },
  ];

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    form.handleSubmit((data: InsertPrinter) => {
      if (editingItem) {
        updateMutation.mutate({ ...editingItem, ...data } as Printer);
      } else {
        createMutation.mutate({ ...data, ...scopePayload });
      }
    })();
  };

  const handleCancel = () => {
    setFormOpen(false);
    setEditingItem(null);
    form.reset();
  };

  if (formOpen) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle data-testid="text-form-title">{editingItem ? "Edit Printer" : "Add Printer"}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button
                  data-testid="button-save"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  onClick={handleSubmit}
                >
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Printer Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Kitchen Printer - Hot Line" {...field} data-testid="input-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="printerType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Printer Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-printerType">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="receipt">Receipt</SelectItem>
                            <SelectItem value="kitchen">Kitchen</SelectItem>
                            <SelectItem value="bar">Bar</SelectItem>
                            <SelectItem value="prep">Prep</SelectItem>
                            <SelectItem value="report">Report</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="connectionType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Connection Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-connectionType">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="network">Network (IP)</SelectItem>
                            <SelectItem value="windows_printer">Windows USB Printer</SelectItem>
                            <SelectItem value="serial">Serial (COM Port)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {watchedConnectionType === "windows_printer" ? (
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="windowsPrinterName"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Windows Printer Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder='e.g., Star TSP100 CUTTER (TSP143)'
                            {...field}
                            value={field.value || ""}
                            data-testid="input-windowsPrinterName"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground mt-1">
                          Enter the exact printer name from Windows Devices and Printers
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="hostWorkstationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Host Workstation</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === "__none__" ? null : v)} value={field.value || "__none__"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-hostWorkstation-winprinter">
                              <SelectValue placeholder="Select host workstation" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">Not assigned</SelectItem>
                            {workstations.map((ws) => (
                              <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                ) : watchedConnectionType === "serial" ? (
                <div className="grid grid-cols-4 gap-4">
                  <FormField
                    control={form.control}
                    name="comPort"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>COM Port</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-comPort">
                              <SelectValue placeholder="Select COM port" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="COM1">COM1</SelectItem>
                            <SelectItem value="COM2">COM2</SelectItem>
                            <SelectItem value="COM3">COM3</SelectItem>
                            <SelectItem value="COM4">COM4</SelectItem>
                            <SelectItem value="COM5">COM5</SelectItem>
                            <SelectItem value="COM6">COM6</SelectItem>
                            <SelectItem value="COM7">COM7</SelectItem>
                            <SelectItem value="COM8">COM8</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="baudRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Baud Rate</FormLabel>
                        <Select onValueChange={(v) => field.onChange(parseInt(v))} value={String(field.value || 9600)}>
                          <FormControl>
                            <SelectTrigger data-testid="select-baudRate">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="9600">9600</SelectItem>
                            <SelectItem value="19200">19200</SelectItem>
                            <SelectItem value="38400">38400</SelectItem>
                            <SelectItem value="57600">57600</SelectItem>
                            <SelectItem value="115200">115200</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="hostWorkstationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Host Workstation</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === "__none__" ? null : v)} value={field.value || "__none__"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-hostWorkstation">
                              <SelectValue placeholder="Select host workstation" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">Not assigned</SelectItem>
                            {workstations.map((ws) => (
                              <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                ) : (
                <div className="grid grid-cols-4 gap-4">
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
                    name="subnetMask"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subnet Mask</FormLabel>
                        <FormControl>
                          <Input placeholder="255.255.255.0" {...field} value={field.value || ""} data-testid="input-subnetMask" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="port"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Port</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="9100" 
                            {...field} 
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 9100)}
                            data-testid="input-port" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                )}

                <div className="grid grid-cols-4 gap-4">
                  <FormField
                    control={form.control}
                    name="driverProtocol"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Printer Brand</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "epson"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-driverProtocol">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="epson">Epson</SelectItem>
                            <SelectItem value="star">Star Micronics</SelectItem>
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
                    name="model"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Printer Model</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || modelOptions[0]?.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-model">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {modelOptions.map((m) => (
                              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="characterWidth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Character Width</FormLabel>
                        <Select 
                          onValueChange={(val) => field.onChange(parseInt(val))} 
                          value={String(field.value || 42)}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-characterWidth">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CHARACTER_WIDTHS.map((w) => (
                              <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="failureHandlingMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Failure Handling</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "alert_cashier"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-failureHandlingMode">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="fail_silently">Fail Silently</SelectItem>
                            <SelectItem value="alert_cashier">Alert Cashier</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="border rounded-md p-4 space-y-3">
                  <h4 className="font-medium text-sm">Print Options</h4>
                  <div className="grid grid-cols-4 gap-3">
                    <FormField
                      control={form.control}
                      name="autoCut"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel>Auto Cut</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-autoCut" />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="printLogo"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel>Print Logo</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-printLogo" />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="printOrderHeader"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel>Print Order Header</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-printOrderHeader" />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="printOrderFooter"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel>Print Order Footer</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-printOrderFooter" />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="printVoids"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel>Print Voids</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-printVoids" />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="printReprints"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel>Print Reprints</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-printReprints" />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="active"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel>Active</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-active" />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="retryAttempts"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Retry Attempts</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="3" 
                              {...field} 
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 3)}
                              data-testid="input-retryAttempts" 
                            />
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

  return (
    <div className="p-6">
      <DataTable
        data={printers}
        columns={columns}
        title="Printers"
        onAdd={() => {
          setEditingItem(null);
          setFormOpen(true);
        }}
        onEdit={(item) => {
          setEditingItem(item);
          setFormOpen(true);
        }}
        onDelete={(item) => deleteMutation.mutate(item.id)}
        customActions={customActions}
        isLoading={isLoading}
        searchPlaceholder="Search printers..."
        emptyMessage="No printers configured"
      />
    </div>
  );
}
