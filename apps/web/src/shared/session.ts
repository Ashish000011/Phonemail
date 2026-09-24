import { useQuery, useQueryClient } from '@tanstack/react-query';
import { meSchema, type Me } from '@phonemail/shared';
import { api, isUnauthorized } from './api';
import { changeLanguage } from './i18n';
import { reconnectUserSocket } from './socket';

/**
 * The signed-in user, or null when nobody is signed in. Every screen that
 * needs "who am I" reads this one cached query.
 */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api('/me', { schema: meSchema });
      } catch (error) {
        if (isUnauthorized(error)) return null;
        throw error;
      }
    },
    staleTime: 60_000,
    retry: 1,
  });
}

/** After signing in: remember the user, use their language, reconnect live updates. */
export function useSignedIn() {
  const queryClient = useQueryClient();
  return (user: Me) => {
    queryClient.setQueryData(['me'], user);
    void changeLanguage(user.language);
    reconnectUserSocket();
  };
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    queryClient.clear();
    queryClient.setQueryData(['me'], null);
    reconnectUserSocket();
  };
}
