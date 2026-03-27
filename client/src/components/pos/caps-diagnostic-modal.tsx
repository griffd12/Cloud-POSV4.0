import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import {
  Database,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  User,
  Shield,
  BarChart3,
  AlertTriangle,
} from "lucide-react";

interface CAPSDiagnosticModalProps {
  open: boolean;
  onClose: () => void;
}

const CAPS_BASE = "/api/caps";

function useDiagnosticSummary() {
  return useQuery<any>({
    queryKey: [CAPS_BASE, "diagnostic", "summary"],
    queryFn: async () => {
      const res = await fetch(`${CAPS_BASE}/diagnostic/summary`);
      if (!res.ok) throw new Error("Failed to fetch diagnostic summary");
      return res.json();
    },
    refetchInterval: 10000,
  });
}

function useTableData(tableName: string | null) {
  return useQuery<any>({
    queryKey: [CAPS_BASE, "diagnostic", "table", tableName],
    queryFn: async () => {
      if (!tableName) return null;
      const res = await fetch(`${CAPS_BASE}/diagnostic/table/${tableName}?limit=50`);
      if (!res.ok) throw new Error("Failed to fetch table data");
      return res.json();
    },
    enabled: !!tableName,
  });
}

function useEmployeePrivileges(employeeId: string | null) {
  return useQuery<any>({
    queryKey: [CAPS_BASE, "diagnostic", "employee", employeeId, "privileges"],
    queryFn: async () => {
      if (!employeeId) return null;
      const res = await fetch(`${CAPS_BASE}/diagnostic/employee/${employeeId}/privileges`);
      if (!res.ok) throw new Error("Failed to fetch employee privileges");
      return res.json();
    },
    enabled: !!employeeId,
  });
}

