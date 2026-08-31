import { useEffect } from 'react';
import { Star } from 'lucide-react';

import { MARK_COLOURS } from '@/lib/calendar/models';
import { usePalette } from '@/lib/settings/palette';
import { cn } from '@/lib/utils';

/**
 * Picking a colour, the same way everywhere it is picked.
 *
 * Twelve to hand covers most choices; the ones somebody keeps coming back to
 * get starred into their own row, which lives on the account rather than in
 * this browser, so a palette chosen on a laptop is waiting on the phone.
 */
export function ColourField({
  label,
  value,
  onPick,
  clearHint = 'без цвета',
}: {
  label: string;
  value: string | null | undefined;
  onPick: (colour: string | null) => void;
  /** What clearing the colour means here — a day loses it, a shift falls back. */
  clearHint?: string;
}) {
  const saved = usePalette((state) => state.colours);
  const loadPalette = usePalette((state) => state.load);
  const keepColour = usePalette((state) => state.save);
  const forgetColour = usePalette((state) => state.forget);

  useEffect(() => loadPalette(), [loadPalette]);

  const picked = value?.toUpperCase() ?? null;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="field-label">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-label={clearHint}
          title={clearHint}
          onClick={() => onPick(null)}
          className={cn(
            'size-6 rounded-full border border-dashed transition-colors',
            picked === null ? 'border-ink' : 'border-border hover:border-border-strong',
          )}
        />
        {MARK_COLOURS.slice(0, 12).map((mark) => (
          <Swatch
            key={mark.value}
            colour={mark.value}
            label={mark.label}
            picked={picked === mark.value}
            onPick={onPick}
          />
        ))}
        {picked !== null && !saved.includes(picked) && (
          <button
            type="button"
            aria-label="Сохранить цвет"
            title="Сохранить в свои"
            onClick={() => keepColour(picked)}
            className="grid size-6 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:text-ink"
          >
            <Star className="size-3" />
          </button>
        )}
      </div>
      {saved.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="field-hint">Мои</span>
          {saved.map((colour) => (
            <Swatch
              key={colour}
              colour={colour}
              label={`${colour} — правой кнопкой убрать`}
              picked={picked === colour}
              onPick={onPick}
              onForget={() => forgetColour(colour)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Swatch({
  colour,
  label,
  picked,
  onPick,
  onForget,
}: {
  colour: string;
  label: string;
  picked: boolean;
  onPick: (colour: string) => void;
  onForget?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      style={{ background: colour }}
      onClick={() => onPick(colour)}
      onContextMenu={
        onForget &&
        ((event) => {
          event.preventDefault();
          onForget();
        })
      }
      className={cn(
        'size-6 rounded-full ring-offset-2 ring-offset-[var(--surface)] transition-all',
        picked ? 'ring-2 ring-ink' : 'hover:scale-110',
      )}
    />
  );
}
