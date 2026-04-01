import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { usePosContext } from "@/lib/pos-context";
import { useDeviceContext } from "@/lib/device-context";
import { apiRequest, getAuthHeaders, failoverFetch } from "@/lib/queryClient";
import { connectionManager } from "@/lib/connection-manager";
import BreakAttestationDialog from "@/components/pos/break-attestation-dialog";
import type { Employee, Rvc, Property, Timecard, JobCode, Workstation, BreakRule } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useDeviceReload } from "@/hooks/use-device-reload";
import { useDeviceHeartbeat } from "@/hooks/use-device-heartbeat";
import { Building2, Delete, LogIn, Clock, CheckCircle2, LogOut, XCircle, Monitor, Maximize, Minimize, ChevronDown, MapPin } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface WorkstationContext {
  workstation: Workstation;
  property: Property;
  rvcs: Rvc[];
}

interface LoginResponse {
  employee: Employee;
  privileges: string[];
  salariedBypass?: boolean;
  bypassJobCode?: JobCode | null;
}

interface ClockStatusResponse {
  status: "clocked_out" | "clocked_in" | "on_break";
  lastPunch?: { punchType: string; actualTimestamp: string } | null;
  activeBreak?: object | null;
  clockedInAt?: string | null;
  isClockedIn: boolean;
  todayTimecard?: Timecard | null;
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isFullscreen, isSupported: fullscreenSupported, toggleFullscreen } = useFullscreen();
  const {
    setCurrentEmployee,
    setCurrentRvc,
    setPrivileges,
    setIsClockedIn,
    setCurrentTimecard,
    setIsSalariedBypass,
    setCurrentJobCode,
    currentEmployee,
    currentRvc,
    workstationId,
    setWorkstationId,
    setCurrentWorkstation,
  } = usePosContext();

  useDeviceReload();
  useDeviceHeartbeat(true);

  const { clearDeviceConfig } = useDeviceContext();

  const [selectedRvcId, setSelectedRvcId] = useState<string>("");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  
  const [showClockModal, setShowClockModal] = useState(false);
  const [clockPin, setClockPin] = useState("");
  const [clockEmployee, setClockEmployee] = useState<Employee | null>(null);
  const [clockStatus, setClockStatus] = useState<ClockStatusResponse | null>(null);
  const [clockError, setClockError] = useState<string | null>(null);
  const [employeeJobs, setEmployeeJobs] = useState<JobCode[]>([]);
  const [clockStep, setClockStep] = useState<"pin" | "job_select" | "status" | "clock_out_type" | "break_type">("pin");
  const [showAttestationDialog, setShowAttestationDialog] = useState(false);
  const [pendingAttestationData, setPendingAttestationData] = useState<any>(null);
  const [showRvcSwitcher, setShowRvcSwitcher] = useState(false);
  const loginAbortRef = useRef<AbortController | null>(null);

  // Fetch workstation context (includes property and allowed RVCs) if workstation is set
  const { data: wsContext, isLoading: wsContextLoading, error: wsContextError } = useQuery<WorkstationContext>({
    queryKey: ["/api/workstations", workstationId, "context"],
    enabled: !!workstationId,
  });

  // Fallback to all RVCs only if no workstation is configured (for admin/testing)
  const { data: allRvcs = [], isLoading: allRvcsLoading } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs"],
    enabled: !workstationId,
  });

  const { data: allWorkstations = [], isLoading: workstationsLoading } = useQuery<Workstation[]>({
    queryKey: ["/api/workstations"],
    queryFn: async () => {
      const response = await failoverFetch("/api/workstations", { headers: getAuthHeaders() });
      if (!response.ok) throw new Error("Failed to fetch workstations");
      return response.json();
    },
    enabled: !workstationId,
  });

  // Use workstation-scoped RVCs if available, otherwise fall back to all RVCs
  const rvcs = wsContext?.rvcs ?? allRvcs;
  const rvcsLoading = workstationId ? wsContextLoading : allRvcsLoading;
  const selectedProperty = wsContext?.property;

  // Query break rules for attestation requirements
  const { data: breakRules = [] } = useQuery<BreakRule[]>({
    queryKey: ["/api/break-rules?propertyId=" + selectedProperty?.id],
    enabled: !!selectedProperty?.id,
  });
  const activeBreakRule = breakRules.find(r => r.active) || null;

  // Update workstation in context when loaded
  useEffect(() => {
    if (wsContext?.workstation) {
      setCurrentWorkstation(wsContext.workstation);
    }
  }, [wsContext, setCurrentWorkstation]);
  
  // Auto-select RVC from workstation configuration (device-locked, no manual selection)
  useEffect(() => {
    if (wsContext?.workstation?.rvcId) {
      // Use the workstation's assigned RVC - no user selection allowed
      setSelectedRvcId(wsContext.workstation.rvcId);
    } else if (rvcs.length === 1) {
      // If only one RVC available, auto-select it
      setSelectedRvcId(rvcs[0].id);
    }
  }, [wsContext, rvcs]);

  const loginMutation = useMutation({
    mutationFn: async (pinCode: string) => {
      loginAbortRef.current?.abort();
      const cancelController = new AbortController();
      loginAbortRef.current = cancelController;

      const payload = JSON.stringify({ pin: pinCode, rvcId: selectedRvcId });
      const baseUrl = connectionManager.getBaseUrl();
      const url = `${baseUrl}/api/auth/login`;
      const LOGIN_TIMEOUT_MS = 8000;

      const isRetryableError = (err: unknown, res?: Response): boolean => {
        if (err instanceof TypeError) return true;
        if (err instanceof DOMException && err.name === "TimeoutError") return true;
        if (res && res.status >= 500) return true;
        return false;
      };

      const doLogin = async (targetUrl: string): Promise<Response> => {
        const res = await fetch(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: payload,
          credentials: "include",
          signal: AbortSignal.any([
            cancelController.signal,
            AbortSignal.timeout(LOGIN_TIMEOUT_MS),
          ]),
        });
        return res;
      };

      let firstRes: Response | undefined;
      let firstErr: unknown;
      try {
        firstRes = await doLogin(url);
        if (firstRes.ok) {
          return firstRes.json() as Promise<LoginResponse>;
        }
        if (!isRetryableError(null, firstRes)) {
          const text = (await firstRes.text()) || firstRes.statusText;
          throw new Error(`${firstRes.status}: ${text}`);
        }
        firstErr = new Error(`${firstRes.status}: ${firstRes.statusText}`);
      } catch (err: unknown) {
        if (cancelController.signal.aborted) throw err;
        firstErr = err;
        if (!isRetryableError(err)) throw err;
      }

      const lfsUrl = connectionManager.localServerUrl;
      if (!lfsUrl || url.startsWith(lfsUrl)) throw firstErr;

      const retryRes = await fetch(`${lfsUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: payload,
        credentials: "include",
        signal: AbortSignal.any([
          cancelController.signal,
          AbortSignal.timeout(LOGIN_TIMEOUT_MS),
        ]),
      });
      if (!retryRes.ok) {
        const text = (await retryRes.text()) || retryRes.statusText;
        throw new Error(`${retryRes.status}: ${text}`);
      }
      return retryRes.json() as Promise<LoginResponse>;
    },
    onSuccess: async (data) => {
      // For salaried bypass, skip clock-in check - they have privileges without clocking in
      if (data.salariedBypass) {
        setCurrentEmployee(data.employee);
        setPrivileges(data.privileges);
        setIsClockedIn(true); // Treat salaried bypass as "always clocked in" for POS access
        setIsSalariedBypass(true);
        setCurrentJobCode(data.bypassJobCode || null);
        const rvc = rvcs.find((r) => r.id === selectedRvcId);
        if (rvc) {
          setCurrentRvc(rvc);
        }
        navigate("/pos");
        return;
      }

      let hasJobs = true;
      try {
        const jobsController = new AbortController();
        const jobsTimeout = setTimeout(() => jobsController.abort(), 5000);
        const jobsRes = await failoverFetch(`/api/employees/${data.employee.id}/job-codes/details`, { credentials: "include", headers: getAuthHeaders(), signal: jobsController.signal });
        clearTimeout(jobsTimeout);
        if (jobsRes.ok) {
          const jobDetails = await jobsRes.json();
          hasJobs = jobDetails && jobDetails.length > 0;
          setEmployeeJobs(jobDetails.map((detail: { jobCode: JobCode }) => detail.jobCode));
        }
      } catch {
        hasJobs = true;
      }

      let isClockedIn = false;
      let todayTimecard = null;
      try {
        const statusController = new AbortController();
        const statusTimeout = setTimeout(() => statusController.abort(), 5000);
        const statusRes = await failoverFetch(`/api/time-punches/status/${data.employee.id}`, { credentials: "include", headers: getAuthHeaders(), signal: statusController.signal });
        clearTimeout(statusTimeout);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          isClockedIn = statusData.status === "clocked_in" || statusData.status === "on_break";
          todayTimecard = statusData.todayTimecard || null;
        }
      } catch {
        isClockedIn = false;
      }

      if (hasJobs && !isClockedIn) {
        setClockEmployee(data.employee);
        setClockStatus({ status: "clocked_out", lastPunch: null, activeBreak: null, clockedInAt: null, isClockedIn: false });
        setLoginError("You must clock in before ringing sales. Tap 'Clock In / Out' below.");
        setPin("");
        return;
      }
      
      // Employee either has no jobs (no labor tracking) or is already clocked in
      setCurrentEmployee(data.employee);
      setPrivileges(data.privileges);
      setIsClockedIn(isClockedIn);
      setCurrentTimecard(todayTimecard);
      setIsSalariedBypass(false);
      const rvc = rvcs.find((r) => r.id === selectedRvcId);
      if (rvc) {
        setCurrentRvc(rvc);
      }
      navigate("/pos");
    },
    onError: async (error: Error) => {
      if (error.name === "AbortError") {
        return;
      }
      const msg = error.message || "";
      if (msg.startsWith("4") || msg.includes("Invalid") || msg.includes("not found")) {
        setLoginError("Invalid PIN or employee not found");
      } else if (error.name === "TimeoutError" || msg.includes("timeout") || msg.includes("Timeout")) {
        setLoginError("Connection timed out. Please check network and try again.");
      } else {
        setLoginError("Unable to connect. Please check network and try again.");
      }
      setPin("");
    },
  });

  const clockAuthMutation = useMutation({
    mutationFn: async (pinCode: string) => {
      const response = await apiRequest("POST", "/api/auth/login", {
        pin: pinCode,
        rvcId: selectedRvcId,
      });
      return response.json() as Promise<LoginResponse>;
    },
    onSuccess: async (data) => {
      setClockEmployee(data.employee);
      
      const statusRes = await failoverFetch(`/api/time-punches/status/${data.employee.id}`, { credentials: "include", headers: getAuthHeaders() });
      let statusData: ClockStatusResponse | null = null;
      if (statusRes.ok) {
        const rawStatus = await statusRes.json();
        statusData = {
          ...rawStatus,
          isClockedIn: rawStatus.status === "clocked_in" || rawStatus.status === "on_break",
        };
        setClockStatus(statusData);
      }
      
      const jobsRes = await failoverFetch(`/api/employees/${data.employee.id}/job-codes/details`, { credentials: "include", headers: getAuthHeaders() });
      let jobs: JobCode[] = [];
      if (jobsRes.ok) {
        const jobDetails = await jobsRes.json();
        // Extract jobCode from each assignment to get full job details with name
        jobs = jobDetails.map((detail: { jobCode: JobCode }) => detail.jobCode);
        setEmployeeJobs(jobs);
      }
      
      const isClockedIn = statusData?.status === "clocked_in" || statusData?.status === "on_break";
      
      if (isClockedIn) {
        setClockStep("status");
      } else if (jobs.length > 1) {
        setClockStep("job_select");
      } else {
        clockInMutation.mutate({
          employeeId: data.employee.id,
          jobCodeId: jobs.length === 1 ? jobs[0].id : undefined,
          employeeName: data.employee.firstName,
        });
      }
    },
    onError: () => {
      setClockError("Invalid PIN");
      setClockPin("");
    },
  });

  const refreshClockStatus = async (employeeId: string) => {
    const statusRes = await failoverFetch(`/api/time-punches/status/${employeeId}`, { credentials: "include", headers: getAuthHeaders() });
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      setClockStatus({
        ...statusData,
        isClockedIn: statusData.status === "clocked_in" || statusData.status === "on_break",
      });
    }
  };

  const clockInMutation = useMutation({
    mutationFn: async (params: { employeeId: string; jobCodeId?: string; employeeName: string }) => {
      const selectedRvc = rvcs.find((r) => r.id === selectedRvcId);
      const response = await apiRequest("POST", "/api/time-punches/clock-in", {
        employeeId: params.employeeId,
        propertyId: selectedRvc?.propertyId,
        jobCodeId: params.jobCodeId,
      });
      return { result: await response.json(), employeeName: params.employeeName };
    },
    onSuccess: (data) => {
      toast({
        title: "Clocked In",
        description: `${data.employeeName} is now clocked in.`,
      });
      handleCloseClockModal();
    },
    onError: () => {
      setClockError("Failed to clock in. Please try again.");
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async (data: { punchType: "end_shift"; attestation?: any }) => {
      const selectedRvc = rvcs.find((r) => r.id === selectedRvcId);
      const response = await apiRequest("POST", "/api/time-punches/clock-out", {
        employeeId: clockEmployee?.id,
        propertyId: selectedRvc?.propertyId,
        attestation: data.attestation,
        cashTipsDeclared: data.attestation?.cashTipsDeclared,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Clocked Out",
        description: `${clockEmployee?.firstName} has ended their shift.`,
      });
      setShowAttestationDialog(false);
      setPendingAttestationData(null);
      handleCloseClockModal();
    },
    onError: () => {
      setClockError("Failed to clock out. Please try again.");
    },
  });

  const handleEndShiftClick = () => {
    if (activeBreakRule?.requireClockOutAttestation && clockStatus?.clockedInAt) {
      setShowAttestationDialog(true);
    } else {
      clockOutMutation.mutate({ punchType: "end_shift" });
    }
  };

  const handleAttestationConfirm = (attestationData: any) => {
    setShowAttestationDialog(false);
    clockOutMutation.mutate({ punchType: "end_shift", attestation: attestationData });
  };

  const handleAttestationCancel = () => {
    setShowAttestationDialog(false);
  };

  const breakStartMutation = useMutation({
    mutationFn: async (breakType: "meal" | "rest") => {
      const selectedRvc = rvcs.find((r) => r.id === selectedRvcId);
      const response = await apiRequest("POST", "/api/time-punches/break-start", {
        employeeId: clockEmployee?.id,
        propertyId: selectedRvc?.propertyId,
        breakType,
      });
      return response.json();
    },
    onSuccess: (_data, breakType) => {
      toast({
        title: "On Break",
        description: `${clockEmployee?.firstName} is now on a ${breakType === "meal" ? "30 minute meal" : "15 minute rest"} break.`,
      });
      handleCloseClockModal();
    },
    onError: () => {
      setClockError("Failed to start break. Please try again.");
    },
  });

  const breakEndMutation = useMutation({
    mutationFn: async () => {
      const selectedRvc = rvcs.find((r) => r.id === selectedRvcId);
      const response = await apiRequest("POST", "/api/time-punches/break-end", {
        employeeId: clockEmployee?.id,
        propertyId: selectedRvc?.propertyId,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Break Ended",
        description: `${clockEmployee?.firstName} is back from break.`,
      });
      // Refresh status to show clocked_in state
      if (clockEmployee) {
        refreshClockStatus(clockEmployee.id);
      }
      handleCloseClockModal();
    },
    onError: () => {
      setClockError("Failed to end break. Please try again.");
    },
  });

  const handleDigit = (digit: string) => {
    if (pin.length < 6 && !loginMutation.isPending) {
      const newPin = pin + digit;
      setPin(newPin);
      setLoginError(null);
      // Auto-submit when 4 digits are entered
      if (newPin.length === 4) {
        loginMutation.mutate(newPin);
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPin("");
    setLoginError(null);
    if (loginAbortRef.current) {
      loginAbortRef.current.abort();
      loginAbortRef.current = null;
    }
    if (loginMutation.isPending) {
      loginMutation.reset();
    }
  };

  const handleSubmit = () => {
    if (pin.length >= 4) {
      loginMutation.mutate(pin);
    }
  };

  const handleClockDigit = (digit: string) => {
    if (clockPin.length < 6) {
      setClockPin((prev) => prev + digit);
      setClockError(null);
    }
  };

  const handleClockDelete = () => {
    setClockPin((prev) => prev.slice(0, -1));
  };

  const handleClockClear = () => {
    setClockPin("");
    setClockError(null);
  };

  const handleClockSubmit = () => {
    if (clockPin.length >= 4) {
      clockAuthMutation.mutate(clockPin);
    }
  };

  const handleOpenClockModal = () => {
    setClockPin("");
    setClockEmployee(null);
    setClockStatus(null);
    setClockError(null);
    setEmployeeJobs([]);
    setClockStep("pin");
    setShowClockModal(true);
  };

  const handleCloseClockModal = () => {
    setShowClockModal(false);
    setClockPin("");
    setClockEmployee(null);
    setClockStatus(null);
    setClockError(null);
    setEmployeeJobs([]);
    setClockStep("pin");
  };

  const handleBackToClockPin = () => {
    setClockEmployee(null);
    setClockStatus(null);
    setClockPin("");
    setClockError(null);
    setEmployeeJobs([]);
    setClockStep("pin");
  };


  useEffect(() => {
    if (currentEmployee && currentRvc) {
      navigate("/pos");
    }
  }, [currentEmployee, currentRvc, navigate]);

  if (currentEmployee && currentRvc) {
    return null;
  }

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  const selectedRvc = rvcs.find((r) => r.id === selectedRvcId);

  // Show workstation selection if no workstation is configured
  if (!workstationId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          {fullscreenSupported && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              data-testid="button-fullscreen"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </Button>
          )}
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-2">
              <Monitor className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-xl font-semibold">Select Workstation</CardTitle>
            <CardDescription>
              Choose the POS terminal for this device. This determines which location's registers and settings to use.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {workstationsLoading ? (
              <div className="text-center text-muted-foreground py-4">Loading workstations...</div>
            ) : allWorkstations.length === 0 ? (
              <div className="text-center text-muted-foreground py-4">
                No workstations configured. Please set up workstations in the Admin panel first.
              </div>
            ) : (
              <div className="space-y-2">
                {allWorkstations.map((ws) => (
                  <Button
                    key={ws.id}
                    variant="outline"
                    className="w-full justify-start gap-3 h-auto py-3"
                    onClick={() => setWorkstationId(ws.id)}
                    data-testid={`button-workstation-${ws.id}`}
                  >
                    <Monitor className="w-5 h-5 text-muted-foreground" />
                    <div className="text-left">
                      <div className="font-medium">{ws.name}</div>
                      <div className="text-xs text-muted-foreground">{ws.deviceType}</div>
                    </div>
                  </Button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center pt-2">
              Tip: You can also set the workstation via URL parameter: ?workstation=ID
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show error if workstation context failed to load
  if (wsContextError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          {fullscreenSupported && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              data-testid="button-fullscreen"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </Button>
          )}
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-2">
              <XCircle className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle className="text-xl font-semibold">Workstation Not Found</CardTitle>
            <CardDescription>
              The selected workstation "{workstationId}" could not be found or loaded.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setWorkstationId(null)}
              data-testid="button-clear-workstation"
            >
              Select Different Workstation
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {fullscreenSupported && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            data-testid="button-fullscreen"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </Button>
        )}
        <ThemeToggle />
      </div>

      <div className="flex min-h-screen">
        <div className="hidden md:flex flex-1 bg-muted/30 items-center justify-center p-8">
          <div className="max-w-md w-full text-center space-y-6">
            {selectedProperty?.signInLogoUrl ? (
              <img
                src={selectedProperty.signInLogoUrl}
                alt={selectedProperty.name || "Logo"}
                className="max-w-full max-h-64 mx-auto object-contain"
                data-testid="img-property-logo"
              />
            ) : (
              <div className="w-48 h-48 mx-auto bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-muted-foreground/30">
                <Building2 className="w-24 h-24 text-muted-foreground/50" />
              </div>
            )}
            <div>
              <h2 className="text-2xl font-semibold text-foreground" data-testid="text-property-name">
                {selectedProperty?.name || selectedRvc?.name || "Welcome"}
              </h2>
              {selectedProperty?.address && (
                <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">
                  {selectedProperty.address}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 md:max-w-md lg:max-w-lg md:border-l">
          <div className="w-full max-w-sm space-y-6">
            <div className="md:hidden text-center mb-6">
              {selectedProperty?.signInLogoUrl ? (
                <img
                  src={selectedProperty.signInLogoUrl}
                  alt={selectedProperty.name || "Logo"}
                  className="max-w-full max-h-24 mx-auto object-contain"
                  data-testid="img-property-logo-mobile"
                />
              ) : (
                <Building2 className="w-12 h-12 mx-auto text-primary" />
              )}
            </div>

            {/* Revenue Center selector */}
            {selectedRvc && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Revenue Center
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {rvcs.length > 1 ? (
                    <div>
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 p-2 bg-muted/50 hover:bg-muted rounded-md transition-colors cursor-pointer"
                        onClick={() => setShowRvcSwitcher(!showRvcSwitcher)}
                        data-testid="button-rvc-switcher"
                      >
                        <div className="flex-1 text-left">
                          <div className="font-medium" data-testid="text-rvc-name">{selectedRvc.name}</div>
                          <div className="text-xs text-muted-foreground">Tap to switch revenue center</div>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showRvcSwitcher ? 'rotate-180' : ''}`} />
                      </button>
                      {showRvcSwitcher && (
                        <div className="mt-2 space-y-1 border rounded-md p-2 bg-background" data-testid="rvc-switcher-list">
                          {rvcs.map((rvc) => (
                            <button
                              key={rvc.id}
                              type="button"
                              className={`w-full flex items-center gap-2 p-2 rounded-md text-left transition-colors ${
                                rvc.id === selectedRvcId
                                  ? 'bg-primary/10 text-primary font-medium'
                                  : 'hover:bg-muted'
                              }`}
                              onClick={() => {
                                setSelectedRvcId(rvc.id);
                                setShowRvcSwitcher(false);
                              }}
                              data-testid={`button-rvc-option-${rvc.id}`}
                            >
                              <MapPin className="w-4 h-4 flex-shrink-0" />
                              <span>{rvc.name}</span>
                              {rvc.id === selectedRvcId && (
                                <CheckCircle2 className="w-4 h-4 ml-auto text-primary" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                      <div className="flex-1">
                        <div className="font-medium" data-testid="text-rvc-name">{selectedRvc.name}</div>
                        <div className="text-xs text-muted-foreground">Default revenue center</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Show error if no RVC is configured for this workstation */}
            {!selectedRvcId && !rvcsLoading && workstationId && !wsContext?.workstation?.rvcId && (
              <Card className="border-destructive">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-medium flex items-center gap-2 text-destructive">
                    <XCircle className="w-4 h-4" />
                    Configuration Error
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    This workstation does not have an RVC assigned. Please configure the workstation in the EMC Admin panel.
                  </p>
                </CardContent>
              </Card>
            )}

            {selectedRvcId && (
              <>
                <Card>
                  <CardHeader className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                      <LogIn className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl font-semibold" data-testid="text-login-title">
                      Employee Sign In
                    </CardTitle>
                    <p className="text-muted-foreground text-base">Enter your PIN to access POS</p>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="flex justify-center gap-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${
                            i < pin.length
                              ? "bg-primary border-primary"
                              : "border-muted-foreground/30"
                          }`}
                          data-testid={`pin-dot-${i}`}
                        />
                      ))}
                    </div>

                    {loginError && (
                      <div
                        className="text-center text-destructive text-base font-medium"
                        data-testid="text-login-error"
                      >
                        {loginError}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2">
                      {digits.slice(0, 9).map((digit) => (
                        <Button
                          key={digit}
                          variant="secondary"
                          className="h-16 text-xl font-semibold"
                          onClick={() => handleDigit(digit)}
                          disabled={loginMutation.isPending}
                          data-testid={`button-pin-${digit}`}
                        >
                          {digit}
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        className="h-16 text-sm"
                        onClick={handleClear}
                        data-testid="button-pin-clear"
                      >
                        Clear
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-16 text-xl font-semibold"
                        onClick={() => handleDigit("0")}
                        disabled={loginMutation.isPending}
                        data-testid="button-pin-0"
                      >
                        0
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-16"
                        onClick={handleDelete}
                        disabled={loginMutation.isPending}
                        data-testid="button-pin-delete"
                      >
                        <Delete className="w-5 h-5" />
                      </Button>
                    </div>

                    <Button
                      className="w-full h-12 text-base font-semibold"
                      onClick={handleSubmit}
                      disabled={pin.length < 4 || loginMutation.isPending}
                      data-testid="button-login-submit"
                    >
                      {loginMutation.isPending ? "Signing in..." : "Sign In"}
                    </Button>
                  </CardContent>
                </Card>

                <Button
                    variant="outline"
                    className="w-full h-12"
                    onClick={handleOpenClockModal}
                    data-testid="button-open-clock"
                  >
                    <Clock className="w-5 h-5 mr-2" />
                    Clock In / Out
                  </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showClockModal} onOpenChange={setShowClockModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Time Clock
            </DialogTitle>
            <DialogDescription>
              {format(new Date(), "EEEE, MMMM d, yyyy")}
            </DialogDescription>
          </DialogHeader>

          {clockStep === "pin" && (
            <div className="space-y-4">
              <p className="text-base text-muted-foreground text-center">
                Enter your PIN to clock in or out
              </p>
              
              <div className="flex justify-center gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${
                      i < clockPin.length
                        ? "bg-primary border-primary"
                        : "border-muted-foreground/30"
                    }`}
                    data-testid={`clock-pin-dot-${i}`}
                  />
                ))}
              </div>

              {clockError && (
                <div className="text-center text-destructive text-base font-medium">
                  {clockError}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                {digits.slice(0, 9).map((digit) => (
                  <Button
                    key={digit}
                    variant="secondary"
                    className="h-16 text-lg font-semibold"
                    onClick={() => handleClockDigit(digit)}
                    disabled={clockAuthMutation.isPending}
                    data-testid={`button-clock-pin-${digit}`}
                  >
                    {digit}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  className="h-16 text-sm"
                  onClick={handleClockClear}
                  disabled={clockAuthMutation.isPending}
                  data-testid="button-clock-pin-clear"
                >
                  Clear
                </Button>
                <Button
                  variant="secondary"
                  className="h-16 text-lg font-semibold"
                  onClick={() => handleClockDigit("0")}
                  disabled={clockAuthMutation.isPending}
                  data-testid="button-clock-pin-0"
                >
                  0
                </Button>
                <Button
                  variant="ghost"
                  className="h-16"
                  onClick={handleClockDelete}
                  disabled={clockAuthMutation.isPending}
                  data-testid="button-clock-pin-delete"
                >
                  <Delete className="w-4 h-4" />
                </Button>
              </div>

              <Button
                className="w-full"
                onClick={handleClockSubmit}
                disabled={clockPin.length < 4 || clockAuthMutation.isPending}
                data-testid="button-clock-submit"
              >
                {clockAuthMutation.isPending ? "Verifying..." : "Continue"}
              </Button>
            </div>
          )}

          {clockStep === "job_select" && clockEmployee && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold">
                  {clockEmployee.firstName} {clockEmployee.lastName}
                </h3>
                <p className="text-base text-muted-foreground mt-2">
                  Select the job you are working today
                </p>
              </div>

              {clockError && (
                <div className="text-center text-destructive text-base font-medium">
                  {clockError}
                </div>
              )}

              <div className="flex flex-col gap-2">
                {employeeJobs.map((job) => (
                  <Button
                    key={job.id}
                    variant="outline"
                    className="w-full h-12 justify-start"
                    onClick={() => clockInMutation.mutate({
                      employeeId: clockEmployee!.id,
                      jobCodeId: job.id,
                      employeeName: clockEmployee!.firstName,
                    })}
                    disabled={clockInMutation.isPending}
                    data-testid={`button-job-${job.id}`}
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    {job.name}
                  </Button>
                ))}
              </div>

              <Button
                variant="ghost"
                onClick={handleBackToClockPin}
                className="w-full"
                data-testid="button-clock-back"
              >
                Cancel
              </Button>
            </div>
          )}

          {clockStep === "status" && clockEmployee && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold">
                  {clockEmployee.firstName} {clockEmployee.lastName}
                </h3>
                
                <div className="mt-3 space-y-2">
                  {clockStatus?.status === "on_break" ? (
                    <Badge variant="secondary" className="bg-yellow-500 text-yellow-50">
                      <Clock className="w-3 h-3 mr-1" />
                      On Break
                    </Badge>
                  ) : (
                    <Badge variant="default" className="bg-green-500">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Clocked In
                    </Badge>
                  )}
                  {clockStatus?.clockedInAt && (
                    <p className="text-base text-muted-foreground">
                      Since {format(new Date(clockStatus.clockedInAt), "h:mm a")}
                    </p>
                  )}
                </div>
              </div>

              {clockError && (
                <div className="text-center text-destructive text-base font-medium">
                  {clockError}
                </div>
              )}

              <div className="flex flex-col gap-2">
                {clockStatus?.status === "on_break" ? (
                  <Button
                    variant="default"
                    className="w-full h-12"
                    onClick={() => breakEndMutation.mutate()}
                    disabled={breakEndMutation.isPending}
                    data-testid="button-end-break"
                  >
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                    End Break
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    className="w-full h-12"
                    onClick={() => setClockStep("clock_out_type")}
                    data-testid="button-clock-out"
                  >
                    <LogOut className="w-5 h-5 mr-2" />
                    Clock Out
                  </Button>
                )}

                <Button
                  variant="ghost"
                  onClick={handleCloseClockModal}
                  data-testid="button-clock-cancel"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {clockStep === "clock_out_type" && clockEmployee && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold">
                  {clockEmployee.firstName} {clockEmployee.lastName}
                </h3>
                <p className="text-base text-muted-foreground mt-2">
                  Are you going on break or ending your shift?
                </p>
              </div>

              {clockError && (
                <div className="text-center text-destructive text-base font-medium">
                  {clockError}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="w-full h-12"
                  onClick={() => setClockStep("break_type")}
                  data-testid="button-clock-out-break"
                >
                  Going on Break
                </Button>

                <Button
                  variant="destructive"
                  className="w-full h-12"
                  onClick={handleEndShiftClick}
                  disabled={clockOutMutation.isPending}
                  data-testid="button-clock-out-end-shift"
                >
                  <LogOut className="w-5 h-5 mr-2" />
                  End Shift
                </Button>

                <Button
                  variant="ghost"
                  onClick={() => setClockStep("status")}
                  data-testid="button-clock-out-back"
                >
                  Back
                </Button>
              </div>
            </div>
          )}

          {clockStep === "break_type" && clockEmployee && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold">
                  {clockEmployee.firstName} {clockEmployee.lastName}
                </h3>
                <p className="text-base text-muted-foreground mt-2">
                  Select your break type
                </p>
              </div>

              {clockError && (
                <div className="text-center text-destructive text-base font-medium">
                  {clockError}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="w-full h-14"
                  onClick={() => breakStartMutation.mutate("meal")}
                  disabled={breakStartMutation.isPending}
                  data-testid="button-break-meal"
                >
                  <div className="text-left">
                    <div className="font-medium">Meal Break</div>
                    <div className="text-xs text-muted-foreground">30 minutes</div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full h-14"
                  onClick={() => breakStartMutation.mutate("rest")}
                  disabled={breakStartMutation.isPending}
                  data-testid="button-break-rest"
                >
                  <div className="text-left">
                    <div className="font-medium">Rest Break</div>
                    <div className="text-xs text-muted-foreground">15 minutes</div>
                  </div>
                </Button>

                <Button
                  variant="ghost"
                  onClick={() => setClockStep("clock_out_type")}
                  data-testid="button-break-back"
                >
                  Back
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {clockEmployee && selectedProperty && clockStatus?.clockedInAt && (
        <BreakAttestationDialog
          open={showAttestationDialog}
          onOpenChange={setShowAttestationDialog}
          employee={clockEmployee}
          propertyId={selectedProperty.id}
          clockInTime={new Date(clockStatus.clockedInAt)}
          onConfirm={handleAttestationConfirm}
          onCancel={handleAttestationCancel}
        />
      )}
    </div>
  );
}
