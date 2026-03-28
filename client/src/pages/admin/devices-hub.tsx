import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Monitor, Printer, Tv, Network, Search, ExternalLink, Plus, Settings, Shield } from "lucide-react";
import type { Property } from "@shared/schema";

type HubDevice = {
  id: string;
  name: string;
  deviceType: "workstation" | "printer" | "kds_device" | "order_device" | "registered_device";
  propertyId: string | null;
  propertyName: string;
  status: "active" | "inactive" | "offline" | "pending" | "enrolled" | "disabled" | "revoked";
  ipAddress: string | null;
  model: string | null;
  lastUpdated: Date | null;
  configUrl: string;
};

type HubResponse = {
  devices: HubDevice[];
  summary: {
    total: number;
    workstations: number;
    printers: number;
    kdsDevices: number;
    orderDevices: number;
    registeredDevices: number;
    active: number;
    inactive: number;
  };
};

const DEVICE_TYPE_CONFIG = {
  workstation: { label: "Workstation", icon: Monitor, color: "text-blue-600 dark:text-blue-400" },
  printer: { label: "Printer", icon: Printer, color: "text-green-600 dark:text-green-400" },
  kds_device: { label: "KDS Display", icon: Tv, color: "text-orange-600 dark:text-orange-400" },
  order_device: { label: "Order Device", icon: Network, color: "text-purple-600 dark:text-purple-400" },
  registered_device: { label: "Registered Device", icon: Shield, color: "text-cyan-600 dark:text-cyan-400" },
};

