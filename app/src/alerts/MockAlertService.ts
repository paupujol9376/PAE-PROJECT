// Default alert service: stores alerts in IndexedDB on this device and announces new ones
// to every open tab/window through BroadcastChannel, simulating the arrival of an SMS.
// Works fully offline. Nothing leaves the device.
import type { User } from '../auth/types';
import { isFor, statusOf, type Alert, type AlertDraft, type AlertService } from './types';

const DB = 'pae-alerts';
const STORE = 'alerts';
const CHANNEL = 'pae-alerts';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(r.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  }));
}

const newest = (a: Alert, b: Alert) => b.createdAt.localeCompare(a.createdAt);
const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export class MockAlertService implements AlertService {
  readonly name: 'mock' | 'sms' = 'mock';
  private listeners = new Set<(a: Alert) => void>();
  private updateListeners = new Set<() => void>();
  private channel: BroadcastChannel | null =
    typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null;

  constructor() {
    this.channel?.addEventListener('message', (e: MessageEvent) => {
      if (e.data?.kind === 'alert') this.emit(e.data.alert as Alert);
      if (e.data?.kind === 'update') for (const cb of this.updateListeners) cb();
    });
  }

  private emit(a: Alert) {
    for (const cb of this.listeners) cb(a);
  }

  protected async save(a: Alert) {
    await tx('readwrite', (s) => s.put(a));
  }

  /** Persist a status change and tell the other tabs (authorities history updates live). */
  private async saveStatus(a: Alert) {
    await this.save(a);
    for (const cb of this.updateListeners) cb();
    this.channel?.postMessage({ kind: 'update', id: a.id });
  }

  async send(draft: AlertDraft, author: User): Promise<Alert> {
    const text = draft.text.trim();
    if (!text) throw new Error('empty message');
    const a: Alert = {
      ...draft, text, id: uid(), createdAt: new Date().toISOString(),
      author: { id: author.id, name: author.name }, status: 'sent', deliveredTo: [], readBy: [],
    };
    await this.save(a);
    this.emit(a); // this tab
    this.channel?.postMessage({ kind: 'alert', alert: a }); // other tabs and windows
    return a;
  }

  async list(): Promise<Alert[]> {
    return ((await tx('readonly', (s) => s.getAll())) as Alert[]).sort(newest);
  }

  async inbox(user: User): Promise<Alert[]> {
    const mine = (await this.list()).filter((a) => isFor(a, user) && a.author.id !== user.id);
    for (const a of mine) {
      if (user.role !== 'authorities' && !a.deliveredTo.includes(user.id)) {
        a.deliveredTo = [...a.deliveredTo, user.id];
        a.status = statusOf(a);
        await this.saveStatus(a);
      }
    }
    return mine;
  }

  async markRead(id: string, user: User) {
    const a = (await tx('readonly', (s) => s.get(id))) as Alert | undefined;
    if (!a || a.readBy.includes(user.id)) return;
    a.readBy = [...a.readBy, user.id];
    if (!a.deliveredTo.includes(user.id)) a.deliveredTo = [...a.deliveredTo, user.id];
    a.status = statusOf(a);
    await this.saveStatus(a);
  }

  onUpdate(cb: () => void) {
    this.updateListeners.add(cb);
    return () => this.updateListeners.delete(cb);
  }

  subscribe(cb: (a: Alert) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
