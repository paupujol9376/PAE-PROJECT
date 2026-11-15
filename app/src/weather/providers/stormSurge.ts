// 7b. Storm surge: DISABLED. No free, reliable, machine-readable storm-surge forecast for Sri Lanka.
import { registerLayer } from '../registry';

registerLayer({
  id: 'stormSurge', titleKey: 'wx.surge', order: 71, status: 'disabled', disabledReasonKey: 'wx.reason.surge',
  animated: false, defaultOpacity: 1, refreshMinutes: 0, render: { type: 'none' },
  getFrames: async () => [], getValueAt: async () => [],
  getLegend: () => ({ unit: '', stops: [] }),
  getAttribution: () => ({ text: '', url: '' }),
  getCoverage: () => ({ sriLanka: 'no', forecast: false, resolution: '—', update: '—' }),
  dataTime: () => null,
});
