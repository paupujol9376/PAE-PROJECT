// 1a. Precipitation, observed: NASA IMERG (GPM satellite estimate), 30 min, ~10 km, ~5 h latency.
// Not radar: Sri Lanka has no free public radar feed (RainViewer free tier: no nowcast since 2026-01-01).
import { registerLayer } from '../registry';
import { gibsFrames, gibsLatest, gibsTileUrl, GIBS_ATTRIBUTION, reverseColor, samplePixel } from '../gibs';
import { IMERG_COLORS } from '../imergColormap';
import type { Frame } from '../types';

const LAYER = 'IMERG_Precipitation_Rate_30min', LEVEL = 6;
let latest: number | null = null;

registerLayer({
  id: 'precipObs', titleKey: 'wx.precipObs', order: 10, status: 'enabled', animated: true, defaultOpacity: 0.75, refreshMinutes: 30,
  render: { type: 'raster', tileUrl: (f: Frame) => gibsTileUrl(LAYER, LEVEL, f.time), maxzoom: LEVEL },
  async getFrames(signal) {
    latest = await gibsLatest(LAYER, LEVEL, signal);
    if (!latest) throw new Error('IMERG unavailable');
    return gibsFrames(latest, 30, 6);
  },
  async getValueAt(lat, lon, time) {
    if (!latest) return [];
    const t = Math.min(Math.floor(time / 1800_000) * 1800_000, latest);
    const px = await samplePixel(gibsTileUrl(LAYER, LEVEL, t), LEVEL, lat, lon);
    const v = px && px[3] > 0 ? reverseColor(IMERG_COLORS, px[0], px[1], px[2]) : px ? 0 : null;
    return [{ labelKey: 'wx.v.rainObs', value: v, unit: 'mm/h', time: t }];
  },
  getLegend: () => ({ unit: 'mm/h', stops: [0.1, 0.5, 1, 2.5, 5, 10, 25, 50].map((v) => {
    const e = [...IMERG_COLORS].reverse().find((c) => c[3] <= v) ?? IMERG_COLORS[0];
    return { value: v, color: `rgb(${e[0]},${e[1]},${e[2]})` };
  }), noteKey: 'wx.note.precipObs' }),
  getAttribution: () => GIBS_ATTRIBUTION,
  getCoverage: () => ({ sriLanka: 'yes', forecast: false, resolution: '≈10 km', update: '30 min', latency: '≈5 h' }),
  dataTime: () => latest,
});
