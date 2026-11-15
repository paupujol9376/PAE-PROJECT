// 9b. Sri Lanka Department of Meteorology warnings: DISABLED for automatic display. The
// department publishes warnings on meteo.gov.lk but no machine-readable feed (API/RSS/CAP)
// was found. The panel links to the official site instead of scraping it.
import { registerLayer } from '../registry';

registerLayer({
  id: 'warningsLk', titleKey: 'wx.warnLk', order: 91, status: 'disabled', disabledReasonKey: 'wx.reason.lk',
  link: { url: 'https://www.meteo.gov.lk/', labelKey: 'wx.link.lk' },
  animated: false, defaultOpacity: 1, refreshMinutes: 0, render: { type: 'none' },
  getFrames: async () => [], getValueAt: async () => [],
  getLegend: () => ({ unit: '', stops: [] }),
  getAttribution: () => ({ text: 'Department of Meteorology, Sri Lanka', url: 'https://www.meteo.gov.lk/' }),
  getCoverage: () => ({ sriLanka: 'yes', forecast: true, resolution: '—', update: '—' }),
  dataTime: () => null,
});
