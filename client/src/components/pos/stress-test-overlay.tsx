import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Activity, Play, Square, Trash2, X, Zap, Timer, CheckCircle2, XCircle, TrendingUp } from "lucide-react";
import { apiRequest, getAuthHeaders, fetchWithTimeout, queryClient } from "@/lib/queryClient";
import type { Check, CheckItem, MenuItem, Tender } from "@shared/schema";

interface StressTestOverlayProps {
  open: boolean;
  onClose: () => void;
  rvcId: string;
  employeeId: string;
  tenders: Tender[];
  menuItems: MenuItem[];
  setCurrentCheck: (check: Check | null) => void;
  setCheckItems: (items: CheckItem[] | ((prev: CheckItem[]) => CheckItem[])) => void;
  onLogout: () => void;
}

interface TransactionResult {
  checkNumber: number;
  itemCount: number;
  total: number;
  durationMs: number;
  success: boolean;
  error?: string;
  phase: string;
}

type TestPhase = "idle" | "creating" | "adding_items" | "sending" | "paying" | "complete" | "cooldown";

export function StressTestOverlay({
  open,
  onClose,
  rvcId,
  employeeId,
  tenders,
  menuItems,
  setCurrentCheck,
  setCheckItems,
  onLogout,
}: StressTestOverlayProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(1);
  const [targetSpeed, setTargetSpeed] = useState(6);
  const [pattern, setPattern] = useState<"single" | "double" | "triple" | "mixed">("mixed");
  const [selectedTenderId, setSelectedTenderId] = useState<string>("");
  const [phase, setPhase] = useState<TestPhase>("idle");
  const [currentItemName, setCurrentItemName] = useState("");
  const [flashColor, setFlashColor] = useState<string | null>(null);

  const [txCount, setTxCount] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [totalMs, setTotalMs] = useState(0);
  const [minMs, setMinMs] = useState(Infinity);
  const [maxMs, setMaxMs] = useState(0);
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const [lastErrors, setLastErrors] = useState<string[]>([]);
  const [results, setResults] = useState<TransactionResult[]>([]);

  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const testCheckIdsRef = useRef<string[]>([]);
  const testLoopDoneRef = useRef<Promise<void> | null>(null);
  const successCountRef = useRef(0);
  const failCountRef = useRef(0);
  const totalMsRef = useRef(0);
  const minMsRef = useRef(Infinity);
  const maxMsRef = useRef(0);
  const startTimeRef = useRef(0);
  const lastErrorsRef = useRef<string[]>([]);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [showConfig, setShowConfig] = useState(true);

  const [stressTenderLoading, setStressTenderLoading] = useState(true);

  useEffect(() => {
    async function fetchStressTender() {
      try {
        const res = await fetchWithTimeout("/api/stress-test/tender", { credentials: "include", headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          setSelectedTenderId(data.tenderId);
        } else {
          const cashTender = tenders.find(t => t.name.toLowerCase().includes("cash"));
          setSelectedTenderId(cashTender?.id || tenders[0]?.id || "");
        }
      } catch {
        const cashTender = tenders.find(t => t.name.toLowerCase().includes("cash"));
        setSelectedTenderId(cashTender?.id || tenders[0]?.id || "");
      } finally {
        setStressTenderLoading(false);
      }
    }
    if (open && !selectedTenderId) {
      fetchStressTender();
    }
  }, [open, selectedTenderId, tenders]);

  useEffect(() => {
    if (isRunning && startTime > 0) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 500);
      return () => clearInterval(timerRef.current);
    }
  }, [isRunning, startTime]);

  const triggerFlash = useCallback((color: string) => {
    setFlashColor(color);
    setTimeout(() => setFlashColor(null), 200);
  }, []);

  const getItemCount = useCallback(() => {
    if (pattern === "single") return 1;
    if (pattern === "double") return 2;
    if (pattern === "triple") return 3;
    return [1, 2, 3][Math.floor(Math.random() * 3)];
  }, [pattern]);

  const getActiveMenuItems = useCallback(() => {
    return menuItems.filter(mi => mi.active && parseFloat(mi.price || "0") > 0);
  }, [menuItems]);

  const runSingleTransaction = useCallback(async (): Promise<TransactionResult> => {
    const txStart = Date.now();
    let checkId = "";
    let checkNumber = 0;
    let itemCount = 0;
    let total = 0;

    try {
      setPhase("creating");
      triggerFlash("rgba(59, 130, 246, 0.3)");

      const createRes = await apiRequest("POST", "/api/checks", {
        rvcId,
        employeeId,
        orderType: "dine_in",
        testMode: true,
      }, { "Idempotency-Key": crypto.randomUUID() });
      const check = await createRes.json();
      checkId = check.id;
      checkNumber = check.checkNumber;
      testCheckIdsRef.current.push(checkId);

      setCurrentCheck(check);
      setCheckItems([]);

      const items = getActiveMenuItems();
      if (items.length === 0) throw new Error("No menu items available");

      itemCount = getItemCount();
      const addedItems: CheckItem[] = [];

      for (let i = 0; i < itemCount; i++) {
        if (!runningRef.current) throw new Error("Test stopped");

        setPhase("adding_items");
        const item = items[Math.floor(Math.random() * items.length)];
        setCurrentItemName(item.name);
        triggerFlash("rgba(34, 197, 94, 0.2)");

        const addRes = await apiRequest("POST", `/api/checks/${checkId}/items`, {
          menuItemId: item.id,
          menuItemName: item.name,
          unitPrice: item.price,
          quantity: 1,
          modifiers: [],
        });
        const newItem = await addRes.json();
        addedItems.push(newItem);
        setCheckItems([...addedItems]);

        await new Promise(r => setTimeout(r, 80));
      }

      if (!runningRef.current) throw new Error("Test stopped");

      setPhase("sending");
      triggerFlash("rgba(249, 115, 22, 0.3)");
      setCurrentItemName("Sending to kitchen...");

      await apiRequest("POST", `/api/checks/${checkId}/send`, {
        employeeId,
      }, { "Idempotency-Key": crypto.randomUUID() });

      const checkRes = await fetchWithTimeout(`/api/checks/${checkId}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!checkRes.ok) throw new Error("Failed to get check total");
      const updatedCheck = await checkRes.json();
      total = parseFloat(updatedCheck.check?.total || updatedCheck.total || "0");

      setCurrentCheck(updatedCheck.check || updatedCheck);
      if (updatedCheck.items) setCheckItems(updatedCheck.items);

      if (!runningRef.current) throw new Error("Test stopped");

      setPhase("paying");
      triggerFlash("rgba(168, 85, 247, 0.3)");
      setCurrentItemName(`Paying $${total.toFixed(2)}...`);

      await apiRequest("POST", `/api/checks/${checkId}/payments`, {
        tenderId: selectedTenderId,
        amount: total.toFixed(2),
        employeeId,
      }, { "Idempotency-Key": crypto.randomUUID() });

      setPhase("complete");
      triggerFlash("rgba(34, 197, 94, 0.4)");
      setCurrentItemName("Complete!");

      setCurrentCheck(null);
      setCheckItems([]);

      const durationMs = Date.now() - txStart;
      return { checkNumber, itemCount, total, durationMs, success: true, phase: "complete" };
    } catch (error: any) {
      const durationMs = Date.now() - txStart;
      return {
        checkNumber,
        itemCount,
        total,
        durationMs,
        success: false,
        error: error.message,
        phase: "error",
      };
    }
  }, [rvcId, employeeId, selectedTenderId, getActiveMenuItems, getItemCount, setCurrentCheck, setCheckItems, triggerFlash]);

  const saveResults = useCallback(async (status: string) => {
    try {
      const sc = successCountRef.current;
      const fc = failCountRef.current;
      const totalMsVal = totalMsRef.current;
      const avgMs = sc > 0 ? Math.round(totalMsVal / sc) : 0;
      const elapsedSec = startTimeRef.current > 0 ? Math.round((Date.now() - startTimeRef.current) / 1000) : 0;
      const txPerMin = elapsedSec > 0 ? Math.round((sc / elapsedSec) * 60 * 10) / 10 : 0;
      const patternArray = pattern === "mixed" ? ["single", "double", "triple"] : [pattern];
      
      await apiRequest("POST", "/api/stress-test/results", {
        rvcId,
        employeeId,
        status,
        durationMinutes,
        targetTxPerMinute: targetSpeed,
        patterns: patternArray,
        totalTransactions: sc + fc,
        successfulTransactions: sc,
        failedTransactions: fc,
        avgTransactionMs: avgMs,
        minTransactionMs: minMsRef.current === Infinity ? 0 : minMsRef.current,
        maxTransactionMs: maxMsRef.current,
        actualTxPerMinute: txPerMin,
        elapsedSeconds: elapsedSec,
        errors: lastErrorsRef.current,
        startedAt: startTimeRef.current > 0 ? new Date(startTimeRef.current).toISOString() : new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error("Failed to save stress test results:", e);
    }
  }, [rvcId, employeeId, durationMinutes, targetSpeed, pattern]);

  const doCleanup = useCallback(async () => {
    setIsCleaningUp(true);
    setCurrentItemName("Cleaning up test data...");
    try {
      await apiRequest("POST", "/api/stress-test/cleanup");
      testCheckIdsRef.current = [];
      queryClient.invalidateQueries({ queryKey: ["/api/checks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
    } catch (e) {
      console.error("Cleanup failed:", e);
    } finally {
      setIsCleaningUp(false);
      setCurrentItemName("");
    }
  }, []);

  const startTest = useCallback(async () => {
    if (isRunning) return;

    setIsRunning(true);
    setShowConfig(false);
    runningRef.current = true;
    testCheckIdsRef.current = [];
    successCountRef.current = 0;
    failCountRef.current = 0;
    totalMsRef.current = 0;
    minMsRef.current = Infinity;
    maxMsRef.current = 0;
    lastErrorsRef.current = [];

    setTxCount(0);
    setSuccessCount(0);
    setFailCount(0);
    setTotalMs(0);
    setMinMs(Infinity);
    setMaxMs(0);
    setResults([]);
    setLastErrors([]);

    const now = Date.now();
    setStartTime(now);
    startTimeRef.current = now;
    setElapsed(0);

    const endTime = now + durationMinutes * 60 * 1000;
    const delayBetweenTx = (60 * 1000) / targetSpeed;

    const loopPromise = (async () => {
      while (runningRef.current && Date.now() < endTime) {
        const txStartTime = Date.now();
        const result = await runSingleTransaction();

        if (!runningRef.current) break;

        setTxCount(prev => prev + 1);
        if (result.success) {
          successCountRef.current++;
          totalMsRef.current += result.durationMs;
          minMsRef.current = Math.min(minMsRef.current, result.durationMs);
          maxMsRef.current = Math.max(maxMsRef.current, result.durationMs);
          setSuccessCount(prev => prev + 1);
          setTotalMs(prev => prev + result.durationMs);
          setMinMs(prev => Math.min(prev, result.durationMs));
          setMaxMs(prev => Math.max(prev, result.durationMs));
        } else {
          failCountRef.current++;
          setFailCount(prev => prev + 1);
          if (result.error) {
            lastErrorsRef.current = [...lastErrorsRef.current.slice(-4), result.error];
            setLastErrors(prev => [...prev.slice(-4), result.error!]);
          }
        }
        setResults(prev => [...prev, result]);

        setPhase("cooldown");
        const timeTaken = Date.now() - txStartTime;
        const waitTime = Math.max(100, delayBetweenTx - timeTaken);
        if (runningRef.current && Date.now() < endTime) {
          setCurrentItemName(`Next transaction in ${Math.round(waitTime / 100) / 10}s...`);
          await new Promise(r => setTimeout(r, waitTime));
        }
      }
    })();

    testLoopDoneRef.current = loopPromise;
    await loopPromise;
    testLoopDoneRef.current = null;

    setIsRunning(false);
    runningRef.current = false;
    setPhase("idle");
    setCurrentCheck(null);
    setCheckItems([]);

    queryClient.invalidateQueries({ queryKey: ["/api/checks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
    queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });

    await saveResults("completed");
    await doCleanup();
  }, [isRunning, durationMinutes, targetSpeed, runSingleTransaction, setCurrentCheck, setCheckItems, doCleanup, saveResults]);

  const stopTest = useCallback(async () => {
    runningRef.current = false;

    if (testLoopDoneRef.current) {
      await testLoopDoneRef.current;
    }

    setIsRunning(false);
    setPhase("idle");
    setCurrentCheck(null);
    setCheckItems([]);

    await saveResults("stopped");
    await doCleanup();
  }, [setCurrentCheck, setCheckItems, doCleanup, saveResults]);

  const handleCleanup = useCallback(async () => {
    setIsCleaningUp(true);
    try {
      await apiRequest("POST", "/api/stress-test/cleanup");
      testCheckIdsRef.current = [];
      queryClient.invalidateQueries({ queryKey: ["/api/checks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
    } catch (error) {
      console.error("Cleanup failed:", error);
    } finally {
      setIsCleaningUp(false);
    }
  }, []);

  const avgMs = successCount > 0 ? Math.round(totalMs / successCount) : 0;
  const txPerMin = elapsed > 0 ? Math.round((successCount / elapsed) * 600) / 10 : 0;

  const phaseLabel: Record<TestPhase, string> = {
    idle: "Ready",
    creating: "Opening Check",
    adding_items: "Adding Items",
    sending: "Sending Order",
    paying: "Processing Payment",
    complete: "Check Closed",
    cooldown: "Between Orders",
  };

  const phaseColor: Record<TestPhase, string> = {
    idle: "bg-gray-500",
    creating: "bg-blue-500",
    adding_items: "bg-green-500",
    sending: "bg-orange-500",
    paying: "bg-purple-500",
    complete: "bg-emerald-500",
    cooldown: "bg-gray-400",
  };

  const handleClose = useCallback(async () => {
    if (isRunning) {
      await stopTest();
    }
    onClose();
  }, [isRunning, stopTest, onClose]);

  if (!open) return null;

  return (
    <>
      {flashColor && (
        <div
          className="fixed inset-0 z-[60] pointer-events-none transition-opacity duration-200"
          style={{ backgroundColor: flashColor }}
        />
      )}

      <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none" data-testid="stress-test-overlay">
        {isRunning && (
          <div className="pointer-events-auto mx-4 mb-4 bg-black/90 text-white rounded-xl p-4 shadow-2xl border border-white/10 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Activity className="w-5 h-5 text-red-400 animate-pulse" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                </div>
                <span className="font-bold text-lg">STRESS TEST RUNNING</span>
                <Badge className={`${phaseColor[phase]} text-white border-0`}>
                  {phaseLabel[phase]}
                </Badge>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={stopTest}
                className="gap-1"
                disabled={isCleaningUp}
                data-testid="button-stop-stress-test"
              >
                <Square className="w-3 h-3" />
                {isCleaningUp ? "Cleaning..." : "Stop"}
              </Button>
            </div>

            {currentItemName && (
              <div className="text-sm text-white/70 mb-3 truncate">
                <Zap className="w-3 h-3 inline mr-1 text-yellow-400" />
                {currentItemName}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
              <div>
                <div className="text-2xl font-mono font-bold text-blue-400">{txCount}</div>
                <div className="text-xs text-white/50">Total Tx</div>
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-green-400">{successCount}</div>
                <div className="text-xs text-white/50 flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Success
                </div>
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-red-400">{failCount}</div>
                <div className="text-xs text-white/50 flex items-center justify-center gap-1">
                  <XCircle className="w-3 h-3" /> Failed
                </div>
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-purple-400">{avgMs}<span className="text-sm">ms</span></div>
                <div className="text-xs text-white/50">Avg Time</div>
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-amber-400">{txPerMin}</div>
                <div className="text-xs text-white/50 flex items-center justify-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Tx/min
                </div>
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-cyan-400">
                  {minMs === Infinity ? "—" : minMs}<span className="text-sm">{minMs === Infinity ? "" : "ms"}</span>
                </div>
                <div className="text-xs text-white/50">Min</div>
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-orange-400">
                  {maxMs === 0 ? "—" : maxMs}<span className="text-sm">{maxMs === 0 ? "" : "ms"}</span>
                </div>
                <div className="text-xs text-white/50">Max</div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Timer className="w-3 h-3 text-white/50" />
              <div className="flex-1 bg-white/10 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, (elapsed / (durationMinutes * 60)) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-white/50 font-mono">
                {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}
                /{durationMinutes}:00
              </span>
            </div>

            {lastErrors.length > 0 && (
              <div className="mt-2 text-xs text-red-300/80 truncate">
                Last error: {lastErrors[lastErrors.length - 1]}
              </div>
            )}
          </div>
        )}

        {!isRunning && txCount > 0 && !showConfig && (
          <div className="pointer-events-auto mx-4 mb-4 bg-black/90 text-white rounded-xl p-4 shadow-2xl border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <span className="font-bold">TEST COMPLETE</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowConfig(true)}
                  className="gap-1 border-white/20 text-white hover:bg-white/10"
                  data-testid="button-run-again-stress-test"
                >
                  <Play className="w-3 h-3" />
                  Run Again
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  className="text-white/50 hover:text-white hover:bg-white/10"
                  data-testid="button-close-results"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
              <div>
                <div className="text-2xl font-mono font-bold text-blue-400">{txCount}</div>
                <div className="text-xs text-white/50">Total</div>
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-green-400">{successCount}</div>
                <div className="text-xs text-white/50">Success</div>
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-red-400">{failCount}</div>
                <div className="text-xs text-white/50">Failed</div>
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-purple-400">{avgMs}<span className="text-sm">ms</span></div>
                <div className="text-xs text-white/50">Avg</div>
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-amber-400">{txPerMin}</div>
                <div className="text-xs text-white/50">Tx/min</div>
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-cyan-400">
                  {minMs === Infinity ? "—" : minMs}<span className="text-sm">{minMs === Infinity ? "" : "ms"}</span>
                </div>
                <div className="text-xs text-white/50">Min</div>
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-orange-400">
                  {maxMs === 0 ? "—" : maxMs}<span className="text-sm">{maxMs === 0 ? "" : "ms"}</span>
                </div>
                <div className="text-xs text-white/50">Max</div>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex-1 bg-white/10 rounded-full h-2">
                <div className="h-full bg-green-500 rounded-full" style={{ width: "100%" }} />
              </div>
              <div className="text-xs text-white/40 mt-1 text-center">
                {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")} elapsed | Test data auto-cleaned
              </div>
            </div>
          </div>
        )}

        {showConfig && !isRunning && (
          <div className="pointer-events-auto mx-4 mb-4 bg-black/90 text-white rounded-xl p-5 shadow-2xl border border-white/10 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-amber-400" />
                <span className="font-bold text-lg">POS Stress Test</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="text-white/50 hover:text-white hover:bg-white/10"
                data-testid="button-close-stress-config"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-white/60 block mb-1.5">Duration</label>
                <Select value={durationMinutes.toString()} onValueChange={v => setDurationMinutes(parseInt(v))}>
                  <SelectTrigger className="bg-white/10 border-white/20 text-white" data-testid="select-duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 minute</SelectItem>
                    <SelectItem value="2">2 minutes</SelectItem>
                    <SelectItem value="5">5 minutes</SelectItem>
                    <SelectItem value="10">10 minutes</SelectItem>
                    <SelectItem value="15">15 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-white/60 block mb-1.5">
                  Speed: {targetSpeed} tx/min
                </label>
                <Slider
                  value={[targetSpeed]}
                  onValueChange={([v]) => setTargetSpeed(v)}
                  min={2}
                  max={30}
                  step={1}
                  className="mt-3"
                  data-testid="slider-speed"
                />
              </div>

              <div>
                <label className="text-xs text-white/60 block mb-1.5">Items per Order</label>
                <Select value={pattern} onValueChange={v => setPattern(v as any)}>
                  <SelectTrigger className="bg-white/10 border-white/20 text-white" data-testid="select-pattern">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">1 item</SelectItem>
                    <SelectItem value="double">2 items</SelectItem>
                    <SelectItem value="triple">3 items</SelectItem>
                    <SelectItem value="mixed">Mixed (1-3)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-white/60 block mb-1.5">Payment Tender</label>
                <div className="bg-white/10 border border-white/20 rounded-md px-3 py-2 text-sm text-white/80">
                  {stressTenderLoading ? "Loading..." : "Stress Test (System)"}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
              <div className="text-xs text-white/40">
                Test transactions are flagged and excluded from all reports.
                {getActiveMenuItems().length > 0 
                  ? ` Using ${Math.min(getActiveMenuItems().length, 20)} menu items.`
                  : " No active menu items found!"}
              </div>
              <Button
                onClick={startTest}
                disabled={!selectedTenderId || stressTenderLoading || getActiveMenuItems().length === 0}
                className="bg-green-600 hover:bg-green-700 text-white gap-2 px-6"
                data-testid="button-start-stress-test"
              >
                <Play className="w-4 h-4" />
                Start Test
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
