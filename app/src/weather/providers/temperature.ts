// 5. Temperature and feels-like (heat stress): Open-Meteo, hourly, 0.5° grid. Map shows feels-like.
import { registerLayer } from '../registry';
import { OPEN_METEO_ATTRIBUTION, models } from '../openMeteo';
import { fieldAt, trendOf } from '../grid';
import { TEMP_RAMP } from '../colors';
import { modelDataTime, modelFrames, modelValue } from './_model';

registerLayer({
  id: 'temperature', titleKey: 'wx.temperature', order: 50, status: 'enabled', animated: true, defaultOpacity: 0.55, refreshMinutes: 60,
  render: { type: 'heat', field: (t) => (models().grid ? fieldAt(models().grid!, 'apparent_temperature', t) : null) },
  getFrames: modelFrames,
  async getValueAt(lat, lon, time) {
    const tt = modelValue('temperature_2m', lat, lon, time), f = modelValue('apparent_temperature', lat, lon, time);
    const fl = modelValue('apparent_temperature', lat, lon, time + 3 * 3600_000);
    return [
      { labelKey: 'wx.v.temp', value: tt, unit: '°C', time },
      { labelKey: 'wx.v.feels', value: f, unit: '°C', trend: trendOf(f, fl, 1), time },
    ];
  },
  getLegend: () => ({ unit: '°C', stops: TEMP_RAMP, noteKey: 'wx.note.feels' }),
  getAttribution: () => OPEN_METEO_ATTRIBUTION,
  getCoverage: () => ({ sriLanka: 'yes', forecast: true, resolution: '0.5° grid (≈55 km)', update: 'hourly' }),
  dataTime: modelDataTime,
});
