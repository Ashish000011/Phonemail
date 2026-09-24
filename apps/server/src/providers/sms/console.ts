import type { SmsProvider } from './types.js';

/**
 * Demo mode only: nothing is sent. The chain still writes the SmsLog row
 * (status "simulated"), which is exactly what the demo console shows.
 */
export function createConsoleSmsProvider(demoMode: boolean): SmsProvider {
  return {
    name: 'console',
    isConfigured: () => demoMode,
    supportsCustomText: () => true,
    async send(_toE164, body) {
      return { status: 'simulated', sentBody: body };
    },
  };
}
