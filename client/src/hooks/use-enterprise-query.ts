import { useQuery, type UseQueryOptions, type QueryKey } from "@tanstack/react-query";
import { failoverFetch } from "@/lib/queryClient";
import { useEmc } from "@/lib/emc-context";

/**
 * A wrapper around useQuery that automatically adds enterprise filtering
 * to API calls when an enterprise is selected in EMC.
 * 
 * This ensures all EMC modules respect the selected enterprise for multi-tenancy.
 */
export function useEnterpriseQuery<TData = unknown>({
  baseQueryKey,
  additionalParams = {},
  ...options
}: {
  baseQueryKey: string;
  additionalParams?: Record<string, string | undefined>;
} & Omit<UseQueryOptions<TData>, "queryKey" | "queryFn">) {
  const { selectedEnterpriseId } = useEmc();
  
  // Build query parameters
  const params = new URLSearchParams();
  
  // Add enterprise filter if selected
  if (selectedEnterpriseId) {
    params.set("enterpriseId", selectedEnterpriseId);
  }
  
  // Add any additional params
  Object.entries(additionalParams).forEach(([key, value]) => {
    if (value !== undefined) {
      params.set(key, value);
    }
  });
  
  const queryString = params.toString();
  const url = queryString ? `${baseQueryKey}?${queryString}` : baseQueryKey;
  
  // Include enterpriseId in queryKey for cache isolation
  const queryKey: QueryKey = selectedEnterpriseId 
    ? [baseQueryKey, { enterpriseId: selectedEnterpriseId, ...additionalParams }]
    : [baseQueryKey, additionalParams];
  
  return useQuery<TData>({
    queryKey,
    queryFn: async () => {
      const response = await failoverFetch(url, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch ${baseQueryKey}`);
      }
      return response.json();
    },
    ...options,
  });
}

/**
 * Helper to build API URLs with enterprise filtering
 */
export function useEnterpriseApiUrl(basePath: string, additionalParams?: Record<string, string | undefined>) {
  const { selectedEnterpriseId } = useEmc();
  
  const params = new URLSearchParams();
  
  if (selectedEnterpriseId) {
    params.set("enterpriseId", selectedEnterpriseId);
  }
  
  if (additionalParams) {
    Object.entries(additionalParams).forEach(([key, value]) => {
      if (value !== undefined) {
        params.set(key, value);
      }
    });
  }
  
  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}
