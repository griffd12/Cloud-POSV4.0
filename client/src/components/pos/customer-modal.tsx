import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatShortDateInTimezone } from "@/lib/timezone";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  User,
  Star,
  Clock,
  Gift,
  History,
  UserPlus,
  X,
  Plus,
  RotateCcw,
  Loader2,
  Award,
  Phone,
  Mail,
  Pencil,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, fetchWithTimeout } from "@/lib/queryClient";
import type { Check, CheckItem, LoyaltyMember, LoyaltyReward, LoyaltyTransaction, LoyaltyProgram } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CheckWithItems extends Check {
  items: CheckItem[];
}

interface CustomerDetailsResponse {
  customer: LoyaltyMember;
  recentChecks: CheckWithItems[];
  transactions: LoyaltyTransaction[];
  availableRewards: LoyaltyReward[];
}

interface CustomerModalProps {
  open: boolean;
  onClose: () => void;
  currentCheck: Check | null;
  currentCustomerId: string | null;
  employeeId: string | undefined;
  enterpriseId?: string;
  propertyId?: string;
  onCustomerAttached?: (customer: LoyaltyMember) => void;
  onReorderRequested?: (items: CheckItem[], customer: LoyaltyMember | null) => void;
  timezone?: string;
}

export function CustomerModal({
  open,
  onClose,
  currentCheck,
  currentCustomerId,
  employeeId,
  enterpriseId,
  propertyId,
  onCustomerAttached,
  onReorderRequested,
  timezone,
}: CustomerModalProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<LoyaltyMember | null>(null);
  const [activeTab, setActiveTab] = useState("search");
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [showAddPoints, setShowAddPoints] = useState(false);
  const [pointsToAdd, setPointsToAdd] = useState("");
  const [pointsReason, setPointsReason] = useState("");
  const [selectedHistoryCheck, setSelectedHistoryCheck] = useState<CheckWithItems | null>(null);

  const [enrollForm, setEnrollForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  });

  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  });
  const [showEnrollInProgram, setShowEnrollInProgram] = useState(false);
  const [selectedEnrollProgramId, setSelectedEnrollProgramId] = useState("");

  const { data: searchResults = [], isLoading: isSearching } = useQuery<LoyaltyMember[]>({
    queryKey: ["/api/pos/customers/search", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      const res = await fetchWithTimeout(`/api/pos/customers/search?query=${encodeURIComponent(searchQuery)}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: open && searchQuery.length >= 2,
  });

  const { data: customerDetails, isLoading: isLoadingDetails } = useQuery<CustomerDetailsResponse>({
    queryKey: ["/api/pos/customers", selectedCustomer?.id],
    queryFn: async () => {
      const res = await fetchWithTimeout(`/api/pos/customers/${selectedCustomer?.id}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to get customer details");
      return res.json();
    },
    enabled: !!selectedCustomer?.id,
  });

  const loyaltyProgramsUrl = (() => {
    const params = new URLSearchParams();
    if (enterpriseId) params.set("enterpriseId", enterpriseId);
    if (propertyId) params.set("propertyId", propertyId);
    const str = params.toString();
    return str ? `/api/loyalty-programs?${str}` : "/api/loyalty-programs";
  })();
  const { data: loyaltyPrograms = [], isLoading: isLoadingPrograms } = useQuery<LoyaltyProgram[]>({
    queryKey: ["/api/loyalty-programs", enterpriseId, propertyId],
    queryFn: async () => {
      const res = await fetchWithTimeout(loyaltyProgramsUrl, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch loyalty programs");
      return res.json();
    },
    enabled: open && showEnrollInProgram,
  });

  const attachMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const res = await apiRequest("POST", `/api/pos/checks/${currentCheck?.id}/customer`, {
        customerId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Customer Attached", description: "Customer linked to this check" });
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      if (selectedCustomer && onCustomerAttached) {
        onCustomerAttached(selectedCustomer);
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to attach customer", variant: "destructive" });
    },
  });

  const detachMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/pos/checks/${currentCheck?.id}/customer`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Customer Removed", description: "Customer removed from check" });
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      setSelectedCustomer(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove customer", variant: "destructive" });
    },
  });

  const addPointsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/pos/customers/${selectedCustomer?.id}/add-points`, {
        points: parseInt(pointsToAdd),
        reason: pointsReason,
        employeeId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Points Added",
        description: `Added ${pointsToAdd} points. New balance: ${data.newBalance}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/customers", selectedCustomer?.id] });
      setShowAddPoints(false);
      setPointsToAdd("");
      setPointsReason("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add points", variant: "destructive" });
    },
  });

  const enrollMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pos/loyalty/enroll", {
        ...enrollForm,
        enterpriseId: enterpriseId || undefined,
        propertyId: propertyId || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      const desc = data.enrolledPrograms?.length > 0
        ? `${data.member.firstName} added and enrolled in ${data.enrolledPrograms.join(", ")}`
        : `${data.member.firstName} added as a member`;
      toast({
        title: "Member Added",
        description: desc,
      });
      setShowEnrollForm(false);
      setEnrollForm({ firstName: "", lastName: "", phone: "", email: "" });
      setSelectedCustomer(data.member);
      setActiveTab("profile");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Member",
        description: error.message || "Could not add customer",
        variant: "destructive",
      });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/pos/checks/${currentCheck?.id}/reorder/${selectedCustomer?.id}`
      );
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Items Added",
        description: `Added ${data.itemsAdded} items from last order`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id, "items"] });
      onClose();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reorder", variant: "destructive" });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer?.id) {
        throw new Error("No customer selected");
      }
      const res = await apiRequest("PATCH", `/api/loyalty-members/${selectedCustomer.id}`, editForm);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Profile Updated",
        description: `${data.firstName} ${data.lastName}'s profile has been updated`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/customers", selectedCustomer?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-members"] });
      setShowEditProfile(false);
      // Update the selected customer with new data
      setSelectedCustomer(data);
    },
    onError: (error: any) => {
      console.error("Update profile error:", error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update profile", 
        variant: "destructive" 
      });
    },
  });

  const enrollInProgramMutation = useMutation({
    mutationFn: async ({ memberId, programId }: { memberId: string; programId: string }) => {
      const res = await apiRequest("POST", `/api/loyalty-members/${memberId}/enrollments`, { programId });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Enrolled in Program",
        description: "Member has been enrolled in the selected program",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/customers", selectedCustomer?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-members"] });
      setShowEnrollInProgram(false);
      setSelectedEnrollProgramId("");
    },
    onError: (error: any) => {
      toast({
        title: "Enrollment Failed",
        description: error.message || "Could not enroll in program",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSelectedCustomer(null);
      setActiveTab("search");
      setShowEnrollForm(false);
      setShowAddPoints(false);
      setShowEnrollInProgram(false);
      setSelectedEnrollProgramId("");
    }
  }, [open]);

  const handleSelectCustomer = (customer: LoyaltyMember) => {
    setSelectedCustomer(customer);
    setActiveTab("profile");
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-customer-modal-title">
            <User className="w-5 h-5" />
            Customer & Loyalty
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="search" className="flex-1" data-testid="tab-customer-search">
              <Search className="w-4 h-4 mr-2" />
              Search
            </TabsTrigger>
            <TabsTrigger
              value="profile"
              className="flex-1"
              disabled={!selectedCustomer}
              data-testid="tab-customer-profile"
            >
              <User className="w-4 h-4 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="flex-1"
              disabled={!selectedCustomer}
              data-testid="tab-customer-history"
            >
              <History className="w-4 h-4 mr-2" />
              History
            </TabsTrigger>
            <TabsTrigger
              value="rewards"
              className="flex-1"
              disabled={!selectedCustomer}
              data-testid="tab-customer-rewards"
            >
              <Gift className="w-4 h-4 mr-2" />
              Rewards
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="mt-4">
            {showEnrollForm ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Add New Member</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowEnrollForm(false)}
                    data-testid="button-cancel-enroll"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={enrollForm.firstName}
                      onChange={(e) => setEnrollForm({ ...enrollForm, firstName: e.target.value })}
                      data-testid="input-enroll-first-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={enrollForm.lastName}
                      onChange={(e) => setEnrollForm({ ...enrollForm, lastName: e.target.value })}
                      data-testid="input-enroll-last-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={enrollForm.phone}
                      onChange={(e) => setEnrollForm({ ...enrollForm, phone: e.target.value })}
                      data-testid="input-enroll-phone"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={enrollForm.email}
                      onChange={(e) => setEnrollForm({ ...enrollForm, email: e.target.value })}
                      data-testid="input-enroll-email"
                    />
                  </div>
                </div>
                <Button
                  onClick={() => enrollMutation.mutate()}
                  disabled={
                    enrollMutation.isPending ||
                    !enrollForm.firstName ||
                    !enrollForm.lastName ||
                    (!enrollForm.phone && !enrollForm.email)
                  }
                  className="w-full"
                  data-testid="button-submit-enroll"
                >
                  {enrollMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4 mr-2" />
                  )}
                  Add Member
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, phone, or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                      data-testid="input-customer-search"
                    />
                  </div>
                  <Button variant="outline" onClick={() => setShowEnrollForm(true)} data-testid="button-new-customer">
                    <UserPlus className="w-4 h-4 mr-2" />
                    New
                  </Button>
                </div>

                <ScrollArea className="h-[300px]">
                  {isSearching ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : searchQuery.length < 2 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>Enter at least 2 characters to search</p>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No customers found</p>
                      <Button
                        variant="ghost"
                        onClick={() => setShowEnrollForm(true)}
                        className="mt-2 underline"
                        data-testid="link-enroll-new"
                      >
                        Add a new member
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 pr-2">
                      {searchResults.map((customer) => (
                        <Card
                          key={customer.id}
                          className="p-3 cursor-pointer hover-elevate active-elevate-2"
                          onClick={() => handleSelectCustomer(customer)}
                          data-testid={`card-customer-${customer.id}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold">
                                  {customer.firstName} {customer.lastName}
                                </span>
                                <Badge variant="secondary" className="text-xs">
                                  <Star className="w-3 h-3 mr-1" />
                                  Member
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                                {customer.phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {customer.phone}
                                  </span>
                                )}
                                {customer.email && (
                                  <span className="flex items-center gap-1">
                                    <Mail className="w-3 h-3" />
                                    {customer.email}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}
          </TabsContent>

          <TabsContent value="profile" className="mt-4">
            {isLoadingDetails ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : customerDetails ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {customerDetails.customer.firstName} {customerDetails.customer.lastName}
                    </h3>
                    <div className="text-sm text-muted-foreground space-y-1 mt-1">
                      {customerDetails.customer.phone && (
                        <p className="flex items-center gap-2">
                          <Phone className="w-4 h-4" />
                          {customerDetails.customer.phone}
                        </p>
                      )}
                      {customerDetails.customer.email && (
                        <p className="flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          {customerDetails.customer.email}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">
                      {(customerDetails.customer as any).enrollments?.reduce((sum: number, e: any) => sum + (e.currentPoints || 0), 0) || 0}
                    </div>
                    <p className="text-sm text-muted-foreground">Total Points</p>
                    <p className="text-xs text-muted-foreground">
                      {(customerDetails.customer as any).enrollments?.length || 0} program(s)
                    </p>
                  </div>
                </div>

                {/* Program Enrollments */}
                {(customerDetails.customer as any).enrollments?.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">Program Enrollments</h4>
                    <div className="space-y-2">
                      {(customerDetails.customer as any).enrollments.map((enrollment: any) => (
                        <div key={enrollment.id} className="flex items-center justify-between gap-4 p-2 bg-muted/50 rounded-md">
                          <div className="flex items-center gap-2">
                            <Star className="w-4 h-4 text-yellow-500" />
                            <span className="font-medium">{enrollment.program?.name || "Unknown"}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="outline">{enrollment.currentPoints || 0} pts</Badge>
                            <Badge variant={enrollment.status === "active" ? "default" : "secondary"}>
                              {enrollment.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                {showEditProfile ? (
                  <div className="p-3 bg-muted rounded-md space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Edit Profile</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowEditProfile(false)}
                        data-testid="button-cancel-edit-profile"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>First Name</Label>
                        <Input
                          value={editForm.firstName}
                          onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                          placeholder="First name"
                          data-testid="input-edit-first-name"
                        />
                      </div>
                      <div>
                        <Label>Last Name</Label>
                        <Input
                          value={editForm.lastName}
                          onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                          placeholder="Last name"
                          data-testid="input-edit-last-name"
                        />
                      </div>
                      <div>
                        <Label>Phone</Label>
                        <Input
                          type="tel"
                          value={editForm.phone}
                          onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                          placeholder="Phone number"
                          data-testid="input-edit-phone"
                        />
                      </div>
                      <div>
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          placeholder="Email address"
                          data-testid="input-edit-email"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={() => {
                        if (!selectedCustomer?.id) {
                          toast({ title: "Error", description: "No customer selected", variant: "destructive" });
                          return;
                        }
                        updateProfileMutation.mutate();
                      }}
                      disabled={updateProfileMutation.isPending || (!editForm.firstName && !editForm.lastName)}
                      className="w-full"
                      data-testid="button-save-profile"
                    >
                      {updateProfileMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <User className="w-4 h-4 mr-2" />
                      )}
                      Save Profile
                    </Button>
                  </div>
                ) : showAddPoints ? (
                  <div className="p-3 bg-muted rounded-md space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Add Points</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAddPoints(false)}
                        data-testid="button-cancel-add-points"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Points</Label>
                        <Input
                          type="number"
                          value={pointsToAdd}
                          onChange={(e) => setPointsToAdd(e.target.value)}
                          placeholder="Enter points"
                          data-testid="input-add-points"
                        />
                      </div>
                      <div>
                        <Label>Reason</Label>
                        <Input
                          value={pointsReason}
                          onChange={(e) => setPointsReason(e.target.value)}
                          placeholder="Optional reason"
                          data-testid="input-add-points-reason"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={() => addPointsMutation.mutate()}
                      disabled={addPointsMutation.isPending || !pointsToAdd}
                      className="w-full"
                      data-testid="button-submit-add-points"
                    >
                      {addPointsMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4 mr-2" />
                      )}
                      Add Points
                    </Button>
                  </div>
                ) : showEnrollInProgram ? (
                  <div className="p-3 bg-muted rounded-md space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Enroll in Program</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setShowEnrollInProgram(false); setSelectedEnrollProgramId(""); }}
                        data-testid="button-cancel-enroll-program"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label>Select Program</Label>
                      <Select value={selectedEnrollProgramId} onValueChange={setSelectedEnrollProgramId}>
                        <SelectTrigger data-testid="select-enroll-program">
                          <SelectValue placeholder="Choose a program" />
                        </SelectTrigger>
                        <SelectContent>
                          {loyaltyPrograms
                            .filter(p => p.active && !(customerDetails?.customer as any)?.enrollments?.some((e: any) => e.programId === p.id))
                            .map((program) => (
                              <SelectItem key={program.id} value={program.id}>
                                {program.name} ({program.programType})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {loyaltyPrograms.filter(p => p.active && !(customerDetails?.customer as any)?.enrollments?.some((e: any) => e.programId === p.id)).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-2">
                          Already enrolled in all active programs
                        </p>
                      )}
                    </div>
                    <Button
                      onClick={() => {
                        if (selectedCustomer?.id && selectedEnrollProgramId) {
                          enrollInProgramMutation.mutate({
                            memberId: selectedCustomer.id,
                            programId: selectedEnrollProgramId,
                          });
                        }
                      }}
                      disabled={enrollInProgramMutation.isPending || !selectedEnrollProgramId}
                      className="w-full"
                      data-testid="button-submit-enroll-program"
                    >
                      {enrollInProgramMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Star className="w-4 h-4 mr-2" />
                      )}
                      Enroll in Program
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {currentCheck && !currentCustomerId && (
                      <Button
                        onClick={() => attachMutation.mutate(selectedCustomer!.id)}
                        disabled={attachMutation.isPending}
                        data-testid="button-attach-customer"
                      >
                        {attachMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <User className="w-4 h-4 mr-2" />
                        )}
                        Attach to Check
                      </Button>
                    )}
                    {currentCheck && currentCustomerId === selectedCustomer?.id && (
                      <Button
                        variant="destructive"
                        onClick={() => detachMutation.mutate()}
                        disabled={detachMutation.isPending}
                        data-testid="button-detach-customer"
                      >
                        {detachMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <X className="w-4 h-4 mr-2" />
                        )}
                        Remove from Check
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => setShowAddPoints(true)}
                      data-testid="button-show-add-points"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Points
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditForm({
                          firstName: customerDetails.customer.firstName || "",
                          lastName: customerDetails.customer.lastName || "",
                          phone: customerDetails.customer.phone || "",
                          email: customerDetails.customer.email || "",
                        });
                        setShowEditProfile(true);
                      }}
                      data-testid="button-show-edit-profile"
                    >
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit Profile
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowEnrollInProgram(true)}
                      data-testid="button-show-enroll-in-program"
                    >
                      <Star className="w-4 h-4 mr-2" />
                      Add to Program
                    </Button>
                    {customerDetails.recentChecks.length > 0 && currentCheck && (
                      <Button
                        variant="outline"
                        onClick={() => reorderMutation.mutate()}
                        disabled={reorderMutation.isPending}
                        data-testid="button-reorder"
                      >
                        {reorderMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4 mr-2" />
                        )}
                        Reorder Last
                      </Button>
                    )}
                  </div>
                )}

                {customerDetails.availableRewards.length > 0 && (
                  <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
                    <div className="flex items-center gap-2 mb-2">
                      <Award className="w-4 h-4 text-green-600" />
                      <span className="font-medium text-green-700 dark:text-green-300">
                        {customerDetails.availableRewards.length} Reward(s) Available
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {customerDetails.availableRewards.map((reward) => (
                        <Badge key={reward.id} variant="outline" className="bg-white dark:bg-gray-900">
                          {reward.name} ({reward.pointsCost} pts)
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Select a customer to view profile
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {isLoadingDetails ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : customerDetails?.recentChecks && customerDetails.recentChecks.length > 0 ? (
              <div className="flex flex-col h-[300px]">
                <ScrollArea className="flex-1">
                  <div className="space-y-2 pr-2">
                    {customerDetails.recentChecks.map((check) => {
                      const isSelected = selectedHistoryCheck?.id === check.id;
                      const activeItems = check.items?.filter(item => item.itemStatus === "active" && !item.voided) || [];
                      return (
                        <Card
                          key={check.id}
                          className={`p-3 cursor-pointer transition-colors ${isSelected ? "ring-2 ring-primary bg-primary/5" : "hover-elevate"}`}
                          onClick={() => setSelectedHistoryCheck(isSelected ? null : check)}
                          data-testid={`card-history-check-${check.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium">Check #{check.checkNumber}</span>
                              <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                                <Clock className="w-3 h-3" />
                                {check.openedAt ? formatShortDateInTimezone(check.openedAt, timezone) : "N/A"}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-semibold">${check.total || "0.00"}</span>
                              <Badge variant="secondary" className="ml-2 text-xs">
                                {check.status}
                              </Badge>
                            </div>
                          </div>
                          {activeItems.length > 0 && (
                            <div className="mt-2 pt-2 border-t">
                              <div className="text-xs text-muted-foreground mb-1">{activeItems.length} item(s)</div>
                              <div className="space-y-1">
                                {activeItems.slice(0, isSelected ? activeItems.length : 3).map((item, idx) => (
                                  <div key={item.id || idx} className="flex items-center justify-between text-sm">
                                    <span className="truncate flex-1">
                                      {(item.quantity || 1) > 1 && <span className="text-muted-foreground mr-1">{item.quantity}x</span>}
                                      {item.menuItemName}
                                    </span>
                                    <span className="text-muted-foreground ml-2">
                                      ${(parseFloat(item.unitPrice || "0") * (item.quantity || 1)).toFixed(2)}
                                    </span>
                                  </div>
                                ))}
                                {!isSelected && activeItems.length > 3 && (
                                  <div className="text-xs text-muted-foreground">
                                    +{activeItems.length - 3} more items
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
                {selectedHistoryCheck && (
                  <div className="mt-3 pt-3 border-t">
                    <Button
                      className="w-full"
                      onClick={() => {
                        if (onReorderRequested && selectedHistoryCheck.items) {
                          const activeItems = selectedHistoryCheck.items.filter(
                            item => item.itemStatus === "active" && !item.voided
                          );
                          onReorderRequested(activeItems, selectedCustomer);
                          toast({
                            title: "Repeat Order",
                            description: `Adding ${activeItems.length} item(s) from previous order`,
                          });
                          onClose();
                        }
                      }}
                      data-testid="button-repeat-order"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Repeat Order ({selectedHistoryCheck.items?.filter(i => i.itemStatus === "active" && !i.voided).length || 0} items)
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No order history</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="rewards" className="mt-4">
            {isLoadingDetails ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Per-program balances */}
                {(customerDetails?.customer as any)?.enrollments?.length > 0 ? (
                  <div className="space-y-2">
                    {(customerDetails?.customer as any).enrollments.map((enrollment: any) => (
                      <div key={enrollment.id} className="p-3 bg-muted rounded-md flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <Star className="w-4 h-4 text-yellow-500" />
                          <span className="font-medium">{enrollment.program?.name || "Unknown"}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold">{enrollment.currentPoints || 0}</div>
                          <p className="text-xs text-muted-foreground">points</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-muted rounded-md text-center">
                    <div className="text-3xl font-bold">0</div>
                    <p className="text-sm text-muted-foreground">No programs enrolled</p>
                  </div>
                )}

                {customerDetails?.availableRewards && customerDetails.availableRewards.length > 0 ? (
                  <div className="space-y-2">
                    <h4 className="font-medium">Available Rewards</h4>
                    {customerDetails.availableRewards.map((reward: any) => (
                      <Card key={reward.id} className="p-3" data-testid={`card-reward-${reward.id}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="font-medium">{reward.name}</span>
                            <p className="text-sm text-muted-foreground">{reward.description}</p>
                            {reward.programName && (
                              <p className="text-xs text-muted-foreground">{reward.programName}</p>
                            )}
                          </div>
                          <Badge>
                            <Star className="w-3 h-3 mr-1" />
                            {reward.pointsCost} pts
                          </Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <Gift className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No rewards available yet</p>
                    <p className="text-xs">Keep earning points to unlock rewards</p>
                  </div>
                )}

                {customerDetails?.transactions && customerDetails.transactions.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Recent Transactions</h4>
                    <ScrollArea className="h-[150px]">
                      <div className="space-y-1 pr-2">
                        {customerDetails.transactions.slice(0, 10).map((tx: any) => (
                          <div
                            key={tx.id}
                            className="flex items-center justify-between p-2 text-sm bg-muted/50 rounded"
                          >
                            <div>
                              <span className="text-muted-foreground">{tx.reason || tx.transactionType}</span>
                              {tx.programName && (
                                <span className="text-xs text-muted-foreground ml-2">({tx.programName})</span>
                              )}
                            </div>
                            <span className={tx.transactionType === "redeem" ? "text-red-600" : "text-green-600"}>
                              {tx.points >= 0 ? "+" : ""}
                              {tx.points}
                            </span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-close-customer-modal">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
