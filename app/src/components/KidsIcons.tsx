// Inline SVG icons (own drawings, no dependency). Decorative by default: callers give the
// accessible name on the surrounding button/heading. `currentColor` follows the theme.
import type { AlertType } from '../alerts/types';
import type { Avatar } from '../auth/types';

type P = { size?: number; class?: string };
const svg = (p: P, children: preact.ComponentChildren, vb = '0 0 64 64') => (
  <svg viewBox={vb} width={p.size ?? 48} height={p.size ?? 48} class={p.class} aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">{children}</svg>
);

export const BellIcon = (p: P) => svg(p, <><path d="M16 44V28a16 16 0 0 1 32 0v16l5 6H11z" /><path d="M26 54a6 6 0 0 0 12 0" /></>);
export const SchoolIcon = (p: P) => svg(p, <><path d="M8 28 32 12l24 16" /><path d="M14 26v28h36V26" /><path d="M27 54V40h10v14" /><circle cx="32" cy="29" r="4" /></>);
export const HelpIcon = (p: P) => svg(p, <><circle cx="32" cy="32" r="24" /><path d="M24 25a8 8 0 1 1 11 7c-2 1-3 3-3 5v2" /><circle cx="32" cy="47" r="1.5" fill="currentColor" /></>);
export const SpeakerIcon = (p: P) => svg(p, <><path d="M10 24h10l14-11v38L20 40H10z" /><path d="M44 22a14 14 0 0 1 0 20M50 15a24 24 0 0 1 0 34" /></>);
export const BackIcon = (p: P) => svg(p, <path d="M38 14 20 32l18 18" />);
export const PhoneIcon = (p: P) => svg(p, <path d="M18 8h8l4 12-6 4a32 32 0 0 0 16 16l4-6 12 4v8a6 6 0 0 1-6 6A44 44 0 0 1 12 14a6 6 0 0 1 6-6z" />);

// Alert types: wave = flood, exit arrow = evacuation, padlock = school closed, sun = all clear.
export const FloodIcon = (p: P) => svg(p, <><path d="M6 26c6-6 10 6 16 0s10 6 16 0 10 6 16 0 6 0 6 0" /><path d="M6 40c6-6 10 6 16 0s10 6 16 0 10 6 16 0" /><path d="M24 14l4-6 4 6" /></>);
export const EvacuationIcon = (p: P) => svg(p, <><path d="M10 10h22v44H10z" /><path d="M30 32h24M44 22l10 10-10 10" /></>);
export const LockIcon = (p: P) => svg(p, <><rect x="14" y="28" width="36" height="28" rx="4" /><path d="M22 28v-8a10 10 0 0 1 20 0v8" /><circle cx="32" cy="42" r="3" fill="currentColor" /></>);
export const SunIcon = (p: P) => svg(p, <><circle cx="32" cy="32" r="11" /><path d="M32 6v8M32 50v8M6 32h8M50 32h8M13 13l6 6M45 45l6 6M13 51l6-6M45 19l6-6" /></>);

export function AlertTypeIcon(props: P & { type: AlertType }) {
  const I = { flood: FloodIcon, evacuation: EvacuationIcon, school_closed: LockIcon, all_clear: SunIcon }[props.type];
  return <I size={props.size} class={props.class} />;
}

export function AvatarIcon(props: P & { avatar: Avatar }) {
  const p = props;
  switch (p.avatar) {
    case 'elephant':
      return svg(p, <><path d="M14 30a18 16 0 0 1 36 0v10H40v12h-6V40h-4v12h-6V40" /><path d="M14 30c-4 0-6 6-2 10M50 30v14c0 4-4 4-4 0" /><circle cx="40" cy="27" r="2" fill="currentColor" /></>);
    case 'peacock':
      return svg(p, <><path d="M32 54V30" /><circle cx="32" cy="22" r="6" /><path d="M32 30C20 30 10 22 10 12M32 30c12 0 22-8 22-18M32 30C24 34 14 40 12 50M32 30c8 4 18 10 20 20" /><path d="M38 20l6-2" /></>);
    case 'turtle':
      return svg(p, <><path d="M12 40a20 16 0 0 1 40 0z" /><path d="M52 36h6v-6h-6M18 40l-4 8M46 40l4 8M24 26l8 6 8-6M32 32v8" /></>);
    default:
      return svg(p, <path d="M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 25l16-2z" />);
  }
}