export default function DevicesHubPage() {
  const [, navigate] = useLocation();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId } = useEmcFilter();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPropertyId, setFilterPropertyId] = useState<string>(contextPropertyId || "");
  const [filterDeviceType, setFilterDeviceType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");

  useEffect(() => {
    if (contextPropertyId) {
      setFilterPropertyId(contextPropertyId);
    } else {
      setFilterPropertyId("");
    }
  }, [contextPropertyId]);

  const buildQueryPath = () => {
    const params = new URLSearchParams();
    if (selectedEnterpriseId) params.set("enterpriseId", selectedEnterpriseId);
    if (filterPropertyId) params.set("propertyId", filterPropertyId);
    if (filterDeviceType) params.set("deviceType", filterDeviceType);
    const queryStr = params.toString();
    return queryStr ? `/api/devices-hub?${queryStr}` : "/api/devices-hub";
  };

  const queryPath = buildQueryPath();

  const { data: hubData, isLoading } = useQuery<HubResponse>({
    queryKey: [queryPath, filterKeys],
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const filteredDevices = (hubData?.devices || []).filter((device) => {
    if (filterStatus && device.status !== filterStatus) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        device.name.toLowerCase().includes(query) ||
        device.propertyName.toLowerCase().includes(query) ||
        device.ipAddress?.toLowerCase().includes(query) ||
        device.model?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const summary = hubData?.summary || {
    total: 0,
    workstations: 0,
    printers: 0,
    kdsDevices: 0,
    orderDevices: 0,
    registeredDevices: 0,
    active: 0,
    inactive: 0,
  };

  const handleAddDevice = (type: string) => {
    switch (type) {
      case "workstation":
        navigate("/admin/workstations?add=true");
        break;
      case "printer":
        navigate("/admin/printers?add=true");
        break;
      case "kds_device":
        navigate("/admin/kds-devices?add=true");
        break;
      case "order_device":
        navigate("/admin/order-devices?add=true");
        break;
      case "registered_device":
        navigate("/admin/registered-devices?add=true");
        break;
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Devices Hub</h1>
          <p className="text-muted-foreground text-sm">
            Unified view of all hardware devices across properties
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/admin/devices")} data-testid="button-registered-devices">
            <Settings className="w-4 h-4 mr-2" />
            Registered Devices
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card
          className={`cursor-pointer hover-elevate ${filterDeviceType === "workstation" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setFilterDeviceType(filterDeviceType === "workstation" ? "" : "workstation")}
          data-testid="card-summary-workstations"
        >
          <CardContent className="p-4 flex items-center gap-3">
            <Monitor className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            <div>
              <div className="text-2xl font-bold">{summary.workstations}</div>
              <div className="text-xs text-muted-foreground">Workstations</div>
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer hover-elevate ${filterDeviceType === "printer" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setFilterDeviceType(filterDeviceType === "printer" ? "" : "printer")}
          data-testid="card-summary-printers"
        >
          <CardContent className="p-4 flex items-center gap-3">
            <Printer className="w-8 h-8 text-green-600 dark:text-green-400" />
            <div>
              <div className="text-2xl font-bold">{summary.printers}</div>
              <div className="text-xs text-muted-foreground">Printers</div>
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer hover-elevate ${filterDeviceType === "kds_device" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setFilterDeviceType(filterDeviceType === "kds_device" ? "" : "kds_device")}
          data-testid="card-summary-kds"
        >
          <CardContent className="p-4 flex items-center gap-3">
            <Tv className="w-8 h-8 text-orange-600 dark:text-orange-400" />
            <div>
              <div className="text-2xl font-bold">{summary.kdsDevices}</div>
              <div className="text-xs text-muted-foreground">KDS Displays</div>
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer hover-elevate ${filterDeviceType === "order_device" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setFilterDeviceType(filterDeviceType === "order_device" ? "" : "order_device")}
          data-testid="card-summary-order-devices"
        >
          <CardContent className="p-4 flex items-center gap-3">
            <Network className="w-8 h-8 text-purple-600 dark:text-purple-400" />
            <div>
              <div className="text-2xl font-bold">{summary.orderDevices}</div>
              <div className="text-xs text-muted-foreground">Order Devices</div>
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer hover-elevate ${filterDeviceType === "registered_device" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setFilterDeviceType(filterDeviceType === "registered_device" ? "" : "registered_device")}
          data-testid="card-summary-registered-devices"
        >
          <CardContent className="p-4 flex items-center gap-3">
            <Shield className="w-8 h-8 text-cyan-600 dark:text-cyan-400" />
            <div>
              <div className="text-2xl font-bold">{summary.registeredDevices}</div>
              <div className="text-xs text-muted-foreground">Registered</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
          <CardTitle className="text-lg">All Devices</CardTitle>
          <div className="flex gap-2">
            <Select value={filterDeviceType || "_add"} onValueChange={(v) => v !== "_add" && handleAddDevice(v)}>
              <SelectTrigger className="w-36" data-testid="button-add-device">
                <Plus className="w-4 h-4 mr-2" />
                Add Device
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_add" disabled>Select type...</SelectItem>
                <SelectItem value="workstation">Workstation</SelectItem>
                <SelectItem value="printer">Printer</SelectItem>
                <SelectItem value="kds_device">KDS Display</SelectItem>
                <SelectItem value="order_device">Order Device</SelectItem>
                <SelectItem value="registered_device">Registered Device</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search devices..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
            <Select value={filterPropertyId || "_all"} onValueChange={(v) => setFilterPropertyId(v === "_all" ? "" : v)}>
              <SelectTrigger className="w-48" data-testid="select-filter-property">
                <SelectValue placeholder="All Properties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All Properties</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterDeviceType || "_all"} onValueChange={(v) => setFilterDeviceType(v === "_all" ? "" : v)}>
              <SelectTrigger className="w-40" data-testid="select-filter-type">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All Types</SelectItem>
                <SelectItem value="workstation">Workstations</SelectItem>
                <SelectItem value="printer">Printers</SelectItem>
                <SelectItem value="kds_device">KDS Displays</SelectItem>
                <SelectItem value="order_device">Order Devices</SelectItem>
                <SelectItem value="registered_device">Registered</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus || "_all"} onValueChange={(v) => setFilterStatus(v === "_all" ? "" : v)}>
              <SelectTrigger className="w-32" data-testid="select-filter-status">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="enrolled">Enrolled</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="h-[500px]">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading devices...</div>
            ) : filteredDevices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No devices found. Add workstations, printers, or KDS devices from their respective configuration pages.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Model/Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Configure</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDevices.map((device) => {
                    const typeConfig = DEVICE_TYPE_CONFIG[device.deviceType];
                    const Icon = typeConfig.icon;
                    return (
                      <TableRow key={`${device.deviceType}-${device.id}`} data-testid={`row-device-${device.deviceType}-${device.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className={`w-4 h-4 ${typeConfig.color}`} />
                            <span className="font-medium">{device.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{typeConfig.label}</Badge>
                        </TableCell>
                        <TableCell>{device.propertyName}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-sm">
                          {device.ipAddress || "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {device.model || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={device.status === "active" ? "default" : "secondary"}>
                            {device.status === "active" ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(device.configUrl)}
                            data-testid={`button-configure-${device.deviceType}-${device.id}`}
                          >
                            <ExternalLink className="w-4 h-4 mr-1" />
                            Configure
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </ScrollArea>

          <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t">
            <div>
              Showing {filteredDevices.length} of {summary.total} devices
            </div>
            <div className="flex gap-4">
              <span>{summary.active} active</span>
              <span>{summary.inactive} inactive</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/admin/workstations")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Monitor className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="font-medium">Workstations</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure POS terminals, auto-logout settings, and device privileges
            </p>
          </CardContent>
        </Card>
        <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/admin/printers")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Printer className="w-5 h-5 text-green-600 dark:text-green-400" />
              <span className="font-medium">Printers</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure receipt, kitchen, and label printers with failover chains
            </p>
          </CardContent>
        </Card>
        <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/admin/kds-devices")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Tv className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              <span className="font-medium">KDS Displays</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure kitchen display systems, bump modes, and color schemes
            </p>
          </CardContent>
        </Card>
        <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/admin/order-devices")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Network className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <span className="font-medium">Order Devices</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure routing containers that link print classes to physical devices
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
