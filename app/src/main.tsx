import { render } from 'preact';
// Only the scripts the app uses (Latin, Sinhala, Tamil) so the offline precache stays small.
import '@fontsource/noto-sans/latin-400.css';
import '@fontsource/noto-sans/latin-600.css';
import '@fontsource/noto-sans-sinhala/sinhala-400.css';
import '@fontsource/noto-sans-sinhala/sinhala-600.css';
import '@fontsource/noto-sans-tamil/tamil-400.css';
import '@fontsource/noto-sans-tamil/tamil-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import './styles/app.css';
import './styles/roles.css';
import './styles/weather.css';
import { App } from './app';
import { dataError, dataset, flyTo, roadStats } from './state';
import { route } from './router';
import { loadSchools } from './data/schools';
import { loadManifest, resolveTileKeys } from './offline/offline';

render(<App />, document.getElementById('app')!);

loadSchools(import.meta.env.BASE_URL)
  .then((ds) => {
    dataset.value = ds;
    // Deep links: centre the map on the linked school / area once the data is known.
    const r = route.peek();
    if (r.name === 'school') {
      const s = ds.byId.get(r.id);
      if (s) flyTo({ center: [s.lon, s.lat], zoom: 14 });
    } else if (r.name === 'district' || r.name === 'province') {
      const a = (r.name === 'district' ? ds.districts : ds.provinces)[r.id];
      if (a) flyTo({ bbox: a.bbox });
    }
  })
  .catch((e: Error) => {
    console.warn('[PAE] school data:', e.message);
    dataError.value = e.message;
  });

loadManifest().then(resolveTileKeys);

// Measured road statistics for the legend (pipeline/road_stats.py); optional.
fetch(`${import.meta.env.BASE_URL}data/road-stats.json`)
  .then((r) => (r.ok ? r.json() : null))
  .then((j) => { if (j?.classes) roadStats.value = j; })
  .catch(() => undefined);

if (import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}