function SectionCard({
  title,
  tables,
  onSelectTable,
  selectedTable,
}: {
  title: string;
  tables: Record<string, number>;
  onSelectTable: (name: string) => void;
  selectedTable: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalRecords = Object.values(tables).reduce((a, b) => a + b, 0);
  const tableCount = Object.keys(tables).length;
  const emptyCount = Object.values(tables).filter((v) => v === 0).length;

  return (
    <div className="border rounded-lg overflow-hidden" data-testid={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <button
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
        data-testid={`button-toggle-section-${title.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="font-medium text-sm">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {totalRecords} records
          </Badge>
          {emptyCount > 0 && (
            <Badge variant="outline" className="text-xs text-amber-600">
              {emptyCount}/{tableCount} empty
            </Badge>
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t divide-y">
          {Object.entries(tables).map(([table, count]) => (
            <button
              key={table}
              className={`w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-muted/30 transition-colors text-left ${
                selectedTable === table ? "bg-primary/10" : ""
              }`}
              onClick={() => onSelectTable(table)}
              data-testid={`button-table-${table}`}
            >
              <span className="font-mono text-xs">{table}</span>
              <Badge
                variant={count > 0 ? "default" : "outline"}
                className={`text-xs ${count === 0 ? "text-muted-foreground" : ""}`}
              >
                {count}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TableDetail({ tableName }: { tableName: string }) {
  const { data, isLoading } = useTableData(tableName);

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading table data...</div>;
  }

  if (!data || !data.rows || data.rows.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No rows in this table</div>;
  }

  const columns = Object.keys(data.rows[0]);

  return (
    <div className="border rounded-lg overflow-hidden" data-testid={`table-detail-${tableName}`}>
      <div className="p-2 bg-muted/50 border-b flex items-center justify-between">
        <span className="font-mono text-xs font-medium">{tableName}</span>
        <Badge variant="secondary" className="text-xs">{data.count} rows</Badge>
      </div>
      <div className="overflow-x-auto max-h-64">
        <table className="text-xs min-w-max">
          <thead className="sticky top-0 bg-background border-b">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-3 py-1 text-left font-medium text-muted-foreground whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.rows.slice(0, 20).map((row: any, i: number) => (
              <tr key={i} className="hover:bg-muted/30">
                {columns.map((col) => (
                  <td key={col} className="px-3 py-1 whitespace-nowrap">
                    {String(row[col] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmployeePrivilegeInspector() {
  const [employeeId, setEmployeeId] = useState<string>("");
  const [searchId, setSearchId] = useState<string | null>(null);
  const { data, isLoading, error } = useEmployeePrivileges(searchId);

  return (
    <div className="space-y-3" data-testid="employee-privilege-inspector">
      <div className="flex items-center gap-2">
        <User className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Employee Privilege Inspector</span>
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Enter Employee ID"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className="text-sm font-mono"
          data-testid="input-employee-id"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setSearchId(employeeId.trim() || null)}
          disabled={!employeeId.trim()}
          data-testid="button-resolve-privileges"
        >
          <Search className="w-4 h-4 mr-1" />
          Resolve
        </Button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Resolving privileges...</div>}

      {error && <div className="text-sm text-destructive">Employee not found or error resolving</div>}

      {data && data.employee && (
        <div className="space-y-3 border rounded-lg p-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Employee:</span>{" "}
              <span className="font-medium">
                {data.employee.first_name} {data.employee.last_name}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">ID:</span>{" "}
              <span className="font-mono">{data.employee.id}</span>
            </div>
          </div>

          {data.role && (
            <div className="text-xs">
              <span className="text-muted-foreground">Role:</span>{" "}
              <Badge variant="secondary" className="text-xs">
                {data.role.name} ({data.role.code})
              </Badge>
            </div>
          )}

          {data.assignments && data.assignments.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground">Assignments:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {data.assignments.map((a: any, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {a.is_primary ? "Primary" : "Secondary"} - Property: {a.property_id?.slice(0, 8)}...
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-1 mb-1">
              <Shield className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs font-medium">
                Resolved Privileges ({data.resolvedPrivilegeCodes?.length || 0})
              </span>
            </div>
            {data.resolvedPrivilegeCodes && data.resolvedPrivilegeCodes.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {data.resolvedPrivilegeCodes.map((code: string) => (
                  <Badge key={code} variant="default" className="text-xs">
                    {code}
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="text-xs text-amber-600">
                No privileges resolved - using default fallbacks
              </div>
            )}
          </div>

          {data.assignmentRoles && data.assignmentRoles.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground">Assignment-derived Roles:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {data.assignmentRoles.map((ar: any, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {ar.role?.name} ({ar.role?.code}) via {ar.isPrimary ? "primary" : "secondary"} assignment
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {data.privilegeProvenance && data.privilegeProvenance.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground">
                Privilege Provenance Chain:
              </span>
              <div className="mt-1 max-h-32 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 px-1">Code</th>
                      <th className="text-left py-1 px-1">Name</th>
                      <th className="text-left py-1 px-1">Domain</th>
                      <th className="text-left py-1 px-1">Granted Via</th>
                      <th className="text-left py-1 px-1">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.privilegeProvenance.map((pp: any, i: number) => (
                      <tr key={i}>
                        <td className="py-1 px-1 font-mono">{pp.privilegeCode}</td>
                        <td className="py-1 px-1">{pp.privilegeName}</td>
                        <td className="py-1 px-1">{pp.privilegeDomain}</td>
                        <td className="py-1 px-1">{pp.grantedViaRoleName}</td>
                        <td className="py-1 px-1">
                          <Badge variant={pp.roleSource === 'employee.role_id' ? 'default' : 'secondary'} className="text-xs">
                            {pp.roleSource}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TableParityView({ parity }: { parity: any }) {
  if (!parity) return <div className="text-sm text-muted-foreground">No parity data available</div>;

  const [showCloudOnly, setShowCloudOnly] = useState(false);
  const barColor = parity.parity ? "bg-green-500" : parity.parityPct >= 70 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="space-y-4" data-testid="table-parity-view">
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Cloud ↔ CAPS Table Parity</span>
          <Badge variant={parity.parity ? "default" : "destructive"} className="text-xs" data-testid="text-parity-status">
            {parity.parity ? "PARITY" : `${parity.parityPct}% — ${parity.missingFromCaps?.length || 0} missing`}
          </Badge>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div className={`${barColor} rounded-full h-2 transition-all`} style={{ width: `${parity.parityPct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="text-center">
            <div className="text-muted-foreground">Expected</div>
            <div className="font-medium text-lg" data-testid="text-expected-count">{parity.cloudTablesExpected}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Present</div>
            <div className="font-medium text-lg text-green-600" data-testid="text-present-count">{parity.capsTablesPresent}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Missing</div>
            <div className="font-medium text-lg text-red-600" data-testid="text-missing-count">{parity.missingFromCaps?.length || 0}</div>
          </div>
        </div>
      </div>

      {parity.missingFromCaps?.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="p-2 bg-red-50 dark:bg-red-950/20 border-b flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-xs font-medium text-red-700 dark:text-red-400">Missing from CAPS ({parity.missingFromCaps.length})</span>
          </div>
          <div className="p-2 flex flex-wrap gap-1">
            {parity.missingFromCaps.map((t: string) => (
              <Badge key={t} variant="outline" className="text-xs font-mono text-red-600">{t}</Badge>
            ))}
          </div>
        </div>
      )}

      {parity.notYetImplemented?.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="p-2 bg-amber-50 dark:bg-amber-950/20 border-b flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Planned — Not Yet Implemented ({parity.notYetImplemented.length})</span>
          </div>
          <div className="p-2 flex flex-wrap gap-1">
            {parity.notYetImplemented.map((t: string) => (
              <Badge key={t} variant="outline" className="text-xs font-mono text-amber-600">{t}</Badge>
            ))}
          </div>
        </div>
      )}

      {parity.classification && (
        <div className="border rounded-lg overflow-hidden">
          <div className="p-2 bg-blue-50 dark:bg-blue-950/20 border-b flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Classification Breakdown</span>
          </div>
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Config (Cloud → CAPS)</span>
              <Badge variant="outline" className="text-xs" data-testid="text-config-count">{parity.classification.config?.length || 0}</Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Runtime (CAPS → Cloud)</span>
              <Badge variant="outline" className="text-xs" data-testid="text-runtime-count">{parity.classification.runtime?.length || 0}</Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Derived (Complex/TBD)</span>
              <Badge variant="outline" className="text-xs" data-testid="text-derived-count">{parity.classification.derived?.length || 0}</Badge>
            </div>
          </div>
        </div>
      )}

      {parity.capsOnlyInfra?.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="p-2 bg-muted/30 border-b flex items-center gap-2">
            <Database className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">CAPS-Only Infrastructure ({parity.capsOnlyInfra.length})</span>
          </div>
          <div className="p-2 flex flex-wrap gap-1">
            {parity.capsOnlyInfra.map((t: string) => (
              <Badge key={t} variant="outline" className="text-xs font-mono text-muted-foreground">{t}</Badge>
            ))}
          </div>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <button
          className="w-full p-2 bg-muted/50 border-b flex items-center gap-2 hover:bg-muted/70 transition-colors cursor-pointer"
          onClick={() => setShowCloudOnly(!showCloudOnly)}
          data-testid="button-toggle-cloud-only"
        >
          <Database className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium">Cloud-Only by Design ({parity.cloudOnlyByDesign?.length || 0})</span>
          <ChevronDown className={`w-3 h-3 ml-auto text-muted-foreground transition-transform ${showCloudOnly ? "rotate-180" : ""}`} />
        </button>
        {showCloudOnly && (
          <div className="p-2 flex flex-wrap gap-1">
            {parity.cloudOnlyByDesign?.map((t: string) => (
              <Badge key={t} variant="outline" className="text-xs font-mono text-muted-foreground">{t}</Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CAPSDiagnosticModal({ open, onClose }: CAPSDiagnosticModalProps) {
  const { data: summary, isLoading, refetch } = useDiagnosticSummary();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"tables" | "privileges" | "parity">("tables");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-diagnostic-title">
            <Database className="w-5 h-5" />
            CAPS Diagnostic Tool
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading diagnostic data...
          </div>
        ) : summary ? (
          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="sync-health-dashboard">
                <div className="border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-1">Connection</div>
                  <div className="flex items-center gap-1">
                    {summary.syncMetadata?.isConnected ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className="text-sm font-medium" data-testid="text-connection-status">
                      {summary.syncMetadata?.isConnected ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-1">Config Version</div>
                  <span className="text-sm font-medium font-mono" data-testid="text-config-version">
                    v{summary.syncMetadata?.configVersion || 0}
                  </span>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-1">Last Sync</div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs" data-testid="text-last-sync">
                      {summary.syncMetadata?.lastSyncAt
                        ? new Date(summary.syncMetadata.lastSyncAt).toLocaleString()
                        : "Never"}
                    </span>
                  </div>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-1">Total Records</div>
                  <span className="text-sm font-medium" data-testid="text-total-records">
                    {summary.totalRecords?.toLocaleString() || 0}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 border-b pb-2">
                <Button
                  variant={activeTab === "tables" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("tables")}
                  data-testid="button-tab-tables"
                >
                  <Database className="w-4 h-4 mr-1" />
                  Synced Tables
                </Button>
                <Button
                  variant={activeTab === "privileges" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("privileges")}
                  data-testid="button-tab-privileges"
                >
                  <Shield className="w-4 h-4 mr-1" />
                  Privilege Inspector
                </Button>
                <Button
                  variant={activeTab === "parity" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("parity")}
                  data-testid="button-tab-parity"
                >
                  <BarChart3 className="w-4 h-4 mr-1" />
                  Table Parity
                </Button>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetch()}
                  data-testid="button-refresh-diagnostic"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>

              {activeTab === "tables" && (
                <div className="space-y-2">
                  {summary.sections &&
                    Object.entries(summary.sections).map(([sectionName, tables]) => (
                      <SectionCard
                        key={sectionName}
                        title={sectionName}
                        tables={tables as Record<string, number>}
                        onSelectTable={setSelectedTable}
                        selectedTable={selectedTable}
                      />
                    ))}

                  {selectedTable && (
                    <div className="mt-3">
                      <TableDetail tableName={selectedTable} />
                    </div>
                  )}
                </div>
              )}

              {activeTab === "privileges" && <EmployeePrivilegeInspector />}

              {activeTab === "parity" && <TableParityView parity={summary.tableParity} />}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Unable to load diagnostic data. Ensure CAPS is running.
          </div>
        )}

        <div className="flex justify-end pt-2 border-t">
          <Button variant="secondary" onClick={onClose} data-testid="button-close-diagnostic">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
