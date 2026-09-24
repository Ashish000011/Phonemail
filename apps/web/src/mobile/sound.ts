const STORAGE_KEY = 'pm.sound';

/** Settings → Notifications → "In-app sound". On unless turned off; kept on this device only. */
export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Blocked storage: the choice lasts for this visit only.
  }
}

let context: AudioContext | null = null;

/**
 * A soft two-note chime for a new email while the app is open. Made with Web
 * Audio, so there is no sound file to download. Browsers keep audio muted
 * until the page has been tapped once; until then this stays silent.
 */
export function playIncomingSound() {
  if (!soundEnabled() || document.hidden) return;
  try {
    context ??= new AudioContext();
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.setValueAtTime(1320, now + 0.09);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.3);
  } catch {
    // No Web Audio: stay quiet.
  }
}
