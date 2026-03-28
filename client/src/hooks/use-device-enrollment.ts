import { failoverFetch } from "@/lib/queryClient";
import { useState, useEffect, useCallback } from "react";

const DEVICE_TOKEN_KEY = "pos_device_token";
const DEVICE_ID_KEY = "pos_device_linked_id";
const DEVICE_NAME_KEY = "pos_device_name";
const DEVICE_TYPE_KEY = "pos_device_type";
const PROPERTY_ID_KEY = "pos_device_property_id";
const REGISTERED_DEVICE_ID_KEY = "pos_registered_device_id";
const CLOUD_URL_KEY = "ops_cloud_url";

function checkAndStoreUrlCredentials(): boolean {
  const params = new URLSearchParams(window.location.search);
  const deviceToken = params.get("device_token");
  const deviceId = params.get("device_id");
  const registeredDeviceId = params.get("registered_device_id");
  const deviceName = params.get("device_name");
  const deviceType = params.get("device_type");
  const propertyId = params.get("property_id");
  
  console.log("[DeviceEnrollment] Checking URL params:", { 
    hasToken: !!deviceToken, 
    hasDeviceId: !!deviceId, 
    hasRegisteredDeviceId: !!registeredDeviceId,
    hasDeviceName: !!deviceName,
    hasDeviceType: !!deviceType,
    hasPropertyId: !!propertyId,
    fullUrl: window.location.href
  });
  
  if (deviceToken && deviceId && deviceName && deviceType && propertyId) {
    console.log("[DeviceEnrollment] Storing credentials from URL params");
    localStorage.setItem(DEVICE_TOKEN_KEY, deviceToken);
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    localStorage.setItem(DEVICE_NAME_KEY, deviceName);
    localStorage.setItem(DEVICE_TYPE_KEY, deviceType);
    localStorage.setItem(PROPERTY_ID_KEY, propertyId);
    if (registeredDeviceId) {
      localStorage.setItem(REGISTERED_DEVICE_ID_KEY, registeredDeviceId);
    }
    localStorage.setItem(CLOUD_URL_KEY, window.location.origin);
    
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
    console.log("[DeviceEnrollment] Credentials stored, URL cleaned");
    return true;
  }
  return false;
}

export interface DeviceInfo {
  id: string;
  name: string;
  deviceType: "pos_workstation" | "kds_display";
  propertyId: string;
  workstationId?: string;
  kdsDeviceId?: string;
  status: string;
}

export interface EnrollmentState {
  isEnrolled: boolean;
  isValidating: boolean;
  deviceInfo: DeviceInfo | null;
  error: string | null;
}

export function getDeviceToken(): string | null {
  return localStorage.getItem(DEVICE_TOKEN_KEY);
}

export function setDeviceToken(token: string): void {
  localStorage.setItem(DEVICE_TOKEN_KEY, token);
}

export function clearDeviceToken(): void {
  localStorage.removeItem(DEVICE_TOKEN_KEY);
  localStorage.removeItem(DEVICE_ID_KEY);
  localStorage.removeItem(DEVICE_NAME_KEY);
  localStorage.removeItem(DEVICE_TYPE_KEY);
  localStorage.removeItem(PROPERTY_ID_KEY);
  localStorage.removeItem(REGISTERED_DEVICE_ID_KEY);
  localStorage.removeItem(CLOUD_URL_KEY);
}

export function getStoredDeviceInfo(): { 
  id: string | null; 
  name: string | null; 
  type: string | null;
  propertyId: string | null;
} {
  return {
    id: localStorage.getItem(DEVICE_ID_KEY),
    name: localStorage.getItem(DEVICE_NAME_KEY),
    type: localStorage.getItem(DEVICE_TYPE_KEY),
    propertyId: localStorage.getItem(PROPERTY_ID_KEY),
  };
}

export function useDeviceEnrollment() {
  const [state, setState] = useState<EnrollmentState>({
    isEnrolled: false,
    isValidating: true,
    deviceInfo: null,
    error: null,
  });

  const validateEnrollment = useCallback(async () => {
    const storedFromUrl = checkAndStoreUrlCredentials();
    console.log("[DeviceEnrollment] storedFromUrl:", storedFromUrl);
    
    const deviceToken = getDeviceToken();
    console.log("[DeviceEnrollment] deviceToken present:", !!deviceToken, deviceToken ? deviceToken.substring(0, 20) + "..." : "null");

    if (!deviceToken) {
      console.log("[DeviceEnrollment] No device token found");
      setState({
        isEnrolled: false,
        isValidating: false,
        deviceInfo: null,
        error: "This device is not enrolled. Please run the CAL Setup Wizard.",
      });
      return false;
    }

    try {
      console.log("[DeviceEnrollment] Validating device token...");
      const response = await failoverFetch("/api/registered-devices/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deviceToken }),
      });

      const data = await response.json();
      console.log("[DeviceEnrollment] Validation response:", { ok: response.ok, valid: data.valid, message: data.message });

      if (!response.ok || !data.valid) {
        console.log("[DeviceEnrollment] Validation failed:", data.message);
        // Only clear token if server explicitly says it's invalid (401)
        // Don't clear on other errors - user can retry
        if (response.status === 401) {
          console.log("[DeviceEnrollment] Token revoked/invalid, clearing credentials");
          clearDeviceToken();
        }
        setState({
          isEnrolled: false,
          isValidating: false,
          deviceInfo: null,
          error: data.message || "Device enrollment is invalid or has been revoked.",
        });
        return false;
      }

      console.log("[DeviceEnrollment] Validation successful, device enrolled");
      setState({
        isEnrolled: true,
        isValidating: false,
        deviceInfo: data.device,
        error: null,
      });
      return true;
    } catch (error) {
      console.log("[DeviceEnrollment] Validation error:", error);
      setState({
        isEnrolled: false,
        isValidating: false,
        deviceInfo: null,
        error: "Failed to validate device enrollment. Please check your connection.",
      });
      return false;
    }
  }, []);

  useEffect(() => {
    validateEnrollment();
  }, [validateEnrollment]);

  return {
    ...state,
    validateEnrollment,
  };
}
