import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEmcFilter } from "@/lib/emc-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { type CalPackage, type CalPackageVersion, type CalDeployment, type Enterprise, type Workstation, CAL_PACKAGE_TYPES, CAL_DEPLOYMENT_ACTIONS, CAL_VERSION_REGEX, CAL_VERSION_FORMAT_MESSAGE } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Package,
  ChevronRight,
  ChevronDown,
  Plus,
  Rocket,
  Server,
  Printer,
  Monitor,
  CreditCard,
  Settings,
  FolderOpen,
  FileBox,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PACKAGE_TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  service_host: Server,
  service_host_prereqs: Settings,
  caps: Server,
  print_controller: Printer,
  kds_controller: Monitor,
  kds_handler: Monitor,
  kds_client: Monitor,
  payment_controller: CreditCard,
  cal_client: Package,
  custom: FolderOpen,
};

const PACKAGE_TYPE_LABELS: Record<string, string> = {
  service_host: "Service Host",
  service_host_prereqs: "Service Host Prereqs",
  caps: "CAPS (Check & Posting)",
  print_controller: "Print Controller",
  kds_controller: "KDS Controller",
  kds_handler: "KDS Handler",
  kds_client: "KDS Client",
  payment_controller: "Payment Controller",
  cal_client: "CAL Client",
  custom: "Custom",
};

type InlineFormMode = null | "add-package" | "edit-package" | "add-version" | "deploy";

