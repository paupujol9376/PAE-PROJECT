/// <reference types="vite/client" />
// Public build-time settings only. Never put secrets in VITE_* variables: they end up in the bundle.
interface ImportMetaEnv {
  readonly VITE_ALERTS_MODE?: 'mock' | 'sms';
  readonly VITE_ALERTS_API_URL?: string;
  /** Optional: server/ caches Open-Meteo for all users (no key needed, saves the daily quota). */
  readonly VITE_WEATHER_PROXY_URL?: string;
}
