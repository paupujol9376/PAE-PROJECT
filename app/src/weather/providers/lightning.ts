// 4. Lightning: DISABLED. No reliable free source. Blitzortung.org explicitly forbids using its
// data for storm warning systems or risk analysis; official/commercial networks need a contract.
import { registerLayer } from '../registry';

registerLayer({
  id: 'lightning', titleKey: 'wx.lightning', order: 40, status: 'disabled', disabledReasonKey: 'wx.reason.lightning',
  animated: false, defaultOpacity: 1, refreshMinutes: 0, render: { type: 'none' },
  getFrames: async () => [], getValueAt: async () => [],
  getLegend: () => ({ unit: '', stops: [] }),
  getAttribution: () => ({ text: '', url: '' }),
  getCoverage: () => ({ sriLanka: 'no', forecast: false, resolution: '—', update: '—' }),
  dataTime: () => null,
});
