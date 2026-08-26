'use client';

import { useEffect, useMemo, useState } from 'react';

import { fireConfetti } from '@/lib/fx';
import { useI18n } from '@/lib/i18n';
import { SHIFT_DONE_EVENT, ShiftDone, formatElapsed } from '@/lib/live/live-shift';
import { useMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { saveDay, useCalendar } from '@/lib/store/calendar';
import { toSavePayload } from '@/lib/calendar/models';
import { CountUp, Money } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';

/**
 * The clock-out moment, given the screen it deserves: the number, the day's
 * rank in the month, and the two things people actually do right after a
 * shift — write down the tips and show somebody. Closing it is the only way
 * on; nothing here blocks the save, which already happened.
 */
export function ShiftDoneOverlay() {
  const { t, lang } = useI18n();
  const { format } = useMoney();
  const hideAmounts = useSettings((state) => state.settings.hideAmounts);
  const days = useCalendar((state) => state.days);

  const [done, setDone] = useState<ShiftDone | null>(null);
  const [tips, setTips] = useState('');
  const [tipsSaved, setTipsSaved] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const onDone = (event: Event) => {
      setDone((event as CustomEvent<ShiftDone>).detail);
      setTips('');
      setTipsSaved(false);
      fireConfetti({ y: 0.35, count: 160 });

      // A two-note chime and a buzz, only for those who asked. Synthesised
      // on the spot: no asset, no fetch, no licence.
      if (useSettings.getState().settings.clockOutChime) {
        try {
          const audio = new AudioContext();

          for (const [at, frequency] of [[0, 660], [0.12, 880]] as const) {
            const osc = audio.createOscillator();
            const gain = audio.createGain();

            osc.frequency.value = frequency;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.001, audio.currentTime + at);
            gain.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + at + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + at + 0.35);
            osc.connect(gain).connect(audio.destination);
            osc.start(audio.currentTime + at);
            osc.stop(audio.currentTime + at + 0.4);
          }
        } catch {
          // No audio is never a problem worth surfacing.
        }

        navigator.vibrate?.([60, 40, 90]);
      }
    };

    addEventListener(SHIFT_DONE_EVENT, onDone);

    return () => removeEventListener(SHIFT_DONE_EVENT, onDone);
  }, []);

  /** Where this day now sits among the month's worked days. */
  const rank = useMemo(() => {
    if (done === null) return null;

    const month = done.date.slice(0, 7);
    const earnings = [...days.values()]
      .filter((day) => day.date.startsWith(month) && day.earned > 0)
      .map((day) => day.earned)
      .sort((a, b) => b - a);

    const mine = days.get(done.date)?.earned ?? 0;

    if (earnings.length < 3 || mine <= 0) return null;

    return earnings.findIndex((value) => value <= mine) + 1;
  }, [done, days]);

  if (done === null) return null;

  // Paid hours price the hour; the wall clock only prices it when the shift
  // has no paid hours at all — thirteen seconds of a day rate is not a wage.
  const perHour =
    done.hours > 0
      ? done.earned / done.hours
      : done.elapsed > 0
        ? done.earned / (done.elapsed / 3_600_000)
        : 0;

  const addTips = async () => {
    const amount = Number(tips.replace(',', '.'));

    if (!Number.isFinite(amount) || amount <= 0) return;

    const day = days.get(done.date);
    const payload = toSavePayload(day);

    payload.tips = (payload.tips ?? 0) + amount;
    await saveDay(done.date, payload);
    setTipsSaved(true);
  };

  const share = async () => {
    setSharing(true);

    try {
      const blob = await drawDoneCard({
        title: t('Shift finished'),
        name: done.name,
        date: new Date(`${done.date}T00:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'long' }),
        earned: hideAmounts ? '•••' : format(done.earned),
        clock: formatElapsed(done.elapsed),
        perHour: hideAmounts ? '' : `${format(perHour)} ${t('per hour')}`,
      });
      const file = new File([blob], 'shift.png', { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = 'shift.png';
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // A cancelled share sheet is not an error worth reporting.
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="done-scene" role="dialog" aria-label={t('Shift finished')}>
      <div className="done-card">
        <span className="text-[2.6rem] leading-none">🎉</span>
        <h2 className="mt-2 text-[1.25rem] font-bold">{t('Shift finished')}</h2>
        <p className="field-hint">
          {done.name} · {formatElapsed(done.elapsed)}
        </p>

        <div className="my-4 text-[2.6rem] font-bold tracking-tight text-good tabular">
          <CountUp value={done.earned} />
        </div>

        <div className="flex justify-center gap-5 text-center text-[0.85rem]">
          {done.hours > 0 && (
            <span>
              <strong className="block tabular">{format(perHour)}</strong>
              <span className="field-hint">{t('per hour')}</span>
            </span>
          )}
          <span>
            <strong className="block tabular">{done.hours}h</strong>
            <span className="field-hint">{t('paid')}</span>
          </span>
          {rank !== null && (
            <span>
              <strong className="block tabular">{rank === 1 ? '🥇' : `#${rank}`}</strong>
              <span className="field-hint">{t('day of the month')}</span>
            </span>
          )}
        </div>

        {/* Tips, while they are still in the pocket and the number is known. */}
        <div className="mt-5 border-t border-border pt-4">
          {tipsSaved ? (
            <p className="text-[0.9rem] font-semibold text-good">
              ✓ {t('Tips added')}: <Money value={Number(tips.replace(',', '.'))} />
            </p>
          ) : (
            <>
              <p className="field-hint mb-2">{t('Tips tonight?')}</p>
              <div className="flex justify-center gap-1.5">
                {[100, 200, 500].map((amount) => (
                  <button key={amount} type="button" className="btn btn-sm" onClick={() => setTips(`${amount}`)}>
                    +{amount}
                  </button>
                ))}
                <input
                  inputMode="decimal"
                  className="field-input !w-20 text-center"
                  placeholder="0"
                  value={tips}
                  onChange={(event) => setTips(event.target.value)}
                />
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void addTips()}>
                  <Icon name="check" size={13} />
                </button>
              </div>
            </>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button type="button" className="btn flex-1" disabled={sharing} onClick={() => void share()}>
            <Icon name="download" size={14} />
            {t('Share')}
          </button>
          <button type="button" className="btn btn-primary flex-1" onClick={() => setDone(null)}>
            {t('Done')}
          </button>
        </div>
      </div>
    </div>
  );
}

interface DoneCard {
  title: string;
  name: string;
  date: string;
  earned: string;
  clock: string;
  perHour: string;
}

/** A 1080×1350 story card drawn by hand; no DOM screenshotting involved. */
function drawDoneCard(data: DoneCard): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');

  canvas.width = W;
  canvas.height = H;

  const context = canvas.getContext('2d');

  if (context === null) return Promise.reject(new Error('no canvas'));

  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim() || '#4F46E5';

  context.fillStyle = '#14151a';
  context.fillRect(0, 0, W, H);

  // Two soft accent glows, echoing the app's auth backdrop.
  for (const [x, y] of [
    [W * 0.15, H * 0.12],
    [W * 0.9, H * 0.85],
  ]) {
    const glow = context.createRadialGradient(x, y, 0, x, y, 640);

    glow.addColorStop(0, `${accent}55`);
    glow.addColorStop(1, `${accent}00`);
    context.fillStyle = glow;
    context.fillRect(0, 0, W, H);
  }

  context.textAlign = 'center';
  context.fillStyle = 'rgba(255,255,255,0.65)';
  context.font = '600 44px system-ui, -apple-system, sans-serif';
  context.fillText(data.title.toUpperCase(), W / 2, 220);

  context.font = '86px system-ui';
  context.fillText('🎉', W / 2, 400);

  context.fillStyle = '#fff';
  context.font = '700 150px system-ui, -apple-system, sans-serif';
  context.fillText(data.earned, W / 2, 640);

  context.fillStyle = 'rgba(255,255,255,0.85)';
  context.font = '600 54px system-ui, -apple-system, sans-serif';
  context.fillText(data.name, W / 2, 760);

  context.fillStyle = 'rgba(255,255,255,0.55)';
  context.font = '46px system-ui, -apple-system, sans-serif';
  context.fillText(`${data.date} · ${data.clock}`, W / 2, 840);

  if (data.perHour !== '') {
    context.fillText(data.perHour, W / 2, 910);
  }

  context.fillStyle = accent;
  context.beginPath();
  context.roundRect(W / 2 - 130, 1150, 260, 88, 44);
  context.fill();
  context.fillStyle = '#fff';
  context.font = '700 44px system-ui, -apple-system, sans-serif';
  context.fillText('Shifter', W / 2, 1208);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob === null ? reject(new Error('toBlob')) : resolve(blob)), 'image/png'),
  );
}
