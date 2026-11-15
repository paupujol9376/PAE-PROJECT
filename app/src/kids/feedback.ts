// Arrival cue for a new alert: a short two-tone chime made with Web Audio (no audio file,
// works offline) plus vibration where supported. Browsers block sound before the first user
// gesture; the chime then simply does not play and the visual card still shows.
import type { LangCode } from '../data/types';

let ctx: AudioContext | null = null;

export function chime() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    const now = ctx.currentTime;
    for (const [i, f] of [660, 880].entries()) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.25, now + i * 0.25 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.25 + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(now + i * 0.25); o.stop(now + i * 0.25 + 0.4);
    }
  } catch { /* no audio */ }
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* no vibration */ }
}

const voices: Record<LangCode, string> = { en: 'en', si: 'si', ta: 'ta' };

/** Read text aloud (Web Speech API). Returns false if no voice for that language exists. */
export function speak(text: string, lang: LangCode): boolean {
  const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  if (!synth) return false;
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(voices[lang]));
  if (!voice && lang !== 'en') return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang ?? 'en-US';
  if (voice) u.voice = voice;
  u.rate = 0.9;
  synth.speak(u);
  return true;
}

export function canSpeak() {
  return typeof speechSynthesis !== 'undefined';
}
