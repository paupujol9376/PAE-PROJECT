// One shared timeline for every animated weather layer.
import type { Frame } from './types';

export const COLOMBO_TZ = 'Asia/Colombo';

export function formatColombo(time: number, locale = 'en-LK') {
  return new Intl.DateTimeFormat(locale, { timeZone: COLOMBO_TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(time);
}

export type When = 'past' | 'now' | 'forecast';
export function whenOf(time: number, now: number, toleranceMs = 15 * 60_000): When {
  return Math.abs(time - now) <= toleranceMs ? 'now' : time < now ? 'past' : 'forecast';
}

/**
 * Builds the player steps from all layers' frames: the union of times, limited to
 * [now - pastHours, now + futureHours], snapped to `stepMin` minutes so layers with
 * different cadences (10 min satellite, 30 min IMERG, hourly models) share one line.
 */
export function buildSteps(frameSets: Frame[][], now: number, opts = { pastHours: 6, futureHours: 24, stepMin: 30 }): number[] {
  const step = opts.stepMin * 60_000;
  const lo = now - opts.pastHours * 3600_000, hi = now + opts.futureHours * 3600_000;
  const all = frameSets.flat().map((f) => f.time).filter((t) => t >= lo && t <= hi);
  if (!all.length) return [];
  const min = Math.floor(Math.min(...all) / step) * step, max = Math.ceil(Math.max(...all) / step) * step;
  const out: number[] = [];
  for (let t = min; t <= max; t += step) out.push(t);
  return out;
}

/** Latest frame at or before `time` within `maxGapMs` (raster layers show the newest available image). */
export function frameFor(frames: Frame[], time: number, maxGapMs: number): Frame | null {
  let best: Frame | null = null;
  for (const f of frames) if (f.time <= time && (!best || f.time > best.time)) best = f;
  return best && time - best.time <= maxGapMs ? best : null;
}

/** Index of the step closest to `now`. */
export function nowIndex(steps: number[], now: number) {
  let bi = 0;
  steps.forEach((t, i) => { if (Math.abs(t - now) < Math.abs(steps[bi] - now)) bi = i; });
  return bi;
}

/** Plain player state machine (UI-agnostic, unit-tested). */
export class Player {
  steps: number[] = [];
  index = 0;
  playing = false;
  speed: 1 | 2 = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(private onChange: (p: Player) => void, private baseMs = 900) {}

  setSteps(steps: number[], now: number) {
    const cur = this.steps[this.index];
    this.steps = steps;
    const keep = cur != null ? steps.indexOf(cur) : -1;
    this.index = keep >= 0 ? keep : nowIndex(steps, now);
    this.onChange(this);
  }
  get time(): number | null { return this.steps[this.index] ?? null; }
  seek(i: number) { this.index = Math.max(0, Math.min(i, this.steps.length - 1)); this.onChange(this); }
  goNow(now: number) { this.seek(nowIndex(this.steps, now)); }
  next() { if (this.steps.length) this.seek((this.index + 1) % this.steps.length); }
  play() {
    if (this.playing || this.steps.length < 2) return;
    this.playing = true;
    this.timer = setInterval(() => this.next(), this.baseMs / this.speed);
    this.onChange(this);
  }
  pause() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.onChange(this);
  }
  setSpeed(s: 1 | 2) {
    this.speed = s;
    if (this.playing) { this.pause(); this.play(); } else this.onChange(this);
  }
}
