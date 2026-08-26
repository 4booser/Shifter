'use client';

import { useState } from 'react';

import { formatDayLabel, rotationKeys, todayKey } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { pluralWord } from '@/lib/i18n/plural';
import { applyToDates, useCalendar } from '@/lib/store/calendar';
import { Modal } from '@/components/ui/modal';

/** The shapes people actually name when asked what they work. */
const PRESETS = [
  { label: '2/2', on: 2, off: 2 },
  { label: '1/3', on: 1, off: 3 },
  { label: '5/2', on: 5, off: 2 },
  { label: '3/3', on: 3, off: 3 },
];

export function RotationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n();
  const allTemplates = useCalendar((state) => state.templates);
  const templates = allTemplates.filter((template) => !template.archived);

  const [templateId, setTemplateId] = useState<number | null>(null);
  const [on, setOn] = useState(2);
  const [off, setOff] = useState(2);
  const [start, setStart] = useState(todayKey());
  const [span, setSpan] = useState(60);

  const dates = rotationKeys(start, on, off, span);
  const chosen = templates.find((template) => template.id === templateId) ?? null;

  const apply = () => {
    if (chosen === null || dates.length === 0) return;

    void applyToDates(dates, chosen);
    onClose();
  };

  return (
    <Modal open={open} title={t('Fill a rota')} onClose={onClose}>
      {templates.length === 0 ? (
        <p className="field-hint">{t('Create a shift first — a rota needs something to place.')}</p>
      ) : (
        <div className="flex flex-col gap-3.5">
          <label>
            <span className="field-label">{t('Shift')}</span>
            <select
              className="field-input"
              value={templateId ?? ''}
              onChange={(event) => setTemplateId(event.target.value === '' ? null : Number(event.target.value))}
            >
              <option value="" disabled>
                {t('Pick one')}
              </option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} · {template.start_time}–{template.end_time}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="field-label">{t('Pattern')}</span>
            <div className="flex gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={`btn btn-sm ${on === preset.on && off === preset.off ? 'btn-primary' : ''}`}
                  onClick={() => {
                    setOn(preset.on);
                    setOff(preset.off);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label">{t('Days on')}</span>
              <input type="number" min={1} max={31} className="field-input" value={on} onChange={(event) => setOn(Number(event.target.value) || 1)} />
            </label>
            <label>
              <span className="field-label">{t('Days off')}</span>
              <input type="number" min={0} max={31} className="field-input" value={off} onChange={(event) => setOff(Number(event.target.value) || 0)} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label">{t('Starting')}</span>
              <input type="date" className="field-input" value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <label>
              <span className="field-label">{t('For, days')}</span>
              <input type="number" min={1} max={400} className="field-input" value={span} onChange={(event) => setSpan(Number(event.target.value) || 1)} />
            </label>
          </div>

          {dates.length > 0 ? (
            <p className="field-hint">
              {t('Adds')} <strong>{dates.length}</strong> {pluralWord(lang, 'shifts', dates.length)} · {formatDayLabel(dates[0], lang)} —{' '}
              {formatDayLabel(dates[dates.length - 1], lang)}.
            </p>
          ) : (
            <p className="field-hint">{t('Nothing to place with these numbers.')}</p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-quiet" onClick={onClose}>
              {t('Cancel')}
            </button>
            <button type="button" className="btn btn-primary" disabled={chosen === null || dates.length === 0} onClick={apply}>
              {t('Fill calendar')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
