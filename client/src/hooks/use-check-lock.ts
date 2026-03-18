/**
 * Check Locking Hook
 * 
 * Manages check locks for multi-workstation operation.
 * Prevents concurrent editing of checks by different workstations.
 * 
 * Works with both Cloud and Service Host endpoints.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from './use-toast';

export interface CheckLock {
  checkId: string;
  workstationId: string;
  employeeId: string;
  expiresAt: Date;
}

interface UseCheckLockOptions {
  workstationId: string;
  employeeId: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  onLockLost?: (checkId: string) => void;
}

interface CheckLockResult {
  acquireLock: (checkId: string) => Promise<boolean>;
  releaseLock: (checkId: string) => Promise<boolean>;
  refreshLock: (checkId: string) => Promise<boolean>;
  checkLockStatus: (checkId: string) => Promise<CheckLock | null>;
  isLocked: (checkId: string) => boolean;
  getLock: (checkId: string) => CheckLock | undefined;
  heldLocks: Map<string, CheckLock>;
  releaseAllLocks: () => Promise<void>;
}

const LOCK_REFRESH_MARGIN = 60000;

export function useCheckLock(options: UseCheckLockOptions): CheckLockResult {
  const { workstationId, employeeId, autoRefresh = true, refreshInterval = 60000, onLockLost } = options;
  const { toast } = useToast();
  
  const [heldLocks, setHeldLocks] = useState<Map<string, CheckLock>>(new Map());
  const refreshTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  const getApiBase = useCallback((): string => {
    return '';
  }, []);

  const acquireLock = useCallback(async (checkId: string): Promise<boolean> => {
    try {
      const baseUrl = getApiBase();
      const response = await fetch(`${baseUrl}/api/caps/checks/${checkId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workstationId, employeeId }),
        credentials: 'include',
      });

      if (response.status === 409) {
        const data = await response.json();
        toast({
          title: 'Check In Use',
          description: `This check is being edited by another workstation. Available in ${Math.ceil((new Date(data.expiresAt).getTime() - Date.now()) / 60000)} minutes.`,
          variant: 'destructive',
        });
        return false;
      }

      if (!response.ok) {
        throw new Error(`Failed to acquire lock: ${response.statusText}`);
      }

      const data = await response.json();
      const lock: CheckLock = {
        checkId,
        workstationId: data.lock?.workstationId || workstationId,
        employeeId: data.lock?.employeeId || employeeId,
        expiresAt: new Date(data.lock?.expiresAt || Date.now() + 300000),
      };

      setHeldLocks(prev => {
        const next = new Map(prev);
        next.set(checkId, lock);
        return next;
      });

      if (autoRefresh) {
        scheduleRefresh(checkId, lock.expiresAt);
      }

      return true;
    } catch (error) {
      console.error('Failed to acquire lock:', error);
      toast({
        title: 'Lock Failed',
        description: 'Could not acquire lock on check. Please try again.',
        variant: 'destructive',
      });
      return false;
    }
  }, [workstationId, employeeId, getApiBase, toast, autoRefresh]);

  const releaseLock = useCallback(async (checkId: string): Promise<boolean> => {
    try {
      cancelRefresh(checkId);

      const baseUrl = getApiBase();
      const response = await fetch(`${baseUrl}/api/caps/checks/${checkId}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workstationId }),
        credentials: 'include',
      });

      if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to release lock: ${response.statusText}`);
      }

      setHeldLocks(prev => {
        const next = new Map(prev);
        next.delete(checkId);
        return next;
      });

      return true;
    } catch (error) {
      console.error('Failed to release lock:', error);
      return false;
    }
  }, [workstationId, getApiBase]);

  const refreshLock = useCallback(async (checkId: string): Promise<boolean> => {
    try {
      const baseUrl = getApiBase();
      const response = await fetch(`${baseUrl}/api/caps/checks/${checkId}/lock/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workstationId }),
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 409 || response.status === 404) {
          setHeldLocks(prev => {
            const next = new Map(prev);
            next.delete(checkId);
            return next;
          });
          onLockLost?.(checkId);
          toast({
            title: 'Lock Lost',
            description: 'Your lock on this check has expired or was released.',
            variant: 'destructive',
          });
          return false;
        }
        throw new Error(`Failed to refresh lock: ${response.statusText}`);
      }

      const data = await response.json();
      const newExpiresAt = new Date(data.lock?.expiresAt || Date.now() + 300000);

      setHeldLocks(prev => {
        const existing = prev.get(checkId);
        if (existing) {
          const next = new Map(prev);
          next.set(checkId, { ...existing, expiresAt: newExpiresAt });
          return next;
        }
        return prev;
      });

      if (autoRefresh) {
        scheduleRefresh(checkId, newExpiresAt);
      }

      return true;
    } catch (error) {
      console.error('Failed to refresh lock:', error);
      return false;
    }
  }, [workstationId, getApiBase, autoRefresh, onLockLost, toast]);

  const checkLockStatus = useCallback(async (checkId: string): Promise<CheckLock | null> => {
    try {
      const baseUrl = getApiBase();
      const response = await fetch(`${baseUrl}/api/caps/checks/${checkId}/lock`, {
        method: 'GET',
        credentials: 'include',
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Failed to check lock status: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.lock) {
        return null;
      }

      return {
        checkId,
        workstationId: data.lock.workstationId,
        employeeId: data.lock.employeeId,
        expiresAt: new Date(data.lock.expiresAt),
      };
    } catch (error) {
      console.error('Failed to check lock status:', error);
      return null;
    }
  }, [getApiBase]);

  const isLocked = useCallback((checkId: string): boolean => {
    return heldLocks.has(checkId);
  }, [heldLocks]);

  const getLock = useCallback((checkId: string): CheckLock | undefined => {
    return heldLocks.get(checkId);
  }, [heldLocks]);

  const releaseAllLocks = useCallback(async (): Promise<void> => {
    const checkIds = Array.from(heldLocks.keys());
    await Promise.all(checkIds.map(id => releaseLock(id)));
  }, [heldLocks, releaseLock]);

  const scheduleRefresh = useCallback((checkId: string, expiresAt: Date) => {
    cancelRefresh(checkId);

    const timeUntilExpiry = expiresAt.getTime() - Date.now();
    const refreshTime = Math.max(timeUntilExpiry - LOCK_REFRESH_MARGIN, 30000);

    const timer = setTimeout(() => {
      refreshLock(checkId);
    }, refreshTime);

    refreshTimers.current.set(checkId, timer);
  }, [refreshLock]);

  const cancelRefresh = (checkId: string) => {
    const timer = refreshTimers.current.get(checkId);
    if (timer) {
      clearTimeout(timer);
      refreshTimers.current.delete(checkId);
    }
  };

  useEffect(() => {
    return () => {
      refreshTimers.current.forEach(timer => clearTimeout(timer));
      refreshTimers.current.clear();
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      heldLocks.forEach((_, checkId) => {
        const baseUrl = getApiBase();
        navigator.sendBeacon(
          `${baseUrl}/api/caps/checks/${checkId}/unlock`,
          JSON.stringify({ workstationId })
        );
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [heldLocks, workstationId, getApiBase]);

  return {
    acquireLock,
    releaseLock,
    refreshLock,
    checkLockStatus,
    isLocked,
    getLock,
    heldLocks,
    releaseAllLocks,
  };
}
