import { registerSW } from 'virtual:pwa-register';

const RELOADED_AT = 'pm-reloaded-at';

/**
 * Keeps the installed app (PWA and the Android app) on the newest version. It
 * checks for an update whenever the app comes back to the screen, and reloads
 * into the new version as soon as it is ready. Drafts save themselves, so a
 * reload loses nothing.
 */
export function keepAppUpToDate() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update();
      });
    },
  });

  // A new version went live while this page was open, so its old code files
  // are gone: reload once to get the new ones (at most once a minute, never a loop).
  window.addEventListener('vite:preloadError', (event) => {
    try {
      const last = Number(sessionStorage.getItem(RELOADED_AT) ?? 0);
      if (Date.now() - last < 60_000) return;
      sessionStorage.setItem(RELOADED_AT, String(Date.now()));
    } catch {
      return;
    }
    event.preventDefault();
    window.location.reload();
  });
}
