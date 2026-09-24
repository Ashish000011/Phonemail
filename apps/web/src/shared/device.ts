/** Phones get the WhatsApp-style client; bigger screens get the Gmail-style one. */
export function isMobileDevice(): boolean {
  const narrow = window.matchMedia('(max-width: 767px)').matches;
  const mobileAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return narrow || mobileAgent;
}
