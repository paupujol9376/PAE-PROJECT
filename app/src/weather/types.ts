// Weather layers: one WeatherProvider per phenomenon. Adding a phenomenon = one new file in
// ./providers that calls registerLayer(); the panel, player and map read the registry.
import type { FeatureCollection } from 'geojson';
import type { Key } from '../i18n';

/** A point in time a layer has data for. kind is relative to "now" when the frames were made. */
export interface Frame { time: number; kind: 'past' | 'now' | 'forecast' }

export interface LegendStop { value: number; color: string }
export interface Legend { unit: string; stops: LegendStop[]; noteKey?: Key }

export interface Coverage {
  sriLanka: 'yes' | 'partial' | 'no';
  forecast: boolean;
  resolution: string; // e.g. "2 km", "0.5° grid (≈55 km)"
  update: string; // e.g. "10 min", "hourly"
  latency?: string; // e.g. "≈5 h"
}

export interface PointValue {
  labelKey: Key;
  value: number | null;
  unit: string;
  text?: string; // extra (e.g. direction "NE")
  trend?: 'up' | 'down' | 'flat';
  time: number;
}

/** Numeric field on the Sri Lanka grid for one time step (row-major, rows south→north). */
export interface GridField { lats: number[]; lons: number[]; values: (number | null)[] }

export type RenderKind =
  | { type: 'raster'; tileUrl: (f: Frame) => string; maxzoom: number }
  | { type: 'heat'; field: (time: number) => GridField | null }
  | { type: 'wind'; field: (time: number) => { speed: GridField; dir: GridField } | null }
  | { type: 'vector'; data: (time: number) => FeatureCollection | null }
  | { type: 'none' };

export interface LayerOption { id: string; labelKey: Key; values: { value: string; labelKey: Key }[] }

export interface WeatherProvider {
  id: string;
  titleKey: Key;
  order: number; // panel order
  /** disabled = no reliable source; the panel shows it greyed out with the reason. */
  status: 'enabled' | 'disabled';
  disabledReasonKey?: Key;
  link?: { url: string; labelKey: Key };
  animated: boolean;
  defaultOpacity: number;
  refreshMinutes: number;
  render: RenderKind;
  options?: LayerOption[];
  /** Load/refresh frames. Throws on network failure; the registry falls back to the cache. */
  getFrames(signal?: AbortSignal): Promise<Frame[]>;
  getValueAt(lat: number, lon: number, time: number): Promise<PointValue[]>;
  getLegend(): Legend;
  getAttribution(): { text: string; url: string };
  getCoverage(): Coverage;
  /** When the data shown was produced (for "data from X min ago"). */
  dataTime(): number | null;
  setOption?(id: string, value: string): void;
}
