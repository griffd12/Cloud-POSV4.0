import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { getScopeColumn, getZoneColumn, getInheritanceColumn } from "@/components/admin/scope-column";
import { useScopeLookup } from "@/hooks/use-scope-lookup";
import { insertTenderSchema, type Tender, type InsertTender } from "@shared/schema";
import { useConfigOverride } from "@/hooks/use-config-override";
import { OptionBitsPanel } from "@/components/admin/option-bits-panel";

interface PaymentProcessor {
  id: string;
  name: string;
  gatewayType: string;
  active: boolean;
}

export default function TendersPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Tender | null>(null);
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();

  const { data: tenders = [], isLoading } = useQuery<Tender[]>({
    queryKey: ["/api/tenders", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/tenders${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: processors = [] } = useQuery<PaymentProcessor[]>({
    queryKey: ["/api/payment-processors", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/payment-processors${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const activeProcessors = processors.filter(p => p.active);
  const processorMap = processors.reduce((acc, p) => { acc[p.id] = p; return acc; }, {} as Record<string, PaymentProcessor>);

  const { getOverrideActions, filterOverriddenInherited, canDeleteItem, getScopeQueryParams } = useConfigOverride<Tender>("tender", ["/api/tenders"]);
  const displayedTenders = filterOverriddenInherited(tenders);

  const columns: Column<Tender>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "code", header: "Code", sortable: true },
    {
      key: "type",
      header: "Type",
      render: (value) => <Badge variant="outline">{value}</Badge>,
    },
    {
      key: "paymentProcessorId",
      header: "Payment Processor",
      render: (value) => {
        if (!value) return <span className="text-muted-foreground">—</span>;
        const proc = processorMap[value as string];
        return proc ? <Badge variant="secondary">{proc.name}</Badge> : <span className="text-muted-foreground">Unknown</span>;
      },
    },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
    getScopeColumn(),
    getZoneColumn<Tender>(scopeLookup),
    getInheritanceColumn<Tender>(selectedPropertyId, selectedRvcId),
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "Tender Name", type: "text", placeholder: "e.g., Cash", required: true },
    { name: "code", label: "Code", type: "text", placeholder: "e.g., CASH", required: true },
    {
      name: "type",
      label: "Type",
      type: "select",
      options: [
        { value: "cash", label: "Cash" },
        { value: "credit", label: "Credit Card" },
        { value: "debit", label: "Debit Card" },
        { value: "gift", label: "Gift Card" },
        { value: "other", label: "Other" },
      ],
      required: true,
    },
    {
      name: "paymentProcessorId",
      label: "Payment Processor",
      type: "select",
      options: activeProcessors.map(p => ({ value: p.id, label: `${p.name} (${p.gatewayType})` })),
      required: true,
      placeholder: "Select payment processor...",
      description: "Required for credit and debit card tenders to process payments and refunds.",
      visibleWhen: { field: "type", values: ["credit", "debit"] },
    },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
    { name: "isCashMedia", label: "Is Cash Media", type: "switch", defaultValue: false, description: "Classifies this tender as cash for reporting and cash drawer reconciliation." },
    { name: "isCardMedia", label: "Is Card Media", type: "switch", defaultValue: false, description: "Classifies this tender as a card payment for card settlement and tip reporting." },
    { name: "isGiftMedia", label: "Is Gift Media", type: "switch", defaultValue: false, description: "Classifies this tender as a gift card for gift liability tracking." },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertTender) => {
      const response = await apiRequest("POST", "/api/tenders", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenders", filterKeys] });
      setFormOpen(false);
      toast({ title: "Tender created" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to create tender", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Tender) => {
      const response = await apiRequest("PUT", "/api/tenders/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenders", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Tender updated" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to update tender", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/tenders/" + id + getScopeQueryParams());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenders", filterKeys] });
      toast({ title: "Tender deleted" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete tender", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertTender) => {
    const cleanedData = { ...data };
    if (cleanedData.type !== "credit" && cleanedData.type !== "debit") {
      cleanedData.paymentProcessorId = null;
    }
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...cleanedData });
    } else {
      createMutation.mutate({ ...cleanedData, ...scopePayload });
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={displayedTenders}
        columns={columns}
        title="Tenders"
        onAdd={() => {
          setEditingItem(null);
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
        searchPlaceholder="Search tenders..."
        emptyMessage="No tenders configured"
      />

      {editingItem && selectedEnterpriseId && (
        <div className="mt-4">
          <OptionBitsPanel
            entityType="tender"
            entityId={editingItem.id}
            enterpriseId={selectedEnterpriseId}
            currentScopeLevel={selectedRvcId ? "rvc" : selectedPropertyId ? "property" : "enterprise"}
            currentScopeId={selectedRvcId || selectedPropertyId || selectedEnterpriseId}
            scopeChain={[
              { level: "enterprise", id: selectedEnterpriseId },
              ...(selectedPropertyId ? [{ level: "property", id: selectedPropertyId }] : []),
              ...(selectedRvcId ? [{ level: "rvc", id: selectedRvcId }] : []),
            ]}
            scopeLabel={`Editing at ${selectedRvcId ? "RVC" : selectedPropertyId ? "Property" : "Enterprise"} scope`}
          />
        </div>
      )}

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertTenderSchema}
        fields={formFields}
        title={editingItem ? "Edit Tender" : "Add Tender"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
