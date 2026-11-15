// 7. Waves along the coast: Open-Meteo Marine, hourly, 16 coastal points. Storm surge: see stormSurge.ts.
import { registerLayer } from '../registry';
import { COAST_POINTS, OPEN_METEO_ATTRIBUTION, loadModels, models } from '../openMeteo';
import { framesFromTimes } from '../grid';
import { rampColor, WAVE_RAMP } from '../colors';
import type { FeatureCollection } from 'geojson';

function idx(times: number[], t: number) { let i = 0; times.forEach((x, k) => { if (x <= t) i = k; }); return i; }

registerLayer({
  id: 'waves', titleKey: 'wx.waves', order: 70, status: 'enabled', animated: true, defaultOpacity: 0.9, refreshMinutes: 60,
  render: {
    type: 'vector',
    data: (t): FeatureCollection | null => {
      const m = models().marine;
      if (!m) return null;
      const i = idx(m.times, t);
      return { type: 'FeatureCollection', features: COAST_POINTS.map(([lat, lon], p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { wave: m.height[i][p], period: m.period[i][p], _color: (() => { const [r, g, b] = rampColor(WAVE_RAMP, m.height[i][p] ?? 0); return m.height[i][p] == null ? '#888888' : `rgb(${r},${g},${b})`; })(), _radius: 8 } })) };
    },
  },
  async getFrames(signal) {
    const s = await loadModels(signal);
    if (!s.marine) throw new Error('no marine data');
    const now = Date.now();
    return framesFromTimes(s.marine.times, now).filter((f) => f.time >= now - 6 * 3600_000 && f.time <= now + 24 * 3600_000);
  },
  async getValueAt(lat, lon, time) {
    const m = models().marine;
    if (!m) return [];
    let best = 0, bd = Infinity;
    COAST_POINTS.forEach(([a, b], p) => { const d = (a - lat) ** 2 + (b - lon) ** 2; if (d < bd) { bd = d; best = p; } });
    if (Math.sqrt(bd) > 0.5) return []; // > ~55 km from the coast: not relevant
    const i = idx(m.times, time);
    return [{ labelKey: 'wx.v.wave', value: m.height[i][best], unit: 'm', text: m.period[i][best] != null ? `${m.period[i][best]} s` : undefined, time }];
  },
  getLegend: () => ({ unit: 'm', stops: WAVE_RAMP, noteKey: 'wx.note.waves' }),
  getAttribution: () => OPEN_METEO_ATTRIBUTION,
  getCoverage: () => ({ sriLanka: 'yes', forecast: true, resolution: '16 coastal points, model ≈5–25 km', update: 'hourly' }),
  dataTime: () => models().savedAt,
});
