// Data contracts: replica/02-architecture/architecture.md §3.
export type LangCode = 'en' | 'si' | 'ta';
export type Level = 'primary' | 'secondary' | 'primary_secondary';
export type Connectivity = 'connected' | 'not_connected' | 'unknown';

export interface AdminArea {
  id: number;
  osmId?: number;
  name: { en: string; si?: string; ta?: string };
  bbox: [number, number, number, number];
}

export type SchoolRow = [string, string, number, number, 0 | 1 | 2, number, number];

export interface SchoolsFile {
  version: 1;
  generatedAt: string;
  source: { name: string; exportedAt: string | null; files: string[] };
  country: { iso3: 'LKA'; gigaId: number };
  provinces: AdminArea[];
  districts: AdminArea[];
  schools: SchoolRow[];
}

export interface School {
  id: string;
  name: string;
  lon: number;
  lat: number;
  level: Level;
  province?: AdminArea;
  district?: AdminArea;
  connectivity: Connectivity;
  downloadMbps?: { period: 'week' | 'month'; start: string; value: number }[];
}

export interface Dataset {
  generatedAt: string;
  exportedAt: string | null;
  provinces: AdminArea[];
  districts: AdminArea[];
  schools: School[];
  byId: Map<string, School>;
}

/** Plug point for private Giga connectivity data (not available yet). */
export interface ConnectivityProvider {
  name: string;
  load(ids: string[]): Promise<Map<string, Pick<School, 'connectivity' | 'downloadMbps'>>>;
}
