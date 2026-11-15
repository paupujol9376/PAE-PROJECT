// Copy the generated data files from <repo>/data into app/public/data and write manifest.json.
// Usage: npm run data   (run the pipeline first, see README "Regenerating ...")
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../data');
const dst = path.resolve(here, '../public/data');
const files = ['roads.pmtiles', 'base.pmtiles', 'schools.json', 'land.json', 'admin.json'];
const optional = ['connectivity.json', 'road-stats.json']; // pipeline/estimate_connectivity.py or real data

fs.mkdirSync(dst, { recursive: true });
const manifest = { generatedAt: new Date().toISOString(), files: {} };
let missing = 0;
for (const f of files) {
  const from = path.join(src, f);
  if (!fs.existsSync(from)) { console.error(`MISSING ${from}`); missing++; continue; }
  fs.copyFileSync(from, path.join(dst, f));
  const buf = fs.readFileSync(from);
  manifest.files[f] = { size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16) };
  console.log(`copied ${f} (${buf.length.toLocaleString('en')} bytes)`);
}
for (const f of optional) {
  const from = path.join(src, f);
  if (fs.existsSync(from)) { fs.copyFileSync(from, path.join(dst, f)); console.log(`copied ${f} (optional)`); }
  else fs.rmSync(path.join(dst, f), { force: true });
}
fs.writeFileSync(path.join(dst, 'manifest.json'), JSON.stringify(manifest, null, 2));
if (missing) { console.error(`${missing} file(s) missing. Run pipeline/build-roads.ps1, build-base.ps1 and build_schools.py.`); process.exit(1); }
