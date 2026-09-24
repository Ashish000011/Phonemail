import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type OnboardingStep = 'language' | 'terms' | 'phone' | 'verify';

/**
 * Where the user is in the four onboarding screens. Kept in sessionStorage,
 * so a refresh (or the browser killing the tab while the SMS arrives) doesn't
 * start over. The accepted Terms version is saved on the account at sign-up.
 */
interface OnboardingState {
  step: OnboardingStep;
  tosAccepted: boolean;
  country: string;
  number: string;
  phoneE164: string | null;
  demoCode: string | null;
  /** When the last code was sent (ms), for the resend countdown. */
  codeSentAt: number | null;
  resendAfterSeconds: number;
  go: (step: OnboardingStep) => void;
  acceptTerms: () => void;
  setPhone: (country: string, number: string) => void;
  codeSent: (phoneE164: string, demoCode: string | undefined, resendAfterSeconds: number) => void;
  reset: () => void;
}

const initial = {
  step: 'language' as OnboardingStep,
  tosAccepted: false,
  country: 'IN',
  number: '',
  phoneE164: null,
  demoCode: null,
  codeSentAt: null,
  resendAfterSeconds: 30,
};

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set) => ({
      ...initial,
      go: (step) => set({ step }),
      acceptTerms: () => set({ tosAccepted: true, step: 'phone' }),
      setPhone: (country, number) => set({ country, number }),
      codeSent: (phoneE164, demoCode, resendAfterSeconds) =>
        set({
          phoneE164,
          demoCode: demoCode ?? null,
          resendAfterSeconds,
          codeSentAt: Date.now(),
          step: 'verify',
        }),
      reset: () => set(initial),
    }),
    { name: 'pm.onboarding', storage: createJSONStorage(() => sessionStorage) },
  ),
);

/** "Not now" answers are remembered and offered again from Settings. */
export const PERMISSION_KEYS = {
  findNumber: 'pm.permission.findNumber',
  contacts: 'pm.permission.contacts',
} as const;

export function rememberedAnswer(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function rememberAnswer(key: string, value: 'yes' | 'no') {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: we'll just ask again next time.
  }
}