export default function CalPackagesPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, scopePayload } = useEmcFilter();
  const [selectedPackage, setSelectedPackage] = useState<CalPackage | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<CalPackageVersion | null>(null);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [inlineForm, setInlineForm] = useState<InlineFormMode>(null);

  const [pkgName, setPkgName] = useState("");
  const [pkgType, setPkgType] = useState("service_host");
  const [pkgDescription, setPkgDescription] = useState("");

  const [versionNumber, setVersionNumber] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [versionError, setVersionError] = useState("");
  const [urlError, setUrlError] = useState("");

  const [deploymentScope, setDeploymentScope] = useState("property");
  const [deployAction, setDeployAction] = useState("install");

  const { data: packages = [], isLoading: packagesLoading } = useQuery<CalPackage[]>({
    queryKey: ["/api/cal-packages", filterKeys],
    queryFn: async () => {
      if (!selectedEnterpriseId) return [];
      const res = await failoverFetch(`/api/cal-packages${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch CAL packages");
      return res.json();
    },
    enabled: !!selectedEnterpriseId,
  });

  const { data: versions = [] } = useQuery<CalPackageVersion[]>({
    queryKey: ["/api/cal-packages", selectedPackage?.id, "versions", filterKeys],
    queryFn: async () => {
      if (!selectedPackage) return [];
      const res = await failoverFetch(`/api/cal-packages/${selectedPackage.id}/versions${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch versions");
      return res.json();
    },
    enabled: !!selectedPackage,
  });

  const { data: deployments = [] } = useQuery<CalDeployment[]>({
    queryKey: ["/api/cal-deployments", filterKeys],
    queryFn: async () => {
      if (!selectedEnterpriseId) return [];
      const res = await failoverFetch(`/api/cal-deployments${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch deployments");
      return res.json();
    },
    enabled: !!selectedEnterpriseId,
  });

  const packagesByType = packages.reduce((acc, pkg) => {
    const type = pkg.packageType;
    if (!acc[type]) acc[type] = [];
    acc[type].push(pkg);
    return acc;
  }, {} as Record<string, CalPackage[]>);

  const toggleType = (type: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const resetPackageForm = () => {
    setPkgName("");
    setPkgType("service_host");
    setPkgDescription("");
  };

  const resetVersionForm = () => {
    setVersionNumber("");
    setReleaseNotes("");
    setDownloadUrl("");
    setVersionError("");
    setUrlError("");
  };

  const resetDeployForm = () => {
    setDeploymentScope("property");
    setDeployAction("install");
  };

  const handleCancelInlineForm = () => {
    setInlineForm(null);
    resetPackageForm();
    resetVersionForm();
    resetDeployForm();
  };

  const openAddPackage = () => {
    resetPackageForm();
    setInlineForm("add-package");
  };

  const openEditPackage = () => {
    if (selectedPackage) {
      setPkgName(selectedPackage.name);
      setPkgDescription(selectedPackage.description || "");
      setInlineForm("edit-package");
    }
  };

  const openAddVersion = () => {
    resetVersionForm();
    setInlineForm("add-version");
  };

  const openDeploy = () => {
    resetDeployForm();
    setInlineForm("deploy");
  };

  const createPackageMutation = useMutation({
    mutationFn: async (data: { name: string; packageType: string; description: string }) => {
      const res = await apiRequest("POST", "/api/cal-packages", {
        ...data,
        ...scopePayload,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cal-packages", filterKeys] });
      setInlineForm(null);
      resetPackageForm();
      toast({ title: "CAL package created" });
    },
    onError: () => {
      toast({ title: "Failed to create package", variant: "destructive" });
    },
  });

  const createVersionMutation = useMutation({
    mutationFn: async (data: { version: string; releaseNotes: string; downloadUrl: string }) => {
      const res = await apiRequest("POST", "/api/cal-package-versions", {
        ...data,
        packageId: selectedPackage?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cal-packages", selectedPackage?.id, "versions", filterKeys] });
      setInlineForm(null);
      resetVersionForm();
      toast({ title: "Version created" });
    },
    onError: () => {
      toast({ title: "Failed to create version", variant: "destructive" });
    },
  });

  const updatePackageMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const res = await apiRequest("PATCH", `/api/cal-packages/${selectedPackage?.id}`, data);
      return res.json();
    },
    onSuccess: (updatedPackage) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cal-packages", filterKeys] });
      setInlineForm(null);
      setSelectedPackage(updatedPackage);
      resetPackageForm();
      toast({ title: "Package updated" });
    },
    onError: () => {
      toast({ title: "Failed to update package", variant: "destructive" });
    },
  });

  const deletePackageMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/cal-packages/${selectedPackage?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cal-packages", filterKeys] });
      setShowDeleteConfirm(false);
      setSelectedPackage(null);
      setSelectedVersion(null);
      toast({ title: "Package deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete package", variant: "destructive" });
    },
  });

  const createDeploymentMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string> = {
        ...scopePayload,
        packageVersionId: selectedVersion!.id,
        deploymentScope,
        action: deployAction,
      };
      
      const res = await apiRequest("POST", "/api/cal-deployments", payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create deployment");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cal-deployments", filterKeys] });
      setInlineForm(null);
      resetDeployForm();
      toast({ title: "Deployment scheduled" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Failed to create deployment", variant: "destructive" });
    },
  });

  const validateVersion = (v: string) => {
    if (!v) {
      setVersionError("");
      return false;
    }
    if (!CAL_VERSION_REGEX.test(v)) {
      setVersionError(CAL_VERSION_FORMAT_MESSAGE);
      return false;
    }
    setVersionError("");
    return true;
  };

  const validateUrl = (url: string) => {
    if (!url) {
      setUrlError("");
      return false;
    }
    try {
      new URL(url);
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        setUrlError("URL must start with http:// or https://");
        return false;
      }
      setUrlError("");
      return true;
    } catch {
      setUrlError("Please enter a valid URL");
      return false;
    }
  };

  const handleVersionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setVersionNumber(v);
    validateVersion(v);
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setDownloadUrl(url);
    validateUrl(url);
  };

  const handlePackageSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    createPackageMutation.mutate({ name: pkgName, packageType: pkgType, description: pkgDescription });
  };

  const handleEditPackageSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    updatePackageMutation.mutate({ name: pkgName, description: pkgDescription });
  };

  const handleVersionSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (validateVersion(versionNumber) && validateUrl(downloadUrl)) {
      createVersionMutation.mutate({ version: versionNumber, releaseNotes, downloadUrl });
    }
  };

  const handleDeploySubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    createDeploymentMutation.mutate();
  };

  const isVersionValid = versionNumber && CAL_VERSION_REGEX.test(versionNumber) && downloadUrl && !urlError;

  if (inlineForm === "add-package") {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>Add CAL Package</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancelInlineForm} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button
                  onClick={handlePackageSubmit}
                  disabled={createPackageMutation.isPending || !pkgName}
                  data-testid="button-save-package"
                >
                  {createPackageMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePackageSubmit} className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Package Name</Label>
                  <Input
                    value={pkgName}
                    onChange={(e) => setPkgName(e.target.value)}
                    placeholder="e.g., Service Host"
                    data-testid="input-package-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Package Type</Label>
                  <Select value={pkgType} onValueChange={setPkgType}>
                    <SelectTrigger data-testid="select-package-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAL_PACKAGE_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {PACKAGE_TYPE_LABELS[type] || type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={pkgDescription}
                    onChange={(e) => setPkgDescription(e.target.value)}
                    placeholder="Optional description"
                    data-testid="input-package-description"
                  />
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (inlineForm === "edit-package" && selectedPackage) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>Edit CAL Package</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancelInlineForm} data-testid="button-cancel-edit">
                  Cancel
                </Button>
                <Button
                  onClick={handleEditPackageSubmit}
                  disabled={updatePackageMutation.isPending || !pkgName}
                  data-testid="button-save-edit-package"
                >
                  {updatePackageMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleEditPackageSubmit} className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Package Name</Label>
                  <Input
                    value={pkgName}
                    onChange={(e) => setPkgName(e.target.value)}
                    placeholder="e.g., Service Host"
                    data-testid="input-edit-package-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Package Type</Label>
                  <Badge variant="secondary">{PACKAGE_TYPE_LABELS[selectedPackage.packageType] || selectedPackage.packageType}</Badge>
                  <p className="text-xs text-muted-foreground">Package type cannot be changed after creation</p>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={pkgDescription}
                    onChange={(e) => setPkgDescription(e.target.value)}
                    placeholder="Optional description"
                    data-testid="input-edit-package-description"
                  />
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (inlineForm === "add-version") {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>Add Version</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancelInlineForm} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button
                  onClick={handleVersionSubmit}
                  disabled={createVersionMutation.isPending || !isVersionValid}
                  data-testid="button-save-version"
                >
                  {createVersionMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVersionSubmit} className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Version</Label>
                  <Input
                    value={versionNumber}
                    onChange={handleVersionChange}
                    placeholder="e.g., 1.0.0"
                    data-testid="input-version"
                    className={versionError ? "border-destructive" : ""}
                  />
                  <p className="text-xs text-muted-foreground">
                    Format: X.X.X (Major.Patch.Hotfix) - e.g., 1.0.0, 3.5.2, 19.3.1
                  </p>
                  {versionError && (
                    <p className="text-xs text-destructive">{versionError}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Download URL <span className="text-destructive">*</span></Label>
                  <Input
                    value={downloadUrl}
                    onChange={handleUrlChange}
                    placeholder="https://example.com/packages/mypackage-1.0.0.tar.gz"
                    data-testid="input-download-url"
                    className={urlError ? "border-destructive" : ""}
                  />
                  <p className="text-xs text-muted-foreground">
                    URL where Service Hosts will download the .tar.gz package file
                  </p>
                  {urlError && (
                    <p className="text-xs text-destructive">{urlError}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Release Notes</Label>
                  <Textarea
                    value={releaseNotes}
                    onChange={(e) => setReleaseNotes(e.target.value)}
                    placeholder="What's new in this version"
                    data-testid="input-release-notes"
                  />
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (inlineForm === "deploy" && selectedVersion) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>Deploy {selectedVersion.version}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancelInlineForm} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button
                  onClick={handleDeploySubmit}
                  disabled={createDeploymentMutation.isPending}
                  data-testid="button-deploy-confirm"
                >
                  {createDeploymentMutation.isPending ? "Deploying..." : "Deploy"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleDeploySubmit} className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Deployment Scope</Label>
                  <Select value={deploymentScope} onValueChange={setDeploymentScope}>
                    <SelectTrigger data-testid="select-deployment-scope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enterprise">Enterprise (All Properties)</SelectItem>
                      <SelectItem value="property">Property</SelectItem>
                      <SelectItem value="workstation">Workstation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Action</Label>
                  <Select value={deployAction} onValueChange={setDeployAction}>
                    <SelectTrigger data-testid="select-action">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAL_DEPLOYMENT_ACTIONS.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a.charAt(0).toUpperCase() + a.slice(1)}
                        </SelectItem>
                      ))}
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
    <div className="p-6">
      <div className="flex items-center justify-between gap-2 mb-6">
        <div>
          <h1 className="text-2xl font-bold">CAL Packages</h1>
          <p className="text-muted-foreground">Configuration Application Loader - Manage and deploy software packages</p>
        </div>
        <Button onClick={openAddPackage} data-testid="button-add-package">
          <Plus className="h-4 w-4 mr-2" />
          Add Package
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Package Tree</CardTitle>
              <CardDescription>Select a package to view versions</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {packagesLoading ? (
                <div className="p-4 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                </div>
              ) : Object.keys(packagesByType).length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No packages configured
                </div>
              ) : (
                <div className="divide-y">
                  {CAL_PACKAGE_TYPES.map((type) => {
                    const typePackages = packagesByType[type] || [];
                    if (typePackages.length === 0) return null;
                    
                    const Icon = PACKAGE_TYPE_ICONS[type] || Package;
                    const isExpanded = expandedTypes.has(type);
                    
                    return (
                      <Collapsible key={type} open={isExpanded} onOpenChange={() => toggleType(type)}>
                        <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 hover:bg-muted/50 text-left" data-testid={`toggle-type-${type}`}>
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <Icon className="h-4 w-4 text-primary" />
                          <span className="font-medium text-sm">{PACKAGE_TYPE_LABELS[type] || type}</span>
                          <Badge variant="secondary" className="ml-auto">{typePackages.length}</Badge>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="pl-9 pb-2">
                            {typePackages.map((pkg) => (
                              <button
                                key={pkg.id}
                                onClick={() => {
                                  setSelectedPackage(pkg);
                                  setSelectedVersion(null);
                                }}
                                className={`flex items-center gap-2 w-full p-2 rounded-md text-left text-sm ${
                                  selectedPackage?.id === pkg.id
                                    ? "bg-primary/10 text-primary"
                                    : "hover:bg-muted/50"
                                }`}
                                data-testid={`select-package-${pkg.id}`}
                              >
                                <FileBox className="h-4 w-4" />
                                <span>{pkg.name}</span>
                              </button>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Recent Deployments</CardTitle>
            </CardHeader>
            <CardContent>
              {deployments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deployments</p>
              ) : (
                <div className="space-y-2">
                  {deployments.slice(0, 5).map((deployment: CalDeployment & { packageName?: string; versionNumber?: string; targetName?: string; overallStatus?: string }) => (
                    <div key={deployment.id} className="flex flex-col gap-1 text-sm p-2 rounded-md bg-muted/30">
                      <div className="flex items-center gap-2">
                        {deployment.overallStatus === "completed" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                        {deployment.overallStatus === "failed" && <XCircle className="h-4 w-4 text-red-600" />}
                        {deployment.overallStatus === "pending" && <Clock className="h-4 w-4 text-amber-600" />}
                        {(deployment.overallStatus === "downloading" || deployment.overallStatus === "installing") && <Clock className="h-4 w-4 text-blue-600 animate-pulse" />}
                        <span className="font-medium truncate">{deployment.packageName || "Unknown Package"}</span>
                        <Badge variant="secondary" className="text-xs">{deployment.versionNumber || "?"}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground pl-6">
                        <span className="capitalize">{deployment.action}</span>
                        <span>→</span>
                        <span>{deployment.targetName || deployment.deploymentScope}</span>
                        <Badge 
                          variant={deployment.overallStatus === "completed" ? "default" : deployment.overallStatus === "failed" ? "destructive" : "outline"} 
                          className="text-xs ml-auto"
                        >
                          {deployment.overallStatus || "pending"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-8">
          {selectedPackage ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle>{selectedPackage.name}</CardTitle>
                    <CardDescription>{selectedPackage.description || "No description"}</CardDescription>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={openEditPackage} data-testid="button-edit-package">
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(true)} data-testid="button-delete-package">
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                    <Button variant="outline" size="sm" onClick={openAddVersion} data-testid="button-add-version">
                      <Plus className="h-4 w-4 mr-1" />
                      Add Version
                    </Button>
                    {selectedVersion && (
                      <Button size="sm" onClick={openDeploy} data-testid="button-deploy">
                        <Rocket className="h-4 w-4 mr-1" />
                        Deploy
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <span>Package Type:</span>
                    <Badge variant="secondary">{PACKAGE_TYPE_LABELS[selectedPackage.packageType] || selectedPackage.packageType}</Badge>
                  </div>
                </div>

                <h4 className="font-medium mb-3">Versions</h4>
                {versions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No versions available</p>
                ) : (
                  <div className="space-y-2">
                    {versions.map((version) => (
                      <div
                        key={version.id}
                        onClick={() => setSelectedVersion(version)}
                        className={`p-3 rounded-md border cursor-pointer ${
                          selectedVersion?.id === version.id
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                        data-testid={`select-version-${version.id}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{version.version}</span>
                            {version.isLatest && (
                              <Badge className="bg-green-600">Latest</Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {version.releasedAt ? new Date(version.releasedAt).toLocaleDateString() : "N/A"}
                          </span>
                        </div>
                        {version.releaseNotes && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {version.releaseNotes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">Select a package from the tree to view details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete CAL Package</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedPackage?.name}"? This action cannot be undone.
              All versions and deployment history for this package will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePackageMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deletePackageMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
