/** Whether the member has hidden the welcome guide on Today, remembered on this device. */
const HIDDEN_KEY = 'fg:welcome-hidden';

export function welcomeHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function hideWelcome(): void {
  try {
    localStorage.setItem(HIDDEN_KEY, '1');
  } catch {
    // A private window: it is hidden for this visit only.
  }
}
