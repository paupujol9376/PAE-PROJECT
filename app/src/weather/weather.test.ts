import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { accumulation, fieldAt, framesFromTimes, GRID, parseOpenMeteo, valueAt } from './grid';
import { gibsFrames, parseLatest, reverseColor } from './gibs';
import { buildSteps, frameFor, Player, whenOf } from './timeline';
import { DEFAULT_RISK, insideAny, riskScore } from './risk';
import { cachePut, fetchWithCache } from './cache';
import { _clearRegistry, allLayers, registerLayer } from './registry';
import { IMERG_COLORS } from './imergColormap';
import type { WeatherProvider } from './types';

const H = 3600_000;
const T0 = Date.UTC(2026, 10, 15, 0);
const N = GRID.lats.length * GRID.lons.length;

/** Fake Open-Meteo multi-location response: `fn(point, hour)` gives every variable. */
function fakeOpenMeteo(hours: number, fn: (p: number, h: number) => number) {
  return Array.from({ length: N }, (_, p) => ({
    hourly: {
      time: Array.from({ length: hours }, (_, h) => new Date(T0 + h * H).toISOString().slice(0, 16)),
      ...Object.fromEntries(['precipitation', 'temperature_2m', 'apparent_temperature', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m']
        .map((v) => [v, Array.from({ length: hours }, (_, h) => fn(p, h))])),
    },
  }));
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('frame parsing', () => {
  it('parses Open-Meteo multi-location hourly data in grid order', () => {
    const s = parseOpenMeteo(fakeOpenMeteo(3, (p, h) => p + h * 100), T0);
    expect(s.times).toEqual([T0, T0 + H, T0 + 2 * H]);
    expect(s.data.precipitation[1][5]).toBe(105);
    expect(s.data.wind_gusts_10m[2]).toHaveLength(N);
  });
  it('rejects an unexpected response', () => {
    expect(() => parseOpenMeteo({ error: true, reason: 'quota' })).toThrow();
  });
  it('labels frames past / now / forecast', () => {
    expect(framesFromTimes([T0 - H, T0, T0 + H], T0).map((f) => f.kind)).toEqual(['past', 'now', 'forecast']);
  });
  it('reads the latest NASA GIBS time from DescribeDomains', () => {
    const xml = "<Domains><DimensionDomain><Domain>2026-11-14/2026-11-15T10:30:00Z/PT30M</Domain></DimensionDomain></Domains>";
    expect(parseLatest(xml)).toBe(Date.UTC(2026, 10, 15, 10, 30));
    expect(parseLatest('<x/>')).toBeNull();
    const f = gibsFrames(Date.UTC(2026, 10, 15, 10, 30), 30, 2, Date.UTC(2026, 10, 15, 16));
    expect(f).toHaveLength(5);
    expect(f.at(-1)!.time).toBe(Date.UTC(2026, 10, 15, 10, 30));
    expect(f.every((x) => x.kind === 'past')).toBe(true);
  });
  it('turns an IMERG tile colour back into mm/h', () => {
    const [r, g, b, v] = IMERG_COLORS[50];
    expect(reverseColor(IMERG_COLORS, r, g, b)).toBe(v);
    expect(reverseColor(IMERG_COLORS, 255, 0, 255, 5)).toBeNull();
  });
});

describe('value at a point', () => {
  const s = parseOpenMeteo(fakeOpenMeteo(4, (p, h) => (p % GRID.lons.length) * 10 + h), T0);
  it('interpolates bilinearly inside the grid and returns null outside', () => {
    const f = fieldAt(s, 'temperature_2m', T0)!;
    expect(valueAt(f, 7, 80.25)).toBeCloseTo(15, 5); // halfway between lon 80 (10) and 80.5 (20)
    expect(valueAt(f, 3, 80)).toBeNull();
  });
  it('interpolates in time between hourly steps', () => {
    expect(valueAt(fieldAt(s, 'temperature_2m', T0 + H / 2)!, 7, 80)).toBeCloseTo(10.5, 5);
    expect(fieldAt(s, 'temperature_2m', T0 + 10 * H)).toBeNull();
  });
  it('sums rain over a window', () => {
    const r = parseOpenMeteo(fakeOpenMeteo(30, () => 2), T0);
    expect(valueAt(accumulation(r, T0 + 29 * H, 24)!, 7, 80)).toBe(48);
  });
});

describe('player', () => {
  it('builds one shared timeline and snaps layers to their newest frame', () => {
    const now = T0 + 5 * H;
    const sat = [0, 1, 2].map((i) => ({ time: now - i * 30 * 60_000, kind: 'past' as const }));
    const model = [0, 1, 2, 3].map((i) => ({ time: T0 + (4 + i) * H, kind: 'forecast' as const }));
    const steps = buildSteps([sat, model], now);
    expect(steps[0]).toBe(T0 + 4 * H);
    expect(steps.at(-1)).toBe(T0 + 7 * H);
    expect(frameFor(sat, now + 20 * 60_000, 3 * H)!.time).toBe(now);
    expect(whenOf(now + 2 * H, now)).toBe('forecast');
  });
  it('plays, pauses, changes speed and jumps to now', () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const p = new Player((x) => seen.push(x.index), 100);
    p.setSteps([0, 1, 2, 3].map((i) => T0 + i * H), T0 + 2 * H);
    expect(p.index).toBe(2);
    p.play(); vi.advanceTimersByTime(250);
    expect(p.index).toBe(0); // 2 → 3 → 0 (wraps)
    p.setSpeed(2); vi.advanceTimersByTime(100);
    expect(p.index).toBe(2);
    p.pause(); vi.advanceTimersByTime(1000);
    expect(p.index).toBe(2);
    p.seek(0); p.goNow(T0 + 3 * H);
    expect(p.index).toBe(3);
  });
});

describe('risk index', () => {
  it('is low with calm weather and rises with rain, gusts, accumulation and official alerts', () => {
    expect(riskScore({ rain: 0, gust: 10, accum: 0, official: false }).level).toBe('low');
    const r = riskScore({ rain: 30, gust: 90, accum: 200, official: true });
    expect(r.score).toBeCloseTo(1, 5);
    expect(r.level).toBe('severe');
    const mid = riskScore({ rain: 17.5, gust: null, accum: 125, official: false }); // half rain, half accum
    expect(mid.score).toBeCloseTo((0.3 * 0.5 + 0.3 * 0.5) / 1, 5);
    expect(mid.level).toBe('moderate');
  });
  it('explains the level with factors sorted by contribution', () => {
    const r = riskScore({ rain: 30, gust: 40, accum: 0, official: false });
    expect(r.factors[0].id).toBe('rain');
    expect(r.factors.find((f) => f.id === 'gust')!.factor).toBe(0);
  });
  it('uses the configured weights and limits', () => {
    const cfg = { ...DEFAULT_RISK, weights: { rain: 1, gust: 0, accum: 0, official: 0 }, levels: { moderate: 0.1, high: 0.2, severe: 0.9 } };
    expect(riskScore({ rain: 10, gust: 0, accum: 0, official: false }, cfg).level).toBe('high');
  });
  it('detects schools inside a cyclone polygon', () => {
    const fc = { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [[[80, 6], [82, 6], [82, 8], [80, 8], [80, 6]]] } }] };
    expect(insideAny(fc, 81, 7)).toBe(true);
    expect(insideAny(fc, 79.9, 7)).toBe(false);
  });
});

