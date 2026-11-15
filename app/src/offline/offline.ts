// Offline maps: the big PMTiles archives are downloaded on request into the Origin Private
// File System (OPFS) and read from there with pmtiles' FileSource. Online, the same archives
// are read with HTTP range requests. Service workers cannot cache range responses well, which
// is why tiles do not go through Workbox (architecture §5).
import { signal } from '@preact/signals';
import { FileSource, PMTiles, Protocol } from 'pmtiles';

export const protocol = new Protocol();
export type TileName = 'roads' | 'base';
export const TILE_FILES: Record<TileName, string> = { roads: 'roads.pmtiles', base: 'base.pmtiles' };

export interface Manifest { generatedAt: string; files: Record<string, { size: number; sha256: string }> }
export const manifest = signal<Manifest | null>(null);
export const tileKeys = signal<Record<TileName, string> | null>(null);
export const offlineReady = signal<Record<TileName, boolean>>({ roads: false, base: false });
export const progress = signal<Record<TileName, number | null>>({ roads: null, base: null });
export const downloadError = signal<string | null>(null);

export const opfsSupported =
  typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory &&
  typeof FileSystemFileHandle !== 'undefined' && 'createWritable' in FileSystemFileHandle.prototype;

const dataUrl = () => `${location.origin}${import.meta.env.BASE_URL}data/`;

export async function loadManifest() {
  try {
    const r = await fetch(`${dataUrl()}manifest.json`);
    if (r.ok) manifest.value = await r.json();
  } catch { /* offline and never cached: sizes stay unknown */ }
}

async function opfsFile(name: string): Promise<File | null> {
  if (!opfsSupported) return null;
  try {
    const dir = await navigator.storage.getDirectory();
    const h = await dir.getFileHandle(name);
    return await h.getFile();
  } catch {
    return null;
  }
}

function expectedSize(name: string) {
  return manifest.value?.files[name]?.size;
}

/** Decide, per archive, whether the map reads it from OPFS (offline copy) or over HTTP. */
export async function resolveTileKeys() {
  const keys = {} as Record<TileName, string>;
  const ready = { roads: false, base: false };
  for (const t of Object.keys(TILE_FILES) as TileName[]) {
    const name = TILE_FILES[t];
    const file = await opfsFile(name);
    const want = expectedSize(name);
    if (file && file.size > 0 && (want === undefined || file.size === want)) {
      const p = new PMTiles(new FileSource(file));
      protocol.add(p);
      keys[t] = p.source.getKey();
      ready[t] = true;
    } else {
      keys[t] = `${dataUrl()}${name}`;
    }
  }
  offlineReady.value = ready;
  tileKeys.value = keys;
}

let controller: AbortController | null = null;

export async function downloadAll(onDone?: () => void) {
  downloadError.value = null;
  controller = new AbortController();
  try {
    if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false);
    for (const t of Object.keys(TILE_FILES) as TileName[]) {
      if (!offlineReady.value[t]) await download(t, controller.signal);
    }
    await resolveTileKeys();
    onDone?.();
  } catch (e) {
    if ((e as Error).name !== 'AbortError') downloadError.value = (e as Error).message;
  } finally {
    progress.value = { roads: null, base: null };
    controller = null;
  }
}

export function cancelDownload() {
  controller?.abort();
}

async function download(t: TileName, signal: AbortSignal) {
  const name = TILE_FILES[t];
  const res = await fetch(`${dataUrl()}${name}`, { signal, cache: 'no-store' });
  if (!res.ok || !res.body) throw new Error(`${name}: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || expectedSize(name) || 0;
  const dir = await navigator.storage.getDirectory();
  const handle = await dir.getFileHandle(name, { create: true });
  const out = await (handle as FileSystemFileHandle & { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
  const reader = res.body.getReader();
  let got = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await out.write(value);
      got += value.byteLength;
      progress.value = { ...progress.value, [t]: total ? Math.min(99, Math.floor((got / total) * 100)) : 0 };
    }
    await out.close();
  } catch (e) {
    await out.abort().catch(() => undefined);
    await dir.removeEntry(name).catch(() => undefined);
    throw e;
  }
  if (total && got !== total) throw new Error(`${name}: incomplete download (${got} of ${total} bytes)`);
}

export async function removeOffline() {
  if (!opfsSupported) return;
  const dir = await navigator.storage.getDirectory();
  for (const name of Object.values(TILE_FILES)) await dir.removeEntry(name).catch(() => undefined);
  await resolveTileKeys();
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}
