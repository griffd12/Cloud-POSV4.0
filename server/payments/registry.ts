/**
 * Payment Adapter Registry
 * 
 * Manages the registration and retrieval of payment gateway adapters.
 * Each gateway type (stripe, elavon_converge, etc.) registers its factory here.
 */

import type { PaymentAdapterFactory, PaymentGatewayAdapter, GatewayCredentials, GatewaySettings } from './types';

// Registry of adapter factories by gateway type
const adapterFactories: Map<string, PaymentAdapterFactory> = new Map();

/**
 * Register a payment adapter factory
 */
export function registerPaymentAdapter(gatewayType: string, factory: PaymentAdapterFactory): void {
  adapterFactories.set(gatewayType, factory);
}

/**
 * Get a list of registered gateway types
 */
export function getRegisteredGatewayTypes(): string[] {
  return Array.from(adapterFactories.keys());
}

/**
 * Check if a gateway type is registered
 */
export function isGatewayTypeSupported(gatewayType: string): boolean {
  return adapterFactories.has(gatewayType);
}

/**
 * Create a payment adapter instance for a given gateway type
 */
export function createPaymentAdapter(
  gatewayType: string,
  credentials: GatewayCredentials,
  settings: GatewaySettings,
  environment: 'sandbox' | 'production'
): PaymentGatewayAdapter {
  const factory = adapterFactories.get(gatewayType);
  
  if (!factory) {
    throw new Error(`Unsupported payment gateway type: ${gatewayType}. Registered types: ${getRegisteredGatewayTypes().join(', ')}`);
  }
  
  return factory(credentials, settings, environment);
}

/**
 * Resolve credentials from environment variables based on key prefix
 * 
 * Example: For prefix "STRIPE", looks up:
 * - STRIPE_API_KEY
 * - STRIPE_SECRET_KEY
 * - etc.
 * 
 * For prefix "ELAVON_MAIN", looks up:
 * - ELAVON_MAIN_MERCHANT_ID
 * - ELAVON_MAIN_USER_ID
 * - ELAVON_MAIN_PIN
 * - etc.
 */
export function resolveCredentials(keyPrefix: string, requiredKeys: string[], dbFallbackCredentials?: GatewayCredentials): GatewayCredentials {
  const credentials: GatewayCredentials = {};
  const missingKeys: string[] = [];
  
  for (const key of requiredKeys) {
    const envKey = `${keyPrefix}_${key}`;
    const value = process.env[envKey];
    
    if (value) {
      credentials[key] = value;
    } else if (dbFallbackCredentials && dbFallbackCredentials[key]) {
      credentials[key] = dbFallbackCredentials[key];
    } else {
      missingKeys.push(envKey);
    }
  }
  
  if (missingKeys.length > 0) {
    console.warn(`Missing payment credentials: ${missingKeys.join(', ')}`);
  }
  
  return credentials;
}

/**
 * Get required credential keys for a gateway type
 */
export function getRequiredCredentialKeys(gatewayType: string): string[] {
  const keyMap: Record<string, string[]> = {
    'stripe': ['SECRET_KEY'],
    'elavon_converge': ['MERCHANT_ID', 'USER_ID', 'PIN'],
    'square': ['ACCESS_TOKEN', 'LOCATION_ID'],
    'shift4': ['API_KEY', 'CLIENT_GUID'],
    'heartland': ['SECRET_API_KEY', 'DEVELOPER_ID', 'VERSION_NUMBER'],
    'freedompay': ['STORE_ID', 'TERMINAL_ID', 'API_KEY'],
    'eigen': ['API_KEY', 'MERCHANT_ID'],
    'north_ingenico': ['FOUR_PART_KEY', 'MAC_TIC'],
  };
  
  return keyMap[gatewayType] || [];
}