describe('layer registry', () => {
  it('registers every provider file, in order, with disabled layers explained', async () => {
    await import('./layers');
    const layers = allLayers();
    expect(layers.map((l) => l.id)).toEqual(['precipObs', 'precipFcst', 'wind', 'cloudsIr', 'cloudsVis', 'lightning', 'temperature', 'cyclones', 'waves', 'stormSurge', 'rainAccum', 'warningsGdacs', 'warningsLk']);
    for (const l of layers.filter((x) => x.status === 'disabled')) expect(l.disabledReasonKey).toBeTruthy();
    expect(layers.filter((x) => x.status === 'disabled').map((l) => l.id)).toEqual(['lightning', 'stormSurge', 'warningsLk']);
    for (const l of layers.filter((x) => x.status === 'enabled')) expect(l.getAttribution().text).not.toBe('');
  });
  it('rejects duplicates and disabled layers without a reason', () => {
    _clearRegistry();
    const base = { id: 'x', titleKey: 'wx.wind', order: 1, status: 'enabled', animated: false, defaultOpacity: 1, refreshMinutes: 5, render: { type: 'none' },
      getFrames: async () => [], getValueAt: async () => [], getLegend: () => ({ unit: '', stops: [] }), getAttribution: () => ({ text: 'a', url: 'b' }),
      getCoverage: () => ({ sriLanka: 'yes', forecast: false, resolution: '', update: '' }), dataTime: () => null } as unknown as WeatherProvider;
    registerLayer({ ...base });
    expect(() => registerLayer({ ...base })).toThrow();
    expect(() => registerLayer({ ...base, id: 'y', status: 'disabled' } as WeatherProvider)).toThrow();
  });
});

describe('offline behaviour', () => {
  it('falls back to the last cached data with its time when the network fails', async () => {
    const saved = T0 - 25 * 60_000;
    await cachePut('k1', { a: 1 }, saved);
    const r = await fetchWithCache('k1', async () => { throw new Error('offline'); });
    expect(r).toEqual({ value: { a: 1 }, savedAt: saved, stale: true });
  });
  it('returns null (layer hidden) when there is neither network nor cache', async () => {
    expect(await fetchWithCache('never-saved', async () => { throw new Error('offline'); })).toBeNull();
  });
  it('model loader degrades quietly: no throw, cached grid marked stale', async () => {
    const { loadModels, _resetModels } = await import('./openMeteo');
    _resetModels();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => fakeOpenMeteo(3, () => 1) })));
    const live = await loadModels(undefined, 0);
    expect(live.grid?.times).toHaveLength(3);
    expect(live.stale).toBe(false);
    _resetModels();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const off = await loadModels(undefined, 0);
    expect(off.grid?.times).toHaveLength(3);
    expect(off.stale).toBe(true);
  });
});
