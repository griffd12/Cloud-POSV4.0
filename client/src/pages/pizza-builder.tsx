import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePosContext } from "@/lib/pos-context";
import { apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, Minus, Plus, Pizza } from "lucide-react";
import type { MenuItem, Modifier } from "@shared/schema";

type PizzaSection = "whole" | "left" | "right" | "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
type SectionMode = "whole" | "half" | "quarter";

interface ToppingSelection {
  modifier: Modifier;
  sections: PizzaSection[];
  quantity: number;
}

const SECTION_LABELS: Record<PizzaSection, string> = {
  whole: "Whole Pizza",
  left: "Left Half",
  right: "Right Half",
  topLeft: "Top Left",
  topRight: "Top Right",
  bottomLeft: "Bottom Left",
  bottomRight: "Bottom Right",
};

const HALF_SECTIONS: PizzaSection[] = ["left", "right"];
const QUARTER_SECTIONS: PizzaSection[] = ["topLeft", "topRight", "bottomLeft", "bottomRight"];

export default function PizzaBuilderPage() {
  const [location, navigate] = useLocation();
  const [, params] = useRoute("/pos/pizza-builder/:menuItemId");
  const menuItemId = params?.menuItemId;
  const { toast } = useToast();

  // Parse editCheckItemId from URL query params
  // Note: wouter's useLocation only returns the path, not query string
  // We must use window.location.search for query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const editCheckItemId = urlParams.get('editCheckItemId');

  const {
    currentEmployee,
    currentCheck,
    currentRvc,
    setCheckItems,
    checkItems,
  } = usePosContext();

  const [sectionMode, setSectionMode] = useState<SectionMode>("whole");
  const [activeSection, setActiveSection] = useState<PizzaSection>("whole");
  const [selections, setSelections] = useState<Map<string, ToppingSelection>>(new Map());
  const [selectedSauce, setSelectedSauce] = useState<Modifier | null>(null);
  const [toppingTab, setToppingTab] = useState("proteins");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasInitializedEditing, setHasInitializedEditing] = useState(false);

  const { data: menuItem, isLoading: menuItemLoading } = useQuery<MenuItem>({
    queryKey: ["/api/menu-items", menuItemId],
    queryFn: async () => {
      const res = await failoverFetch(`/api/menu-items/${menuItemId}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch menu item");
      return res.json();
    },
    enabled: !!menuItemId,
  });

  const { data: modifiers, isLoading: modifiersLoading } = useQuery<Modifier[]>({
    queryKey: ["/api/modifiers", currentRvc?.propertyId],
    queryFn: async () => {
      const res = await failoverFetch(`/api/modifiers?propertyId=${currentRvc?.propertyId}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch modifiers");
      return res.json();
    },
    enabled: !!currentRvc?.propertyId,
  });

  // Fetch the check item directly from server when editing (don't rely on context)
  const { data: editingCheckItem } = useQuery<{
    id: string;
    menuItemId: string | null;
    menuItemName: string | null;
    modifiers: { name: string; priceDelta: string; prefix?: string }[] | null;
  }>({
    queryKey: ["/api/check-items", editCheckItemId],
    queryFn: async () => {
      const res = await failoverFetch(`/api/check-items/${editCheckItemId}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch check item");
      return res.json();
    },
    enabled: !!editCheckItemId,
  });

  const { toppings, sauces } = useMemo(() => {
    if (!modifiers) return { toppings: [], sauces: [] };
    
    const sauceList: Modifier[] = [];
    const toppingList: Modifier[] = [];
    
    modifiers.forEach(m => {
      const name = m.name.toLowerCase();
      if (name.includes("sauce") || name === "pesto sauce") {
        sauceList.push(m);
      } else {
        toppingList.push(m);
      }
    });
    
    return { toppings: toppingList, sauces: sauceList };
  }, [modifiers]);

  useEffect(() => {
    if (sauces.length > 0 && !selectedSauce) {
      const pizzaSauce = sauces.find(s => s.name === "Pizza Sauce");
      setSelectedSauce(pizzaSauce || sauces[0]);
    }
  }, [sauces, selectedSauce]);

  // Pre-populate selections when editing an existing check item
  useEffect(() => {
    // Wait until we have all the data needed from the server
    if (!editCheckItemId || !modifiers || modifiers.length === 0 || hasInitializedEditing) {
      return;
    }
    
    // Use the server-fetched check item data
    if (!editingCheckItem?.modifiers || editingCheckItem.modifiers.length === 0) {
      // If no modifiers found, don't block - user can add new ones
      return;
    }
    
    const newSelections = new Map<string, ToppingSelection>();
    
    editingCheckItem.modifiers.forEach(mod => {
      // Parse section from modifier name (e.g., "Pepperoni (Left Half)")
      const sectionMatch = mod.name.match(/\(([^)]+)\)/);
      let section: PizzaSection = "whole";
      
      if (sectionMatch) {
        const sectionLabel = sectionMatch[1];
        const sectionEntry = Object.entries(SECTION_LABELS).find(([, label]) => label === sectionLabel);
        if (sectionEntry) {
          section = sectionEntry[0] as PizzaSection;
        }
      }
      
      // Parse quantity from modifier name (e.g., "Pepperoni x2")
      const quantityMatch = mod.name.match(/x(\d+)$/);
      const quantity = quantityMatch ? parseInt(quantityMatch[1]) : 1;
      
      // Find the base modifier - strip section label and quantity
      const baseName = mod.name.replace(/\s*\([^)]+\)/, '').replace(/\s*x\d+$/, '').trim();
      
      // Try exact match first, then case-insensitive
      let modifier = modifiers.find(m => m.name === baseName);
      if (!modifier) {
        modifier = modifiers.find(m => m.name.toLowerCase() === baseName.toLowerCase());
      }
      
      if (modifier) {
        // Check if it's a sauce
        if (baseName.toLowerCase().includes('sauce')) {
          setSelectedSauce(modifier);
        } else {
          // It's a topping
          const existing = newSelections.get(modifier.id);
          if (existing) {
            if (!existing.sections.includes(section)) {
              existing.sections.push(section);
            }
          } else {
            newSelections.set(modifier.id, {
              modifier,
              sections: [section],
              quantity,
            });
          }
        }
      }
    });
    
    // Determine section mode from selections
    const allSections = new Set<PizzaSection>();
    newSelections.forEach(sel => sel.sections.forEach(s => allSections.add(s)));
    if (allSections.has('topLeft') || allSections.has('topRight') || allSections.has('bottomLeft') || allSections.has('bottomRight')) {
      setSectionMode('quarter');
    } else if (allSections.has('left') || allSections.has('right')) {
      setSectionMode('half');
    }
    
    if (newSelections.size > 0) {
      setSelections(newSelections);
    }
    setHasInitializedEditing(true);
  }, [editCheckItemId, editingCheckItem, modifiers, hasInitializedEditing]);

  const sizePriceMultiplier = useMemo(() => {
    if (!menuItem) return 1;
    const name = menuItem.name.toLowerCase();
    if (name.includes("18") || name.includes("x-large")) return 1.4;
    if (name.includes("14") || name.includes("large")) return 1.2;
    return 1;
  }, [menuItem]);

  const handleSectionModeChange = (mode: SectionMode) => {
    setSectionMode(mode);
    if (mode === "whole") {
      setActiveSection("whole");
    } else if (mode === "half") {
      setActiveSection("left");
    } else {
      setActiveSection("topLeft");
    }
  };

  const toggleTopping = (topping: Modifier) => {
    setSelections(prev => {
      const updated = new Map(prev);
      const existing = updated.get(topping.id);

      if (existing) {
        const sections = existing.sections;
        const hasSection = sections.includes(activeSection);
        
        if (hasSection) {
          const newSections = sections.filter(s => s !== activeSection);
          if (newSections.length === 0) {
            updated.delete(topping.id);
          } else {
            updated.set(topping.id, { ...existing, sections: newSections });
          }
        } else {
          updated.set(topping.id, { ...existing, sections: [...sections, activeSection] });
        }
      } else {
        updated.set(topping.id, {
          modifier: topping,
          sections: [activeSection],
          quantity: 1,
        });
      }

      return updated;
    });
  };

  const adjustQuantity = (topping: Modifier, delta: number) => {
    setSelections(prev => {
      const updated = new Map(prev);
      const existing = updated.get(topping.id);
      if (existing) {
        const newQuantity = Math.max(0, Math.min(3, existing.quantity + delta));
        if (newQuantity === 0) {
          updated.delete(topping.id);
        } else {
          updated.set(topping.id, { ...existing, quantity: newQuantity });
        }
      }
      return updated;
    });
  };

  const isToppingSelectedForActiveSection = (toppingId: string): boolean => {
    const selection = selections.get(toppingId);
    if (!selection) return false;
    return selection.sections.includes(activeSection);
  };

  const getToppingsForSection = useCallback((section: PizzaSection): Modifier[] => {
    const result: Modifier[] = [];
    selections.forEach(sel => {
      if (sel.sections.includes(section)) {
        result.push(sel.modifier);
      }
    });
    return result;
  }, [selections]);

  const calculatePrice = useMemo(() => {
    if (!menuItem) return 0;
    let total = parseFloat(menuItem.price || "0");

    selections.forEach(sel => {
      const toppingPrice = parseFloat(sel.modifier.priceDelta || "0") * sizePriceMultiplier;
      let sectionMultiplier = 1;

      if (sectionMode === "half") {
        const leftSelected = sel.sections.includes("left");
        const rightSelected = sel.sections.includes("right");
        if (leftSelected && rightSelected) {
          sectionMultiplier = 1;
        } else if (leftSelected || rightSelected) {
          sectionMultiplier = 0.5;
        }
      } else if (sectionMode === "quarter") {
        const quarterCount = sel.sections.filter(s => QUARTER_SECTIONS.includes(s)).length;
        sectionMultiplier = quarterCount / 4;
      }

      total += toppingPrice * sectionMultiplier * sel.quantity;
    });

    return total;
  }, [menuItem, selections, sectionMode, sizePriceMultiplier]);

  const handleAddToCheck = async () => {
    if (!menuItem || !currentCheck) return;
    
    // Defensive check: if we're in edit mode but the check item data hasn't loaded yet,
    // prevent premature submission that would fail or cause unexpected behavior
    if (editCheckItemId && !editingCheckItem) {
      toast({ title: "Loading pizza details...", variant: "default" });
      return;
    }
    
    setIsSubmitting(true);
    try {
      const modifiersList: { id: string; name: string; priceDelta: string }[] = [];

      if (selectedSauce) {
        modifiersList.push({
          id: selectedSauce.id,
          name: selectedSauce.name,
          priceDelta: selectedSauce.priceDelta || "0",
        });
      }

      // Note: priceDelta is set to "0" because the total price (unitPrice) already includes
      // all topping costs calculated with section fractions and quantity multipliers.
      // The modifier names show what was added for display purposes only.
      selections.forEach(sel => {
        sel.sections.forEach(section => {
          const sectionLabel = section === "whole" ? "" : ` (${SECTION_LABELS[section]})`;
          modifiersList.push({
            id: sel.modifier.id,
            name: `${sel.modifier.name}${sectionLabel}${sel.quantity > 1 ? ` x${sel.quantity}` : ""}`,
            priceDelta: "0", // Price already included in unitPrice
          });
        });
      });

      if (editCheckItemId) {
        // Update existing check item with new modifiers and recalculated price
        const response = await apiRequest("PUT", `/api/check-items/${editCheckItemId}/modifiers`, {
          modifiers: modifiersList,
          unitPrice: calculatePrice.toFixed(2),
        });
        const updatedItem = await response.json();
        setCheckItems((prev: any[]) => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
        toast({ title: "Pizza updated" });
      } else {
        // Add new item
        const response = await apiRequest("POST", "/api/checks/" + currentCheck.id + "/items", {
          menuItemId: menuItem.id,
          menuItemName: menuItem.name,
          unitPrice: calculatePrice.toFixed(2),
          modifiers: modifiersList,
          quantity: 1,
        });
        const newItem = await response.json();
        setCheckItems((prev: any[]) => [...prev, newItem]);
        toast({ title: "Pizza added to check" });
      }
      
      navigate("/pos");
    } catch (error) {
      toast({ title: editCheckItemId ? "Failed to update pizza" : "Failed to add pizza", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate("/pos");
  };

  const groupedToppings = useMemo(() => {
    const proteins: Modifier[] = [];
    const veggies: Modifier[] = [];
    const cheeses: Modifier[] = [];
    const premium: Modifier[] = [];

    toppings.forEach(t => {
      const price = parseFloat(t.priceDelta || "0");
      const name = t.name.toLowerCase();

      if (price >= 4) {
        premium.push(t);
      } else if (name.includes("cheese") || name.includes("mozzarella") || name.includes("parmesan") || name.includes("ricotta") || name.includes("feta")) {
        cheeses.push(t);
      } else if (name.includes("chicken") || name.includes("pepperoni") || name.includes("bacon") || name.includes("sausage") || name.includes("meatball") || name.includes("ham") || name.includes("canadian") || name.includes("vegan")) {
        proteins.push(t);
      } else {
        veggies.push(t);
      }
    });

    return { proteins, veggies, cheeses, premium };
  }, [toppings]);

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;

  const availableSections = sectionMode === "whole" ? ["whole"] : sectionMode === "half" ? HALF_SECTIONS : QUARTER_SECTIONS;

  if (!currentEmployee || !currentCheck) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="p-6">
          <CardContent>
            <p className="text-muted-foreground">No active check. Please return to POS.</p>
            <Button className="mt-4" onClick={() => navigate("/pos")}>
              Return to POS
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (menuItemLoading || modifiersLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!menuItem) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="p-6">
          <CardContent>
            <p className="text-muted-foreground">Pizza item not found.</p>
            <Button className="mt-4" onClick={() => navigate("/pos")}>
              Return to POS
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleCancel} data-testid="button-pizza-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Pizza className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-semibold">{menuItem.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-2xl font-bold" data-testid="text-pizza-total">
            {formatPrice(calculatePrice)}
          </div>
          <Button variant="outline" onClick={handleCancel} data-testid="button-pizza-cancel">
            Cancel
          </Button>
          <Button 
            onClick={handleAddToCheck} 
            disabled={isSubmitting || (!!editCheckItemId && !hasInitializedEditing)} 
            data-testid="button-pizza-add"
          >
            {isSubmitting 
              ? (editCheckItemId ? "Updating..." : "Adding...") 
              : (editCheckItemId && !hasInitializedEditing)
                ? "Loading..."
                : (editCheckItemId ? "Update" : "Add to Check")}
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[380px] flex flex-col border-r bg-muted/30 p-4">
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Pizza Style</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button
                  variant={sectionMode === "whole" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => handleSectionModeChange("whole")}
                  data-testid="button-pizza-mode-whole"
                >
                  Whole
                </Button>
                <Button
                  variant={sectionMode === "half" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => handleSectionModeChange("half")}
                  data-testid="button-pizza-mode-half"
                >
                  Half & Half
                </Button>
                <Button
                  variant={sectionMode === "quarter" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => handleSectionModeChange("quarter")}
                  data-testid="button-pizza-mode-quarter"
                >
                  Quarters
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex-1 flex items-center justify-center">
            <PizzaVisual
              sectionMode={sectionMode}
              activeSection={activeSection}
              onSectionClick={setActiveSection}
              getToppingsForSection={getToppingsForSection}
            />
          </div>

          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Select Section</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {availableSections.map(section => (
                  <Button
                    key={section}
                    variant={activeSection === section ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveSection(section as PizzaSection)}
                    data-testid={`button-section-${section}`}
                  >
                    {SECTION_LABELS[section as PizzaSection]}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Selected Toppings</CardTitle>
            </CardHeader>
            <CardContent>
              {selections.size === 0 ? (
                <p className="text-sm text-muted-foreground">No toppings selected</p>
              ) : (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {Array.from(selections.values()).map(sel => (
                    <div key={sel.modifier.id} className="flex items-center justify-between text-sm">
                      <span>{sel.modifier.name}</span>
                      <Badge variant="secondary">
                        {sel.sections.length === 1 
                          ? SECTION_LABELS[sel.sections[0]] 
                          : `${sel.sections.length} sections`}
                        {sel.quantity > 1 && ` x${sel.quantity}`}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <Card className="m-4 mb-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Sauce</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {sauces.map(sauce => (
                  <Button
                    key={sauce.id}
                    variant={selectedSauce?.id === sauce.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedSauce(sauce)}
                    data-testid={`button-sauce-${sauce.id}`}
                  >
                    {selectedSauce?.id === sauce.id && <Check className="w-3 h-3 mr-1" />}
                    {sauce.name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Tabs value={toppingTab} onValueChange={setToppingTab} className="flex-1 flex flex-col overflow-hidden m-4 mt-2">
            <TabsList className="w-auto justify-start gap-1">
              <TabsTrigger value="proteins" data-testid="tab-proteins">
                Proteins ({groupedToppings.proteins.length})
              </TabsTrigger>
              <TabsTrigger value="veggies" data-testid="tab-veggies">
                Veggies ({groupedToppings.veggies.length})
              </TabsTrigger>
              <TabsTrigger value="cheeses" data-testid="tab-cheeses">
                Cheese ({groupedToppings.cheeses.length})
              </TabsTrigger>
              <TabsTrigger value="premium" data-testid="tab-premium">
                Premium ({groupedToppings.premium.length})
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 mt-4">
              <TabsContent value="proteins" className="m-0">
                <ToppingGrid
                  toppings={groupedToppings.proteins}
                  selections={selections}
                  activeSection={activeSection}
                  onToggle={toggleTopping}
                  onAdjustQuantity={adjustQuantity}
                  isSelectedForSection={isToppingSelectedForActiveSection}
                  sizePriceMultiplier={sizePriceMultiplier}
                />
              </TabsContent>
              <TabsContent value="veggies" className="m-0">
                <ToppingGrid
                  toppings={groupedToppings.veggies}
                  selections={selections}
                  activeSection={activeSection}
                  onToggle={toggleTopping}
                  onAdjustQuantity={adjustQuantity}
                  isSelectedForSection={isToppingSelectedForActiveSection}
                  sizePriceMultiplier={sizePriceMultiplier}
                />
              </TabsContent>
              <TabsContent value="cheeses" className="m-0">
                <ToppingGrid
                  toppings={groupedToppings.cheeses}
                  selections={selections}
                  activeSection={activeSection}
                  onToggle={toggleTopping}
                  onAdjustQuantity={adjustQuantity}
                  isSelectedForSection={isToppingSelectedForActiveSection}
                  sizePriceMultiplier={sizePriceMultiplier}
                />
              </TabsContent>
              <TabsContent value="premium" className="m-0">
                <ToppingGrid
                  toppings={groupedToppings.premium}
                  selections={selections}
                  activeSection={activeSection}
                  onToggle={toggleTopping}
                  onAdjustQuantity={adjustQuantity}
                  isSelectedForSection={isToppingSelectedForActiveSection}
                  sizePriceMultiplier={sizePriceMultiplier}
                />
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

interface PizzaVisualProps {
  sectionMode: SectionMode;
  activeSection: PizzaSection;
  onSectionClick: (section: PizzaSection) => void;
  getToppingsForSection: (section: PizzaSection) => Modifier[];
}

function PizzaVisual({ sectionMode, activeSection, onSectionClick, getToppingsForSection }: PizzaVisualProps) {
  const size = 280;
  const center = size / 2;
  const radius = size / 2 - 10;
  const crustWidth = 14;
  const innerRadius = radius - crustWidth;

  const toppingDots = useMemo(() => {
    const dots: { x: number; y: number; color: string; section: PizzaSection }[] = [];
    
    const generateDotsForSection = (section: PizzaSection, toppingsForSection: Modifier[]) => {
      if (toppingsForSection.length === 0) return;
      
      let angleStart = 0;
      let angleEnd = Math.PI * 2;
      
      if (sectionMode === "half") {
        if (section === "left") {
          angleStart = Math.PI / 2;
          angleEnd = Math.PI * 1.5;
        } else if (section === "right") {
          angleStart = -Math.PI / 2;
          angleEnd = Math.PI / 2;
        }
      } else if (sectionMode === "quarter") {
        const quarterAngles: Record<string, [number, number]> = {
          topRight: [-Math.PI / 2, 0],
          bottomRight: [0, Math.PI / 2],
          bottomLeft: [Math.PI / 2, Math.PI],
          topLeft: [Math.PI, Math.PI * 1.5],
        };
        [angleStart, angleEnd] = quarterAngles[section] || [0, Math.PI * 2];
      }

      const dotsPerTopping = Math.min(5, Math.max(2, 6 - toppingsForSection.length));
      
      toppingsForSection.forEach((topping, tIdx) => {
        const colors = [
          "hsl(0, 70%, 50%)",
          "hsl(45, 80%, 50%)",
          "hsl(120, 50%, 40%)",
          "hsl(30, 80%, 40%)",
          "hsl(200, 60%, 50%)",
          "hsl(280, 50%, 50%)",
        ];
        const color = colors[tIdx % colors.length];
        
        for (let i = 0; i < dotsPerTopping; i++) {
          const angle = angleStart + (angleEnd - angleStart) * ((i + 0.5) / dotsPerTopping);
          const seed = topping.id.charCodeAt(0) + topping.id.charCodeAt(1) + i * 17 + tIdx * 31;
          const pseudoRandom1 = ((seed * 9301 + 49297) % 233280) / 233280;
          const pseudoRandom2 = ((seed * 7919 + 23773) % 233280) / 233280;
          const r = innerRadius * (0.25 + pseudoRandom1 * 0.55);
          
          dots.push({
            x: center + Math.cos(angle) * r + (pseudoRandom2 - 0.5) * 12,
            y: center + Math.sin(angle) * r + (pseudoRandom1 - 0.5) * 12,
            color,
            section,
          });
        }
      });
    };

    if (sectionMode === "whole") {
      generateDotsForSection("whole", getToppingsForSection("whole"));
    } else if (sectionMode === "half") {
      HALF_SECTIONS.forEach(s => generateDotsForSection(s, getToppingsForSection(s)));
    } else {
      QUARTER_SECTIONS.forEach(s => generateDotsForSection(s, getToppingsForSection(s)));
    }

    return dots;
  }, [sectionMode, getToppingsForSection, center, innerRadius]);

  const renderSectionPath = (section: PizzaSection, isActive: boolean) => {
    const strokeWidth = isActive ? 4 : 1;
    const strokeColor = isActive ? "hsl(var(--primary))" : "hsl(var(--border))";
    const fillOpacity = isActive ? 0.15 : 0;

    if (sectionMode === "whole") {
      return (
        <circle
          cx={center}
          cy={center}
          r={innerRadius}
          fill={`hsl(var(--primary) / ${fillOpacity})`}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          className="cursor-pointer transition-all hover:fill-primary/10"
          onClick={() => onSectionClick("whole")}
          data-testid="pizza-section-whole"
        />
      );
    }

    if (sectionMode === "half") {
      const isLeft = section === "left";
      const path = isLeft
        ? `M ${center} ${center - innerRadius} A ${innerRadius} ${innerRadius} 0 0 0 ${center} ${center + innerRadius} L ${center} ${center} Z`
        : `M ${center} ${center - innerRadius} A ${innerRadius} ${innerRadius} 0 0 1 ${center} ${center + innerRadius} L ${center} ${center} Z`;
      
      return (
        <path
          d={path}
          fill={`hsl(var(--primary) / ${fillOpacity})`}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          className="cursor-pointer transition-all hover:fill-primary/10"
          onClick={() => onSectionClick(section)}
          data-testid={`pizza-section-${section}`}
        />
      );
    }

    const quarterPaths: Record<string, string> = {
      topRight: `M ${center} ${center} L ${center + innerRadius} ${center} A ${innerRadius} ${innerRadius} 0 0 0 ${center} ${center - innerRadius} Z`,
      bottomRight: `M ${center} ${center} L ${center} ${center + innerRadius} A ${innerRadius} ${innerRadius} 0 0 0 ${center + innerRadius} ${center} Z`,
      bottomLeft: `M ${center} ${center} L ${center - innerRadius} ${center} A ${innerRadius} ${innerRadius} 0 0 0 ${center} ${center + innerRadius} Z`,
      topLeft: `M ${center} ${center} L ${center} ${center - innerRadius} A ${innerRadius} ${innerRadius} 0 0 0 ${center - innerRadius} ${center} Z`,
    };

    return (
      <path
        d={quarterPaths[section]}
        fill={`hsl(var(--primary) / ${fillOpacity})`}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        className="cursor-pointer transition-all hover:fill-primary/10"
        onClick={() => onSectionClick(section)}
        data-testid={`pizza-section-${section}`}
      />
    );
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow-xl">
      <defs>
        <radialGradient id="pizzaCrust" cx="50%" cy="50%" r="50%">
          <stop offset="85%" stopColor="hsl(35, 60%, 50%)" />
          <stop offset="100%" stopColor="hsl(30, 50%, 35%)" />
        </radialGradient>
        <radialGradient id="pizzaCheese" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(45, 80%, 75%)" />
          <stop offset="100%" stopColor="hsl(40, 70%, 60%)" />
        </radialGradient>
      </defs>

      <circle cx={center} cy={center} r={radius} fill="url(#pizzaCrust)" />
      <circle cx={center} cy={center} r={innerRadius} fill="url(#pizzaCheese)" />

      {toppingDots.map((dot, i) => (
        <circle
          key={i}
          cx={dot.x}
          cy={dot.y}
          r={6}
          fill={dot.color}
          opacity={0.9}
        />
      ))}

      {sectionMode === "whole" && renderSectionPath("whole", activeSection === "whole")}
      {sectionMode === "half" && HALF_SECTIONS.map(s => (
        <g key={s}>{renderSectionPath(s, activeSection === s)}</g>
      ))}
      {sectionMode === "quarter" && QUARTER_SECTIONS.map(s => (
        <g key={s}>{renderSectionPath(s, activeSection === s)}</g>
      ))}

      {sectionMode !== "whole" && (
        <>
          {sectionMode === "half" && (
            <line
              x1={center}
              y1={center - innerRadius}
              x2={center}
              y2={center + innerRadius}
              stroke="hsl(var(--border))"
              strokeWidth={2}
            />
          )}
          {sectionMode === "quarter" && (
            <>
              <line
                x1={center}
                y1={center - innerRadius}
                x2={center}
                y2={center + innerRadius}
                stroke="hsl(var(--border))"
                strokeWidth={2}
              />
              <line
                x1={center - innerRadius}
                y1={center}
                x2={center + innerRadius}
                y2={center}
                stroke="hsl(var(--border))"
                strokeWidth={2}
              />
            </>
          )}
        </>
      )}
    </svg>
  );
}

interface ToppingGridProps {
  toppings: Modifier[];
  selections: Map<string, ToppingSelection>;
  activeSection: PizzaSection;
  onToggle: (topping: Modifier) => void;
  onAdjustQuantity: (topping: Modifier, delta: number) => void;
  isSelectedForSection: (toppingId: string) => boolean;
  sizePriceMultiplier: number;
}

function ToppingGrid({
  toppings,
  selections,
  onToggle,
  onAdjustQuantity,
  isSelectedForSection,
  sizePriceMultiplier,
}: ToppingGridProps) {
  const formatPrice = (price: string | null) => {
    const numPrice = parseFloat(price || "0") * sizePriceMultiplier;
    if (numPrice === 0) return "";
    return `+$${numPrice.toFixed(2)}`;
  };

  if (toppings.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No toppings in this category
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {toppings.map(topping => {
        const isSelected = isSelectedForSection(topping.id);
        const selection = selections.get(topping.id);
        const quantity = selection?.quantity || 0;
        const allSections = selection?.sections || [];
        const priceStr = formatPrice(topping.priceDelta);

        return (
          <Card
            key={topping.id}
            className={`cursor-pointer transition-all ${
              isSelected
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "hover:border-muted-foreground/50"
            }`}
            onClick={() => onToggle(topping)}
            data-testid={`button-topping-${topping.id}`}
          >
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  isSelected ? "bg-primary text-primary-foreground" : "border"
                }`}>
                  {isSelected && <Check className="w-3 h-3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{topping.name}</div>
                  {priceStr && (
                    <div className="text-xs text-muted-foreground">{priceStr}</div>
                  )}
                </div>
              </div>

              {isSelected && allSections.length > 0 && (
                <div className="mt-3 flex items-center justify-between" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onAdjustQuantity(topping, -1); }}
                      data-testid={`button-topping-${topping.id}-minus`}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="w-6 text-center text-sm font-medium">{quantity}x</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onAdjustQuantity(topping, 1); }}
                      disabled={quantity >= 3}
                      data-testid={`button-topping-${topping.id}-plus`}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {allSections.length > 1 ? `${allSections.length} sec` : ""}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
