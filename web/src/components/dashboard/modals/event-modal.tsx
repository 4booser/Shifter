'use client';

import { useEffect, useRef, useState } from 'react';

import { CalendarEvent, EMOJI_GROUPS, EventKind, MARK_COLOURS } from '@/lib/calendar/models';
import { apiErrorMessage } from '@/lib/api/http';
import { useI18n } from '@/lib/i18n';
import { pluralWord } from '@/lib/i18n/plural';
import { catalogueActions } from '@/lib/store/calendar';
import { Alert, SwatchRow } from '@/components/ui/bits';
import { Modal } from '@/components/ui/modal';

/**
 * Creates or edits one event. The end date defaults to the start and moves
 * with it while they match, so a single day stays a single field until
 * somebody actually wants a range.
 */
export function EventModal({
  open,
  editing,
  date,
  onClose,
}: {
  open: boolean;
  editing: CalendarEvent | null;
  date: string | null;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState<string | null>(null);
  const [colour, setColour] = useState(MARK_COLOURS[0].value);
  const [cost, setCost] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<EventKind>('ordinary');
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [repeatUntil, setRepeatUntil] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      loadedFor.current = null;

      return;
    }

    const key = editing === null ? `new:${date}` : `edit:${editing.id}`;

    if (key === loadedFor.current) return;

    loadedFor.current = key;
    setError(null);

    if (editing === null) {
      const start = date ?? '';

      setName('');
      setSymbol(null);
      setColour(MARK_COLOURS[0].value);
      setCost(0);
      setFrom(start);
      setTo(start);
      setAllDay(true);
      setStartTime('09:00');
      setEndTime('18:00');
      setNote('');
      setKind('ordinary');
      setRepeatDays([]);
      setRepeatUntil('');

      return;
    }

    setName(editing.name);
    setSymbol(editing.symbol);
    setColour(editing.colour);
    setCost(editing.cost);
    setFrom(editing.start_date);
    setTo(editing.end_date);
    setAllDay(editing.start_time === null);
    setStartTime(editing.start_time ?? '09:00');
    setEndTime(editing.end_time ?? '18:00');
    setNote(editing.note ?? '');
    setKind(editing.kind ?? 'ordinary');
    setRepeatDays(
      editing.repeat_weekdays === null
        ? []
        : editing.repeat_weekdays.split(',').map(Number).filter((day) => day >= 0 && day <= 6),
    );
    setRepeatUntil(editing.repeat_until ?? '');
  }, [open, editing, date]);

  const days =
    from === '' || to === '' || to < from
      ? 0
      : (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;

  const repeats = repeatDays.length > 0;
  const valid = name.trim().length > 0 && (repeats ? from !== '' : days > 0);

  const submit = async () => {
    if (!valid || saving) return;

    setSaving(true);
    setError(null);

    try {
      await catalogueActions.saveEvent(
        {
          name: name.trim(),
          symbol,
          colour,
          start_date: from,
          // A repeating event is its anchor plus the rule; the server pins
          // the range to one day either way.
          end_date: repeats ? from : to,
          start_time: allDay ? null : startTime,
          end_time: allDay ? null : endTime,
          note: note.trim() === '' ? null : note.trim(),
          kind,
          repeat_weekdays: repeats ? [...repeatDays].sort((a, b) => a - b).join(',') : null,
          repeat_until: repeats && repeatUntil !== '' ? repeatUntil : null,
          cost,
          template_id: editing?.template_id ?? null,
        },
        editing?.id ?? null,
      );
      onClose();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={t(editing === null ? 'New event' : 'Edit event')} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        {error && <Alert>{error}</Alert>}

        <label>
          <span className="field-label">{t('Name')}</span>
          <input
            className="field-input"
            maxLength={80}
            value={name}
            placeholder={t('Holiday, course, day off…')}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <div>
          <span className="field-label">{t('Colour')}</span>
          <SwatchRow colours={MARK_COLOURS} saveable value={colour} onPick={setColour} />
        </div>

        <label>
          <span className="field-label">{t('Costs')}</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            className="field-input"
            value={cost}
            onChange={(event) => setCost(Number(event.target.value))}
          />
          <span className="field-hint">
            {t('Counted apart from what you earn — never subtracted from it.')}
          </span>
        </label>

        <div>
          <span className="field-label">{t('Badge')}</span>
          <div className="flex max-h-36 flex-col gap-2 overflow-y-auto rounded-(--radius) border border-border p-2">
            {EMOJI_GROUPS.map((group) => (
              <div key={group.label}>
                <span className="field-hint">{t(group.label)}</span>
                <div className="flex flex-wrap gap-0.5">
                  {group.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={`grid h-7 w-7 place-items-center rounded text-[0.95rem] hover:bg-surface-2 ${
                        symbol === emoji ? 'bg-(--accent-soft) ring-1 ring-(--accent)' : ''
                      }`}
                      onClick={() => setSymbol((current) => (current === emoji ? null : emoji))}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">{t('From')}</span>
            <input
              type="date"
              className="field-input"
              value={from}
              onChange={(event) => {
                // Dragging the start past the end takes the end with it.
                const value = event.target.value;
                const wasSingleDay = from === to;

                setFrom(value);

                if (wasSingleDay || to < value) setTo(value);
              }}
            />
          </label>
          {!repeats && (<label>
            <span className="field-label">{t('To')}</span>
            <input type="date" className="field-input" min={from} value={to} onChange={(event) => setTo(event.target.value)} />
          </label>)}

        <div>
          <span className="field-label">{t('Repeat on')}</span>
          <div className="flex gap-1">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, weekday) => (
              <button
                key={label}
                type="button"
                className={`h-8 flex-1 rounded-(--radius) border text-[0.72rem] font-semibold transition-colors ${
                  repeatDays.includes(weekday)
                    ? 'border-(--accent) bg-(--accent) text-(--accent-ink)'
                    : 'border-border text-muted hover:border-border-strong'
                }`}
                onClick={() =>
                  setRepeatDays((current) =>
                    current.includes(weekday) ? current.filter((day) => day !== weekday) : [...current, weekday],
                  )
                }
              >
                {t(label)}
              </button>
            ))}
          </div>
          {repeats && (
            <label className="mt-2 block">
              <span className="field-hint">{t('Until (leave empty to repeat forever)')}</span>
              <input
                type="date"
                className="field-input !w-40"
                value={repeatUntil}
                min={from}
                onChange={(event) => setRepeatUntil(event.target.value)}
              />
            </label>
          )}
        </div>
        </div>

        <label className="flex items-center gap-2 text-[0.88rem]">
          <input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />
          {t('All day')}
        </label>

        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label">{t('Starts')}</span>
              <input type="time" className="field-input" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </label>
            <label>
              <span className="field-label">{t('Ends')}</span>
              <input type="time" className="field-input" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </label>
          </div>
        )}


        <div>
          <span className="field-label">{t('Kind of day')}</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {([
              { id: 'ordinary' as const, emoji: '📌', label: 'Ordinary' },
              { id: 'vacation' as const, emoji: '🏝️', label: 'Vacation' },
              { id: 'sick' as const, emoji: '🤒', label: 'Sick leave' },
              { id: 'dayoff' as const, emoji: '🔁', label: 'Day off' },
            ]).map((option) => (
              <button
                key={option.id}
                type="button"
                className={`chip ${kind === option.id ? 'border-(--accent) bg-(--accent-soft) text-(--accent)' : ''}`}
                onClick={() => setKind(option.id)}
              >
                {option.emoji} {t(option.label)}
              </button>
            ))}
          </div>
          {(kind === 'vacation' || kind === 'sick') && (
            <p className="field-hint mt-1">{t('These days leave the pace alone — a holiday is not a slow week.')}</p>
          )}
        </div>
        <label>
          <span className="field-label">{t('Note')}</span>
          <textarea rows={2} maxLength={500} className="field-input" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>

        {days > 1 && (
          <p className="field-hint">
            {t('Covers')} <strong>{days}</strong> {pluralWord(lang, 'days', days)}.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="button" className="btn btn-primary" disabled={!valid || saving} onClick={() => void submit()}>
            {t(saving ? 'Saving…' : 'Save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
