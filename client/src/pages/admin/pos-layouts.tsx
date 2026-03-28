import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { Plus, Edit, Trash2, Grid3X3, LayoutGrid, Save, X, GripVertical, Star, Upload, Image, ChevronDown, ChevronRight, Building2 } from "lucide-react";
import type { PosLayout, PosLayoutCell, MenuItem, Rvc, Property, PosLayoutRvcAssignment } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDndMonitor, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

interface LayoutWithCells extends PosLayout {
  cells?: PosLayoutCell[];
}

interface CellData {
  rowIndex: number;
  colIndex: number;
  rowSpan: number;
  colSpan: number;
  menuItemId: string | null;
  backgroundColor: string;
  textColor: string;
  displayLabel: string | null;
}

interface DraggableCellProps {
  id: string;
  cell: CellData;
  menuItem: MenuItem | null | undefined;
  isSelected: boolean;
  isDragging: boolean;
  onClick: () => void;
}

function DraggableDroppableCell({ id, cell, menuItem, isSelected, isDragging, onClick }: DraggableCellProps) {
  const { attributes, listeners, setNodeRef: setDragRef, transform } = useDraggable({ id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });

  const setRef = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  const style = {
    backgroundColor: cell.menuItemId ? cell.backgroundColor : "transparent",
    color: cell.menuItemId ? cell.textColor : "inherit",
    borderColor: isOver ? "hsl(var(--primary))" : cell.menuItemId ? cell.backgroundColor : "hsl(var(--border))",
    borderStyle: cell.menuItemId ? "solid" : "dashed",
    opacity: isDragging ? 0.5 : 1,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  };

  return (
    <button
      ref={setRef}
      className={`rounded-md border-2 transition-all flex items-center justify-center text-sm font-medium relative ${
        isSelected ? "ring-2 ring-primary ring-offset-2" : ""
      } ${isOver ? "ring-2 ring-primary" : ""} ${cell.menuItemId ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={style}
      onClick={onClick}
      data-testid={`cell-${cell.rowIndex}-${cell.colIndex}`}
      {...(cell.menuItemId ? { ...attributes, ...listeners } : {})}
    >
      {cell.displayLabel || menuItem?.shortName || menuItem?.name || ""}
      {cell.menuItemId && (
        <GripVertical className="absolute top-1 right-1 w-3 h-3 opacity-50" />
      )}
    </button>
  );
}

function DragOverlayCell({ cell, menuItem }: { cell: CellData | null | undefined; menuItem: MenuItem | null | undefined }) {
  if (!cell) return null;
  return (
    <div
      className="rounded-md border-2 flex items-center justify-center text-sm font-medium shadow-lg"
      style={{
        backgroundColor: cell.backgroundColor,
        color: cell.textColor,
        borderColor: cell.backgroundColor,
        width: 80,
        height: 80,
      }}
    >
      {cell.displayLabel || menuItem?.shortName || menuItem?.name || ""}
    </div>
  );
}

// Property Branding Section Component
function PropertyBrandingSection({ properties, toast }: { properties: Property[]; toast: ReturnType<typeof useToast>["toast"] }) {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const updateLogoMutation = useMutation({
    mutationFn: async ({ propertyId, logoUrl }: { propertyId: string; logoUrl: string | null }) => {
      const response = await apiRequest("PUT", `/api/properties/${propertyId}`, { signInLogoUrl: logoUrl });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({ title: "Logo updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update logo", variant: "destructive" });
    },
  });

  const handleFileChange = async (propertyId: string, file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large. Maximum size is 10MB.", variant: "destructive" });
      return;
    }
    
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file.", variant: "destructive" });
      return;
    }

    // Resize image to 800x600 before uploading
    const resizeImage = (dataUrl: string): Promise<string> => {
      return new Promise((resolve) => {
        const img = document.createElement("img");
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const TARGET_WIDTH = 800;
          const TARGET_HEIGHT = 600;
          canvas.width = TARGET_WIDTH;
          canvas.height = TARGET_HEIGHT;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            // Fill with white background first
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
            // Calculate scaling to fit within 800x600 while maintaining aspect ratio
            const scale = Math.min(TARGET_WIDTH / img.width, TARGET_HEIGHT / img.height);
            const scaledWidth = img.width * scale;
            const scaledHeight = img.height * scale;
            const x = (TARGET_WIDTH - scaledWidth) / 2;
            const y = (TARGET_HEIGHT - scaledHeight) / 2;
            ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
          }
          resolve(canvas.toDataURL("image/png"));
        };
        img.src = dataUrl;
      });
    };

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const resizedDataUrl = await resizeImage(dataUrl);
      updateLogoMutation.mutate({ propertyId, logoUrl: resizedDataUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = (propertyId: string) => {
    updateLogoMutation.mutate({ propertyId, logoUrl: null });
  };

  if (properties.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="w-5 h-5" />
          Property Sign-In Logos
        </CardTitle>
        <CardDescription>
          Upload custom logos for each property to display on the employee sign-in screen
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map((property) => (
            <div key={property.id} className="border rounded-lg p-4 space-y-3">
              <div className="font-medium text-sm">{property.name}</div>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-muted rounded-lg flex items-center justify-center overflow-hidden border">
                  {property.signInLogoUrl ? (
                    <img
                      src={property.signInLogoUrl}
                      alt={`${property.name} logo`}
                      className="w-full h-full object-contain"
                      data-testid={`img-logo-preview-${property.id}`}
                    />
                  ) : (
                    <Building2 className="w-8 h-8 text-muted-foreground/50" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={(el) => { fileInputRefs.current[property.id] = el; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileChange(property.id, file);
                      e.target.value = "";
                    }}
                    data-testid={`input-logo-file-${property.id}`}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRefs.current[property.id]?.click()}
                    disabled={updateLogoMutation.isPending}
                    data-testid={`button-upload-logo-${property.id}`}
                  >
                    <Upload className="w-3 h-3 mr-1" />
                    {property.signInLogoUrl ? "Change" : "Upload"}
                  </Button>
                  {property.signInLogoUrl && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveLogo(property.id)}
                      disabled={updateLogoMutation.isPending}
                      data-testid={`button-remove-logo-${property.id}`}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PosLayoutsPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, scopePayload } = useEmcFilter();
  const [formOpen, setFormOpen] = useState(false);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [editingLayout, setEditingLayout] = useState<LayoutWithCells | null>(null);
  const [layoutName, setLayoutName] = useState("");
  const [layoutMode, setLayoutMode] = useState<"slu_tabs" | "custom_grid">("slu_tabs");
  const [gridRows, setGridRows] = useState(4);
  const [gridCols, setGridCols] = useState(6);
  const [fontSize, setFontSize] = useState<"small" | "medium" | "large" | "xlarge">("medium");
  const [isDefault, setIsDefault] = useState(false);
  const [selectedRvcId, setSelectedRvcId] = useState<string>(""); // Legacy single RVC
  const [selectedRvcAssignments, setSelectedRvcAssignments] = useState<{ propertyId: string; rvcId: string; isDefault: boolean }[]>([]);
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());
  const [cells, setCells] = useState<CellData[]>([]);
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    
    if (!over || active.id === over.id) return;
    
    const [srcRow, srcCol] = (active.id as string).split("-").map(Number);
    const [destRow, destCol] = (over.id as string).split("-").map(Number);
    
    setCells(prev => {
      const newCells = [...prev];
      const srcIndex = newCells.findIndex(c => c.rowIndex === srcRow && c.colIndex === srcCol);
      const destIndex = newCells.findIndex(c => c.rowIndex === destRow && c.colIndex === destCol);
      
      if (srcIndex === -1 || destIndex === -1) return prev;
      
      const srcPayload = {
        menuItemId: newCells[srcIndex].menuItemId,
        backgroundColor: newCells[srcIndex].backgroundColor,
        textColor: newCells[srcIndex].textColor,
        displayLabel: newCells[srcIndex].displayLabel,
        rowSpan: newCells[srcIndex].rowSpan,
        colSpan: newCells[srcIndex].colSpan,
      };
      const destPayload = {
        menuItemId: newCells[destIndex].menuItemId,
        backgroundColor: newCells[destIndex].backgroundColor,
        textColor: newCells[destIndex].textColor,
        displayLabel: newCells[destIndex].displayLabel,
        rowSpan: newCells[destIndex].rowSpan,
        colSpan: newCells[destIndex].colSpan,
      };
      
      newCells[srcIndex] = { ...newCells[srcIndex], ...destPayload };
      newCells[destIndex] = { ...newCells[destIndex], ...srcPayload };
      
      return newCells;
    });
    
    toast({ title: "Cell moved" });
  };

  const getActiveDragCell = () => {
    if (!activeDragId) return null;
    const [row, col] = activeDragId.split("-").map(Number);
    return cells.find(c => c.rowIndex === row && c.colIndex === col);
  };

  const { data: layouts = [], isLoading } = useQuery<PosLayout[]>({
    queryKey: ["/api/pos-layouts", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/pos-layouts${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: rvcs = [] } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/rvcs${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["/api/menu-items", filterKeys],
    queryFn: async () => {
      const res = await failoverFetch(`/api/menu-items${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/pos-layouts", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-layouts", filterKeys] });
      setFormOpen(false);
      resetForm();
      toast({ title: "Layout created" });
    },
    onError: () => {
      toast({ title: "Failed to create layout", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/pos-layouts/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-layouts", filterKeys] });
      setFormOpen(false);
      resetForm();
      toast({ title: "Layout updated" });
    },
    onError: () => {
      toast({ title: "Failed to update layout", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/pos-layouts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-layouts", filterKeys] });
      toast({ title: "Layout deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete layout", variant: "destructive" });
    },
  });

  const saveCellsMutation = useMutation({
    mutationFn: async ({ layoutId, cells }: { layoutId: string; cells: CellData[] }) => {
      const response = await apiRequest("PUT", `/api/pos-layouts/${layoutId}/cells`, cells);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-layouts", filterKeys] });
      toast({ title: "Layout cells saved" });
    },
    onError: () => {
      toast({ title: "Failed to save cells", variant: "destructive" });
    },
  });

  const saveRvcAssignmentsMutation = useMutation({
    mutationFn: async ({ layoutId, assignments }: { layoutId: string; assignments: { propertyId: string; rvcId: string }[] }) => {
      const response = await apiRequest("PUT", `/api/pos-layouts/${layoutId}/rvc-assignments`, assignments);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-layouts", filterKeys] });
    },
  });

  const resetForm = () => {
    setLayoutName("");
    setLayoutMode("slu_tabs");
    setGridRows(4);
    setGridCols(6);
    setFontSize("medium");
    setIsDefault(false);
    setSelectedRvcId("");
    setSelectedRvcAssignments([]);
    setExpandedProperties(new Set());
    setEditingLayout(null);
  };

  const handleOpenForm = async (layout?: PosLayout) => {
    if (layout) {
      setEditingLayout(layout);
      setLayoutName(layout.name);
      setLayoutMode(layout.mode as "slu_tabs" | "custom_grid");
      setGridRows(layout.gridRows || 4);
      setGridCols(layout.gridCols || 6);
      setFontSize((layout.fontSize as "small" | "medium" | "large" | "xlarge") || "medium");
      setIsDefault(layout.isDefault || false);
      setSelectedRvcId(layout.rvcId || "");
      // Load existing RVC assignments
      try {
        const res = await failoverFetch(`/api/pos-layouts/${layout.id}/rvc-assignments`, { credentials: "include", headers: getAuthHeaders() });
        const assignments: PosLayoutRvcAssignment[] = await res.json();
        setSelectedRvcAssignments(assignments.map(a => ({ 
          propertyId: a.propertyId, 
          rvcId: a.rvcId, 
          isDefault: a.isDefault ?? false 
        })));
        // Expand all properties that have assignments
        const propIds = new Set(assignments.map(a => a.propertyId));
        setExpandedProperties(propIds);
      } catch {
        setSelectedRvcAssignments([]);
      }
    } else {
      resetForm();
    }
    setFormOpen(true);
  };

  const handleCancel = () => {
    setFormOpen(false);
    setEditingLayout(null);
    resetForm();
  };

  const handleCancelDesigner = () => {
    setDesignerOpen(false);
    setEditingLayout(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const data = {
      name: layoutName,
      mode: layoutMode,
      gridRows,
      gridCols,
      fontSize,
      isDefault,
      rvcId: selectedRvcId || null,
      active: true,
    };

    if (editingLayout) {
      updateMutation.mutate({ id: editingLayout.id, data }, {
        onSuccess: () => {
          // Save RVC assignments after updating layout
          saveRvcAssignmentsMutation.mutate({ 
            layoutId: editingLayout.id, 
            assignments: selectedRvcAssignments 
          });
        }
      });
    } else {
      createMutation.mutate({ ...data, ...scopePayload }, {
        onSuccess: (newLayout: PosLayout) => {
          // Save RVC assignments for the newly created layout
          if (selectedRvcAssignments.length > 0) {
            saveRvcAssignmentsMutation.mutate({ 
              layoutId: newLayout.id, 
              assignments: selectedRvcAssignments 
            });
          }
        }
      });
    }
  };

  // Toggle property expansion in the multi-select
  const togglePropertyExpand = (propertyId: string) => {
    setExpandedProperties(prev => {
      const next = new Set(prev);
      if (next.has(propertyId)) {
        next.delete(propertyId);
      } else {
        next.add(propertyId);
      }
      return next;
    });
  };

  // Toggle RVC selection
  const toggleRvcSelection = (propertyId: string, rvcId: string) => {
    setSelectedRvcAssignments(prev => {
      const exists = prev.some(a => a.rvcId === rvcId);
      if (exists) {
        return prev.filter(a => a.rvcId !== rvcId);
      } else {
        return [...prev, { propertyId, rvcId, isDefault: false }];
      }
    });
  };

  // Toggle default status for an RVC
  const toggleRvcDefault = (rvcId: string) => {
    setSelectedRvcAssignments(prev => 
      prev.map(a => a.rvcId === rvcId ? { ...a, isDefault: !a.isDefault } : a)
    );
  };

  // Toggle all RVCs for a property
  const toggleAllPropertyRvcs = (propertyId: string) => {
    const propertyRvcs = rvcs.filter(r => r.propertyId === propertyId);
    const allSelected = propertyRvcs.every(r => 
      selectedRvcAssignments.some(a => a.rvcId === r.id)
    );
    
    if (allSelected) {
      // Deselect all RVCs for this property
      setSelectedRvcAssignments(prev => 
        prev.filter(a => a.propertyId !== propertyId)
      );
    } else {
      // Select all RVCs for this property
      const newAssignments = propertyRvcs
        .filter(r => !selectedRvcAssignments.some(a => a.rvcId === r.id))
        .map(r => ({ propertyId, rvcId: r.id, isDefault: false }));
      setSelectedRvcAssignments(prev => [...prev, ...newAssignments]);
    }
  };

  // Check if all RVCs of a property are selected
  const isPropertyFullySelected = (propertyId: string) => {
    const propertyRvcs = rvcs.filter(r => r.propertyId === propertyId);
    return propertyRvcs.length > 0 && propertyRvcs.every(r => 
      selectedRvcAssignments.some(a => a.rvcId === r.id)
    );
  };

  // Check if some (but not all) RVCs of a property are selected
  const isPropertyPartiallySelected = (propertyId: string) => {
    const propertyRvcs = rvcs.filter(r => r.propertyId === propertyId);
    const selectedCount = propertyRvcs.filter(r => 
      selectedRvcAssignments.some(a => a.rvcId === r.id)
    ).length;
    return selectedCount > 0 && selectedCount < propertyRvcs.length;
  };

  const handleOpenDesigner = async (layout: PosLayout) => {
    setEditingLayout(layout);
    setGridRows(layout.gridRows || 4);
    setGridCols(layout.gridCols || 6);
    
    const res = await failoverFetch(`/api/pos-layouts/${layout.id}/cells`, { credentials: "include", headers: getAuthHeaders() });
    const existingCells: PosLayoutCell[] = await res.json();
    
    const cellMap = new Map<string, PosLayoutCell>();
    existingCells.forEach(c => cellMap.set(`${c.rowIndex}-${c.colIndex}`, c));
    
    const newCells: CellData[] = [];
    for (let r = 0; r < (layout.gridRows || 4); r++) {
      for (let c = 0; c < (layout.gridCols || 6); c++) {
        const existing = cellMap.get(`${r}-${c}`);
        newCells.push({
          rowIndex: r,
          colIndex: c,
          rowSpan: existing?.rowSpan || 1,
          colSpan: existing?.colSpan || 1,
          menuItemId: existing?.menuItemId || null,
          backgroundColor: existing?.backgroundColor || "#3B82F6",
          textColor: existing?.textColor || "#FFFFFF",
          displayLabel: existing?.displayLabel || null,
        });
      }
    }
    setCells(newCells);
    setSelectedCell(null);
    setDesignerOpen(true);
  };

  const handleCellClick = (row: number, col: number) => {
    setSelectedCell({ row, col });
  };

  const updateCell = (row: number, col: number, updates: Partial<CellData>) => {
    setCells(prev => prev.map(c => 
      c.rowIndex === row && c.colIndex === col ? { ...c, ...updates } : c
    ));
  };

  const handleSaveDesign = () => {
    if (!editingLayout) return;
    const filledCells = cells.filter(c => c.menuItemId);
    saveCellsMutation.mutate({ layoutId: editingLayout.id, cells: filledCells });
  };

  const getMenuItem = (id: string | null) => {
    if (!id) return null;
    return menuItems.find(m => m.id === id);
  };

  const selectedCellData = selectedCell 
    ? cells.find(c => c.rowIndex === selectedCell.row && c.colIndex === selectedCell.col)
    : null;

  if (designerOpen) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Screen Designer - {editingLayout?.name}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Drag cells to rearrange items</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancelDesigner} data-testid="button-close-designer">Close</Button>
                <Button onClick={handleSaveDesign} disabled={saveCellsMutation.isPending} data-testid="button-save-design">
                  <Save className="w-4 h-4 mr-2" />
                  {saveCellsMutation.isPending ? "Saving..." : "Save Layout"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                  <div
                    className="grid gap-2 p-4 bg-muted/30 rounded-lg"
                    style={{
                      gridTemplateColumns: `repeat(${gridCols}, minmax(80px, 1fr))`,
                      gridTemplateRows: `repeat(${gridRows}, 80px)`,
                    }}
                  >
                    {cells.map((cell) => {
                      const menuItem = getMenuItem(cell.menuItemId);
                      const isSelected = selectedCell?.row === cell.rowIndex && selectedCell?.col === cell.colIndex;
                      const cellId = `${cell.rowIndex}-${cell.colIndex}`;
                      return (
                        <DraggableDroppableCell
                          key={cellId}
                          id={cellId}
                          cell={cell}
                          menuItem={menuItem}
                          isSelected={isSelected}
                          isDragging={activeDragId === cellId}
                          onClick={() => handleCellClick(cell.rowIndex, cell.colIndex)}
                        />
                      );
                    })}
                  </div>
                  <DragOverlay>
                    {activeDragId ? (
                      <DragOverlayCell cell={getActiveDragCell()} menuItem={getMenuItem(getActiveDragCell()?.menuItemId || null)} />
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </div>
              <div className="w-72 border-l pl-4">
                <ScrollArea className="h-full">
                  {selectedCellData ? (
                    <div className="space-y-4">
                      <h3 className="font-medium">Cell Properties</h3>
                      <div className="space-y-2">
                        <Label>Menu Item</Label>
                        <Select
                          value={selectedCellData.menuItemId || "__empty__"}
                          onValueChange={(v) => updateCell(selectedCell!.row, selectedCell!.col, { menuItemId: v === "__empty__" ? null : v })}
                        >
                          <SelectTrigger data-testid="select-cell-menu-item">
                            <SelectValue placeholder="Select item" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__empty__">Empty</SelectItem>
                            {menuItems.filter(m => m.active).map(item => (
                              <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Display Label (Optional)</Label>
                        <Input
                          value={selectedCellData.displayLabel || ""}
                          onChange={(e) => updateCell(selectedCell!.row, selectedCell!.col, { displayLabel: e.target.value || null })}
                          placeholder="Override button text"
                          data-testid="input-cell-label"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Background Color</Label>
                        <div className="flex gap-2">
                          <Input
                            type="color"
                            value={selectedCellData.backgroundColor}
                            onChange={(e) => updateCell(selectedCell!.row, selectedCell!.col, { backgroundColor: e.target.value })}
                            className="w-12 h-9 p-1"
                            data-testid="input-cell-bg-color"
                          />
                          <Input
                            value={selectedCellData.backgroundColor}
                            onChange={(e) => updateCell(selectedCell!.row, selectedCell!.col, { backgroundColor: e.target.value })}
                            className="flex-1"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Text Color</Label>
                        <div className="flex gap-2">
                          <Input
                            type="color"
                            value={selectedCellData.textColor}
                            onChange={(e) => updateCell(selectedCell!.row, selectedCell!.col, { textColor: e.target.value })}
                            className="w-12 h-9 p-1"
                            data-testid="input-cell-text-color"
                          />
                          <Input
                            value={selectedCellData.textColor}
                            onChange={(e) => updateCell(selectedCell!.row, selectedCell!.col, { textColor: e.target.value })}
                            className="flex-1"
                          />
                        </div>
                      </div>
                      <Separator />
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => updateCell(selectedCell!.row, selectedCell!.col, { menuItemId: null, displayLabel: null })}
                        data-testid="button-clear-cell"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Clear Cell
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      <Grid3X3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>Select a cell to edit</p>
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (formOpen) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>{editingLayout ? "Edit Layout" : "Create Layout"}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel-layout">
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={!layoutName} data-testid="button-save-layout">
                  {editingLayout ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Layout Name</Label>
                  <Input
                    value={layoutName}
                    onChange={(e) => setLayoutName(e.target.value)}
                    placeholder="e.g., Quick Service Layout"
                    data-testid="input-layout-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Layout Mode</Label>
                  <Select value={layoutMode} onValueChange={(v) => setLayoutMode(v as any)}>
                    <SelectTrigger data-testid="select-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="slu_tabs">SLU Tabs (Category based)</SelectItem>
                      <SelectItem value="custom_grid">Custom Grid (Designer)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Button Font Size</Label>
                  <Select value={fontSize} onValueChange={(v) => setFontSize(v as any)}>
                    <SelectTrigger data-testid="select-font-size">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small</SelectItem>
                      <SelectItem value="medium">Medium (Default)</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                      <SelectItem value="xlarge">Extra Large</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {layoutMode === "custom_grid" && (
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Grid Rows</Label>
                    <Input
                      type="number"
                      min={2}
                      max={10}
                      value={gridRows}
                      onChange={(e) => setGridRows(Number(e.target.value))}
                      data-testid="input-grid-rows"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Grid Columns</Label>
                    <Input
                      type="number"
                      min={2}
                      max={12}
                      value={gridCols}
                      onChange={(e) => setGridCols(Number(e.target.value))}
                      data-testid="input-grid-cols"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch
                      checked={isDefault}
                      onCheckedChange={setIsDefault}
                      data-testid="switch-default"
                    />
                    <Label>Set as default layout</Label>
                  </div>
                </div>
              )}

              {layoutMode !== "custom_grid" && (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={isDefault}
                    onCheckedChange={setIsDefault}
                    data-testid="switch-default"
                  />
                  <Label>Set as default layout</Label>
                </div>
              )}

              <div className="space-y-2">
                <Label>Revenue Centers</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select which locations will use this layout
                </p>
                <div className="border rounded-md max-h-48 overflow-y-auto">
                  {properties.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">No properties available</div>
                  ) : (
                    properties.map(property => {
                      const propertyRvcs = rvcs.filter(r => r.propertyId === property.id);
                      const isExpanded = expandedProperties.has(property.id);
                      const isFullySelected = isPropertyFullySelected(property.id);
                      const isPartiallySelected = isPropertyPartiallySelected(property.id);
                      
                      return (
                        <div key={property.id} className="border-b last:border-b-0">
                          <div className="flex items-center gap-2 p-2 hover-elevate">
                            <button
                              type="button"
                              className="p-0.5"
                              onClick={() => togglePropertyExpand(property.id)}
                              data-testid={`button-expand-property-${property.id}`}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                            <Checkbox
                              checked={isFullySelected}
                              ref={(el) => {
                                if (el) {
                                  (el as any).indeterminate = isPartiallySelected;
                                }
                              }}
                              onCheckedChange={() => toggleAllPropertyRvcs(property.id)}
                              data-testid={`checkbox-property-${property.id}`}
                            />
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{property.name}</span>
                            {(isFullySelected || isPartiallySelected) && (
                              <Badge variant="secondary" className="ml-auto text-xs">
                                {selectedRvcAssignments.filter(a => a.propertyId === property.id).length}/{propertyRvcs.length}
                              </Badge>
                            )}
                          </div>
                          {isExpanded && propertyRvcs.length > 0 && (
                            <div className="pl-10 pb-2 space-y-1">
                              {propertyRvcs.map(rvc => {
                                const assignment = selectedRvcAssignments.find(a => a.rvcId === rvc.id);
                                const isAssigned = !!assignment;
                                const isDefaultForRvc = assignment?.isDefault ?? false;
                                
                                return (
                                  <div
                                    key={rvc.id}
                                    className="flex items-center gap-2 px-2 py-1 hover-elevate rounded"
                                  >
                                    <Checkbox
                                      checked={isAssigned}
                                      onCheckedChange={() => toggleRvcSelection(property.id, rvc.id)}
                                      data-testid={`checkbox-rvc-${rvc.id}`}
                                    />
                                    <span className="text-sm flex-1">{rvc.name}</span>
                                    {isAssigned && (
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className={`h-6 w-6 ${isDefaultForRvc ? "text-yellow-500" : "text-muted-foreground"}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleRvcDefault(rvc.id);
                                        }}
                                        title={isDefaultForRvc ? "Remove as default for this location" : "Set as default for this location"}
                                        data-testid={`button-default-rvc-${rvc.id}`}
                                      >
                                        <Star className={`w-4 h-4 ${isDefaultForRvc ? "fill-current" : ""}`} />
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                {selectedRvcAssignments.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedRvcAssignments.length} revenue center{selectedRvcAssignments.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">POS Screen Layouts</h1>
          <p className="text-sm text-muted-foreground">
            Configure custom layouts and branding for the POS screens
          </p>
        </div>
      </div>

      <PropertyBrandingSection properties={properties} toast={toast} />

      <Separator className="my-8" />

      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold">Screen Layouts</h2>
          <p className="text-sm text-muted-foreground">
            Create custom layouts for the transaction screen
          </p>
        </div>
        <Button onClick={() => handleOpenForm()} data-testid="button-add-layout">
          <Plus className="w-4 h-4 mr-2" />
          Add Layout
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : layouts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <LayoutGrid className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No layouts configured</p>
            <Button className="mt-4" onClick={() => handleOpenForm()}>
              Create your first layout
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {layouts.map(layout => (
            <Card key={layout.id} data-testid={`card-layout-${layout.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{layout.name}</CardTitle>
                  <div className="flex gap-1">
                    {layout.isDefault && <Badge variant="default">Default</Badge>}
                    {layout.mode === "custom_grid" ? (
                      <Badge variant="outline">Custom</Badge>
                    ) : (
                      <Badge variant="secondary">SLU Tabs</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground mb-4">
                  {layout.mode === "custom_grid" ? (
                    <span>{layout.gridRows} x {layout.gridCols} grid</span>
                  ) : (
                    <span>Uses SLU category tabs</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleOpenForm(layout)} data-testid={`button-edit-layout-${layout.id}`}>
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  {layout.mode === "custom_grid" && (
                    <Button size="sm" variant="outline" onClick={() => handleOpenDesigner(layout)} data-testid={`button-design-layout-${layout.id}`}>
                      <Grid3X3 className="w-4 h-4 mr-1" />
                      Design
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(layout.id)} data-testid={`button-delete-layout-${layout.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
