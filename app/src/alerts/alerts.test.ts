import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { MockAlertService } from './MockAlertService';
import { isFor, type Alert } from './types';
import { userById } from '../auth/demoUsers';
import type { User } from '../auth/types';

const officer = userById('u-auth-1')!;
const parent = userById('u-adult-1')!; // school ABAKOLAWEWA K.V., district Hambantota
const kid = userById('u-kid-1')!;

beforeEach(async () => {
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('pae-alerts'); r.onsuccess = r.onerror = r.onblocked = () => res(); });
});

describe('MockAlertService', () => {
  it('sends an alert and delivers it to a kid on another tab', async () => {
    const sender = new MockAlertService(); // authorities tab
    const receiver = new MockAlertService(); // kids tab, same device
    const got = new Promise<Alert>((res) => receiver.subscribe(res));
    const sent = await sender.send({ type: 'flood', text: 'Heavy rain. Go to the upper floor.', lang: 'en', recipients: { kind: 'district', districts: ['Hambantota'] } }, officer);
    expect(sent.status).toBe('sent');
    expect(sent.author).toEqual({ id: officer.id, name: officer.name });
    const arrived = await got;
    expect(arrived.id).toBe(sent.id);
    const box = await receiver.inbox(kid);
    expect(box.map((a) => a.id)).toEqual([sent.id]);
    expect(box[0].status).toBe('delivered');
    await receiver.markRead(sent.id, kid);
    expect((await sender.list())[0].status).toBe('read');
  });

  it('does not deliver alerts addressed to someone else', async () => {
    const s = new MockAlertService();
    await s.send({ type: 'school_closed', text: 'Closed today', lang: 'si', recipients: { kind: 'district', districts: ['Jaffna'] } }, officer);
    await s.send({ type: 'all_clear', text: 'All clear', lang: 'ta', recipients: { kind: 'role', roles: ['adult'] } }, officer);
    expect(await s.inbox(kid)).toEqual([]);
    expect((await s.inbox(parent)).map((a) => a.type)).toEqual(['all_clear']);
    expect(await s.list()).toHaveLength(2);
  });

  it('rejects an empty message', async () => {
    await expect(new MockAlertService().send({ type: 'flood', text: '   ', lang: 'en', recipients: { kind: 'all' } }, officer)).rejects.toThrow();
  });
});

describe('recipient matching', () => {
  const base: Omit<Alert, 'recipients'> = { id: '1', type: 'evacuation', text: 'x', lang: 'en', createdAt: '', author: { id: 'a', name: 'A' }, status: 'sent', deliveredTo: [], readBy: [] };
  const u = (p: Partial<User>): User => ({ id: 'u', role: 'kids', name: 'n', ...p });
  it('matches by all, role, district and school', () => {
    expect(isFor({ ...base, recipients: { kind: 'all' } }, u({}))).toBe(true);
    expect(isFor({ ...base, recipients: { kind: 'role', roles: ['adult'] } }, u({ role: 'kids' }))).toBe(false);
    expect(isFor({ ...base, recipients: { kind: 'district', districts: ['Kandy'] } }, u({ district: 'Kandy' }))).toBe(true);
    expect(isFor({ ...base, recipients: { kind: 'school', schools: ['s1'] } }, u({ schoolId: 's2' }))).toBe(false);
  });
});
