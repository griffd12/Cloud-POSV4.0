import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import {
  CheckCircle2,
  Circle,
  Building2,
  Store,
  LayoutGrid,
  Users,
  UtensilsCrossed,
  Printer,
  Tv2,
  CreditCard,
  Receipt,
  Shield,
  Wifi,
  Monitor,
  ArrowRight,
  Download,
  FileText,
  Rocket,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
  ChevronRight,
  Table2,
} from "lucide-react";

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  category: string;
  link?: string;
  autoCheck?: () => boolean;
}

const STORAGE_KEY = "pos-onboarding-checklist";
const IGNORE_AUTO_KEY = "pos-onboarding-ignore-auto";

export default function OnboardingPage() {
  const { data: stats } = useQuery<{
    enterprises: number;
    properties: number;
    rvcs: number;
    employees: number;
    menuItems: number;
  }>({
    queryKey: ["/api/admin/stats"],
  });

  const { data: printers = [] } = useQuery<{ id: string }[]>({
    queryKey: ["/api/printers"],
  });

  const { data: kdsDevices = [] } = useQuery<{ id: string }[]>({
    queryKey: ["/api/kds-devices"],
  });

  const { data: taxGroups = [] } = useQuery<{ id: string }[]>({
    queryKey: ["/api/tax-groups"],
  });

  const { data: tenders = [] } = useQuery<{ id: string }[]>({
    queryKey: ["/api/tenders"],
  });

  const checklistItems: ChecklistItem[] = [
    {
      id: "pre-1",
      title: "Sign customer contract",
      description: "Complete service agreement and payment terms with the customer",
      category: "Pre-Installation",
    },
    {
      id: "pre-2",
      title: "Collect customer information",
      description: "Business name, locations, contact details, menu data",
      category: "Pre-Installation",
    },
    {
      id: "pre-3",
      title: "Review hardware requirements",
      description: "Determine terminals, printers, KDS screens needed per location",
      category: "Pre-Installation",
    },
    {
      id: "pre-4",
      title: "Order/ship hardware to customer",
      description: "Tablets, printers, cash drawers, KDS displays, network equipment",
      category: "Pre-Installation",
    },
    {
      id: "hw-1",
      title: "Verify network connectivity",
      description: "Stable internet connection with backup (LTE failover recommended)",
      category: "Hardware Setup",
    },
    {
      id: "hw-2",
      title: "Install POS terminals/tablets",
      description: "Set up touchscreens, configure browser kiosk mode",
      category: "Hardware Setup",
    },
    {
      id: "hw-3",
      title: "Connect receipt printers",
      description: "Network printers preferred - assign static IP addresses",
      category: "Hardware Setup",
    },
    {
      id: "hw-4",
      title: "Install KDS displays",
      description: "Mount monitors, connect Chromebox/Android device, configure browser",
      category: "Hardware Setup",
    },
    {
      id: "hw-5",
      title: "Connect cash drawers",
      description: "Attach to receipt printer (printer-driven drawer kick)",
      category: "Hardware Setup",
    },
    {
      id: "hw-6",
      title: "Test all hardware connections",
      description: "Verify printers print, KDS displays show content, drawers open",
      category: "Hardware Setup",
    },
    {
      id: "cfg-1",
      title: "Create Enterprise",
      description: "Set up the customer's enterprise (parent organization)",
      category: "System Configuration",
      link: "/admin/enterprises",
      autoCheck: () => (stats?.enterprises || 0) > 0,
    },
    {
      id: "cfg-2",
      title: "Create Property (Location)",
      description: "Add each restaurant location under the enterprise",
      category: "System Configuration",
      link: "/admin/properties",
      autoCheck: () => (stats?.properties || 0) > 0,
    },
    {
      id: "cfg-3",
      title: "Create Revenue Center(s)",
      description: "Define RVCs for each property (e.g., Dine-In, Takeout, Bar)",
      category: "System Configuration",
      link: "/admin/rvcs",
      autoCheck: () => (stats?.rvcs || 0) > 0,
    },
    {
      id: "cfg-4",
      title: "Set up Tax Groups",
      description: "Configure tax rates for the location (sales tax, etc.)",
      category: "System Configuration",
      link: "/admin/tax-groups",
      autoCheck: () => taxGroups.length > 0,
    },
    {
      id: "cfg-5",
      title: "Configure Tender Types",
      description: "Set up payment methods (Cash, Credit, Debit, Gift Cards)",
      category: "System Configuration",
      link: "/admin/tenders",
      autoCheck: () => tenders.length > 0,
    },
    {
      id: "cfg-6",
      title: "Set up Payment Processor",
      description: "Configure Stripe, Elavon, or other payment gateway",
      category: "System Configuration",
      link: "/admin/payment-processors",
    },
    {
      id: "menu-1",
      title: "Create SLUs (Categories)",
      description: "Set up menu categories (Appetizers, Entrees, Drinks, etc.)",
      category: "Menu Setup",
      link: "/admin/slus",
    },
    {
      id: "menu-2",
      title: "Add Menu Items",
      description: "Enter all menu items with prices and categories",
      category: "Menu Setup",
      link: "/admin/menu-items",
      autoCheck: () => (stats?.menuItems || 0) > 0,
    },
    {
      id: "menu-3",
      title: "Create Modifier Groups",
      description: "Set up modifiers (sizes, toppings, temperatures, etc.)",
      category: "Menu Setup",
      link: "/admin/modifier-groups",
    },
    {
      id: "menu-4",
      title: "Assign Print Classes",
      description: "Define which items print to which kitchen stations",
      category: "Menu Setup",
      link: "/admin/print-classes",
    },
    {
      id: "staff-1",
      title: "Create Jobs",
      description: "Define job types (Server, Cashier, Manager, Cook)",
      category: "Staff Setup",
      link: "/admin/jobs",
    },
    {
      id: "staff-2",
      title: "Configure Roles & Privileges",
      description: "Set up permission levels for each role",
      category: "Staff Setup",
      link: "/admin/roles",
    },
    {
      id: "staff-3",
      title: "Add Employees",
      description: "Create employee accounts with PINs and job assignments",
      category: "Staff Setup",
      link: "/admin/employees",
      autoCheck: () => (stats?.employees || 0) > 0,
    },
    {
      id: "dev-1",
      title: "Configure Workstations",
      description: "Register each POS terminal in the system",
      category: "Device Configuration",
      link: "/admin/workstations",
    },
    {
      id: "dev-2",
      title: "Configure Printers",
      description: "Add printers with IP addresses and assign to properties",
      category: "Device Configuration",
      link: "/admin/printers",
      autoCheck: () => printers.length > 0,
    },
    {
      id: "dev-3",
      title: "Configure KDS Devices",
      description: "Set up kitchen display stations (Hot, Cold, Expo)",
      category: "Device Configuration",
      link: "/admin/kds-devices",
      autoCheck: () => kdsDevices.length > 0,
    },
    {
      id: "dev-4",
      title: "Set Up Order Device Routing",
      description: "Link print classes to printers and KDS displays",
      category: "Device Configuration",
      link: "/admin/order-devices",
    },
    {
      id: "test-1",
      title: "Test order entry",
      description: "Ring up test orders to verify menu and pricing",
      category: "Testing & Training",
    },
    {
      id: "test-2",
      title: "Test kitchen printing",
      description: "Verify orders print to correct kitchen printers",
      category: "Testing & Training",
    },
    {
      id: "test-3",
      title: "Test KDS display",
      description: "Confirm orders appear on kitchen display screens",
      category: "Testing & Training",
    },
    {
      id: "test-4",
      title: "Test payment processing",
      description: "Process test card transactions (use test mode)",
      category: "Testing & Training",
    },
    {
      id: "test-5",
      title: "Test receipt printing",
      description: "Verify customer receipts print correctly",
      category: "Testing & Training",
    },
    {
      id: "train-1",
      title: "Train managers on admin functions",
      description: "Menu updates, employee management, reports",
      category: "Testing & Training",
    },
    {
      id: "train-2",
      title: "Train cashiers on POS operations",
      description: "Order entry, payments, voids, discounts",
      category: "Testing & Training",
    },
    {
      id: "train-3",
      title: "Train kitchen staff on KDS",
      description: "Bumping orders, recalling, order priority",
      category: "Testing & Training",
    },
    {
      id: "go-1",
      title: "Disable test mode on payment processor",
      description: "Switch from sandbox to live payment processing",
      category: "Go Live",
    },
    {
      id: "go-2",
      title: "Run final system check",
      description: "Verify all devices online and functioning",
      category: "Go Live",
    },
    {
      id: "go-3",
      title: "Document support contacts",
      description: "Provide customer with support phone/email",
      category: "Go Live",
    },
    {
      id: "go-4",
      title: "Launch!",
      description: "System is live - first real transactions",
      category: "Go Live",
    },
  ];

  const [checkedItems, setCheckedItems] = useState<Set<string>>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
  });

  const [ignoreAutoCheck, setIgnoreAutoCheck] = useState<boolean>(() => {
    const saved = localStorage.getItem(IGNORE_AUTO_KEY);
    return saved === "true";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(checkedItems)));
  }, [checkedItems]);

  useEffect(() => {
    localStorage.setItem(IGNORE_AUTO_KEY, ignoreAutoCheck ? "true" : "false");
  }, [ignoreAutoCheck]);

  const toggleItem = (id: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isItemChecked = (item: ChecklistItem) => {
    if (checkedItems.has(item.id)) return true;
    if (!ignoreAutoCheck && item.autoCheck && item.autoCheck()) return true;
    return false;
  };

  const categories = Array.from(new Set(checklistItems.map((item) => item.category)));
  const totalItems = checklistItems.length;
  const completedItems = checklistItems.filter((item) => isItemChecked(item)).length;
  const progressPercent = Math.round((completedItems / totalItems) * 100);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Pre-Installation":
        return FileText;
      case "Hardware Setup":
        return Wifi;
      case "System Configuration":
        return Building2;
      case "Menu Setup":
        return UtensilsCrossed;
      case "Staff Setup":
        return Users;
      case "Device Configuration":
        return Printer;
      case "Testing & Training":
        return Monitor;
      case "Go Live":
        return Rocket;
      default:
        return Circle;
    }
  };

  const resetChecklist = () => {
    setCheckedItems(new Set());
    setIgnoreAutoCheck(true);
  };

  const exportChecklist = () => {
    const data = checklistItems.map((item) => ({
      category: item.category,
      task: item.title,
      description: item.description,
      status: isItemChecked(item) ? "Complete" : "Pending",
    }));
    const csv = [
      ["Category", "Task", "Description", "Status"],
      ...data.map((row) => [row.category, row.task, row.description, row.status]),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "onboarding-checklist.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-onboarding-title">
            Customer Onboarding Checklist
          </h1>
          <p className="text-muted-foreground">
            Step-by-step guide for new customer installation and setup
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportChecklist} data-testid="button-export">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={resetChecklist} data-testid="button-reset">
            Reset Checklist
          </Button>
        </div>
      </div>

      <Tabs defaultValue="checklist" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="checklist" data-testid="tab-checklist">
            <FileText className="w-4 h-4 mr-2" />
            Installation Checklist
          </TabsTrigger>
          <TabsTrigger value="import" data-testid="tab-import">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Data Import
          </TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-6 mt-6">
          <DataImportSection />
        </TabsContent>

        <TabsContent value="checklist" className="space-y-6 mt-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="text-base">Overall Progress</CardTitle>
                  <CardDescription>
                    {completedItems} of {totalItems} tasks completed
                  </CardDescription>
                </div>
                <Badge variant={progressPercent === 100 ? "default" : "secondary"}>
                  {progressPercent}%
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Progress value={progressPercent} className="h-3" />
            </CardContent>
          </Card>

          {categories.map((category) => {
          const categoryItems = checklistItems.filter((item) => item.category === category);
          const categoryCompleted = categoryItems.filter((item) => isItemChecked(item)).length;
          const CategoryIcon = getCategoryIcon(category);

          return (
            <Card key={category}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <CategoryIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{category}</CardTitle>
                      <CardDescription>
                        {categoryCompleted} of {categoryItems.length} complete
                      </CardDescription>
                    </div>
                  </div>
                  {categoryCompleted === categoryItems.length && (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Complete
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Separator className="mb-4" />
                <div className="space-y-3">
                  {categoryItems.map((item) => {
                    const checked = isItemChecked(item);
                    return (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 p-3 rounded-lg border bg-card hover-elevate"
                      >
                        <Checkbox
                          id={item.id}
                          checked={checked}
                          onCheckedChange={() => toggleItem(item.id)}
                          className="mt-0.5"
                          data-testid={`checkbox-${item.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <label
                            htmlFor={item.id}
                            className={`font-medium cursor-pointer ${
                              checked ? "line-through text-muted-foreground" : ""
                            }`}
                          >
                            {item.title}
                          </label>
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                        </div>
                        {item.link && (
                          <Link href={item.link}>
                            <Button variant="ghost" size="sm" data-testid={`link-${item.id}`}>
                              <ArrowRight className="w-4 h-4" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface PhaseInfo {
  phase: number;
  sheetName: string;
  columns: { header: string; required: boolean; description: string | null; lookupSheet: string | null }[];
}

interface ImportResult {
  phase: number;
  inserted: number;
  errors: string[];
  total: number;
  success: boolean;
}

const PHASE_COLORS: Record<number, string> = {
  1: "bg-blue-500", 2: "bg-blue-500", 3: "bg-blue-500",
  4: "bg-green-500", 5: "bg-green-500", 6: "bg-green-500", 7: "bg-green-500",
  8: "bg-emerald-500", 9: "bg-emerald-500",
  10: "bg-amber-500", 11: "bg-amber-500", 12: "bg-amber-500", 13: "bg-amber-500",
  14: "bg-orange-500", 15: "bg-orange-500", 16: "bg-orange-500",
  17: "bg-orange-500", 18: "bg-orange-500",
  19: "bg-red-500",
  20: "bg-indigo-500",
};

const PHASE_GROUPS = [
  { label: "Organization", phases: [1, 2, 3], icon: Building2 },
  { label: "Financial", phases: [4, 5, 6, 7], icon: CreditCard },
  { label: "Labor", phases: [8, 9], icon: Users },
  { label: "Devices", phases: [10, 11, 12, 13], icon: Printer },
  { label: "Menu Structure", phases: [14, 15, 16], icon: LayoutGrid },
  { label: "Modifiers", phases: [17, 18], icon: Table2 },
  { label: "Menu Items", phases: [19], icon: UtensilsCrossed },
  { label: "Employees", phases: [20], icon: Users },
];

function DataImportSection() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [importingPhase, setImportingPhase] = useState<number | null>(null);
  const [importResults, setImportResults] = useState<Record<number, ImportResult>>({});

  const { data: phases = [] } = useQuery<PhaseInfo[]>({
    queryKey: ["/api/onboarding/phases"],
  });

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      const response = await failoverFetch("/api/onboarding/templates", { headers: getAuthHeaders() });
      if (!response.ok) throw new Error("Failed to download template");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "OnPoint_POS_Onboarding_Templates.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Template Downloaded", description: "Open in Excel, fill in your data, then upload each tab back here." });
    } catch (err) {
      toast({ title: "Download Failed", description: "Could not download the template file.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const handleFileUpload = async (phase: number, file: File) => {
    setImportingPhase(phase);
    try {
      const buffer = await file.arrayBuffer();
      const response = await failoverFetch(`/api/onboarding/import/${phase}`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/octet-stream",
        },
        body: buffer,
      });
      const result: ImportResult = await response.json();
      setImportResults((prev) => ({ ...prev, [phase]: result }));
      if (result.success) {
        toast({ title: "Import Successful", description: `Imported ${result.inserted} records for ${phases.find((p) => p.phase === phase)?.sheetName || `Phase ${phase}`}` });
      } else {
        toast({
          title: `Imported ${result.inserted} of ${result.total}`,
          description: result.errors.length > 0 ? result.errors[0] : "Some rows had errors",
          variant: result.inserted > 0 ? "default" : "destructive",
        });
      }
    } catch (err) {
      toast({ title: "Import Failed", description: "Could not process the uploaded file.", variant: "destructive" });
    } finally {
      setImportingPhase(null);
    }
  };

  const triggerUpload = (phase: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.csv";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleFileUpload(phase, file);
    };
    input.click();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Data Import Templates</CardTitle>
                <CardDescription>
                  Download the Excel workbook, fill in your data, and upload each tab to build your database
                </CardDescription>
              </div>
            </div>
            <Button onClick={downloadTemplate} disabled={downloading} data-testid="button-download-template">
              {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Download Excel Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <p className="text-sm font-medium">How it works:</p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Download the Excel template — it has 20 tabs in dependency order</li>
              <li>Fill in your data starting from Tab 1 (Enterprise) through Tab 20 (Employees)</li>
              <li>Lookup fields have dropdown menus that pull from earlier tabs</li>
              <li>Upload each completed tab below in order — the system validates and imports</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {PHASE_GROUPS.map((group) => {
        const GroupIcon = group.icon;
        const groupPhases = phases.filter((p) => group.phases.includes(p.phase));
        const allCompleted = group.phases.every((ph) => importResults[ph]?.success);

        return (
          <Card key={group.label}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <GroupIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{group.label}</CardTitle>
                    <CardDescription>
                      {group.phases.length === 1 ? "1 tab" : `${group.phases.length} tabs`} to import
                    </CardDescription>
                  </div>
                </div>
                {allCompleted && (
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Imported
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Separator className="mb-4" />
              <div className="space-y-3">
                {groupPhases.map((phaseInfo) => {
                  const result = importResults[phaseInfo.phase];
                  const isImporting = importingPhase === phaseInfo.phase;
                  const lookupCols = phaseInfo.columns.filter((c) => c.lookupSheet);

                  return (
                    <div
                      key={phaseInfo.phase}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-card hover-elevate"
                    >
                      <div className={`w-8 h-8 rounded-full ${PHASE_COLORS[phaseInfo.phase] || "bg-gray-500"} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                        {phaseInfo.phase}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{phaseInfo.sheetName}</span>
                          {result?.success && (
                            <Badge variant="outline" className="text-green-600 border-green-300 text-xs">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              {result.inserted} imported
                            </Badge>
                          )}
                          {result && !result.success && result.inserted > 0 && (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              {result.inserted}/{result.total}
                            </Badge>
                          )}
                          {result && !result.success && result.inserted === 0 && (
                            <Badge variant="destructive" className="text-xs">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Failed
                            </Badge>
                          )}
                        </div>
                        {lookupCols.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Links to: {lookupCols.map((c) => c.lookupSheet).filter((v, i, a) => a.indexOf(v) === i).join(", ")}
                          </p>
                        )}
                        {result?.errors && result.errors.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {result.errors.slice(0, 3).map((err, i) => (
                              <p key={i} className="text-xs text-destructive">{err}</p>
                            ))}
                            {result.errors.length > 3 && (
                              <p className="text-xs text-muted-foreground">...and {result.errors.length - 3} more errors</p>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => triggerUpload(phaseInfo.phase)}
                        disabled={isImporting}
                        data-testid={`button-upload-phase-${phaseInfo.phase}`}
                      >
                        {isImporting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-1" />
                            Upload
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
