import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { DataTable, type Column, type CustomAction } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { getScopeColumn, getZoneColumn, getInheritanceColumn } from "@/components/admin/scope-column";
import { useScopeLookup } from "@/hooks/use-scope-lookup";
import { insertMenuItemSchema, type MenuItem, type InsertMenuItem, type TaxGroup, type PrintClass, type Slu, type MenuItemSlu, type ModifierGroup, type MenuItemModifierGroup, type MajorGroup, type FamilyGroup, type IngredientPrefix, type MenuItemRecipeIngredient, type Modifier, type ModifierGroupModifier } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Upload, Unlink, Plus, X } from "lucide-react";
import { useConfigOverride } from "@/hooks/use-config-override";

export default function MenuItemsPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();
  
  usePosWebSocket();
  
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedSlus, setSelectedSlus] = useState<string[]>([]);
  const [selectedModifierGroups, setSelectedModifierGroups] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [menuBuildEnabled, setMenuBuildEnabled] = useState(false);
  const [recipeIngredients, setRecipeIngredients] = useState<Array<{modifierId: string; defaultPrefixId: string | null; sortOrder: number}>>([]);

  const { data: menuItems = [], isLoading } = useQuery<MenuItem[]>({
    queryKey: ["/api/menu-items", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/menu-items${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch menu items");
      return res.json();
    },
    enabled: !!selectedEnterpriseId,
  });

  const { data: taxGroups = [] } = useQuery<TaxGroup[]>({
    queryKey: ["/api/tax-groups", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/tax-groups${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch tax groups");
      return res.json();
    },
    enabled: !!selectedEnterpriseId,
  });

  const { data: printClasses = [] } = useQuery<PrintClass[]>({
    queryKey: ["/api/print-classes", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/print-classes${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch print classes");
      return res.json();
    },
    enabled: !!selectedEnterpriseId,
  });

  const { data: slus = [] } = useQuery<Slu[]>({
    queryKey: ["/api/slus", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/slus${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch slus");
      return res.json();
    },
    enabled: !!selectedEnterpriseId,
  });

  const { data: allMenuItemSlus = [] } = useQuery<MenuItemSlu[]>({
    queryKey: ["/api/menu-item-slus", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/menu-item-slus${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch menu item slus");
      return res.json();
    },
    enabled: !!selectedEnterpriseId,
  });

  const { data: modifierGroups = [] } = useQuery<ModifierGroup[]>({
    queryKey: ["/api/modifier-groups", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/modifier-groups${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch modifier groups");
      return res.json();
    },
    enabled: !!selectedEnterpriseId,
  });

  const { data: majorGroups = [] } = useQuery<MajorGroup[]>({
    queryKey: ["/api/major-groups", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/major-groups${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch major groups");
      return res.json();
    },
    enabled: !!selectedEnterpriseId,
  });

  const { data: familyGroups = [] } = useQuery<FamilyGroup[]>({
    queryKey: ["/api/family-groups", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/family-groups${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch family groups");
      return res.json();
    },
    enabled: !!selectedEnterpriseId,
  });

  const { getOverrideActions, filterOverriddenInherited, canDeleteItem, getScopeQueryParams } = useConfigOverride<MenuItem>("menu_item", ["/api/menu-items"]);
  const displayedMenuItems = filterOverriddenInherited(menuItems);

  const filteredMenuItems = categoryFilter === "all"
    ? displayedMenuItems
    : categoryFilter === "unlinked"
    ? displayedMenuItems.filter(item => {
        const linkedSluIds = allMenuItemSlus.filter(l => l.menuItemId === item.id);
        return linkedSluIds.length === 0;
      })
    : displayedMenuItems.filter(item => {
        const linkedSluIds = allMenuItemSlus.filter(l => l.menuItemId === item.id).map(l => l.sluId);
        return linkedSluIds.includes(categoryFilter);
      });

  const columns: Column<MenuItem>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "shortName", header: "Short Name" },
    {
      key: "price",
      header: "Price",
      sortable: true,
      render: (value) => `$${parseFloat(value || "0").toFixed(2)}`,
    },
    {
      key: "id",
      header: "Categories (SLUs)",
      render: (value) => {
        const linkedSluIds = allMenuItemSlus.filter(l => l.menuItemId === value).map(l => l.sluId);
        if (linkedSluIds.length === 0) {
          return <span className="text-muted-foreground text-sm">Not linked</span>;
        }
        const linkedSlus = slus.filter(s => linkedSluIds.includes(s.id));
        return (
          <div className="flex flex-wrap gap-1">
            {linkedSlus.slice(0, 3).map(slu => (
              <Badge key={slu.id} variant="secondary" className="text-xs">
                {slu.buttonLabel || slu.name}
              </Badge>
            ))}
            {linkedSlus.length > 3 && (
              <Badge variant="outline" className="text-xs">+{linkedSlus.length - 3}</Badge>
            )}
          </div>
        );
      },
    },
    {
      key: "taxGroupId",
      header: "Tax Group",
      render: (value) => taxGroups.find((t) => t.id === value)?.name || "-",
    },
    {
      key: "printClassId",
      header: "Print Class",
      render: (value) => printClasses.find((p) => p.id === value)?.name || "-",
    },
    {
      key: "majorGroupId",
      header: "Major Group",
      render: (value) => majorGroups.find((g) => g.id === value)?.name || "-",
    },
    {
      key: "familyGroupId",
      header: "Family Group",
      render: (value) => familyGroups.find((g) => g.id === value)?.name || "-",
    },
    {
      key: "menuBuildEnabled",
      header: "Menu Build",
      render: (value) => (value ? <Badge>Enabled</Badge> : <Badge variant="secondary">-</Badge>),
    },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
    getScopeColumn(),
    getZoneColumn<MenuItem>(scopeLookup),
    getInheritanceColumn<MenuItem>(contextPropertyId, selectedRvcId),
  ];

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", "/api/menu-items/" + id + getScopeQueryParams());
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-items", filterKeys] });
      queryClient.invalidateQueries({ queryKey: ["/api/menu-item-slus", filterKeys] });
      toast({ title: "Menu item deleted" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Failed to delete menu item", variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (items: any[]) => {
      const importParams = new URLSearchParams();
      if (scopePayload.enterpriseId) importParams.set("enterpriseId", scopePayload.enterpriseId);
      if (scopePayload.propertyId) importParams.set("propertyId", scopePayload.propertyId);
      if (scopePayload.rvcId) importParams.set("rvcId", scopePayload.rvcId);
      const response = await apiRequest("POST", `/api/menu-items/import?${importParams.toString()}`, items);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-items", filterKeys] });
      toast({ 
        title: "Import Complete",
        description: data.message || `Processed ${data.imported} items: ${data.created || 0} created, ${data.updated || 0} updated`
      });
    },
    onError: () => {
      toast({ title: "Failed to import menu items", variant: "destructive" });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/menu-items/${id}/unlink-slus`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-items", filterKeys] });
      queryClient.invalidateQueries({ queryKey: ["/api/menu-item-slus", filterKeys] });
      toast({ title: data.message || "Item unlinked from categories and deactivated" });
    },
    onError: () => {
      toast({ title: "Failed to unlink menu item", variant: "destructive" });
    },
  });

  const handleExport = () => {
    if (!selectedEnterpriseId) {
      toast({ title: "Please select an enterprise first", variant: "destructive" });
      return;
    }
    
    if (menuItems.length === 0) {
      toast({ title: "No menu items to export", variant: "destructive" });
      return;
    }
    
    const headers = ["id", "name", "shortName", "price", "color", "active", "majorGroup", "familyGroup"];
    const csvRows = [headers.join(",")];
    
    for (const item of menuItems) {
      const majorGroupName = majorGroups.find(g => g.id === item.majorGroupId)?.name || "";
      const familyGroupName = familyGroups.find(g => g.id === item.familyGroupId)?.name || "";
      const row = [
        `"${item.id}"`,
        `"${(item.name || "").replace(/"/g, '""')}"`,
        `"${(item.shortName || "").replace(/"/g, '""')}"`,
        item.price || "0",
        `"${item.color || "#3B82F6"}"`,
        item.active ? "true" : "false",
        `"${majorGroupName.replace(/"/g, '""')}"`,
        `"${familyGroupName.replace(/"/g, '""')}"`,
      ];
      csvRows.push(row.join(","));
    }
    
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "menu-items.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: `Exported ${menuItems.length} menu items to CSV` });
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.split("\n").filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    const items: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values: string[] = [];
      let current = "";
      let inQuotes = false;
      
      for (const char of lines[i]) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          values.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      
      const item: any = {};
      headers.forEach((header, idx) => {
        let value = values[idx] || "";
        value = value.replace(/^"|"$/g, "").replace(/""/g, '"');
        if (header === "active") {
          item[header] = value.toLowerCase() === "true";
        } else if (header === "price") {
          item[header] = value;
        } else {
          item[header] = value;
        }
      });
      
      if (item.name) {
        items.push(item);
      }
    }
    
    return items;
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedEnterpriseId) {
      toast({ title: "Please select an enterprise first", variant: "destructive" });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }
    
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const items = parseCSV(text);
        if (items.length > 0) {
          importMutation.mutate(items);
        } else {
          toast({ title: "No valid items found in CSV file", variant: "destructive" });
        }
      } catch {
        toast({ title: "Failed to parse CSV file", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const createDuplicate = useMutation({
    mutationFn: async (item: MenuItem) => {
      const response = await apiRequest("POST", "/api/menu-items", {
        ...item,
        name: `${item.name} (Copy)`,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-items", filterKeys] });
      toast({ title: "Menu item duplicated" });
    },
    onError: () => {
      toast({ title: "Failed to duplicate menu item", variant: "destructive" });
    },
  });

  const initialSluIds = editingItem 
    ? allMenuItemSlus.filter(l => l.menuItemId === editingItem.id).map(l => l.sluId)
    : [];

  const { data: existingModGroupLinks = [] } = useQuery<MenuItemModifierGroup[]>({
    queryKey: ["/api/menu-items", editingItem?.id, "modifier-groups"],
    queryFn: async () => {
      if (!editingItem) return [];
      const res = await failoverFetch(`/api/menu-items/${editingItem.id}/modifier-groups`, { headers: getAuthHeaders() });
      return res.json();
    },
    enabled: !!editingItem,
  });

  useEffect(() => {
    if (existingModGroupLinks.length > 0) {
      setSelectedModifierGroups(existingModGroupLinks.map(l => l.modifierGroupId));
    }
  }, [existingModGroupLinks]);

  const { data: ingredientPrefixes = [] } = useQuery<IngredientPrefix[]>({
    queryKey: ["/api/ingredient-prefixes", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/ingredient-prefixes${filterParam}`, { headers: getAuthHeaders() });
      return res.json();
    },
    enabled: !!selectedEnterpriseId && menuBuildEnabled,
  });

  const { data: modifiers = [] } = useQuery<Modifier[]>({
    queryKey: ["/api/modifiers", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/modifiers${filterParam}`, { headers: getAuthHeaders() });
      return res.json();
    },
    enabled: !!selectedEnterpriseId && menuBuildEnabled,
  });

  const { data: modGroupModLinks = [] } = useQuery<ModifierGroupModifier[]>({
    queryKey: ["/api/sync/modifier-group-modifiers"],
    queryFn: async () => {
      const res = await failoverFetch(`/api/sync/modifier-group-modifiers`, { headers: getAuthHeaders() });
      return res.json();
    },
    enabled: !!selectedEnterpriseId && menuBuildEnabled,
  });

  const { data: existingRecipeIngredients = [] } = useQuery<MenuItemRecipeIngredient[]>({
    queryKey: ["/api/menu-items", editingItem?.id, "recipe-ingredients"],
    queryFn: async () => {
      if (!editingItem) return [];
      const res = await failoverFetch(`/api/menu-items/${editingItem.id}/recipe-ingredients`, { headers: getAuthHeaders() });
      return res.json();
    },
    enabled: !!editingItem && menuBuildEnabled,
  });

  useEffect(() => {
    if (existingRecipeIngredients.length > 0) {
      setRecipeIngredients(
        existingRecipeIngredients
          .filter(r => r.modifierId !== null)
          .map(r => ({
            modifierId: r.modifierId!,
            defaultPrefixId: r.defaultPrefixId,
            sortOrder: r.sortOrder ?? 0,
          }))
      );
    }
  }, [existingRecipeIngredients]);

  const form = useForm<InsertMenuItem>({
    resolver: zodResolver(insertMenuItemSchema),
    defaultValues: {
      name: "",
      shortName: "",
      price: "",
      taxGroupId: "__none__",
      printClassId: "__none__",
      majorGroupId: "__none__",
      familyGroupId: "__none__",
      color: "#3B82F6",
      active: true,
      menuBuildEnabled: false,
    },
  });

  useEffect(() => {
    if (formOpen && editingItem) {
      form.reset({
        name: editingItem.name,
        shortName: editingItem.shortName || "",
        price: editingItem.price,
        taxGroupId: editingItem.taxGroupId || "__none__",
        printClassId: editingItem.printClassId || "__none__",
        majorGroupId: editingItem.majorGroupId || "__none__",
        familyGroupId: editingItem.familyGroupId || "__none__",
        color: editingItem.color || "#3B82F6",
        active: editingItem.active ?? true,
        menuBuildEnabled: editingItem.menuBuildEnabled ?? false,
        enterpriseId: editingItem.enterpriseId,
        propertyId: editingItem.propertyId,
        rvcId: editingItem.rvcId,
      });
      setSelectedSlus(initialSluIds);
      setMenuBuildEnabled(editingItem.menuBuildEnabled ?? false);
    } else if (formOpen && !editingItem) {
      form.reset({
        name: "",
        shortName: "",
        price: "",
        taxGroupId: "__none__",
        printClassId: "__none__",
        majorGroupId: "__none__",
        familyGroupId: "__none__",
        color: "#3B82F6",
        active: true,
        menuBuildEnabled: false,
      });
      setSelectedSlus([]);
      setSelectedModifierGroups([]);
      setMenuBuildEnabled(false);
      setRecipeIngredients([]);
    }
  }, [formOpen, editingItem]);

  const toggleSlu = (sluId: string) => {
    setSelectedSlus(prev => 
      prev.includes(sluId)
        ? prev.filter(id => id !== sluId)
        : [...prev, sluId]
    );
  };

  const handleFormSubmit = async (data: InsertMenuItem) => {
    setIsSaving(true);
    try {
      const cleanedData: InsertMenuItem = {
        ...data,
        price: String(data.price),
        taxGroupId: data.taxGroupId === "__none__" ? null : (data.taxGroupId || null),
        printClassId: data.printClassId === "__none__" ? null : (data.printClassId || null),
        majorGroupId: data.majorGroupId === "__none__" ? null : (data.majorGroupId || null),
        familyGroupId: data.familyGroupId === "__none__" ? null : (data.familyGroupId || null),
        menuBuildEnabled,
        ...scopePayload,
      };

      let menuItemId: string;
      
      if (editingItem) {
        const response = await apiRequest("PUT", "/api/menu-items/" + editingItem.id, cleanedData);
        const updated = await response.json();
        menuItemId = updated.id;
      } else {
        const response = await apiRequest("POST", "/api/menu-items", cleanedData);
        const created = await response.json();
        menuItemId = created.id;
      }

      await apiRequest("POST", `/api/menu-items/${menuItemId}/slus`, { sluIds: selectedSlus });
      await apiRequest("PUT", `/api/menu-items/${menuItemId}/modifier-groups`, { modifierGroupIds: selectedModifierGroups });

      if (menuBuildEnabled && recipeIngredients.length > 0) {
        const existingIds = existingRecipeIngredients.map(r => r.id);
        for (const existingId of existingIds) {
          await apiRequest("DELETE", `/api/recipe-ingredients/${existingId}`);
        }
        for (const ingredient of recipeIngredients) {
          await apiRequest("POST", `/api/menu-items/${menuItemId}/recipe-ingredients`, {
            modifierId: ingredient.modifierId,
            defaultPrefixId: ingredient.defaultPrefixId,
            sortOrder: ingredient.sortOrder,
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/menu-items", filterKeys] });
      queryClient.invalidateQueries({ queryKey: ["/api/menu-item-slus", filterKeys] });
      queryClient.invalidateQueries({ queryKey: ["/api/menu-items", menuItemId, "modifier-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/menu-items", menuItemId, "recipe-ingredients"] });
      
      toast({ title: editingItem ? "Menu item updated" : "Menu item created" });
      setFormOpen(false);
      setEditingItem(null);
    } catch (error: any) {
      toast({ title: error.message || "Failed to save menu item", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    form.reset();
    setSelectedSlus([]);
    setSelectedModifierGroups([]);
    setMenuBuildEnabled(false);
    setRecipeIngredients([]);
    setFormOpen(false);
    setEditingItem(null);
  };

  const addRecipeIngredient = (modifierId: string) => {
    if (!recipeIngredients.find(r => r.modifierId === modifierId)) {
      setRecipeIngredients(prev => [...prev, {
        modifierId,
        defaultPrefixId: null,
        sortOrder: prev.length,
      }]);
    }
  };

  const removeRecipeIngredient = (modifierId: string) => {
    setRecipeIngredients(prev => prev.filter(r => r.modifierId !== modifierId));
  };

  const updateIngredientPrefix = (modifierId: string, prefixId: string | null) => {
    setRecipeIngredients(prev => prev.map(r => 
      r.modifierId === modifierId ? { ...r, defaultPrefixId: prefixId } : r
    ));
  };

  const toggleModifierGroup = (groupId: string) => {
    setSelectedModifierGroups(prev => 
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  if (formOpen) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle data-testid="text-form-title">{editingItem ? "Edit Menu Item" : "Add Menu Item"}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancel} disabled={isSaving} data-testid="button-cancel-menu-item">
                  Cancel
                </Button>
                <Button
                  data-testid="button-form-submit"
                  disabled={isSaving}
                  onClick={form.handleSubmit(handleFormSubmit)}
                >
                  {isSaving ? "Saving..." : (editingItem ? "Update" : "Create")}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
                <div className="grid grid-cols-4 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Item Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Cheeseburger" {...field} data-testid="input-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="shortName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Short Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., CHZBGR" {...field} value={field.value || ""} data-testid="input-shortName" />
                        </FormControl>
                        <FormDescription>Abbreviated name for receipts/KDS</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price *</FormLabel>
                        <FormControl>
                          <Input placeholder="0.00" {...field} data-testid="input-price" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Button Color</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={field.value || "#3B82F6"}
                              onChange={(e) => field.onChange(e.target.value)}
                              className="w-10 h-10 rounded border cursor-pointer"
                              data-testid="color-color"
                            />
                            <Input
                              placeholder="#3B82F6"
                              {...field}
                              value={field.value || ""}
                              className="flex-1"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <FormField
                    control={form.control}
                    name="taxGroupId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tax Group</FormLabel>
                        <Select value={field.value || "__none__"} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-taxGroupId">
                              <SelectValue placeholder="Select tax group..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {taxGroups.map(tg => (
                              <SelectItem key={tg.id} value={tg.id}>{tg.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="printClassId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Print Class</FormLabel>
                        <Select value={field.value || "__none__"} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-printClassId">
                              <SelectValue placeholder="Select print class..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {printClasses.map(pc => (
                              <SelectItem key={pc.id} value={pc.id}>{pc.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>Routes items to kitchen printers/KDS</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="majorGroupId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Major Group</FormLabel>
                        <Select value={field.value || "__none__"} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-majorGroupId">
                              <SelectValue placeholder="Select major group..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {majorGroups.map(g => (
                              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>High-level reporting category</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="familyGroupId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Family Group</FormLabel>
                        <Select value={field.value || "__none__"} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-familyGroupId">
                              <SelectValue placeholder="Select family group..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {familyGroups.map(g => (
                              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>Sub-category for detailed reporting</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <FormLabel>Active</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value ?? true}
                          onCheckedChange={field.onChange}
                          data-testid="switch-active"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="pt-4 border-t">
                  <Label className="text-base font-semibold">Category Assignment (SLU)</Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    Select which category this item appears in on the POS.
                  </p>
                  
                  {slus.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                      No categories configured. Create SLUs in the Categories section first.
                    </p>
                  ) : (
                    <Select
                      value={selectedSlus[0] || "__none__"}
                      onValueChange={(value) => {
                        if (value === "__none__") {
                          setSelectedSlus([]);
                        } else {
                          setSelectedSlus([value]);
                        }
                      }}
                    >
                      <SelectTrigger data-testid="select-slu">
                        <SelectValue placeholder="Select a category..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No Category</SelectItem>
                        {slus.map(slu => (
                          <SelectItem key={slu.id} value={slu.id}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded flex-shrink-0" 
                                style={{ backgroundColor: slu.color || "#3B82F6" }} 
                              />
                              {slu.buttonLabel || slu.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  
                  {selectedSlus.length === 0 && slus.length > 0 && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                      Warning: Item won't appear on POS without category assignment
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t">
                  <Label className="text-base font-semibold">Required Modifier Groups</Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    Select modifier groups that customers must choose from when ordering this item.
                  </p>
                  
                  {modifierGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                      No modifier groups configured. Create Modifier Groups in the Modifier Groups section first.
                    </p>
                  ) : (
                    <ScrollArea className="h-[180px] border rounded-md p-3">
                      <div className="space-y-2">
                        {modifierGroups.map(group => (
                          <div
                            key={group.id}
                            className="flex items-center gap-3 p-2 rounded-md hover-elevate"
                          >
                            <Checkbox
                              id={`modgroup-${group.id}`}
                              checked={selectedModifierGroups.includes(group.id)}
                              onCheckedChange={() => toggleModifierGroup(group.id)}
                              data-testid={`checkbox-modgroup-${group.id}`}
                            />
                            <Label
                              htmlFor={`modgroup-${group.id}`}
                              className="flex-1 cursor-pointer flex items-center gap-2"
                            >
                              <span>{group.name}</span>
                              {group.required && (
                                <Badge variant="secondary" className="text-xs">Required</Badge>
                              )}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                  
                  {selectedModifierGroups.length > 0 && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {selectedModifierGroups.length} modifier group{selectedModifierGroups.length > 1 ? "s" : ""} linked
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-base font-semibold">Menu Build / Recipe</Label>
                    <Switch
                      checked={menuBuildEnabled}
                      onCheckedChange={setMenuBuildEnabled}
                      data-testid="switch-menu-build-enabled"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Enable conversational ordering with default ingredients that can be modified (No, Extra, Sub).
                  </p>
                  
                  {menuBuildEnabled && (
                    <>
                      <div className="mb-3">
                        <Label className="text-sm mb-2 block">Select Ingredients from Modifiers</Label>
                        {modifiers.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">
                            No modifiers configured. Create Modifiers in the Modifiers section first.
                          </p>
                        ) : (
                          <ScrollArea className="h-[220px] border rounded-md p-3">
                            <div className="space-y-3">
                              {(() => {
                                const grouped: Record<string, { groupName: string; mods: Modifier[] }> = {};
                                const assignedModIds = new Set<string>();
                                modGroupModLinks.forEach(link => {
                                  const group = modifierGroups.find(g => g.id === link.modifierGroupId);
                                  const mod = modifiers.find(m => m.id === link.modifierId);
                                  if (!group || !mod) return;
                                  if (!grouped[group.id]) grouped[group.id] = { groupName: group.name, mods: [] };
                                  if (!grouped[group.id].mods.find(m => m.id === mod.id)) {
                                    grouped[group.id].mods.push(mod);
                                    assignedModIds.add(mod.id);
                                  }
                                });
                                const ungrouped = modifiers.filter(m => !assignedModIds.has(m.id));
                                const sections = Object.entries(grouped).sort((a, b) => a[1].groupName.localeCompare(b[1].groupName));
                                return (
                                  <>
                                    {sections.map(([groupId, { groupName, mods }]) => (
                                      <div key={groupId}>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{groupName}</p>
                                        <div className="space-y-1">
                                          {mods.sort((a, b) => a.name.localeCompare(b.name)).map(mod => (
                                            <div key={mod.id} className="flex items-center gap-3 p-1.5 rounded-md hover:bg-muted/50">
                                              <Checkbox
                                                id={`recipe-mod-${mod.id}`}
                                                checked={!!recipeIngredients.find(r => r.modifierId === mod.id)}
                                                onCheckedChange={(checked) => {
                                                  if (checked) addRecipeIngredient(mod.id);
                                                  else removeRecipeIngredient(mod.id);
                                                }}
                                                data-testid={`checkbox-recipe-mod-${mod.id}`}
                                              />
                                              <Label htmlFor={`recipe-mod-${mod.id}`} className="flex-1 cursor-pointer text-sm">
                                                {mod.name}
                                              </Label>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                    {ungrouped.length > 0 && (
                                      <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Other</p>
                                        <div className="space-y-1">
                                          {ungrouped.sort((a, b) => a.name.localeCompare(b.name)).map(mod => (
                                            <div key={mod.id} className="flex items-center gap-3 p-1.5 rounded-md hover:bg-muted/50">
                                              <Checkbox
                                                id={`recipe-mod-${mod.id}`}
                                                checked={!!recipeIngredients.find(r => r.modifierId === mod.id)}
                                                onCheckedChange={(checked) => {
                                                  if (checked) addRecipeIngredient(mod.id);
                                                  else removeRecipeIngredient(mod.id);
                                                }}
                                                data-testid={`checkbox-recipe-mod-${mod.id}`}
                                              />
                                              <Label htmlFor={`recipe-mod-${mod.id}`} className="flex-1 cursor-pointer text-sm">
                                                {mod.name}
                                              </Label>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </ScrollArea>
                        )}
                      </div>

                      {recipeIngredients.length > 0 && (
                        <>
                          <Label className="text-sm mb-2 block">{recipeIngredients.length} Selected Ingredient{recipeIngredients.length > 1 ? "s" : ""} — Prefix Settings</Label>
                          <ScrollArea className="h-[150px] border rounded-md p-3">
                            <div className="space-y-2">
                              {recipeIngredients.map((ingredient, idx) => {
                                const mod = modifiers.find(m => m.id === ingredient.modifierId);
                                return (
                                  <div
                                    key={ingredient.modifierId}
                                    className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
                                  >
                                    <span className="text-muted-foreground text-sm w-6">{idx + 1}.</span>
                                    <span className="flex-1">{mod?.name || "Unknown"}</span>
                                    <Select
                                      value={ingredient.defaultPrefixId || "__default__"}
                                      onValueChange={(val) => updateIngredientPrefix(ingredient.modifierId, val === "__default__" ? null : val)}
                                    >
                                      <SelectTrigger className="w-28" data-testid={`select-prefix-${ingredient.modifierId}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__default__">Default</SelectItem>
                                        {ingredientPrefixes.map(prefix => (
                                          <SelectItem key={prefix.id} value={prefix.id}>
                                            {prefix.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => removeRecipeIngredient(ingredient.modifierId)}
                                      data-testid={`button-remove-ingredient-${ingredient.modifierId}`}
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </ScrollArea>
                        </>
                      )}
                    </>
                  )}
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
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48" data-testid="select-category-filter">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="unlinked">Unlinked Items</SelectItem>
              {slus.map((slu) => (
                <SelectItem key={slu.id} value={slu.id}>
                  {slu.buttonLabel || slu.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-menu">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => fileInputRef.current?.click()}
            disabled={importMutation.isPending}
            data-testid="button-import-menu"
          >
            <Upload className="w-4 h-4 mr-2" />
            {importMutation.isPending ? "Importing..." : "Import CSV"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImport}
            className="hidden"
            data-testid="input-import-file"
          />
        </div>
      </div>
      
      <DataTable
        data={filteredMenuItems}
        columns={columns}
        title="Menu Items"
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
        onDuplicate={(item) => createDuplicate.mutate(item)}
        customActions={[
          {
            label: "Unlink from Categories",
            icon: Unlink,
            onClick: (item) => unlinkMutation.mutate(item.id),
          },
          ...getOverrideActions(),
        ] as CustomAction<MenuItem>[]}
        isLoading={isLoading}
        searchPlaceholder="Search menu items..."
        emptyMessage="No menu items configured"
      />
    </div>
  );
}
