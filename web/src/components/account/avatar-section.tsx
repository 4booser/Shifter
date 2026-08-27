'use client';

import { useEffect, useRef, useState } from 'react';

import { api, apiErrorMessage } from '@/lib/api/http';
import { accountApi } from '@/lib/api/auth';
import { calendarApi } from '@/lib/api/calendar';
import { keyOf, todayKey } from '@/lib/calendar/calendar-date';
import { MEMBER_COLOURS } from '@/lib/api/team';
import { useI18n } from '@/lib/i18n';
import { pushToast } from '@/lib/toast';
import { Alert } from '@/components/ui/bits';
import { Avatar, Weave } from '@/components/ui/avatar';

const PRESET_EMOJI = ['🍸', '🍕', '☕', '🍣', '🥂', '🔪', '🥐', '🛵', '📋', '🫧', '🍰', '🔥'];

/**
 * The face on the profile. A photo is cropped square on the client and
 * leaves the browser as a 256×256 JPEG data URL — the server never sees
 * the original. The weave is grown from the person's own last four weeks,
 * so no two schedules wear the same cloth.
 */
export function AvatarSection({
  name,
  kind,
  data,
  email,
  onChanged,
}: {
  name: string;
  kind: string | null;
  data: string | null;
  email: string | null;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [weaveSeed, setWeaveSeed] = useState<string | null>(null);
  const [presetEmoji, setPresetEmoji] = useState('🍸');
  const [presetColour, setPresetColour] = useState<string>(MEMBER_COLOURS[0]);

  // The seed is the person's real month: 28 digits of daily intensity.
  useEffect(() => {
    const to = todayKey();
    const from = keyOf(new Date(Date.now() - 27 * 86_400_000));

    void calendarApi
      .days(from, to)
      .then((summary) => {
        const peak = Math.max(1, ...summary.days.map((day) => day.earned));
        const byDate = new Map(summary.days.map((day) => [day.date, day.earned]));
        const digits = Array.from({ length: 28 }, (_, index) => {
          const key = keyOf(new Date(Date.now() - (27 - index) * 86_400_000));

          return Math.min(9, Math.round(((byDate.get(key) ?? 0) / peak) * 9));
        }).join('');

        setWeaveSeed(digits);
      })
      .catch(() => setWeaveSeed(String(Date.now() % 997)));
  }, []);

  const save = (nextKind: string | null, nextData: string | null) => {
    setBusy(true);
    setError(null);

    void api('/shifter/v1/account/avatar', { method: 'PUT', body: { kind: nextKind, data: nextData } })
      .then(() => {
        onChanged();
        pushToast({ icon: '🖼️', title: t('Saved') });
      })
      .catch((caught) => setError(apiErrorMessage(caught)))
      .finally(() => setBusy(false));
  };

  const pickPhoto = (picked: File) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        // Centre-crop to a square, shrink to 256, re-encode as JPEG. Twenty
        // lines here spare the server from ever holding a 12MP original.
        const side = Math.min(image.width, image.height);
        const canvas = document.createElement('canvas');

        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        if (ctx === null) return;

        ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 256, 256);

        let quality = 0.82;
        let url = canvas.toDataURL('image/jpeg', quality);

        while (url.length > 64_000 && quality > 0.4) {
          quality -= 0.12;
          url = canvas.toDataURL('image/jpeg', quality);
        }

        save('photo', url);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(picked);
  };

  return (
    <section className="card reveal p-4">
      <header className="mb-3 flex items-center gap-3">
        <Avatar kind={kind} data={data} name={name} size={56} />
        <div>
          <h2 className="text-[0.98rem] font-bold">{t('Your face here')}</h2>
          <p className="field-hint">{t('Shown in the header, the rota, the board and your gig replies.')}</p>
        </div>
        {kind !== null && (
          <button type="button" className="btn btn-quiet btn-sm ml-auto" disabled={busy} onClick={() => save(null, null)}>
            {t('Back to initials')}
          </button>
        )}
      </header>

      {error !== null && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      <EmailRow email={email} onSaved={onChanged} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-(--radius) border border-border p-3">
          <p className="mb-2 text-[0.85rem] font-semibold">{t('A photo')}</p>
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const picked = event.target.files?.[0];

              if (picked !== undefined) pickPhoto(picked);
              event.target.value = '';
            }}
          />
          <button type="button" className="btn w-full" disabled={busy} onClick={() => file.current?.click()}>
            {t('Choose a photo')}
          </button>
          <p className="field-hint mt-1.5">{t('Cropped square and shrunk right in the browser.')}</p>
        </div>

        <div className="rounded-(--radius) border border-border p-3">
          <p className="mb-2 text-[0.85rem] font-semibold">{t('A role badge')}</p>
          <div className="mb-2 flex flex-wrap gap-1">
            {PRESET_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`grid h-8 w-8 place-items-center rounded-full text-[1rem] ${presetEmoji === emoji ? 'bg-(--accent-soft) ring-2 ring-(--accent)' : 'bg-surface-2'}`}
                onClick={() => setPresetEmoji(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="mb-2 flex flex-wrap gap-1">
            {MEMBER_COLOURS.map((colour) => (
              <button
                key={colour}
                type="button"
                aria-label={colour}
                className={`h-6 w-6 rounded-full ${presetColour === colour ? 'ring-2 ring-(--accent) ring-offset-2' : ''}`}
                style={{ background: colour }}
                onClick={() => setPresetColour(colour)}
              />
            ))}
          </div>
          <button type="button" className="btn w-full" disabled={busy} onClick={() => save('preset', `${presetEmoji}|${presetColour}`)}>
            {t('Wear it')}
          </button>
        </div>

        <div className="rounded-(--radius) border border-border p-3">
          <p className="mb-2 text-[0.85rem] font-semibold">{t('Weave of your month')}</p>
          <div className="mb-2 flex items-center gap-2">
            {weaveSeed !== null && <Weave seed={weaveSeed} size={40} />}
            <p className="field-hint">{t('Woven from your last four weeks of shifts — nobody else’s looks like it.')}</p>
          </div>
          <button type="button" className="btn w-full" disabled={busy || weaveSeed === null} onClick={() => weaveSeed !== null && save('weave', weaveSeed)}>
            {t('Weave it')}
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * The recovery address, the only thing standing between a forgotten
 * password and a lost account. Private: it never travels with a gig reply.
 */
function EmailRow({ email, onSaved }: { email: string | null; onSaved: () => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState(email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed = value.trim().toLowerCase() !== (email ?? '');

  const save = () => {
    setBusy(true);
    setError(null);

    void accountApi
      .setEmail(value.trim() === '' ? null : value.trim())
      .then(() => {
        onSaved();
        pushToast({ icon: '✉️', title: t('Saved') });
      })
      .catch((caught) => setError(apiErrorMessage(caught)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="mb-3 rounded-(--radius) border border-border p-3">
      <span className="field-label">{t('Email for password recovery')}</span>
      <div className="mt-1 flex flex-wrap gap-2">
        <input
          type="email"
          inputMode="email"
          autoCapitalize="none"
          className="field-input min-w-48 flex-1"
          placeholder="you@example.com"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="button" className="btn" disabled={busy || !changed} onClick={save}>
          {t('Save')}
        </button>
      </div>
      {error !== null && <p className="mt-1 text-[0.85rem] text-danger">{error}</p>}
      <p className="field-hint mt-1">
        {email === null
          ? t('Without it a forgotten password cannot be recovered. Nobody else ever sees this address.')
          : t('Nobody else ever sees this address — it is only for recovery letters.')}
      </p>
    </div>
  );
}
