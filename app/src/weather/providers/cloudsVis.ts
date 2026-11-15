// 3b. Clouds, visible: Himawari AHI band 3 via NASA GIBS, every 10 min, 1 km, daytime only.
import { registerLayer } from '../registry';
import { gibsFrames, gibsLatest, gibsTileUrl, GIBS_ATTRIBUTION } from '../gibs';

const LAYER = 'Himawari_AHI_Band3_Red_Visible_1km', LEVEL = 7;
let latest: number | null = null;

registerLayer({
  id: 'cloudsVis', titleKey: 'wx.cloudsVis', order: 31, status: 'enabled', animated: true, defaultOpacity: 0.55, refreshMinutes: 10,
  render: { type: 'raster', tileUrl: (f) => gibsTileUrl(LAYER, LEVEL, f.time), maxzoom: LEVEL },
  async getFrames(signal) {
    latest = await gibsLatest(LAYER, LEVEL, signal);
    if (!latest) throw new Error('Himawari unavailable');
    return gibsFrames(latest, 10, 3);
  },
  getValueAt: async () => [],
  getLegend: () => ({ unit: '', stops: [{ value: 0, color: '#202020' }, { value: 1, color: '#ffffff' }], noteKey: 'wx.note.vis' }),
  getAttribution: () => GIBS_ATTRIBUTION,
  getCoverage: () => ({ sriLanka: 'yes', forecast: false, resolution: '1 km', update: '10 min (daylight)', latency: '≈20 min' }),
  dataTime: () => latest,
});
