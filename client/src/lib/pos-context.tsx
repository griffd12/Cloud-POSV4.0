import { createContext, useContext, useState, useCallback, useEffect, type ReactNode, type Dispatch, type SetStateAction } from "react";
import type { Employee, Rvc, Check, CheckItem, MenuItem, Slu, ModifierGroup, Modifier, OrderType, Timecard, JobCode, Workstation } from "@shared/schema";
import { useDeviceContext } from "./device-context";
import { connectionManager } from "./connection-manager";

const RVC_STORAGE_KEY = "pos_selected_rvc";
const WORKSTATION_STORAGE_KEY = "pos_workstation_id";

interface SelectedModifier {
  id: string;
  name: string;
  priceDelta: string;
}

interface PosContextType {
  currentEmployee: Employee | null;
  currentRvc: Rvc | null;
  currentCheck: Check | null;
  checkItems: CheckItem[];
  selectedSlu: Slu | null;
  pendingItem: MenuItem | null;
  pendingModifiers: SelectedModifier[];
  privileges: string[];
  isClockedIn: boolean;
  currentTimecard: Timecard | null;
  isSalariedBypass: boolean;
  currentJobCode: JobCode | null;
  workstationId: string | null;
  currentWorkstation: Workstation | null;
  
  setCurrentEmployee: (employee: Employee | null) => void;
  setCurrentRvc: (rvc: Rvc | null) => void;
  setCurrentCheck: (check: Check | null) => void;
  setCheckItems: Dispatch<SetStateAction<CheckItem[]>>;
  setSelectedSlu: (slu: Slu | null) => void;
  setPendingItem: (item: MenuItem | null) => void;
  setPendingModifiers: (modifiers: SelectedModifier[]) => void;
  setPrivileges: (privileges: string[]) => void;
  setIsClockedIn: (value: boolean) => void;
  setCurrentTimecard: (timecard: Timecard | null) => void;
  setIsSalariedBypass: (value: boolean) => void;
  setCurrentJobCode: (jobCode: JobCode | null) => void;
  setWorkstationId: (id: string | null) => void;
  setCurrentWorkstation: (workstation: Workstation | null) => void;
  
  hasPrivilege: (code: string) => boolean;
  logout: () => void;
}

const PosContext = createContext<PosContextType | null>(null);

const DEVICE_LINKED_ID_KEY = "pos_device_linked_id";
const DEVICE_TYPE_KEY = "pos_device_type";

function getInitialWorkstationId(): string | null {
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    const urlWorkstation = urlParams.get('workstation');
    if (urlWorkstation) {
      localStorage.setItem(WORKSTATION_STORAGE_KEY, urlWorkstation);
      return urlWorkstation;
    }
    
    const storedWorkstation = localStorage.getItem(WORKSTATION_STORAGE_KEY);
    if (storedWorkstation) {
      return storedWorkstation;
    }
    
    const deviceType = localStorage.getItem(DEVICE_TYPE_KEY);
    const deviceLinkedId = localStorage.getItem(DEVICE_LINKED_ID_KEY);
    if (deviceType === "pos" && deviceLinkedId) {
      localStorage.setItem(WORKSTATION_STORAGE_KEY, deviceLinkedId);
      return deviceLinkedId;
    }
  }
  return null;
}

export function PosProvider({ children }: { children: ReactNode }) {
  const { linkedDeviceId, deviceType } = useDeviceContext();
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [currentRvc, setCurrentRvcState] = useState<Rvc | null>(() => {
    try {
      const saved = localStorage.getItem(RVC_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved) as Rvc;
      }
    } catch {
    }
    return null;
  });
  const [currentCheck, setCurrentCheck] = useState<Check | null>(null);
  const [checkItems, setCheckItems] = useState<CheckItem[]>([]);
  const [selectedSlu, setSelectedSlu] = useState<Slu | null>(null);
  const [pendingItem, setPendingItem] = useState<MenuItem | null>(null);
  const [pendingModifiers, setPendingModifiers] = useState<SelectedModifier[]>([]);
  const [privileges, setPrivileges] = useState<string[]>([]);
  const [isClockedIn, setIsClockedIn] = useState<boolean>(false);
  const [currentTimecard, setCurrentTimecard] = useState<Timecard | null>(null);
  const [isSalariedBypass, setIsSalariedBypass] = useState<boolean>(false);
  const [currentJobCode, setCurrentJobCode] = useState<JobCode | null>(null);
  const [workstationId, setWorkstationIdState] = useState<string | null>(getInitialWorkstationId);
  const [currentWorkstation, setCurrentWorkstationState] = useState<Workstation | null>(null);

  const setCurrentWorkstation = useCallback((ws: Workstation | null) => {
    setCurrentWorkstationState(ws);
    if (ws) {
      connectionManager.initFromWorkstation(ws);
    }
  }, []);

  useEffect(() => {
    if (linkedDeviceId && deviceType === 'pos' && !workstationId) {
      setWorkstationIdState(linkedDeviceId);
      localStorage.setItem(WORKSTATION_STORAGE_KEY, linkedDeviceId);
    }
  }, [linkedDeviceId, deviceType, workstationId]);

  useEffect(() => {
    if (!workstationId) {
      const stored = localStorage.getItem(WORKSTATION_STORAGE_KEY);
      if (stored) {
        setWorkstationIdState(stored);
      }
    }
  }, []);

  const setWorkstationId = useCallback((id: string | null) => {
    setWorkstationIdState(id);
    if (id) {
      localStorage.setItem(WORKSTATION_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(WORKSTATION_STORAGE_KEY);
    }
  }, []);

  const setCurrentRvc = useCallback((rvc: Rvc | null) => {
    setCurrentRvcState(rvc);
    if (rvc) {
      try {
        localStorage.setItem(RVC_STORAGE_KEY, JSON.stringify(rvc));
      } catch {
      }
    } else {
      localStorage.removeItem(RVC_STORAGE_KEY);
    }
  }, []);

  const hasPrivilege = useCallback((code: string) => {
    return privileges.includes(code);
  }, [privileges]);

  const logout = useCallback(() => {
    setCurrentEmployee(null);
    setCurrentCheck(null);
    setCheckItems([]);
    setSelectedSlu(null);
    setPendingItem(null);
    setPendingModifiers([]);
    setPrivileges([]);
    setIsClockedIn(false);
    setCurrentTimecard(null);
    setIsSalariedBypass(false);
    setCurrentJobCode(null);
  }, []);

  return (
    <PosContext.Provider
      value={{
        currentEmployee,
        currentRvc,
        currentCheck,
        checkItems,
        selectedSlu,
        pendingItem,
        pendingModifiers,
        privileges,
        isClockedIn,
        currentTimecard,
        isSalariedBypass,
        currentJobCode,
        workstationId,
        currentWorkstation,
        setCurrentEmployee,
        setCurrentRvc,
        setCurrentCheck,
        setCheckItems,
        setSelectedSlu,
        setPendingItem,
        setPendingModifiers,
        setPrivileges,
        setIsClockedIn,
        setCurrentTimecard,
        setIsSalariedBypass,
        setCurrentJobCode,
        setWorkstationId,
        setCurrentWorkstation,
        hasPrivilege,
        logout,
      }}
    >
      {children}
    </PosContext.Provider>
  );
}

export function usePosContext() {
  const context = useContext(PosContext);
  if (!context) {
    throw new Error("usePosContext must be used within PosProvider");
  }
  return context;
}
