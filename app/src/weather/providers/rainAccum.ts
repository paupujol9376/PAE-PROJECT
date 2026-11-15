// 8. Accumulated rain over 24 / 48 / 72 h (flood and landslide signal): Open-Meteo, hourly, 0.5° grid.
// Official landslide (NBRO) and flood (DMC/Irrigation) warnings have no API; GDACS floods are in warningsGdacs.
import { registerLayer } from '../registry';
import { OPEN_METEO_ATTRIBUTION, models } from '../openMeteo';
import { accumulation, valueAt } from '../grid';
import { ACCUM_RAMP } from '../colors';
import { modelDataTime, modelFrames } from './_model';

let hours = 24;
const acc = (t: number, h = hours) => (models().grid ? accumulation(models().grid!, t, h) : null);

registerLayer({
  id: 'rainAccum', titleKey: 'wx.accum', order: 80, status: 'enabled', animated: true, defaultOpacity: 0.6, refreshMinutes: 60,
  render: { type: 'heat', field: (t) => acc(t) },
  options: [{ id: 'hours', labelKey: 'wx.opt.window', values: [{ value: '24', labelKey: 'wx.opt.24' }, { value: '48', labelKey: 'wx.opt.48' }, { value: '72', labelKey: 'wx.opt.72' }] }],
  setOption(id, value) { if (id === 'hours') hours = Number(value); },
  getFrames: modelFrames,
  async getValueAt(lat, lon, time) {
    const v = (h: number) => { const f = acc(time, h); return f ? valueAt(f, lat, lon) : null; };
    return [
      { labelKey: 'wx.v.accum24', value: v(24), unit: 'mm', time },
      { labelKey: 'wx.v.accum48', value: v(48), unit: 'mm', time },
      { labelKey: 'wx.v.accum72', value: v(72), unit: 'mm', time },
    ];
  },
  getLegend: () => ({ unit: 'mm', stops: ACCUM_RAMP, noteKey: 'wx.note.accum' }),
  getAttribution: () => OPEN_METEO_ATTRIBUTION,
  getCoverage: () => ({ sriLanka: 'yes', forecast: true, resolution: '0.5° grid (≈55 km)', update: 'hourly' }),
  dataTime: modelDataTime,
});
