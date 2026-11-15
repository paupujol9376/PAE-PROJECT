import { MockAlertService } from './MockAlertService';
import { SmsAlertService } from './SmsAlertService';
import type { AlertService } from './types';

// VITE_ALERTS_MODE=sms + VITE_ALERTS_API_URL=https://… switch to the real backend.
// Only the URL is public; SMS provider keys live on the server (server/.env), never here.
export function createAlertService(): AlertService {
  const mode = import.meta.env.VITE_ALERTS_MODE;
  const url = import.meta.env.VITE_ALERTS_API_URL;
  if (mode === 'sms' && url) return new SmsAlertService(url);
  return new MockAlertService();
}

export const alertService: AlertService = createAlertService();
export * from './types';
