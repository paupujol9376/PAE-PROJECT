import { describe, expect, it } from 'vitest';
import { parseSchools } from './schools';
import { buildIndex, normalize } from './search';
import type { SchoolsFile } from './types';

const file: SchoolsFile = {
  version: 1,
  generatedAt: '2026-11-15T00:00:00Z',
  source: { name: 'test', exportedAt: null, files: [] },
  country: { iso3: 'LKA', gigaId: 49 },
  provinces: [{ id: 0, name: { en: 'Central', si: 'මධ්‍යම', ta: 'மத்திய' }, bbox: [80, 7, 81, 8] }],
  districts: [{ id: 0, name: { en: 'Kandy', si: 'මහනුවර', ta: 'கண்டி' }, bbox: [80.5, 7, 81, 7.5] }],
  schools: [
    ['a', 'ABAKOLAWEWA K.V.', 80.79, 6.18, 0, 0, 0],
    ['b', 'KANDY GIRLS HIGH SCHOOL', 80.63, 7.29, 1, 0, 0],
    ['c', 'ST. ANNE\'S COLLEGE', 80.6, 7.3, 2, -1, -1],
  ],
};

describe('normalize', () => {
  it('folds case, dots and accents', () => {
    expect(normalize('  K.V.  Café ')).toBe('kv cafe');
    expect(normalize("ST. ANNE'S, Kandy-East")).toBe('st annes kandy east');
  });
});

describe('search', () => {
  const ds = parseSchools(file);
  const idx = buildIndex(ds);
  it('matches dotted abbreviations without dots', () => {
    expect(idx.search('abakolawewa kv')[0]).toMatchObject({ kind: 'school' });
  });
  it('ranks the district above schools with the same prefix', () => {
    const hits = idx.search('kandy');
    expect(hits[0].kind).toBe('district');
    expect(hits[1]).toMatchObject({ kind: 'school' });
  });
  it('finds areas by Sinhala and Tamil names', () => {
    expect(idx.search('මහනුවර')[0].kind).toBe('district');
    expect(idx.search('கண்டி')[0].kind).toBe('district');
  });
  it('returns nothing for empty or unknown queries', () => {
    expect(idx.search('   ')).toEqual([]);
    expect(idx.search('zzzz')).toEqual([]);
  });
  it('keeps schools without an area', () => {
    expect(ds.byId.get('c')?.district).toBeUndefined();
  });
});
