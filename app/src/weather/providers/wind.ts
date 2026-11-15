// 2. Wind speed, direction and gusts: Open-Meteo, hourly, 0.5° grid (drawn as arrows).
import { registerLayer } from '../registry';
import { OPEN_METEO_ATTRIBUTION, models } from '../openMeteo';
import { compass, fieldAt, trendOf } from '../grid';
import { WIND_RAMP } from '../colors';
import { modelDataTime, modelFrames, modelValue } from './_model';

registerLayer({
  id: 'wind', titleKey: 'wx.wind', order: 20, status: 'enabled', animated: true, defaultOpacity: 0.9, refreshMinutes: 60,
  render: {
    type: 'wind',
    field: (t) => {
      const g = models().grid;
      const speed = g && fieldAt(g, 'wind_speed_10m', t), dir = g && fieldAt(g, 'wind_direction_10m', t);
      return speed && dir ? { speed, dir } : null;
    },
  },
  getFrames: modelFrames,
  async getValueAt(lat, lon, time) {
    const s = modelValue('wind_speed_10m', lat, lon, time), d = modelValue('wind_direction_10m', lat, lon, time);
    const g = modelValue('wind_gusts_10m', lat, lon, time), gl = modelValue('wind_gusts_10m', lat, lon, time + 3 * 3600_000);
    return [
      { labelKey: 'wx.v.wind', value: s, unit: 'km/h', text: d != null ? compass(d) : undefined, time },
      { labelKey: 'wx.v.gust', value: g, unit: 'km/h', trend: trendOf(g, gl, 5), time },
    ];
  },
  getLegend: () => ({ unit: 'km/h', stops: WIND_RAMP, noteKey: 'wx.note.model' }),
  getAttribution: () => OPEN_METEO_ATTRIBUTION,
  getCoverage: () => ({ sriLanka: 'yes', forecast: true, resolution: '0.5° grid (≈55 km)', update: 'hourly' }),
  dataTime: modelDataTime,
});
