import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { useEmcFilter } from "@/lib/emc-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { Loader2, Plus, Download, FileText, DollarSign, Calculator } from "lucide-react";
import type { Property, GlMapping, AccountingExport } from "@shared/schema";

const MAPPING_TYPES = ["revenue", "tax", "tender", "discount", "tip", "labor", "expense"];
const EXPORT_FORMATS = ["csv", "qbo", "iif"];

export default function AccountingExportPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, scopePayload, selectedPropertyId: contextPropertyId } = useEmcFilter();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(contextPropertyId || "");

  useEffect(() => {
    if (contextPropertyId) {
      setSelectedPropertyId(contextPropertyId);
    }
  }, [contextPropertyId]);
  const [showMappingForm, setShowMappingForm] = useState(false);
  const [showExportForm, setShowExportForm] = useState(false);
  const [editingMapping, setEditingMapping] = useState<GlMapping | null>(null);

  const [mappingType, setMappingType] = useState("revenue");
  const [mappingName, setMappingName] = useState("");
  const [glAccountCode, setGlAccountCode] = useState("");
  const [glAccountName, setGlAccountName] = useState("");

  const [exportFormat, setExportFormat] = useState("csv");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: glMappings = [], isLoading: mappingsLoading } = useQuery<GlMapping[]>({
    queryKey: ["/api/gl-mappings", selectedPropertyId, filterKeys],
    enabled: !!selectedPropertyId,
    queryFn: async () => {
      const entParam = selectedEnterpriseId ? `&enterpriseId=${selectedEnterpriseId}` : "";
      const res = await failoverFetch(`/api/gl-mappings?propertyId=${selectedPropertyId}${entParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch GL mappings");
      return res.json();
    },
  });

  const { data: exports = [], isLoading: exportsLoading } = useQuery<AccountingExport[]>({
    queryKey: ["/api/accounting-exports", selectedPropertyId, filterKeys],
    enabled: !!selectedPropertyId,
    queryFn: async () => {
      const entParam = selectedEnterpriseId ? `&enterpriseId=${selectedEnterpriseId}` : "";
      const res = await failoverFetch(`/api/accounting-exports?propertyId=${selectedPropertyId}${entParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch exports");
      return res.json();
    },
  });

  const createMappingMutation = useMutation({
    mutationFn: async (data: Partial<GlMapping>) => {
      const res = await apiRequest("POST", "/api/gl-mappings", { ...data, ...scopePayload });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gl-mappings"] });
      handleCancelMapping();
      toast({ title: "Mapping Created", description: "GL mapping has been created." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMappingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<GlMapping> }) => {
      const res = await apiRequest("PATCH", `/api/gl-mappings/${id}`, { ...data, ...scopePayload });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gl-mappings"] });
      handleCancelMapping();
      toast({ title: "Mapping Updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const generateExportMutation = useMutation({
    mutationFn: async (data: { propertyId: string; startDate: string; endDate: string; format: string }) => {
      const res = await apiRequest("POST", "/api/accounting-exports/generate", { ...data, ...scopePayload });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting-exports"] });
      handleCancelExport();
      toast({ title: "Export Generated", description: "Your export file is ready for download." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetMappingForm = () => {
    setMappingType("revenue");
    setMappingName("");
    setGlAccountCode("");
    setGlAccountName("");
    setEditingMapping(null);
  };

  const resetExportForm = () => {
    setExportFormat("csv");
    setStartDate(format(subDays(new Date(), 7), "yyyy-MM-dd"));
    setEndDate(format(new Date(), "yyyy-MM-dd"));
  };

  const handleCancelMapping = () => {
    setShowMappingForm(false);
    setEditingMapping(null);
    resetMappingForm();
  };

  const handleCancelExport = () => {
    setShowExportForm(false);
    resetExportForm();
  };

  const openEditMapping = (mapping: GlMapping) => {
    setEditingMapping(mapping);
    setMappingType(mapping.sourceType);
    setMappingName(mapping.description || "");
    setGlAccountCode(mapping.glAccountCode);
    setGlAccountName(mapping.glAccountName || "");
    setShowMappingForm(true);
  };

  const handleSaveMapping = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!mappingName || !glAccountCode) return;
    
    const data = {
      propertyId: selectedPropertyId,
      sourceType: mappingType,
      description: mappingName,
      glAccountCode,
      glAccountName: glAccountName || undefined,
    };

    if (editingMapping) {
      updateMappingMutation.mutate({ id: editingMapping.id, data });
    } else {
      createMappingMutation.mutate(data);
    }
  };

  const handleGenerateExport = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedPropertyId) return;
    generateExportMutation.mutate({
      propertyId: selectedPropertyId,
      startDate,
      endDate,
      formatType: exportFormat,
    });
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      revenue: "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
      tax: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
      tender: "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400",
      discount: "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400",
      tip: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400",
      labor: "bg-pink-100 text-pink-800 dark:bg-pink-900/20 dark:text-pink-400",
      expense: "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400",
    };
    return <Badge className={colors[type] || ""} variant="outline">{type}</Badge>;
  };

  const groupedMappings = MAPPING_TYPES.reduce((acc, type) => {
    acc[type] = glMappings.filter(m => m.sourceType === type);
    return acc;
  }, {} as Record<string, GlMapping[]>);

  if (showMappingForm) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle>{editingMapping ? "Edit GL Mapping" : "Add GL Mapping"}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancelMapping} data-testid="button-cancel-mapping">
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveMapping}
                  disabled={!mappingName || !glAccountCode || createMappingMutation.isPending || updateMappingMutation.isPending}
                  data-testid="button-save-mapping"
                >
                  {(createMappingMutation.isPending || updateMappingMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingMapping ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveMapping} className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Mapping Type</Label>
                  <Select value={mappingType} onValueChange={setMappingType}>
                    <SelectTrigger data-testid="select-mapping-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MAPPING_TYPES.map(t => (
                        <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={mappingName} onChange={(e) => setMappingName(e.target.value)} placeholder="e.g., Food Sales" data-testid="input-mapping-name" />
                </div>
                <div className="space-y-2">
                  <Label>GL Account Code</Label>
                  <Input value={glAccountCode} onChange={(e) => setGlAccountCode(e.target.value)} placeholder="e.g., 4000" data-testid="input-gl-code" />
                </div>
                <div className="space-y-2">
                  <Label>GL Account Name (optional)</Label>
                  <Input value={glAccountName} onChange={(e) => setGlAccountName(e.target.value)} placeholder="e.g., Sales Revenue" data-testid="input-gl-name" />
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showExportForm) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle>Generate Accounting Export</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancelExport} data-testid="button-cancel-export">
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerateExport}
                  disabled={generateExportMutation.isPending}
                  data-testid="button-generate-export"
                >
                  {generateExportMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Generate Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleGenerateExport} className="space-y-4">
              <p className="text-sm text-muted-foreground">Select a date range and format to generate an export file.</p>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-start-date" />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="input-end-date" />
                </div>
                <div className="space-y-2">
                  <Label>Export Format</Label>
                  <Select value={exportFormat} onValueChange={setExportFormat}>
                    <SelectTrigger data-testid="select-format"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="csv">CSV (Comma Separated)</SelectItem>
                      <SelectItem value="qbo">QBO (QuickBooks Online)</SelectItem>
                      <SelectItem value="iif">IIF (QuickBooks Desktop)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Accounting Export</h1>
          <p className="text-muted-foreground">Configure GL mappings and generate accounting exports</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Property</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
            <SelectTrigger className="w-64" data-testid="select-property">
              <SelectValue placeholder="Select a property..." />
            </SelectTrigger>
            <SelectContent>
              {properties.map(prop => (
                <SelectItem key={prop.id} value={prop.id}>{prop.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedPropertyId && (
        <Tabs defaultValue="mappings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="mappings" data-testid="tab-mappings">GL Mappings</TabsTrigger>
            <TabsTrigger value="exports" data-testid="tab-exports">Export History</TabsTrigger>
          </TabsList>

          <TabsContent value="mappings" className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button onClick={() => setShowMappingForm(true)} data-testid="button-add-mapping">
                <Plus className="w-4 h-4 mr-2" />
                Add Mapping
              </Button>
              <Button variant="outline" onClick={() => setShowExportForm(true)} data-testid="button-export">
                <Download className="w-4 h-4 mr-2" />
                Generate Export
              </Button>
            </div>

            {mappingsLoading ? (
              <Card><CardContent className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
            ) : glMappings.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">
                <Calculator className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                No GL mappings configured. Add mappings to link POS data to your accounting system.
              </CardContent></Card>
            ) : (
              <div className="space-y-6">
                {MAPPING_TYPES.map(type => {
                  const mappings = groupedMappings[type];
                  if (mappings.length === 0) return null;
                  return (
                    <Card key={type}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          {getTypeBadge(type)}
                          <span className="capitalize">{type} Mappings</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>GL Account Code</TableHead>
                              <TableHead>GL Account Name</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mappings.map(mapping => (
                              <TableRow key={mapping.id} data-testid={`row-mapping-${mapping.id}`}>
                                <TableCell className="font-medium">{mapping.description || mapping.sourceId || "-"}</TableCell>
                                <TableCell className="font-mono">{mapping.glAccountCode}</TableCell>
                                <TableCell>{mapping.glAccountName || "-"}</TableCell>
                                <TableCell>
                                  <Button size="sm" variant="ghost" onClick={() => openEditMapping(mapping)}>
                                    Edit
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="exports">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Export History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {exportsLoading ? (
                  <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
                ) : exports.length === 0 ? (
                  <p className="p-8 text-center text-muted-foreground">No exports generated yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date Range</TableHead>
                        <TableHead>Format</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exports.map(exp => (
                        <TableRow key={exp.id} data-testid={`row-export-${exp.id}`}>
                          <TableCell>{exp.startDate} - {exp.endDate}</TableCell>
                          <TableCell><Badge variant="outline">{exp.formatType?.toUpperCase()}</Badge></TableCell>
                          <TableCell>
                            <Badge variant={exp.status === "completed" ? "secondary" : "outline"}>{exp.status}</Badge>
                          </TableCell>
                          <TableCell>{exp.createdAt ? format(new Date(exp.createdAt), "MMM d, h:mm a") : "-"}</TableCell>
                          <TableCell>
                            {exp.status === "completed" && exp.downloadUrl && (
                              <Button size="sm" variant="outline" asChild>
                                <a href={exp.downloadUrl} download>
                                  <Download className="w-4 h-4 mr-1" />
                                  Download
                                </a>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
