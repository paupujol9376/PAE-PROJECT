import type { AdminArea, Dataset, LangCode, School } from './types';

export type SearchHit =
  | { kind: 'school'; school: School; score: number }
  | { kind: 'district' | 'province'; area: AdminArea; score: number };

/** Lowercase, strip accents, drop dots/apostrophes ("K.V." → "kv"), other punctuation → space. */
export function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'’]+/g, '')
    .replace(/[,\-_/()"]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function score(hay: string, q: string): number {
  if (hay === q) return 0;
  if (hay.startsWith(q)) return 1;
  if (hay.includes(' ' + q)) return 2;
  if (hay.includes(q)) return 3;
  // all query words present, any order
  const words = q.split(' ');
  if (words.length > 1 && words.every((w) => hay.includes(w))) return 4;
  return -1;
}

export interface SearchIndex {
  search(q: string, limit?: number): SearchHit[];
}

export function buildIndex(ds: Dataset): SearchIndex {
  const schools = ds.schools.map((s) => ({ s, n: normalize(s.name) }));
  const areas = [
    ...ds.provinces.map((a) => ({ kind: 'province' as const, a })),
    ...ds.districts.map((a) => ({ kind: 'district' as const, a })),
  ].map((x) => ({ ...x, names: (['en', 'si', 'ta'] as LangCode[]).map((l) => x.a.name[l]).filter(Boolean).map((n) => normalize(n!)) }));

  return {
    search(raw, limit = 50) {
      const q = normalize(raw);
      if (!q) return [];
      const hits: SearchHit[] = [];
      for (const x of areas) {
        const best = Math.min(...x.names.map((n) => score(n, q)).filter((v) => v >= 0), 99);
        if (best < 99) hits.push({ kind: x.kind, area: x.a, score: best - 0.5 }); // areas rank above schools of equal score
      }
      for (const { s, n } of schools) {
        const sc = score(n, q);
        if (sc >= 0) hits.push({ kind: 'school', school: s, score: sc });
      }
      hits.sort((a, b) => a.score - b.score || label(a).localeCompare(label(b)));
      return hits.slice(0, limit);
    },
  };
}

function label(h: SearchHit) {
  return h.kind === 'school' ? h.school.name : h.area.name.en;
}
