// 3a. Clouds, infrared: Himawari AHI band 13 via NASA GIBS, every 10 min, 2 km, day and night.
import { registerLayer } from '../registry';
import { gibsFrames, gibsLatest, gibsTileUrl, GIBS_ATTRIBUTION } from '../gibs';

const LAYER = 'Himawari_AHI_Band13_Clean_Infrared', LEVEL = 6;
let latest: number | null = null;

registerLayer({
  id: 'cloudsIr', titleKey: 'wx.cloudsIr', order: 30, status: 'enabled', animated: true, defaultOpacity: 0.55, refreshMinutes: 10,
  render: { type: 'raster', tileUrl: (f) => gibsTileUrl(LAYER, LEVEL, f.time), maxzoom: LEVEL },
  async getFrames(signal) {
    latest = await gibsLatest(LAYER, LEVEL, signal);
    if (!latest) throw new Error('Himawari unavailable');
    return gibsFrames(latest, 10, 3);
  },
  getValueAt: async () => [],
  getLegend: () => ({ unit: '', stops: [{ value: 0, color: '#202020' }, { value: 1, color: '#9a9a9a' }, { value: 2, color: '#ffffff' }], noteKey: 'wx.note.ir' }),
  getAttribution: () => GIBS_ATTRIBUTION,
  getCoverage: () => ({ sriLanka: 'yes', forecast: false, resolution: '2 km', update: '10 min', latency: '≈20 min' }),
  dataTime: () => latest,
});
