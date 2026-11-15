// Alert state for the views: history (authorities), inbox (adult/kids), and the latest
// alert that just arrived (drives the kids' full-screen card, sound and vibration).
import { signal } from '@preact/signals';
import { alertService, isFor, type Alert } from './index';
import type { User } from '../auth/types';

export const history = signal<Alert[]>([]);
export const inbox = signal<Alert[]>([]);
export const arrived = signal<Alert | null>(null);

let unsubscribe: (() => void) | null = null;
let unUpdate: (() => void) | null = null;

export async function startAlerts(user: User, onArrive?: (a: Alert) => void) {
  stopAlerts();
  const refresh = async () => {
    if (user.role === 'authorities') history.value = await alertService.list();
    else inbox.value = await alertService.inbox(user);
  };
  await refresh();
  // authorities: delivered/read changes from other tabs refresh the history
  if (user.role === 'authorities') unUpdate = alertService.onUpdate(() => { refresh(); });
  unsubscribe = alertService.subscribe(async (a) => {
    if (user.role !== 'authorities' && isFor(a, user) && a.author.id !== user.id) {
      arrived.value = a;
      onArrive?.(a);
    }
    await refresh();
  });
}

export function stopAlerts() {
  unsubscribe?.();
  unsubscribe = null;
  unUpdate?.();
  unUpdate = null;
  history.value = [];
  inbox.value = [];
  arrived.value = null;
}

export async function refreshAlerts(user: User) {
  if (user.role === 'authorities') history.value = await alertService.list();
  else inbox.value = await alertService.inbox(user);
}
