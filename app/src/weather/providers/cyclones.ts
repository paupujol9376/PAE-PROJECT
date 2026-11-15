// 6. Tropical cyclones: GDACS (track, wind buffers 60/90/120 km/h, forecast cone, alert level),
// North Indian Ocean only. Track data originates from JTWC. RSMC New Delhi (IMD) is the official
// regional centre but has no machine-readable feed; GDACS is the open aggregator.
import { registerLayer } from '../registry';
import { GDACS_ATTRIBUTION, loadCyclones, type GdacsEvent } from '../gdacs';
import type { FeatureCollection } from 'geojson';

let data: { events: GdacsEvent[]; geoms: FeatureCollection } | null = null;
let savedAt: number | null = null;

registerLayer({
  id: 'cyclones', titleKey: 'wx.cyclones', order: 60, status: 'enabled', animated: false, defaultOpacity: 0.8, refreshMinutes: 30,
  render: { type: 'vector', data: () => data?.geoms ?? null },
  async getFrames(signal) {
    const r = await loadCyclones(signal);
    if (!r) throw new Error('GDACS unavailable');
    data = r.value; savedAt = r.savedAt;
    return [{ time: r.savedAt, kind: 'now' }];
  },
  async getValueAt() {
    if (!data) return [];
    return data.events.map((e) => ({ labelKey: 'wx.v.cyclone' as const, value: null, unit: '', text: `${e.name} (${e.level}, ${e.source}) · ${e.modified.slice(0, 16).replace('T', ' ')} UTC`, time: Date.parse(`${e.modified}Z`) }));
  },
  getLegend: () => ({ unit: '', stops: [{ value: 60, color: '#4fd18b' }, { value: 90, color: '#f28c28' }, { value: 120, color: '#e5383b' }], noteKey: 'wx.note.cyclones' }),
  getAttribution: () => GDACS_ATTRIBUTION,
  getCoverage: () => ({ sriLanka: 'yes', forecast: true, resolution: 'track points, 6–12 h', update: '30 min (advisories ≈6 h)' }),
  dataTime: () => savedAt,
});
