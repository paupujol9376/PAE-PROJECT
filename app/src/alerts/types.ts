import type { LangCode } from '../data/types';
import type { Role, User } from '../auth/types';

export type AlertType = 'flood' | 'evacuation' | 'school_closed' | 'all_clear';
export const ALERT_TYPES: AlertType[] = ['flood', 'evacuation', 'school_closed', 'all_clear'];

export type Recipients =
  | { kind: 'all' }
  | { kind: 'district'; districts: string[] } // English OSM district names
  | { kind: 'school'; schools: string[] } // Giga IDs
  | { kind: 'role'; roles: Role[] };

export type AlertStatus = 'sent' | 'delivered' | 'read';

export interface Alert {
  id: string;
  type: AlertType;
  text: string;
  lang: LangCode;
  recipients: Recipients;
  createdAt: string; // ISO 8601 UTC
  author: { id: string; name: string };
  status: AlertStatus;
  deliveredTo: string[]; // user ids
  readBy: string[]; // user ids
}

export type AlertDraft = Pick<Alert, 'type' | 'text' | 'lang' | 'recipients'>;

export interface AlertService {
  readonly name: 'mock' | 'sms';
  send(draft: AlertDraft, author: User): Promise<Alert>;
  /** Every alert, newest first (authorities history). */
  list(): Promise<Alert[]>;
  /** Alerts addressed to this user, newest first; marks them delivered. */
  inbox(user: User): Promise<Alert[]>;
  markRead(id: string, user: User): Promise<void>;
  /** Called when an alert arrives (this tab or another tab/window on the device). */
  subscribe(cb: (a: Alert) => void): () => void;
  /** Called when an alert's delivered/read status changes anywhere on the device. */
  onUpdate(cb: () => void): () => void;
}

/** Does this alert target this user? Authorities see everything. */
export function isFor(a: Alert, u: User): boolean {
  if (u.role === 'authorities') return true;
  const r = a.recipients;
  if (r.kind === 'all') return true;
  if (r.kind === 'role') return r.roles.includes(u.role);
  if (r.kind === 'district') return !!u.district && r.districts.includes(u.district);
  return !!u.schoolId && r.schools.includes(u.schoolId);
}

export function statusOf(a: Pick<Alert, 'deliveredTo' | 'readBy'>): AlertStatus {
  return a.readBy.length ? 'read' : a.deliveredTo.length ? 'delivered' : 'sent';
}
