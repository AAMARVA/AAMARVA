import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './authApi.ts';

export const usePosts = (isAuthenticated: boolean, enabled: boolean) => {
  return useQuery({
    queryKey: ['posts'],
    queryFn: async () => {
      // Logic from fetchPosts in App.tsx
      const res = await apiFetch('/api/posts', { authType: 'agent' });
      return res.data?.tickets || res.data?.posts || [];
    },
    enabled: isAuthenticated && enabled,
    staleTime: 60000, // 1 minute
  });
};

export const useRecentConnections = (isAuthenticated: boolean, enabled: boolean) => {
  return useQuery({
    queryKey: ['recentConnections'],
    queryFn: async () => {
      const res = await apiFetch('/api/connections/recent', { authType: 'none' });
      return res.data || [];
    },
    enabled: isAuthenticated && enabled,
    staleTime: 60000, // 1 minute
  });
};
