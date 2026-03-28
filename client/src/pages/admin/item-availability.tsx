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
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { Loader2, AlertTriangle, Check, X, Plus, RefreshCw, UtensilsCrossed } from "lucide-react";
import type { Property, MenuItem, ItemAvailability, PrepItem } from "@shared/schema";

export default function ItemAvailabilityPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId } = useEmcFilter();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(contextPropertyId || "");

  useEffect(() => {
    if (contextPropertyId) {
      setSelectedPropertyId(contextPropertyId);
    }
  }, [contextPropertyId]);
  const [showAvailabilityDialog, setShowAvailabilityDialog] = useState(false);
  const [showPrepDialog, setShowPrepDialog] = useState(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [availableQuantity, setAvailableQuantity] = useState("");
  const [initialQuantity, setInitialQuantity] = useState("");
  
  const [prepName, setPrepName] = useState("");
  const [prepQuantity, setPrepQuantity] = useState("");
  const [prepUnit, setPrepUnit] = useState("each");

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["/api/menu-items", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/menu-items${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch menu items");
      return res.json();
    },
  });

  const { data: itemAvailability = [], isLoading: availabilityLoading } = useQuery<ItemAvailability[]>({
    queryKey: ["/api/item-availability", selectedPropertyId, filterKeys],
    queryFn: async () => {
      if (!selectedPropertyId) return [];
      const params = new URLSearchParams();
      params.set("propertyId", selectedPropertyId);
      if (selectedEnterpriseId) params.set("enterpriseId", selectedEnterpriseId);
      const res = await failoverFetch(`/api/item-availability?${params.toString()}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const { data: prepItems = [], isLoading: prepLoading } = useQuery<PrepItem[]>({
    queryKey: ["/api/prep-items", selectedPropertyId, filterKeys],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("propertyId", selectedPropertyId);
      if (selectedEnterpriseId) params.set("enterpriseId", selectedEnterpriseId);
      const res = await failoverFetch(`/api/prep-items?${params.toString()}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch prep items");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const updateAvailabilityMutation = useMutation({
    mutationFn: async (data: { menuItemId: string; propertyId: string; currentQuantity?: number; initialQuantity?: number; businessDate: string }) => {
      const res = await apiRequest("POST", "/api/item-availability", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/item-availability", selectedPropertyId, filterKeys] });
      resetAvailabilityDialog();
      toast({ title: "Availability Updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const mark86Mutation = useMutation({
    mutationFn: async (availabilityId: string) => {
      const res = await apiRequest("POST", `/api/item-availability/${availabilityId}/86`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/item-availability", selectedPropertyId, filterKeys] });
      toast({ title: "Item Marked as 86'd", description: "Item has been marked as sold out." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createPrepMutation = useMutation({
    mutationFn: async (data: Partial<PrepItem>) => {
      const res = await apiRequest("POST", "/api/prep-items", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prep-items", selectedPropertyId, filterKeys] });
      resetPrepDialog();
      toast({ title: "Prep Item Created" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetAvailabilityDialog = () => {
    setSelectedMenuItem(null);
    setAvailableQuantity("");
    setInitialQuantity("");
    setShowAvailabilityDialog(false);
  };

  const resetPrepDialog = () => {
    setPrepName("");
    setPrepQuantity("");
    setPrepUnit("each");
    setShowPrepDialog(false);
  };

  const handleCancelAvailability = () => {
    setShowAvailabilityDialog(false);
    setSelectedMenuItem(null);
    setAvailableQuantity("");
    setInitialQuantity("");
  };

  const handleCancelPrep = () => {
    setShowPrepDialog(false);
    setPrepName("");
    setPrepQuantity("");
    setPrepUnit("each");
  };

  const openAvailabilityDialog = (item: MenuItem) => {
    const existing = itemAvailability.find(a => a.menuItemId === item.id);
    setSelectedMenuItem(item);
    setAvailableQuantity(existing?.currentQuantity?.toString() || "");
    setInitialQuantity(existing?.initialQuantity?.toString() || "");
    setShowAvailabilityDialog(true);
  };

  const handleSaveAvailability = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedMenuItem || !selectedPropertyId) return;
    updateAvailabilityMutation.mutate({
      menuItemId: selectedMenuItem.id,
      propertyId: selectedPropertyId,
      currentQuantity: availableQuantity ? parseInt(availableQuantity) : undefined,
      initialQuantity: initialQuantity ? parseInt(initialQuantity) : undefined,
      businessDate: format(new Date(), "yyyy-MM-dd"),
    });
  };

  const handleCreatePrep = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prepName || !prepQuantity || !selectedPropertyId) return;
    createPrepMutation.mutate({
      propertyId: selectedPropertyId,
      name: prepName,
      currentLevel: parseInt(prepQuantity),
      parLevel: parseInt(prepQuantity),
      unit: prepUnit,
    });
  };

  const getAvailabilityForItem = (itemId: string) => {
    return itemAvailability.find(a => a.menuItemId === itemId);
  };

  const isLowStock = (availability: ItemAvailability | undefined) => {
    if (!availability || availability.currentQuantity === null || availability.currentQuantity === undefined) return false;
    return availability.currentQuantity <= 5;
  };

  const sold86Items = itemAvailability.filter(a => a.is86ed);
  const lowStockItems = itemAvailability.filter(a => isLowStock(a) && !a.is86ed);

  if (showAvailabilityDialog) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>Update Availability - {selectedMenuItem?.name}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancelAvailability} data-testid="button-cancel-availability">
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveAvailability}
                  disabled={updateAvailabilityMutation.isPending}
                  data-testid="button-save-availability"
                >
                  {updateAvailabilityMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveAvailability} className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Current Quantity</Label>
                  <Input type="number" value={availableQuantity} onChange={(e) => setAvailableQuantity(e.target.value)} placeholder="0" data-testid="input-available-qty" />
                </div>
                <div className="space-y-2">
                  <Label>Initial Quantity</Label>
                  <Input type="number" value={initialQuantity} onChange={(e) => setInitialQuantity(e.target.value)} placeholder="0" data-testid="input-threshold" />
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showPrepDialog) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>Add Prep Item</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancelPrep} data-testid="button-cancel-prep">
                  Cancel
                </Button>
                <Button
                  onClick={handleCreatePrep}
                  disabled={!prepName || !prepQuantity || createPrepMutation.isPending}
                  data-testid="button-save-prep"
                >
                  {createPrepMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreatePrep} className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={prepName} onChange={(e) => setPrepName(e.target.value)} placeholder="e.g., Sliced Tomatoes" data-testid="input-prep-name" />
                </div>
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input type="number" value={prepQuantity} onChange={(e) => setPrepQuantity(e.target.value)} placeholder="0" data-testid="input-prep-qty" />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Select value={prepUnit} onValueChange={setPrepUnit}>
                    <SelectTrigger data-testid="select-prep-unit"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="each">Each</SelectItem>
                      <SelectItem value="portions">Portions</SelectItem>
                      <SelectItem value="oz">Oz</SelectItem>
                      <SelectItem value="lb">Lb</SelectItem>
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
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Item Availability</h1>
          <p className="text-muted-foreground">Track menu item availability and prep countdown</p>
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
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <X className="w-4 h-4 text-destructive" />
                  86'd Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-destructive">{sold86Items.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  Low Stock
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-yellow-600">{lowStockItems.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" />
                  Available
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-600">{itemAvailability.filter(a => !a.is86ed && !isLowStock(a)).length}</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="availability" className="space-y-4">
            <TabsList>
              <TabsTrigger value="availability" data-testid="tab-availability">Availability</TabsTrigger>
              <TabsTrigger value="86d" data-testid="tab-86d">86'd Items ({sold86Items.length})</TabsTrigger>
              <TabsTrigger value="prep" data-testid="tab-prep">Prep Items</TabsTrigger>
            </TabsList>

            <TabsContent value="availability" className="space-y-4">
              {availabilityLoading ? (
                <Card><CardContent className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Menu Item</TableHead>
                          <TableHead className="text-right">Available</TableHead>
                          <TableHead className="text-right">Threshold</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {menuItems.slice(0, 20).map(item => {
                          const availability = getAvailabilityForItem(item.id);
                          const low = isLowStock(availability);
                          return (
                            <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                              <TableCell className="font-medium">{item.name}</TableCell>
                              <TableCell className="text-right">{availability?.currentQuantity ?? "-"}</TableCell>
                              <TableCell className="text-right">{availability?.initialQuantity ?? "-"}</TableCell>
                              <TableCell>
                                {availability?.is86ed ? (
                                  <Badge variant="destructive">86'd</Badge>
                                ) : low ? (
                                  <Badge className="bg-yellow-500">Low</Badge>
                                ) : (
                                  <Badge variant="secondary">OK</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" onClick={() => openAvailabilityDialog(item)}>
                                    Edit
                                  </Button>
                                  {availability && !availability.is86ed && (
                                    <Button size="sm" variant="destructive" onClick={() => mark86Mutation.mutate(availability.id)}>
                                      86
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="86d" className="space-y-4">
              {sold86Items.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">No 86'd items.</CardContent></Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sold86Items.map(item => {
                    const menuItem = menuItems.find(m => m.id === item.menuItemId);
                    return (
                      <Card key={item.id} className="border-destructive" data-testid={`card-86-${item.id}`}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <X className="w-4 h-4 text-destructive" />
                            {menuItem?.name || "Unknown Item"}
                          </CardTitle>
                          <CardDescription>
                            86'd at {item.eightySixedAt ? format(new Date(item.eightySixedAt), "h:mm a") : "-"}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Button size="sm" variant="outline" className="w-full">
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Restore
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="prep" className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setShowPrepDialog(true)} data-testid="button-add-prep">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Prep Item
                </Button>
              </div>

              {prepLoading ? (
                <Card><CardContent className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
              ) : prepItems.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">No prep items configured.</CardContent></Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {prepItems.map(prep => {
                    const currentQty = prep.currentLevel || 0;
                    const parLevel = prep.parLevel || 100;
                    const percentage = Math.min((currentQty / parLevel) * 100, 100);
                    return (
                      <Card key={prep.id} data-testid={`card-prep-${prep.id}`}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <UtensilsCrossed className="w-4 h-4" />
                            {prep.name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span>Current: {currentQty} {prep.unit}</span>
                            <span className="text-muted-foreground">Par: {parLevel}</span>
                          </div>
                          <Progress value={percentage} className={percentage < 25 ? "bg-destructive/20" : ""} />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
