import { useCallback, useEffect, useState } from 'react';

/** Seconds left until something is allowed again (e.g. "Resend code in 23s"). */
export function useCountdown() {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const start = useCallback((seconds: number) => setSecondsLeft(Math.max(0, seconds)), []);
  const reset = useCallback(() => setSecondsLeft(0), []);

  return { secondsLeft, start, reset };
}
