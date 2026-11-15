// 9a. Official alerts relayed by GDACS for Sri Lanka (floods, cyclones…), with source and issue time.
import { registerLayer } from '../registry';
import { GDACS_ATTRIBUTION, LEVEL_COLOR, loadLkAlerts, type GdacsEvent } from '../gdacs';
import type { FeatureCollection } from 'geojson';

let events: GdacsEvent[] = [];
let savedAt: number | null = null;

export const lkAlerts = () => events;

registerLayer({
  id: 'warningsGdacs', titleKey: 'wx.warnGdacs', order: 90, status: 'enabled', animated: false, defaultOpacity: 1, refreshMinutes: 15,
  render: {
    type: 'vector',
    data: (): FeatureCollection => ({ type: 'FeatureCollection', features: events.map((e) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lon, e.lat] }, properties: { level: e.level, name: e.name, _color: LEVEL_COLOR[e.level] ?? '#f2d64b', _radius: 12 } })) }),
  },
  async getFrames(signal) {
    const r = await loadLkAlerts(signal);
    if (!r) throw new Error('GDACS unavailable');
    events = r.value; savedAt = r.savedAt;
    return [{ time: r.savedAt, kind: 'now' }];
  },
  async getValueAt() {
    return events.map((e) => ({ labelKey: 'wx.v.alert' as const, value: null, unit: '', text: `${e.name} · ${e.level} · ${e.source || 'GDACS'} · ${e.modified.slice(0, 16).replace('T', ' ')} UTC`, time: Date.parse(`${e.modified}Z`) }));
  },
  getLegend: () => ({ unit: '', stops: [{ value: 1, color: '#4fd18b' }, { value: 2, color: '#f28c28' }, { value: 3, color: '#e5383b' }], noteKey: 'wx.note.official' }),
  getAttribution: () => GDACS_ATTRIBUTION,
  getCoverage: () => ({ sriLanka: 'yes', forecast: false, resolution: 'per event', update: '15 min' }),
  dataTime: () => savedAt,
});
