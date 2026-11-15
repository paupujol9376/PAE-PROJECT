// 1b. Precipitation, forecast (and recent hours): Open-Meteo model blend, hourly, 0.5° grid.
import { registerLayer } from '../registry';
import { OPEN_METEO_ATTRIBUTION, models } from '../openMeteo';
import { fieldAt, trendOf } from '../grid';
import { RAIN_RAMP } from '../colors';
import { modelDataTime, modelFrames, modelValue } from './_model';

registerLayer({
  id: 'precipFcst', titleKey: 'wx.precipFcst', order: 11, status: 'enabled', animated: true, defaultOpacity: 0.7, refreshMinutes: 60,
  render: { type: 'heat', field: (t) => (models().grid ? fieldAt(models().grid!, 'precipitation', t) : null) },
  getFrames: modelFrames,
  async getValueAt(lat, lon, time) {
    const v = modelValue('precipitation', lat, lon, time), later = modelValue('precipitation', lat, lon, time + 3 * 3600_000);
    return [{ labelKey: 'wx.v.rainFcst', value: v, unit: 'mm/h', trend: trendOf(v, later, 0.5), time }];
  },
  getLegend: () => ({ unit: 'mm/h', stops: RAIN_RAMP, noteKey: 'wx.note.model' }),
  getAttribution: () => OPEN_METEO_ATTRIBUTION,
  getCoverage: () => ({ sriLanka: 'yes', forecast: true, resolution: '0.5° grid (≈55 km), models ≈9–25 km', update: 'hourly' }),
  dataTime: modelDataTime,
});
