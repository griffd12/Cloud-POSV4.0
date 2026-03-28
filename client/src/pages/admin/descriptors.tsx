import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { 
  Building2, 
  Store, 
  LayoutGrid, 
  FileText, 
  Upload, 
  Trash2, 
  Save, 
  RotateCcw,
  Image,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import type { Enterprise, Property, Rvc } from "@shared/schema";

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

interface DescriptorLogoAsset {
  id: string;
  enterpriseId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  checksum: string;
  uploadedAt: string;
}

const MAX_HEADER_LINES = 16;
const MAX_TRAILER_LINES = 16;
const MAX_CHARS_PER_LINE = 48;

export default function DescriptorsPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, scopePayload } = useEmcFilter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedRvcId, setSelectedRvcId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"enterprise" | "property" | "rvc">("enterprise");

  useEffect(() => {
    if (selectedPropertyId) {
      setActiveTab("property");
    } else {
      setActiveTab("enterprise");
      setSelectedRvcId("");
    }
  }, [selectedPropertyId]);
  
  const [headerLines, setHeaderLines] = useState<string[]>(Array(MAX_HEADER_LINES).fill(""));
  const [trailerLines, setTrailerLines] = useState<string[]>(Array(MAX_TRAILER_LINES).fill(""));
  const [logoEnabled, setLogoEnabled] = useState(false);
  const [selectedLogoId, setSelectedLogoId] = useState<string | null>(null);
  const [overrideHeader, setOverrideHeader] = useState(false);
  const [overrideTrailer, setOverrideTrailer] = useState(false);
  const [overrideLogo, setOverrideLogo] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  const { data: enterprises = [] } = useQuery<Enterprise[]>({
    queryKey: ["/api/enterprises", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/enterprises${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: rvcs = [] } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/rvcs${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const selectedEnterprise = enterprises.find(e => e.id === selectedEnterpriseId);

  const filteredProperties = properties.filter(p => !selectedEnterpriseId || p.enterpriseId === selectedEnterpriseId);
  const filteredRvcs = rvcs.filter(r => !selectedPropertyId || r.propertyId === selectedPropertyId);

  const { data: descriptors = [], isLoading: loadingDescriptors } = useQuery<DescriptorSet[]>({
    queryKey: ["/api/descriptors", selectedEnterpriseId],
    queryFn: async () => {
      if (!selectedEnterpriseId) return [];
      const response = await failoverFetch(`/api/descriptors?enterpriseId=${selectedEnterpriseId}`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!selectedEnterpriseId,
  });

  const { data: logos = [] } = useQuery<DescriptorLogoAsset[]>({
    queryKey: ["/api/descriptor-logos", selectedEnterpriseId],
    queryFn: async () => {
      if (!selectedEnterpriseId) return [];
      const response = await failoverFetch(`/api/descriptor-logos?enterpriseId=${selectedEnterpriseId}`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!selectedEnterpriseId,
  });

  const getCurrentScopeId = () => {
    switch (activeTab) {
      case "enterprise": return selectedEnterpriseId;
      case "property": return selectedPropertyId;
      case "rvc": return selectedRvcId;
    }
  };

  const loadDescriptor = (descriptor: DescriptorSet | undefined) => {
    if (descriptor) {
      setHeaderLines([...descriptor.headerLines, ...Array(MAX_HEADER_LINES - descriptor.headerLines.length).fill("")].slice(0, MAX_HEADER_LINES));
      setTrailerLines([...descriptor.trailerLines, ...Array(MAX_TRAILER_LINES - descriptor.trailerLines.length).fill("")].slice(0, MAX_TRAILER_LINES));
      setLogoEnabled(descriptor.logoEnabled);
      setSelectedLogoId(descriptor.logoAssetId);
      setOverrideHeader(descriptor.overrideHeader);
      setOverrideTrailer(descriptor.overrideTrailer);
      setOverrideLogo(descriptor.overrideLogo);
    } else {
      setHeaderLines(Array(MAX_HEADER_LINES).fill(""));
      setTrailerLines(Array(MAX_TRAILER_LINES).fill(""));
      setLogoEnabled(false);
      setSelectedLogoId(null);
      setOverrideHeader(activeTab !== "enterprise");
      setOverrideTrailer(activeTab !== "enterprise");
      setOverrideLogo(activeTab !== "enterprise");
    }
    setHasChanges(false);
  };

  const currentDescriptor = descriptors.find(d => d.scopeType === activeTab && d.scopeId === getCurrentScopeId());

  useEffect(() => {
    if (descriptors.length > 0 || selectedEnterpriseId) {
      const scopeId = getCurrentScopeId();
      if (scopeId) {
        const descriptor = descriptors.find(d => d.scopeType === activeTab && d.scopeId === scopeId);
        loadDescriptor(descriptor);
      }
    }
  }, [descriptors, activeTab, selectedEnterpriseId, selectedPropertyId, selectedRvcId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const scopeId = getCurrentScopeId();
      if (!scopeId || !selectedEnterpriseId) throw new Error("Please select a scope");
      
      const cleanHeader = headerLines.filter(l => l.trim()).map(l => l.substring(0, MAX_CHARS_PER_LINE));
      const cleanTrailer = trailerLines.filter(l => l.trim()).map(l => l.substring(0, MAX_CHARS_PER_LINE));
      
      return apiRequest("PUT", `/api/descriptors/${activeTab}/${scopeId}`, {
        ...scopePayload,
        headerLines: cleanHeader,
        trailerLines: cleanTrailer,
        logoEnabled,
        logoAssetId: selectedLogoId,
        overrideHeader,
        overrideTrailer,
        overrideLogo,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/descriptors", filterKeys] });
      setHasChanges(false);
      toast({ title: "Descriptors saved successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const scopeId = getCurrentScopeId();
      if (!scopeId) throw new Error("No scope selected");
      return apiRequest("DELETE", `/api/descriptors/${activeTab}/${scopeId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/descriptors", filterKeys] });
      loadDescriptor(undefined);
      toast({ title: "Descriptors reset to inherit from parent" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reset", description: error.message, variant: "destructive" });
    },
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = async () => {
          const base64 = (reader.result as string).split(",")[1];
          try {
            const result = await apiRequest("POST", "/api/descriptor-logos", {
              ...scopePayload,
              filename: file.name,
              mimeType: file.type,
              base64Data: base64,
            });
            resolve(result);
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/descriptor-logos", filterKeys] });
      toast({ title: "Logo uploaded successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to upload logo", description: error.message, variant: "destructive" });
    },
  });

  const deleteLogoMutation = useMutation({
    mutationFn: async (logoId: string) => {
      return apiRequest("DELETE", `/api/descriptor-logos/${logoId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/descriptor-logos", filterKeys] });
      toast({ title: "Logo deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete logo", description: error.message, variant: "destructive" });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!["image/png", "image/bmp"].includes(file.type)) {
      toast({ title: "Invalid file type", description: "Only PNG and BMP files are supported for thermal printers", variant: "destructive" });
      return;
    }
    
    if (file.size > 200 * 1024) {
      toast({ title: "File too large", description: "Logo must be under 200KB", variant: "destructive" });
      return;
    }
    
    uploadLogoMutation.mutate(file);
    e.target.value = "";
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
    setHasChanges(true);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as "enterprise" | "property" | "rvc");
    const descriptor = descriptors.find(d => d.scopeType === tab && d.scopeId === (
      tab === "enterprise" ? selectedEnterpriseId :
      tab === "property" ? selectedPropertyId : selectedRvcId
    ));
    loadDescriptor(descriptor);
  };

  const getScopeIcon = (scope: string) => {
    switch (scope) {
      case "enterprise": return <Building2 className="w-4 h-4" />;
      case "property": return <Store className="w-4 h-4" />;
      case "rvc": return <LayoutGrid className="w-4 h-4" />;
    }
  };

  const getScopeName = () => {
    switch (activeTab) {
      case "enterprise": return enterprises.find(e => e.id === selectedEnterpriseId)?.name || "Select Enterprise";
      case "property": return filteredProperties.find(p => p.id === selectedPropertyId)?.name || "Select Property";
      case "rvc": return filteredRvcs.find(r => r.id === selectedRvcId)?.name || "Select RVC";
    }
  };

  const canEdit = () => {
    switch (activeTab) {
      case "enterprise": return !!selectedEnterpriseId;
      case "property": return !!selectedPropertyId;
      case "rvc": return !!selectedRvcId;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <FileText className="w-6 h-6" />
            Guest Check Descriptors
          </h1>
          <p className="text-muted-foreground">
            Configure receipt headers, trailers, and logos with enterprise-wide defaults and property/RVC overrides
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="outline" className="text-yellow-600 border-yellow-600">
              <AlertCircle className="w-3 h-3 mr-1" />
              Unsaved changes
            </Badge>
          )}
          <Button
            variant="outline"
            onClick={() => loadDescriptor(currentDescriptor)}
            disabled={!hasChanges}
            data-testid="button-revert"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Revert
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!canEdit() || saveMutation.isPending}
            data-testid="button-save"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Hierarchy Selection</CardTitle>
            <CardDescription>Select scope for configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Enterprise</Label>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span data-testid="text-enterprise-name">{selectedEnterprise?.name || "No enterprise selected"}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Property (Optional Override)</Label>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted text-muted-foreground">
                <Store className="h-4 w-4" />
                <span data-testid="text-property-name">{filteredProperties.find(p => p.id === selectedPropertyId)?.name || "All Properties (use filter bar)"}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Revenue Center (Optional Override)</Label>
              <Select
                value={selectedRvcId || "__none__"}
                onValueChange={(v) => {
                  const actualValue = v === "__none__" ? "" : v;
                  setSelectedRvcId(actualValue);
                  if (actualValue) setActiveTab("rvc");
                  else setActiveTab("property");
                }}
                disabled={!selectedPropertyId}
              >
                <SelectTrigger data-testid="select-rvc">
                  <SelectValue placeholder="Select RVC" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (Use Property)</SelectItem>
                  {filteredRvcs.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Configured Scopes</Label>
              {loadingDescriptors ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading...
                </div>
              ) : descriptors.length === 0 ? (
                <p className="text-sm text-muted-foreground">No descriptors configured yet</p>
              ) : (
                <div className="space-y-1">
                  {descriptors.map(d => (
                    <div key={d.id} className="flex items-center gap-2 text-sm">
                      {getScopeIcon(d.scopeType)}
                      <span className="truncate">
                        {d.scopeType === "enterprise" 
                          ? enterprises.find(e => e.id === d.scopeId)?.name
                          : d.scopeType === "property"
                          ? properties.find(p => p.id === d.scopeId)?.name
                          : rvcs.find(r => r.id === d.scopeId)?.name
                        }
                      </span>
                      <CheckCircle2 className="w-3 h-3 text-green-500 ml-auto shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {getScopeIcon(activeTab)}
                  {getScopeName()}
                </CardTitle>
                <CardDescription>
                  Configure receipt header and trailer lines (max {MAX_CHARS_PER_LINE} characters per line)
                </CardDescription>
              </div>
              {activeTab !== "enterprise" && currentDescriptor && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  data-testid="button-reset-inherit"
                >
                  <Trash2 className="w-3 h-3 mr-2" />
                  Reset to Inherit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!canEdit() ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Select an enterprise to configure descriptors</p>
              </div>
            ) : (
              <Tabs value={activeTab} onValueChange={handleTabChange}>
                <TabsList className="mb-4">
                  <TabsTrigger value="enterprise" disabled={!selectedEnterpriseId} data-testid="tab-enterprise">
                    <Building2 className="w-4 h-4 mr-2" />
                    Enterprise Default
                  </TabsTrigger>
                  <TabsTrigger value="property" disabled={!selectedPropertyId} data-testid="tab-property">
                    <Store className="w-4 h-4 mr-2" />
                    Property Override
                  </TabsTrigger>
                  <TabsTrigger value="rvc" disabled={!selectedRvcId} data-testid="tab-rvc">
                    <LayoutGrid className="w-4 h-4 mr-2" />
                    RVC Override
                  </TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className="space-y-6">
                  {activeTab !== "enterprise" && (
                    <Card className="bg-muted/50">
                      <CardContent className="pt-4">
                        <div className="flex flex-wrap gap-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={overrideHeader}
                              onCheckedChange={(v) => { setOverrideHeader(v); setHasChanges(true); }}
                              data-testid="switch-override-header"
                            />
                            <Label>Override Header</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={overrideTrailer}
                              onCheckedChange={(v) => { setOverrideTrailer(v); setHasChanges(true); }}
                              data-testid="switch-override-trailer"
                            />
                            <Label>Override Trailer</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={overrideLogo}
                              onCheckedChange={(v) => { setOverrideLogo(v); setHasChanges(true); }}
                              data-testid="switch-override-logo"
                            />
                            <Label>Override Logo</Label>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-medium">Header Lines (max {MAX_HEADER_LINES})</Label>
                        <span className="text-xs text-muted-foreground">
                          {headerLines.filter(l => l.trim()).length} / {MAX_HEADER_LINES} used
                        </span>
                      </div>
                      <ScrollArea className="h-[320px] border rounded-md p-3">
                        <div className="space-y-2">
                          {headerLines.map((line, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{i + 1}</span>
                              <Input
                                value={line}
                                onChange={(e) => handleLineChange("header", i, e.target.value)}
                                placeholder={i === 0 ? "Business Name (double size)" : i === 1 ? "Address Line 1" : ""}
                                className="font-mono text-sm"
                                maxLength={MAX_CHARS_PER_LINE}
                                disabled={activeTab !== "enterprise" && !overrideHeader}
                                data-testid={`input-header-${i}`}
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
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-medium">Trailer Lines (max {MAX_TRAILER_LINES})</Label>
                        <span className="text-xs text-muted-foreground">
                          {trailerLines.filter(l => l.trim()).length} / {MAX_TRAILER_LINES} used
                        </span>
                      </div>
                      <ScrollArea className="h-[320px] border rounded-md p-3">
                        <div className="space-y-2">
                          {trailerLines.map((line, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{i + 1}</span>
                              <Input
                                value={line}
                                onChange={(e) => handleLineChange("trailer", i, e.target.value)}
                                placeholder={i === 0 ? "Thank you message" : i === 1 ? "Website or phone" : ""}
                                className="font-mono text-sm"
                                maxLength={MAX_CHARS_PER_LINE}
                                disabled={activeTab !== "enterprise" && !overrideTrailer}
                                data-testid={`input-trailer-${i}`}
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

                  <Separator />

                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={logoEnabled}
                          onCheckedChange={(v) => { setLogoEnabled(v); setHasChanges(true); }}
                          disabled={activeTab !== "enterprise" && !overrideLogo}
                          data-testid="switch-logo-enabled"
                        />
                        <div>
                          <Label className="text-base font-medium">Print Logo</Label>
                          <p className="text-xs text-muted-foreground">Black/white monochrome image, 75-120px wide, PNG/BMP, max 200KB</p>
                        </div>
                      </div>
                      
                      <div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/bmp"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        <Button
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadLogoMutation.isPending || !selectedEnterpriseId}
                          data-testid="button-upload-logo"
                        >
                          {uploadLogoMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4 mr-2" />
                          )}
                          Upload Logo
                        </Button>
                      </div>
                    </div>

                    {logos.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {logos.map(logo => (
                          <div
                            key={logo.id}
                            onClick={() => { setSelectedLogoId(logo.id); setHasChanges(true); }}
                            className={`
                              relative border rounded-md p-2 cursor-pointer transition-all
                              ${selectedLogoId === logo.id ? "ring-2 ring-primary border-primary" : "hover-elevate"}
                              ${activeTab !== "enterprise" && !overrideLogo ? "opacity-50 pointer-events-none" : ""}
                            `}
                            data-testid={`logo-${logo.id}`}
                          >
                            <div className="aspect-square bg-muted rounded flex items-center justify-center overflow-hidden">
                              <img
                                src={`/api/descriptor-logos/${logo.id}/file`}
                                alt={logo.filename}
                                className="max-w-full max-h-full object-contain"
                              />
                            </div>
                            <p className="text-xs truncate mt-1 text-center">{logo.filename}</p>
                            {selectedLogoId === logo.id && (
                              <div className="absolute top-1 right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                                <CheckCircle2 className="w-3 h-3 text-primary-foreground" />
                              </div>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute bottom-1 right-1 w-6 h-6 opacity-0 hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (selectedLogoId === logo.id) setSelectedLogoId(null);
                                deleteLogoMutation.mutate(logo.id);
                              }}
                              data-testid={`button-delete-logo-${logo.id}`}
                            >
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {logos.length === 0 && (
                      <div className="text-center py-6 border rounded-md bg-muted/30">
                        <Image className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">No logos uploaded yet</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
