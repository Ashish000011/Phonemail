import { api } from '../../shared/api';

/**
 * The Contact Picker API (Chrome on Android): the user picks which contacts
 * to share, and only those are sent. Elsewhere it doesn't exist and we skip
 * the step silently, as the spec says.
 */
interface PickedContact {
  name?: string[];
  tel?: string[];
}
interface ContactsManager {
  select(properties: string[], options: { multiple: boolean }): Promise<PickedContact[]>;
}

export function contactPickerSupported(): boolean {
  return 'contacts' in navigator && 'ContactsManager' in window;
}

/** Opens the phone's contact picker and uploads what was picked. Returns how many were saved. */
export async function pickAndShareContacts(): Promise<number> {
  const manager = (navigator as Navigator & { contacts: ContactsManager }).contacts;
  const picked = await manager.select(['name', 'tel'], { multiple: true });
  const contacts = picked
    .filter((c) => c.tel?.length && c.name?.[0])
    .map((c) => ({ name: c.name![0].slice(0, 100), phones: c.tel!.slice(0, 5) }));
  if (contacts.length === 0) return 0;
  const result = await api<{ saved: number }>('/contacts', { method: 'POST', body: { contacts } });
  return result.saved;
}
