export type Role = 'kids' | 'adult' | 'authorities';
export const ROLES: Role[] = ['kids', 'adult', 'authorities'];

export type Avatar = 'elephant' | 'peacock' | 'turtle' | 'star';

export interface User {
  id: string;
  role: Role;
  name: string;
  /** School the account belongs to (Giga ID); kids and adults see "my school". */
  schoolId?: string;
  /** District (English OSM name) used to match district-wide alerts. */
  district?: string;
  avatar?: Avatar;
}

export interface Session {
  userId: string;
  role: Role;
  loginAt: string;
}
