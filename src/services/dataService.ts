import { useQuery } from '@tanstack/react-query';
import { apiFetch, getCurrentSessionAuthType } from './authApi.ts';

export const useRecentConnections = (isAuthenticated: boolean, enabled: boolean) => {
  return useQuery({
    queryKey: ['recentConnections'],
    queryFn: async () => {
      const res = await apiFetch('/api/connections/recent', { authType: getCurrentSessionAuthType() });
      return res.data || [];
    },
    enabled: isAuthenticated && enabled,
    staleTime: 60000, // 1 minute
  });
};
