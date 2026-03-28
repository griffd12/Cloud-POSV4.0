import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { useEmcFilter } from "@/lib/emc-context";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { Loader2, Plus, Package, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, RotateCcw, Download } from "lucide-react";
import type { Property, InventoryItem, InventoryStock, InventoryTransaction, MenuItem } from "@shared/schema";

const UNIT_TYPES = ["each", "oz", "lb", "kg", "g", "ml", "l", "gal", "qt", "pt", "cup", "tbsp", "tsp"];
const TRANSACTION_TYPES = ["receive", "sale", "waste", "transfer", "adjustment", "count"];

export default function InventoryPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId } = useEmcFilter();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(contextPropertyId || "");

  useEffect(() => {
    if (contextPropertyId) {
      setSelectedPropertyId(contextPropertyId);
    }
  }, [contextPropertyId]);
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const [itemName, setItemName] = useState("");
  const [itemSku, setItemSku] = useState("");
  const [itemCategory, setItemCategory] = useState("");
  const [itemUnitType, setItemUnitType] = useState("each");
  const [itemUnitCost, setItemUnitCost] = useState("");
  const [itemParLevel, setItemParLevel] = useState("");
  const [itemReorderPoint, setItemReorderPoint] = useState("");
  const [itemTrackInventory, setItemTrackInventory] = useState(true);

  const [txItemId, setTxItemId] = useState("");
  const [txType, setTxType] = useState("receive");
  const [txQuantity, setTxQuantity] = useState("");
  const [txNotes, setTxNotes] = useState("");

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: inventoryItems = [], isLoading: itemsLoading } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory-items", selectedPropertyId, filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/inventory-items?propertyId=${selectedPropertyId}${selectedEnterpriseId ? `&enterpriseId=${selectedEnterpriseId}` : ""}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch inventory items");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const { data: inventoryStock = [] } = useQuery<InventoryStock[]>({
    queryKey: ["/api/inventory-stock", selectedPropertyId, filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/inventory-stock?propertyId=${selectedPropertyId}${selectedEnterpriseId ? `&enterpriseId=${selectedEnterpriseId}` : ""}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch inventory stock");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const { data: inventoryTransactions = [] } = useQuery<InventoryTransaction[]>({
    queryKey: ["/api/inventory-transactions", selectedPropertyId, filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/inventory-transactions?propertyId=${selectedPropertyId}${selectedEnterpriseId ? `&enterpriseId=${selectedEnterpriseId}` : ""}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch inventory transactions");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const createItemMutation = useMutation({
    mutationFn: async (data: Partial<InventoryItem>) => {
      const res = await apiRequest("POST", "/api/inventory-items", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items", selectedPropertyId, filterKeys] });
      resetItemDialog();
      toast({ title: "Item Created", description: "Inventory item has been created." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InventoryItem> }) => {
      const res = await apiRequest("PATCH", `/api/inventory-items/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items", selectedPropertyId, filterKeys] });
      resetItemDialog();
      toast({ title: "Item Updated", description: "Inventory item has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createTransactionMutation = useMutation({
    mutationFn: async (data: Partial<InventoryTransaction>) => {
      const res = await apiRequest("POST", "/api/inventory-transactions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-transactions", selectedPropertyId, filterKeys] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-stock", selectedPropertyId, filterKeys] });
      resetTransactionDialog();
      toast({ title: "Transaction Recorded", description: "Inventory transaction has been recorded." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const importFromMenuMutation = useMutation({
    mutationFn: async (propertyId: string) => {
      const res = await apiRequest("POST", "/api/inventory-items/import-from-menu", { propertyId, enterpriseId: selectedEnterpriseId });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items", selectedPropertyId, filterKeys] });
      if (data.imported > 0) {
        toast({ 
          title: "Menu Items Imported", 
          description: `Imported ${data.imported} item(s) from menu.${data.skipped > 0 ? ` Skipped ${data.skipped} existing item(s).` : ""}` 
        });
      } else if (data.skipped > 0) {
        toast({ 
          title: "No New Items", 
          description: `All ${data.skipped} menu items already exist in inventory.` 
        });
      } else {
        toast({ 
          title: "No Menu Items", 
          description: "No menu items found for this property." 
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Import Failed", description: error.message, variant: "destructive" });
    },
  });

  const resetItemDialog = () => {
    setItemName("");
    setItemSku("");
    setItemCategory("");
    setItemUnitType("each");
    setItemUnitCost("");
    setItemParLevel("");
    setItemReorderPoint("");
    setItemTrackInventory(true);
    setEditingItem(null);
    setShowItemDialog(false);
  };

  const resetTransactionDialog = () => {
    setTxItemId("");
    setTxType("receive");
    setTxQuantity("");
    setTxNotes("");
    setShowTransactionDialog(false);
  };

  const handleCancelItem = () => {
    setShowItemDialog(false);
    setEditingItem(null);
    setItemName("");
    setItemSku("");
    setItemCategory("");
    setItemUnitType("each");
    setItemUnitCost("");
    setItemParLevel("");
    setItemReorderPoint("");
    setItemTrackInventory(true);
  };

  const handleCancelTransaction = () => {
    setShowTransactionDialog(false);
    setTxItemId("");
    setTxType("receive");
    setTxQuantity("");
    setTxNotes("");
  };

  const openEditDialog = (item: InventoryItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemSku(item.sku || "");
    setItemCategory(item.category || "");
    setItemUnitType(item.unitType || "each");
    setItemUnitCost(item.unitCost || "");
    setItemParLevel(item.parLevel || "");
    setItemReorderPoint(item.reorderPoint || "");
    setItemTrackInventory(item.trackInventory ?? true);
    setShowItemDialog(true);
  };

  const handleSaveItem = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!itemName) return;
    
    const data = {
      name: itemName,
      propertyId: selectedPropertyId,
      sku: itemSku || undefined,
      category: itemCategory || undefined,
      unitType: itemUnitType,
      unitCost: itemUnitCost || undefined,
      parLevel: itemParLevel || undefined,
      reorderPoint: itemReorderPoint || undefined,
      trackInventory: itemTrackInventory,
    };

    if (editingItem) {
      updateItemMutation.mutate({ id: editingItem.id, data });
    } else {
      createItemMutation.mutate(data);
    }
  };

  const handleSaveTransaction = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!txItemId || !txQuantity) return;
    createTransactionMutation.mutate({
      inventoryItemId: txItemId,
      propertyId: selectedPropertyId,
      transactionType: txType,
      quantity: txQuantity,
      businessDate: format(new Date(), "yyyy-MM-dd"),
      reason: txNotes || undefined,
    });
  };

  const getStockForItem = (itemId: string) => {
    const stock = inventoryStock.find(s => s.inventoryItemId === itemId);
    return stock ? parseFloat(stock.currentQuantity || "0") : 0;
  };

  const isLowStock = (item: InventoryItem) => {
    if (!item.reorderPoint) return false;
    const stock = getStockForItem(item.id);
    return stock <= parseFloat(item.reorderPoint);
  };

  const formatCurrency = (value: string | null | undefined) => {
    if (!value) return "-";
    return `$${parseFloat(value).toFixed(2)}`;
  };

  if (showItemDialog) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>{editingItem ? "Edit Item" : "Add Inventory Item"}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancelItem} data-testid="button-cancel-item">
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveItem}
                  disabled={!itemName || createItemMutation.isPending || updateItemMutation.isPending}
                  data-testid="button-save-item"
                >
                  {(createItemMutation.isPending || updateItemMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingItem ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveItem} className="space-y-6">
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g., Chicken Breast" data-testid="input-item-name" />
                </div>
                <div className="space-y-2">
                  <Label>SKU</Label>
                  <Input value={itemSku} onChange={(e) => setItemSku(e.target.value)} placeholder="Optional" data-testid="input-item-sku" />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input value={itemCategory} onChange={(e) => setItemCategory(e.target.value)} placeholder="e.g., Proteins" data-testid="input-item-category" />
                </div>
                <div className="space-y-2">
                  <Label>Unit Type</Label>
                  <Select value={itemUnitType} onValueChange={setItemUnitType}>
                    <SelectTrigger data-testid="select-unit-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNIT_TYPES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Unit Cost</Label>
                  <Input type="number" step="0.01" value={itemUnitCost} onChange={(e) => setItemUnitCost(e.target.value)} placeholder="0.00" data-testid="input-unit-cost" />
                </div>
                <div className="space-y-2">
                  <Label>Par Level</Label>
                  <Input type="number" step="0.1" value={itemParLevel} onChange={(e) => setItemParLevel(e.target.value)} placeholder="0" data-testid="input-par-level" />
                </div>
                <div className="space-y-2">
                  <Label>Reorder Point</Label>
                  <Input type="number" step="0.1" value={itemReorderPoint} onChange={(e) => setItemReorderPoint(e.target.value)} placeholder="0" data-testid="input-reorder-point" />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={itemTrackInventory} onCheckedChange={setItemTrackInventory} data-testid="switch-track" />
                  <Label>Track Inventory</Label>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showTransactionDialog) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>Record Inventory Transaction</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancelTransaction} data-testid="button-cancel-transaction">
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveTransaction}
                  disabled={!txItemId || !txQuantity || createTransactionMutation.isPending}
                  data-testid="button-save-transaction"
                >
                  {createTransactionMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Record
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveTransaction} className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Item</Label>
                  <Select value={txItemId} onValueChange={setTxItemId}>
                    <SelectTrigger data-testid="select-tx-item"><SelectValue placeholder="Select item..." /></SelectTrigger>
                    <SelectContent>
                      {inventoryItems.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Transaction Type</Label>
                  <Select value={txType} onValueChange={setTxType}>
                    <SelectTrigger data-testid="select-tx-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TRANSACTION_TYPES.map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input type="number" step="0.1" value={txQuantity} onChange={(e) => setTxQuantity(e.target.value)} placeholder="0" data-testid="input-tx-quantity" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={txNotes} onChange={(e) => setTxNotes(e.target.value)} placeholder="Optional notes..." data-testid="input-tx-notes" />
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
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Inventory Management</h1>
          <p className="text-muted-foreground">Track inventory items, stock levels, and transactions</p>
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
        <Tabs defaultValue="items" className="space-y-4">
          <TabsList>
            <TabsTrigger value="items" data-testid="tab-items">Items</TabsTrigger>
            <TabsTrigger value="stock" data-testid="tab-stock">Stock Levels</TabsTrigger>
            <TabsTrigger value="transactions" data-testid="tab-transactions">Transactions</TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => importFromMenuMutation.mutate(selectedPropertyId)} 
                disabled={importFromMenuMutation.isPending}
                data-testid="button-import-from-menu"
              >
                {importFromMenuMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Import from Menu
              </Button>
              <Button onClick={() => setShowItemDialog(true)} data-testid="button-add-item">
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </div>

            {itemsLoading ? (
              <Card><CardContent className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
            ) : inventoryItems.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No inventory items.</CardContent></Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventoryItems.map(item => (
                        <TableRow key={item.id} className="cursor-pointer hover-elevate" onClick={() => openEditDialog(item)} data-testid={`row-item-${item.id}`}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>
                            {(item as any).menuItemId ? (
                              <Badge variant="secondary" className="text-xs">Menu</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">Manual</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-sm">{item.sku || "-"}</TableCell>
                          <TableCell>{item.category || "-"}</TableCell>
                          <TableCell>{item.unitType}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.unitCost)}</TableCell>
                          <TableCell className="text-right font-medium">{getStockForItem(item.id).toFixed(2)}</TableCell>
                          <TableCell>
                            {isLowStock(item) ? (
                              <Badge variant="destructive" className="gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Low
                              </Badge>
                            ) : (
                              <Badge variant="secondary">OK</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="stock" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Current Stock Levels</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inventoryItems.filter(i => i.trackInventory).map(item => {
                    const stock = getStockForItem(item.id);
                    const low = isLowStock(item);
                    return (
                      <Card key={item.id} className={low ? "border-destructive" : ""} data-testid={`card-stock-${item.id}`}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Package className="w-4 h-4" />
                            {item.name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-end justify-between">
                            <div>
                              <p className="text-2xl font-bold">{stock.toFixed(1)}</p>
                              <p className="text-sm text-muted-foreground">{item.unitType}</p>
                            </div>
                            {low && <AlertTriangle className="w-5 h-5 text-destructive" />}
                          </div>
                          {item.parLevel && (
                            <p className="text-xs text-muted-foreground mt-2">Par: {item.parLevel}</p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowTransactionDialog(true)} data-testid="button-add-transaction">
                <Plus className="w-4 h-4 mr-2" />
                Record Transaction
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryTransactions.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No transactions recorded.</TableCell></TableRow>
                    ) : (
                      inventoryTransactions.map(tx => (
                        <TableRow key={tx.id} data-testid={`row-tx-${tx.id}`}>
                          <TableCell>{tx.createdAt ? format(new Date(tx.createdAt), "MMM d, h:mm a") : "-"}</TableCell>
                          <TableCell>{inventoryItems.find(i => i.id === tx.inventoryItemId)?.name || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{tx.transactionType}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">{tx.quantity}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{tx.reason || "-"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
