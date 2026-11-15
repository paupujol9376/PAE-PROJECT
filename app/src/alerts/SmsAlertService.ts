// Real SMS mode: sends alerts through a backend (see server/README.md), which holds the SMS
// provider credentials. The browser only knows the backend URL (VITE_ALERTS_API_URL),
// never a provider key. A local copy is kept (IndexedDB) so history and the inbox work offline.
//
//   POST {VITE_ALERTS_API_URL}/api/alerts   body: AlertDraft + author  ->  201 Alert
//   GET  {VITE_ALERTS_API_URL}/api/alerts                                ->  200 Alert[]
import type { User } from '../auth/types';
import { MockAlertService } from './MockAlertService';
import type { Alert, AlertDraft } from './types';

export class SmsAlertService extends MockAlertService {
  readonly name = 'sms' as const;
  constructor(private baseUrl: string) {
    super();
  }

  async send(draft: AlertDraft, author: User): Promise<Alert> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...draft, author: { id: author.id, name: author.name } }),
    });
    if (!res.ok) throw new Error(`alerts API: HTTP ${res.status}`);
    const sent = (await res.json()) as Alert;
    await this.save(sent); // keep it for the local history / offline
    return sent;
  }

  async list(): Promise<Alert[]> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/alerts`);
      if (res.ok) {
        const remote = (await res.json()) as Alert[];
        for (const a of remote) await this.save(a);
      }
    } catch { /* offline: fall back to the local copy */ }
    return super.list();
  }
}
