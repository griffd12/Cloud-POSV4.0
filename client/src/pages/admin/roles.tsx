import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { useEmcFilter } from "@/lib/emc-context";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { getScopeColumn, getZoneColumn, getInheritanceColumn } from "@/components/admin/scope-column";
import { useScopeLookup } from "@/hooks/use-scope-lookup";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { type Role, type Privilege, type RoleRules } from "@shared/schema";
import { useConfigOverride } from "@/hooks/use-config-override";
import { OptionBitsPanel } from "@/components/admin/option-bits-panel";
import { Shield, Save } from "lucide-react";

export default function RolesPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Role | null>(null);
  const [rulesRoleId, setRulesRoleId] = useState<string>("");
  
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [active, setActive] = useState(true);
  const [selectedPrivileges, setSelectedPrivileges] = useState<string[]>([]);

  const [ruleFields, setRuleFields] = useState({
    maxItemDiscountPct: 0,
    maxCheckDiscountPct: 0,
    maxItemDiscountAmt: "0",
    maxCheckDiscountAmt: "0",
    maxPriceOverridePctDown: 0,
    maxPriceOverrideAmtDown: "0",
    reopenWindowMinutes: 0,
    editClosedWindowMinutes: 0,
    refundWindowMinutes: 0,
    bypassWindowsAllowed: false,
  });

  const { data: roles = [], isLoading } = useQuery<Role[]>({
    queryKey: ["/api/roles", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/roles${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch roles");
      return res.json();
    },
  });

  const { getOverrideActions, filterOverriddenInherited, canDeleteItem, getScopeQueryParams } = useConfigOverride<Role>("role", ["/api/roles"]);
  const displayedRoles = filterOverriddenInherited(roles);

  const { data: privileges = [] } = useQuery<Privilege[]>({
    queryKey: ["/api/privileges", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/privileges${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch privileges");
      return res.json();
    },
  });

  const { data: roleRulesData, isLoading: isLoadingRules } = useQuery<RoleRules | null>({
    queryKey: ["/api/roles", rulesRoleId, "rules"],
    queryFn: async () => {
      const res = await failoverFetch(`/api/roles/${rulesRoleId}/rules`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch role rules");
      return res.json();
    },
    enabled: !!rulesRoleId,
  });

  useEffect(() => {
    if (roleRulesData) {
      setRuleFields({
        maxItemDiscountPct: roleRulesData.maxItemDiscountPct ?? 0,
        maxCheckDiscountPct: roleRulesData.maxCheckDiscountPct ?? 0,
        maxItemDiscountAmt: roleRulesData.maxItemDiscountAmt ?? "0",
        maxCheckDiscountAmt: roleRulesData.maxCheckDiscountAmt ?? "0",
        maxPriceOverridePctDown: roleRulesData.maxPriceOverridePctDown ?? 0,
        maxPriceOverrideAmtDown: roleRulesData.maxPriceOverrideAmtDown ?? "0",
        reopenWindowMinutes: roleRulesData.reopenWindowMinutes ?? 0,
        editClosedWindowMinutes: roleRulesData.editClosedWindowMinutes ?? 0,
        refundWindowMinutes: roleRulesData.refundWindowMinutes ?? 0,
        bypassWindowsAllowed: roleRulesData.bypassWindowsAllowed ?? false,
      });
    } else if (rulesRoleId && !isLoadingRules) {
      setRuleFields({
        maxItemDiscountPct: 0,
        maxCheckDiscountPct: 0,
        maxItemDiscountAmt: "0",
        maxCheckDiscountAmt: "0",
        maxPriceOverridePctDown: 0,
        maxPriceOverrideAmtDown: "0",
        reopenWindowMinutes: 0,
        editClosedWindowMinutes: 0,
        refundWindowMinutes: 0,
        bypassWindowsAllowed: false,
      });
    }
  }, [roleRulesData, rulesRoleId, isLoadingRules]);

  const saveRulesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", `/api/roles/${rulesRoleId}/rules`, {
        enterpriseId: selectedEnterpriseId,
        ...ruleFields,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles", rulesRoleId, "rules"] });
      toast({ title: "Role rules saved" });
    },
    onError: () => {
      toast({ title: "Failed to save role rules", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setName("");
    setCode("");
    setActive(true);
    setSelectedPrivileges([]);
  };

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setCode(editingItem.code);
      setActive(editingItem.active ?? true);
      
      apiRequest("GET", `/api/roles/${editingItem.id}/privileges`)
        .then(res => res.json())
        .then((privs: string[]) => {
          setSelectedPrivileges(privs);
        });
    } else {
      resetForm();
    }
  }, [editingItem]);

  const columns: Column<Role>[] = [
    { key: "code", header: "Code", sortable: true },
    { key: "name", header: "Name", sortable: true },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
    getScopeColumn(),
    getZoneColumn<Role>(scopeLookup),
    getInheritanceColumn<Role>(selectedPropertyId, selectedRvcId),
  ];

  const createMutation = useMutation({
    mutationFn: async (data: { role: Partial<Role>; privileges: string[] }) => {
      const response = await apiRequest("POST", "/api/roles", data.role);
      const created = await response.json();
      await apiRequest("PUT", `/api/roles/${created.id}/privileges`, { privileges: data.privileges });
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      resetForm();
      toast({ title: "Role created" });
    },
    onError: () => {
      toast({ title: "Failed to create role", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { role: Partial<Role>; privileges: string[] }) => {
      const response = await apiRequest("PUT", "/api/roles/" + data.role.id, data.role);
      await apiRequest("PUT", `/api/roles/${data.role.id}/privileges`, { privileges: data.privileges });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      resetForm();
      toast({ title: "Role updated" });
    },
    onError: () => {
      toast({ title: "Failed to update role", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/roles/" + id + getScopeQueryParams());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles", filterKeys] });
      toast({ title: "Role deleted" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete role", variant: "destructive" });
    },
  });

  const seedPrivilegesMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/privileges/seed", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/privileges", filterKeys] });
      toast({ title: "Privileges seeded successfully" });
    },
    onError: () => {
      toast({ title: "Failed to seed privileges", variant: "destructive" });
    },
  });

  const seedRolesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEnterpriseId) {
        throw new Error("No enterprise selected");
      }
      await apiRequest("POST", "/api/roles/seed", filterKeys);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles", filterKeys] });
      toast({ title: "Roles seeded successfully with privileges from matrix" });
    },
    onError: () => {
      toast({ title: "Failed to seed roles", variant: "destructive" });
    },
  });

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!name || !code) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }

    const roleData: Partial<Role> = {
      name,
      code,
      active,
    };

    if (editingItem) {
      roleData.id = editingItem.id;
      updateMutation.mutate({ role: roleData, privileges: selectedPrivileges });
    } else {
      createMutation.mutate({ role: { ...roleData, ...scopePayload }, privileges: selectedPrivileges });
    }
  };

  const handleCancel = () => {
    setFormOpen(false);
    setEditingItem(null);
    resetForm();
  };

  const togglePrivilege = (code: string) => {
    setSelectedPrivileges(prev => 
      prev.includes(code) 
        ? prev.filter(p => p !== code)
        : [...prev, code]
    );
  };

  const toggleAllInDomain = (domain: string, privs: Privilege[]) => {
    const domainCodes = privs.map(p => p.code);
    const allSelected = domainCodes.every(code => selectedPrivileges.includes(code));
    
    if (allSelected) {
      setSelectedPrivileges(prev => prev.filter(code => !domainCodes.includes(code)));
    } else {
      setSelectedPrivileges(prev => {
        const combined = [...prev, ...domainCodes];
        return Array.from(new Set(combined));
      });
    }
  };

  const privilegesByDomain = privileges.reduce((acc, priv) => {
    const domain = priv.domain || "other";
    if (!acc[domain]) acc[domain] = [];
    acc[domain].push(priv);
    return acc;
  }, {} as Record<string, Privilege[]>);

  const domainLabels: Record<string, string> = {
    check_control: "Check Control",
    item_control: "Item Control",
    payment_control: "Payment Control",
    manager_override: "Manager Override",
    reporting: "Reporting",
    admin: "Admin",
    operations: "Operations",
    other: "Other",
  };

  return (
    <div className="p-6 space-y-6">
      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles" data-testid="tab-roles">Roles</TabsTrigger>
          <TabsTrigger value="privileges" data-testid="tab-privileges">Privileges</TabsTrigger>
          <TabsTrigger value="role-rules" data-testid="tab-role-rules">Role Rules</TabsTrigger>
        </TabsList>
        
        <TabsContent value="roles" className="space-y-4">
          {formOpen ? (
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{editingItem ? "Edit Role" : "Add Role"}</CardTitle>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel-role">
                      Cancel
                    </Button>
                    <Button
                      data-testid="button-submit-role"
                      disabled={createMutation.isPending || updateMutation.isPending}
                      onClick={handleSubmit}
                    >
                      {editingItem ? "Save Changes" : "Create Role"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Role Name *</Label>
                      <Input 
                        id="name"
                        data-testid="input-role-name"
                        value={name} 
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Manager"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="code">Code *</Label>
                      <Input 
                        id="code"
                        data-testid="input-role-code"
                        value={code} 
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        placeholder="e.g., MGR"
                      />
                    </div>
                    <div className="flex items-center space-x-2 pt-6">
                      <Switch 
                        id="active"
                        data-testid="switch-role-active"
                        checked={active}
                        onCheckedChange={setActive}
                      />
                      <Label htmlFor="active">Active</Label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Privileges</Label>
                    <Accordion type="multiple" className="border rounded-md">
                      {Object.entries(privilegesByDomain).map(([domain, privs]) => {
                        const allDomainSelected = privs.every(p => selectedPrivileges.includes(p.code));
                        
                        return (
                          <AccordionItem key={domain} value={domain}>
                            <AccordionTrigger className="px-4 py-2 text-sm">
                              {domainLabels[domain] || domain}
                              <Badge variant="secondary" className="ml-2">
                                {privs.filter(p => selectedPrivileges.includes(p.code)).length}/{privs.length}
                              </Badge>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-3">
                              <div className="mb-3 pb-2 border-b flex items-center space-x-2">
                                <Checkbox 
                                  id={`select-all-${domain}`}
                                  data-testid={`checkbox-select-all-${domain}`}
                                  checked={allDomainSelected}
                                  onCheckedChange={() => toggleAllInDomain(domain, privs)}
                                />
                                <Label 
                                  htmlFor={`select-all-${domain}`} 
                                  className="text-sm font-medium cursor-pointer"
                                >
                                  Select All {domainLabels[domain] || domain}
                                </Label>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                {privs.map((priv) => (
                                  <div key={priv.id} className="flex items-center space-x-2">
                                    <Checkbox 
                                      id={`priv-${priv.code}`}
                                      data-testid={`checkbox-priv-${priv.code}`}
                                      checked={selectedPrivileges.includes(priv.code)}
                                      onCheckedChange={() => togglePrivilege(priv.code)}
                                    />
                                    <Label htmlFor={`priv-${priv.code}`} className="text-sm font-normal cursor-pointer">
                                      {priv.name}
                                    </Label>
                                  </div>
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex gap-2 flex-wrap">
                <Button 
                  variant="outline" 
                  onClick={() => seedRolesMutation.mutate()}
                  disabled={seedRolesMutation.isPending}
                  data-testid="button-seed-roles"
                >
                  Seed Standard Roles
                </Button>
              </div>
              
              <DataTable
                data={displayedRoles}
                columns={columns}
                title="Roles"
                onAdd={() => {
                  setEditingItem(null);
                  resetForm();
                  setFormOpen(true);
                }}
                onEdit={(item) => {
                  setEditingItem(item);
                  setFormOpen(true);
                }}
                onDelete={(item) => deleteMutation.mutate(item.id)}
                canDelete={canDeleteItem}
                customActions={getOverrideActions()}
                isLoading={isLoading}
                searchPlaceholder="Search roles..."
                emptyMessage="No roles configured"
              />
            </>
          )}
        </TabsContent>
        
        <TabsContent value="privileges" className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button 
              variant="outline" 
              onClick={() => seedPrivilegesMutation.mutate()}
              disabled={seedPrivilegesMutation.isPending}
              data-testid="button-seed-privileges"
            >
              Seed Standard Privileges
            </Button>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(privilegesByDomain).map(([domain, privs]) => (
              <Card key={domain}>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">{domainLabels[domain] || domain}</CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  <ul className="space-y-1">
                    {privs.map(priv => (
                      <li key={priv.id} className="text-sm text-muted-foreground">
                        {priv.name}
                        <span className="text-xs ml-2 font-mono text-muted-foreground/60">({priv.code})</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="role-rules" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Role Rules & Thresholds
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Select Role</Label>
                <Select value={rulesRoleId} onValueChange={(v) => setRulesRoleId(v)}>
                  <SelectTrigger data-testid="select-rules-role">
                    <SelectValue placeholder="Choose a role to configure..." />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name} ({role.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {rulesRoleId && (
                <>
                  {isLoadingRules ? (
                    <div className="text-sm text-muted-foreground">Loading rules...</div>
                  ) : (
                    <>
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-sm font-medium mb-3">Discount Limits</h4>
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="maxItemDiscountPct" className="text-xs">Max Item Discount %</Label>
                              <Input
                                id="maxItemDiscountPct"
                                data-testid="input-max-item-discount-pct"
                                type="number"
                                min={0}
                                max={100}
                                value={ruleFields.maxItemDiscountPct}
                                onChange={(e) => setRuleFields(prev => ({ ...prev, maxItemDiscountPct: parseInt(e.target.value) || 0 }))}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="maxCheckDiscountPct" className="text-xs">Max Check Discount %</Label>
                              <Input
                                id="maxCheckDiscountPct"
                                data-testid="input-max-check-discount-pct"
                                type="number"
                                min={0}
                                max={100}
                                value={ruleFields.maxCheckDiscountPct}
                                onChange={(e) => setRuleFields(prev => ({ ...prev, maxCheckDiscountPct: parseInt(e.target.value) || 0 }))}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="maxItemDiscountAmt" className="text-xs">Max Item Discount $</Label>
                              <Input
                                id="maxItemDiscountAmt"
                                data-testid="input-max-item-discount-amt"
                                type="number"
                                min={0}
                                step="0.01"
                                value={ruleFields.maxItemDiscountAmt}
                                onChange={(e) => setRuleFields(prev => ({ ...prev, maxItemDiscountAmt: e.target.value }))}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="maxCheckDiscountAmt" className="text-xs">Max Check Discount $</Label>
                              <Input
                                id="maxCheckDiscountAmt"
                                data-testid="input-max-check-discount-amt"
                                type="number"
                                min={0}
                                step="0.01"
                                value={ruleFields.maxCheckDiscountAmt}
                                onChange={(e) => setRuleFields(prev => ({ ...prev, maxCheckDiscountAmt: e.target.value }))}
                              />
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-sm font-medium mb-3">Price Override Limits</h4>
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="maxPriceOverridePctDown" className="text-xs">Max Override % Down</Label>
                              <Input
                                id="maxPriceOverridePctDown"
                                data-testid="input-max-price-override-pct-down"
                                type="number"
                                min={0}
                                max={100}
                                value={ruleFields.maxPriceOverridePctDown}
                                onChange={(e) => setRuleFields(prev => ({ ...prev, maxPriceOverridePctDown: parseInt(e.target.value) || 0 }))}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="maxPriceOverrideAmtDown" className="text-xs">Max Override $ Down</Label>
                              <Input
                                id="maxPriceOverrideAmtDown"
                                data-testid="input-max-price-override-amt-down"
                                type="number"
                                min={0}
                                step="0.01"
                                value={ruleFields.maxPriceOverrideAmtDown}
                                onChange={(e) => setRuleFields(prev => ({ ...prev, maxPriceOverrideAmtDown: e.target.value }))}
                              />
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-sm font-medium mb-3">Time Windows</h4>
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="reopenWindowMinutes" className="text-xs">Reopen Window (min)</Label>
                              <Input
                                id="reopenWindowMinutes"
                                data-testid="input-reopen-window-minutes"
                                type="number"
                                min={0}
                                value={ruleFields.reopenWindowMinutes}
                                onChange={(e) => setRuleFields(prev => ({ ...prev, reopenWindowMinutes: parseInt(e.target.value) || 0 }))}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="editClosedWindowMinutes" className="text-xs">Edit Closed Window (min)</Label>
                              <Input
                                id="editClosedWindowMinutes"
                                data-testid="input-edit-closed-window-minutes"
                                type="number"
                                min={0}
                                value={ruleFields.editClosedWindowMinutes}
                                onChange={(e) => setRuleFields(prev => ({ ...prev, editClosedWindowMinutes: parseInt(e.target.value) || 0 }))}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="refundWindowMinutes" className="text-xs">Refund Window (min)</Label>
                              <Input
                                id="refundWindowMinutes"
                                data-testid="input-refund-window-minutes"
                                type="number"
                                min={0}
                                value={ruleFields.refundWindowMinutes}
                                onChange={(e) => setRuleFields(prev => ({ ...prev, refundWindowMinutes: parseInt(e.target.value) || 0 }))}
                              />
                            </div>
                            <div className="flex items-center space-x-2 pt-6">
                              <Switch
                                id="bypassWindowsAllowed"
                                data-testid="switch-bypass-windows"
                                checked={ruleFields.bypassWindowsAllowed}
                                onCheckedChange={(v) => setRuleFields(prev => ({ ...prev, bypassWindowsAllowed: v }))}
                              />
                              <Label htmlFor="bypassWindowsAllowed" className="text-xs">Bypass Windows</Label>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <Button
                            onClick={() => saveRulesMutation.mutate()}
                            disabled={saveRulesMutation.isPending}
                            data-testid="button-save-role-rules"
                          >
                            <Save className="w-4 h-4 mr-1" />
                            Save Rules
                          </Button>
                        </div>
                      </div>

                      {selectedEnterpriseId && (
                        <div className="border-t pt-4 mt-4">
                          <h4 className="text-sm font-medium mb-3">Option Permissions</h4>
                          <OptionBitsPanel
                            entityType="role"
                            entityId={rulesRoleId}
                            enterpriseId={selectedEnterpriseId}
                            currentScopeLevel={selectedRvcId ? "rvc" : selectedPropertyId ? "property" : "enterprise"}
                            currentScopeId={selectedRvcId || selectedPropertyId || selectedEnterpriseId}
                            scopeChain={[
                              { level: "enterprise", id: selectedEnterpriseId },
                              ...(selectedPropertyId ? [{ level: "property", id: selectedPropertyId }] : []),
                              ...(selectedRvcId ? [{ level: "rvc", id: selectedRvcId }] : []),
                            ]}
                            scopeLabel={`Role: ${roles.find(r => r.id === rulesRoleId)?.name || ""}`}
                          />
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {!rulesRoleId && (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  Select a role above to configure its thresholds and option permissions.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
