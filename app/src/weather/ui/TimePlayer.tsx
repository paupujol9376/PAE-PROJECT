import { Pause, Play } from 'lucide-preact';
import { getLayer } from '../layers';
import { activeIds, player, reducedMotion, wxPlayer } from '../store';
import { formatColombo, whenOf } from '../timeline';
import { lang } from '../../state';
import { t } from '../../i18n';

const LOCALE = { en: 'en-LK', si: 'si-LK', ta: 'ta-LK' } as const;

/** One timeline for every animated layer: play/pause, scrubber, 1x/2x, "Now", Sri Lanka time. */
export function TimePlayer() {
  const anyAnimated = activeIds.value.some((id) => getLayer(id)?.animated);
  const pl = wxPlayer.value;
  if (!anyAnimated || pl.steps.length < 2) return null;
  const time = pl.steps[pl.index];
  const when = whenOf(time, Date.now(), 20 * 60_000);
  const motionOff = reducedMotion.value;
  return (
    <div class="wx-player" role="group" aria-label={t('wx.time')}>
      <button class="icon-btn" disabled={motionOff} aria-label={pl.playing ? t('wx.pause') : t('wx.play')} title={motionOff ? t('wx.motionOff') : undefined}
        onClick={() => (pl.playing ? player.pause() : player.play())}>{pl.playing ? <Pause size={20} /> : <Play size={20} />}</button>
      <input class="wx-scrub" type="range" min="0" max={String(pl.steps.length - 1)} step="1" value={pl.index} aria-label={t('wx.time')}
        aria-valuetext={formatColombo(time, LOCALE[lang.value])} onInput={(e) => { player.pause(); player.seek(Number((e.target as HTMLInputElement).value)); }} />
      <span class={`wx-when when-${when}`}>{t(`wx.when.${when}`)}</span>
      <time class="wx-clock" dateTime={new Date(time).toISOString()}>{formatColombo(time, LOCALE[lang.value])}</time>
      <button class="chip" aria-pressed={pl.speed === 2} aria-label={`${t('wx.speed')} ${pl.speed}x`} onClick={() => player.setSpeed(pl.speed === 1 ? 2 : 1)}>{pl.speed}x</button>
      <button class="chip" onClick={() => player.goNow(Date.now())}>{t('wx.now')}</button>
    </div>
  );
}
