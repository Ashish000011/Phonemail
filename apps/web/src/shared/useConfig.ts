import { useQuery } from '@tanstack/react-query';
import { publicConfigSchema, type PublicConfig } from '@phonemail/shared';
import { api } from './api';

/** Server settings every screen may need (auth mode, demo mode, mail domain). Fetched once. */
export function useConfig() {
  return useQuery<PublicConfig>({
    queryKey: ['config'],
    queryFn: () => api('/config', { schema: publicConfigSchema }),
    staleTime: Infinity,
    retry: 1,
  });
}
