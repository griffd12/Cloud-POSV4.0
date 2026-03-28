import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { insertRvcSchema, type Rvc, type InsertRvc, type Property, ORDER_TYPES, DOM_SEND_MODES } from "@shared/schema";
import { FileText, Save, Loader2 } from "lucide-react";
import { OptionBitsPanel } from "@/components/admin/option-bits-panel";

const MAX_HEADER_LINES = 16;
const MAX_TRAILER_LINES = 16;
const MAX_CHARS_PER_LINE = 48;

interface DescriptorSet {
  id: string;
  scopeType: "enterprise" | "property" | "rvc";
  scopeId: string;
  enterpriseId: string;
  headerLines: string[];
  trailerLines: string[];
  logoEnabled: boolean;
  logoAssetId: string | null;
  overrideHeader: boolean;
  overrideTrailer: boolean;
  overrideLogo: boolean;
}

export default function RvcsPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId } = useEmcFilter();
  usePosWebSocket();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Rvc | null>(null);
  const [descriptorsOpen, setDescriptorsOpen] = useState(false);
  const [descriptorsRvc, setDescriptorsRvc] = useState<Rvc | null>(null);
  const [headerLines, setHeaderLines] = useState<string[]>(Array(MAX_HEADER_LINES).fill(""));
  const [trailerLines, setTrailerLines] = useState<string[]>(Array(MAX_TRAILER_LINES).fill(""));
  const [overrideHeader, setOverrideHeader] = useState(false);
  const [overrideTrailer, setOverrideTrailer] = useState(false);

  const [rvcName, setRvcName] = useState("");
  const [rvcCode, setRvcCode] = useState("");
  const [rvcPropertyId, setRvcPropertyId] = useState(contextPropertyId || "");
  const [defaultOrderType, setDefaultOrderType] = useState("dine_in");
  const [fastTransactionDefault, setFastTransactionDefault] = useState(false);
  const [dynamicOrderMode, setDynamicOrderMode] = useState(false);
  const [domSendMode, setDomSendMode] = useState("fire_on_fly");
  const [conversationalOrderingEnabled, setConversationalOrderingEnabled] = useState(false);

  const { data: rvcs = [], isLoading } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/rvcs${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch rvcs");
      return res.json();
    },
  });

  const enterpriseOnlyParam = selectedEnterpriseId ? `?enterpriseId=${selectedEnterpriseId}` : "";
  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", selectedEnterpriseId],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${enterpriseOnlyParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const columns: Column<Rvc>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "code", header: "Code", sortable: true },
    {
      key: "propertyId",
      header: "Property",
      render: (value) => properties.find((p) => p.id === value)?.name || "-",
    },
    {
      key: "fastTransactionDefault",
      header: "Fast Transaction",
      render: (value) => (value ? <Badge>Enabled</Badge> : <Badge variant="secondary">Disabled</Badge>),
    },
    {
      key: "dynamicOrderMode",
      header: "Dynamic Order",
      render: (value) => (value ? <Badge>Enabled</Badge> : <Badge variant="secondary">Disabled</Badge>),
    },
    {
      key: "domSendMode",
      header: "DOM Send Mode",
      render: (value, row) => {
        if (!row.dynamicOrderMode) return "-";
        const labels: Record<string, string> = {
          fire_on_fly: "Fire on Fly",
          fire_on_next: "Fire on Next",
          fire_on_tender: "Fire on Tender",
        };
        return <Badge variant="outline">{labels[value as string] || value}</Badge>;
      },
    },
    { key: "defaultOrderType", header: "Default Order Type" },
    {
      key: "conversationalOrderingEnabled",
      header: "Conversational",
      render: (value) => (value ? <Badge>Enabled</Badge> : <Badge variant="secondary">Disabled</Badge>),
    },
    {
      key: "id",
      header: "Descriptors",
      render: (_, row) => (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={(e) => { e.stopPropagation(); openDescriptors(row); }}
          data-testid={`button-descriptors-${row.id}`}
        >
          <FileText className="w-3 h-3 mr-1" />
          Configure
        </Button>
      ),
    },
  ];

  const resetForm = () => {
    setRvcName("");
    setRvcCode("");
    setRvcPropertyId(contextPropertyId || properties[0]?.id || "");
    setDefaultOrderType("dine_in");
    setFastTransactionDefault(false);
    setDynamicOrderMode(false);
    setDomSendMode("fire_on_fly");
    setConversationalOrderingEnabled(false);
  };

  useEffect(() => {
    if (editingItem) {
      setRvcName(editingItem.name);
      setRvcCode(editingItem.code || "");
      setRvcPropertyId(editingItem.propertyId || "");
      setDefaultOrderType(editingItem.defaultOrderType || "dine_in");
      setFastTransactionDefault(editingItem.fastTransactionDefault ?? false);
      setDynamicOrderMode(editingItem.dynamicOrderMode ?? false);
      setDomSendMode(editingItem.domSendMode || "fire_on_fly");
      setConversationalOrderingEnabled(editingItem.conversationalOrderingEnabled ?? false);
    } else {
      resetForm();
    }
  }, [editingItem]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertRvc) => {
      const response = await apiRequest("POST", "/api/rvcs", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rvcs", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      resetForm();
      toast({ title: "Revenue Center created" });
    },
    onError: () => {
      toast({ title: "Failed to create RVC", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Rvc) => {
      const response = await apiRequest("PUT", "/api/rvcs/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rvcs", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      resetForm();
      toast({ title: "Revenue Center updated" });
    },
    onError: () => {
      toast({ title: "Failed to update RVC", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/rvcs/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rvcs", filterKeys] });
      toast({ title: "Revenue Center deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete RVC", variant: "destructive" });
    },
  });

  const saveDescriptorsMutation = useMutation({
    mutationFn: async () => {
      if (!descriptorsRvc) throw new Error("No RVC selected");
      const property = properties.find(p => p.id === descriptorsRvc.propertyId);
      if (!property?.enterpriseId) throw new Error("Property or enterprise not found");
      
      const cleanHeader = headerLines.filter(l => l.trim()).map(l => l.substring(0, MAX_CHARS_PER_LINE));
      const cleanTrailer = trailerLines.filter(l => l.trim()).map(l => l.substring(0, MAX_CHARS_PER_LINE));
      
      return apiRequest("PUT", `/api/descriptors/rvc/${descriptorsRvc.id}`, {
        enterpriseId: property.enterpriseId,
        headerLines: cleanHeader,
        trailerLines: cleanTrailer,
        logoEnabled: false,
        logoAssetId: null,
        overrideHeader,
        overrideTrailer,
        overrideLogo: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/descriptors"] });
      handleCancelDescriptors();
      toast({ title: "Descriptors saved successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save descriptors", description: error.message, variant: "destructive" });
    },
  });

  const openDescriptors = async (rvc: Rvc) => {
    setDescriptorsRvc(rvc);
    try {
      const response = await failoverFetch(`/api/descriptors/rvc/${rvc.id}`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (response.ok) {
        const data: DescriptorSet = await response.json();
        const newHeader = Array(MAX_HEADER_LINES).fill("");
        const newTrailer = Array(MAX_TRAILER_LINES).fill("");
        (data.headerLines || []).forEach((line, i) => { if (i < MAX_HEADER_LINES) newHeader[i] = line; });
        (data.trailerLines || []).forEach((line, i) => { if (i < MAX_TRAILER_LINES) newTrailer[i] = line; });
        setHeaderLines(newHeader);
        setTrailerLines(newTrailer);
        setOverrideHeader(data.overrideHeader ?? false);
        setOverrideTrailer(data.overrideTrailer ?? false);
      } else {
        setHeaderLines(Array(MAX_HEADER_LINES).fill(""));
        setTrailerLines(Array(MAX_TRAILER_LINES).fill(""));
        setOverrideHeader(false);
        setOverrideTrailer(false);
      }
    } catch {
      setHeaderLines(Array(MAX_HEADER_LINES).fill(""));
      setTrailerLines(Array(MAX_TRAILER_LINES).fill(""));
      setOverrideHeader(false);
      setOverrideTrailer(false);
    }
    setDescriptorsOpen(true);
  };

  const handleLineChange = (type: "header" | "trailer", index: number, value: string) => {
    const truncated = value.substring(0, MAX_CHARS_PER_LINE);
    if (type === "header") {
      const newLines = [...headerLines];
      newLines[index] = truncated;
      setHeaderLines(newLines);
    } else {
      const newLines = [...trailerLines];
      newLines[index] = truncated;
      setTrailerLines(newLines);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!rvcName || !rvcCode || !rvcPropertyId) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }

    const data: InsertRvc = {
      name: rvcName,
      code: rvcCode,
      propertyId: rvcPropertyId,
      defaultOrderType,
      fastTransactionDefault,
      dynamicOrderMode,
      domSendMode,
      conversationalOrderingEnabled,
    } as InsertRvc;

    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleCancel = () => {
    setFormOpen(false);
    setEditingItem(null);
    resetForm();
  };

  const handleCancelDescriptors = () => {
    setDescriptorsOpen(false);
    setDescriptorsRvc(null);
  };

  if (descriptorsOpen) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Receipt Descriptors - {descriptorsRvc?.name}
              </CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancelDescriptors} data-testid="button-cancel-descriptors">
                  Cancel
                </Button>
                <Button onClick={() => saveDescriptorsMutation.mutate()} disabled={saveDescriptorsMutation.isPending} data-testid="button-save-descriptors">
                  {saveDescriptorsMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Descriptors
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Configure receipt header and trailer lines for this RVC. These override property-level settings.
            </p>

            <div className="flex flex-wrap gap-4 p-4 bg-muted/50 rounded-md">
              <div className="flex items-center gap-2">
                <Switch
                  checked={overrideHeader}
                  onCheckedChange={setOverrideHeader}
                  data-testid="switch-rvc-override-header"
                />
                <Label>Override Header</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={overrideTrailer}
                  onCheckedChange={setOverrideTrailer}
                  data-testid="switch-rvc-override-trailer"
                />
                <Label>Override Trailer</Label>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <Label className="text-base font-medium">Header Lines</Label>
                  <span className="text-xs text-muted-foreground">
                    {headerLines.filter(l => l.trim()).length} / {MAX_HEADER_LINES} used
                  </span>
                </div>
                <ScrollArea className="h-[300px] border rounded-md p-3">
                  <div className="space-y-2">
                    {headerLines.map((line, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{i + 1}</span>
                        <Input
                          value={line}
                          onChange={(e) => handleLineChange("header", i, e.target.value)}
                          placeholder={i === 0 ? "Business Name" : ""}
                          className="font-mono text-sm"
                          maxLength={MAX_CHARS_PER_LINE}
                          disabled={!overrideHeader}
                          data-testid={`input-rvc-header-${i}`}
                        />
                        <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
                          {line.length}/{MAX_CHARS_PER_LINE}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <Label className="text-base font-medium">Trailer Lines</Label>
                  <span className="text-xs text-muted-foreground">
                    {trailerLines.filter(l => l.trim()).length} / {MAX_TRAILER_LINES} used
                  </span>
                </div>
                <ScrollArea className="h-[300px] border rounded-md p-3">
                  <div className="space-y-2">
                    {trailerLines.map((line, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{i + 1}</span>
                        <Input
                          value={line}
                          onChange={(e) => handleLineChange("trailer", i, e.target.value)}
                          placeholder={i === 0 ? "Thank you message" : ""}
                          className="font-mono text-sm"
                          maxLength={MAX_CHARS_PER_LINE}
                          disabled={!overrideTrailer}
                          data-testid={`input-rvc-trailer-${i}`}
                        />
                        <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
                          {line.length}/{MAX_CHARS_PER_LINE}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (formOpen) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle>{editingItem ? "Edit Revenue Center" : "Add Revenue Center"}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel-rvc">
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit-rvc"
                >
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingItem ? "Save Changes" : "Create RVC"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rvcName">RVC Name *</Label>
                  <Input
                    id="rvcName"
                    value={rvcName}
                    onChange={(e) => setRvcName(e.target.value)}
                    placeholder="Enter name"
                    data-testid="input-rvc-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rvcCode">Code *</Label>
                  <Input
                    id="rvcCode"
                    value={rvcCode}
                    onChange={(e) => setRvcCode(e.target.value)}
                    placeholder="e.g., RVC001"
                    data-testid="input-rvc-code"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rvcProperty">Property *</Label>
                  <Select value={rvcPropertyId} onValueChange={setRvcPropertyId}>
                    <SelectTrigger data-testid="select-rvc-property">
                      <SelectValue placeholder="Select property" />
                    </SelectTrigger>
                    <SelectContent>
                      {properties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="orderType">Default Order Type</Label>
                  <Select value={defaultOrderType} onValueChange={setDefaultOrderType}>
                    <SelectTrigger data-testid="select-order-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t.replace("_", " ").toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="domMode">DOM Send Mode</Label>
                  <Select value={domSendMode} onValueChange={setDomSendMode}>
                    <SelectTrigger data-testid="select-dom-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOM_SEND_MODES.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {mode === "fire_on_fly" ? "Fire on Fly (immediate)" :
                           mode === "fire_on_next" ? "Fire on Next (when next item rung)" :
                           "Fire on Tender (when payment made)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">When Dynamic Order Mode is enabled, controls when items are sent to KDS</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="flex items-center space-x-2 pt-2">
                  <Switch
                    id="fastTransaction"
                    checked={fastTransactionDefault}
                    onCheckedChange={setFastTransactionDefault}
                    data-testid="switch-fast-transaction"
                  />
                  <div>
                    <Label htmlFor="fastTransaction">Fast Transaction Mode</Label>
                    <p className="text-xs text-muted-foreground">Enable fast transaction mode by default for this RVC</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 pt-2">
                  <Switch
                    id="dynamicOrder"
                    checked={dynamicOrderMode}
                    onCheckedChange={setDynamicOrderMode}
                    data-testid="switch-dynamic-order"
                  />
                  <div>
                    <Label htmlFor="dynamicOrder">Dynamic Order Mode</Label>
                    <p className="text-xs text-muted-foreground">Items appear on KDS immediately when added to check</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 pt-2">
                  <Switch
                    id="conversational"
                    checked={conversationalOrderingEnabled}
                    onCheckedChange={setConversationalOrderingEnabled}
                    data-testid="switch-conversational"
                  />
                  <div>
                    <Label htmlFor="conversational">Conversational Ordering</Label>
                    <p className="text-xs text-muted-foreground">Enable MICROS RES 3700-style conversational ordering</p>
                  </div>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        {editingItem && selectedEnterpriseId && (
          <OptionBitsPanel
            entityType="rvc"
            entityId={editingItem.id}
            enterpriseId={selectedEnterpriseId}
            currentScopeLevel={contextPropertyId ? "property" : "enterprise"}
            currentScopeId={contextPropertyId || selectedEnterpriseId}
            scopeChain={[
              { level: "enterprise", id: selectedEnterpriseId },
              ...(contextPropertyId ? [{ level: "property", id: contextPropertyId }] : []),
            ]}
            scopeLabel={`Editing at ${contextPropertyId ? "Property" : "Enterprise"} scope`}
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-6">
      <DataTable
        data={rvcs}
        columns={columns}
        title="Revenue Centers"
        onAdd={() => {
          setEditingItem(null);
          setFormOpen(true);
        }}
        onEdit={(item) => {
          setEditingItem(item);
          setFormOpen(true);
        }}
        onDelete={(item) => deleteMutation.mutate(item.id)}
        isLoading={isLoading}
        searchPlaceholder="Search RVCs..."
        emptyMessage="No revenue centers configured"
      />
    </div>
  );
}
