'use client';

import { useEffect, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import { EMOJI_GROUPS, EventKind, EventTemplate, MARK_COLOURS } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { catalogueActions } from '@/lib/store/calendar';
import { Alert, SwatchRow } from '@/components/ui/bits';
import { Modal } from '@/components/ui/modal';

const KINDS: { value: EventKind; label: string }[] = [
  { value: 'ordinary', label: 'Ordinary' },
  { value: 'vacation', label: 'Leave' },
  { value: 'sick', label: 'Sick' },
  { value: 'dayoff', label: 'Day off' },
];

/**
 * A repeatable thing that is not work: «английский», «вождение», the gym.
 *
 * The money here runs the other way from everywhere else in the app, and the
 * form says so in as many words — what the lesson costs is never added to
 * what the week earned, it sits beside it.
 */
export function EventTemplateModal({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: EventTemplate | null;
  onClose: () => void;
}) {
  const { t } = useI18n();

  const [name, setName] = useState('');
  const [badge, setBadge] = useState<string | null>(null);
  const [colour, setColour] = useState(MARK_COLOURS[0].value);
  const [kind, setKind] = useState<EventKind>('ordinary');
  const [timed, setTimed] = useState(true);
  const [start, setStart] = useState('19:00');
  const [end, setEnd] = useState('20:30');
  const [priced, setPriced] = useState(false);
  const [cost, setCost] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setName(editing?.name ?? '');
    setBadge(editing?.symbol ?? null);
    setColour(editing?.colour ?? MARK_COLOURS[0].value);
    setKind(editing?.kind ?? 'ordinary');
    setTimed(editing === null ? true : editing.start_time !== null);
    setStart(editing?.start_time ?? '19:00');
    setEnd(editing?.end_time ?? '20:30');
    // Null and zero are different answers: nothing recorded, versus somebody
    // saying it was free. The switch is what tells them apart.
    setPriced(editing === null ? false : editing.cost !== null);
    setCost(editing?.cost ?? 0);
  }, [open, editing]);

  const submit = async () => {
    if (name.trim() === '') return;

    try {
      await catalogueActions.saveEventTemplate(
        {
          name: name.trim(),
          symbol: badge,
          colour,
          kind,
          start_time: timed ? start : null,
          end_time: timed ? end : null,
          cost: priced ? cost : null,
        },
        editing?.id ?? null,
      );
      onClose();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  };

  return (
    <Modal
      open={open}
      title={t(editing === null ? 'New event type' : 'Edit event type')}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3.5">
        {error && <Alert>{error}</Alert>}

        <label>
          <span className="field-label">{t('Name')}</span>
          <input
            className="field-input"
            maxLength={60}
            value={name}
            placeholder={t('English, driving, the gym…')}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <div>
          <span className="field-label">{t('Colour')}</span>
          <SwatchRow colours={MARK_COLOURS} saveable value={colour} onPick={setColour} />
        </div>

        <div>
          <span className="field-label">{t('Badge')}</span>
          <div className="flex max-h-32 flex-col gap-2 overflow-y-auto rounded-(--radius) border border-border p-2">
            {EMOJI_GROUPS.map((group) => (
              <div key={group.label}>
                <span className="field-hint">{t(group.label)}</span>
                <div className="flex flex-wrap gap-0.5">
                  {group.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={`grid h-7 w-7 place-items-center rounded text-[0.95rem] hover:bg-surface-2 ${
                        badge === emoji ? 'bg-(--accent-soft) ring-1 ring-(--accent)' : ''
                      }`}
                      onClick={() => setBadge((current) => (current === emoji ? null : emoji))}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={timed} onChange={(event) => setTimed(event.target.checked)} />
          <span className="text-[0.88rem]">{t('It happens at a set time')}</span>
        </label>

        {timed && (
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label">{t('From')}</span>
              <input
                type="time"
                className="field-input"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label>
              <span className="field-label">{t('To')}</span>
              <input
                type="time"
                className="field-input"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
          </div>
        )}

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={priced} onChange={(event) => setPriced(event.target.checked)} />
          <span className="text-[0.88rem]">{t('It costs money')}</span>
        </label>

        {priced && (
          <label>
            <span className="field-label">{t('Costs, each time')}</span>
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
        )}

        <div>
          <span className="field-label">{t('Kind')}</span>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`btn btn-sm ${kind === option.value ? 'btn-primary' : ''}`}
                aria-pressed={kind === option.value}
                onClick={() => setKind(option.value)}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
          <span className="field-hint">
            {t('Leave and sickness are left out of your pace; ordinary ones are not.')}
          </span>
        </div>

        <div className="flex justify-between gap-2">
          {editing !== null && (
            <button
              type="button"
              className="btn btn-quiet text-danger"
              onClick={async () => {
                try {
                  await catalogueActions.deleteEventTemplate(editing.id);
                  onClose();
                } catch (caught) {
                  setError(apiErrorMessage(caught));
                }
              }}
            >
              {t('Delete')}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary ml-auto"
            disabled={name.trim() === ''}
            onClick={() => void submit()}
          >
            {t('Save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
