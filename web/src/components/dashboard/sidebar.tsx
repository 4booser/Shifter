'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { daysToCsv, downloadCsv } from '@/lib/calendar/csv-export';
import { averagesFor, change } from '@/lib/calendar/insights';
import { EventTemplate, SalesPosition, ShiftTemplate, WorkLocation, rateLabel } from '@/lib/calendar/models';
import { todayKey } from '@/lib/calendar/calendar-date';
import { buildIcs, downloadIcs } from '@/lib/export/ics';
import { Rota, teamApi } from '@/lib/api/team';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';
import {
  SUMMARY_PERIODS,
  calendarActions,
  catalogueActions,
  copyPreviousWeek,
  summaryRange,
  useCalendar,
} from '@/lib/store/calendar';
import { Delta, Money } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';
import { Teach } from '@/components/ui/teach';
import { ImportModal } from './modals/import-modal';
import { PhotoImportModal } from './modals/photo-import-modal';
import { IcsImportModal } from './modals/ics-import-modal';
import { ForeignImportModal } from './modals/foreign-import-modal';
import { LocationModal } from './modals/location-modal';
import { PatternModal } from './modals/pattern-modal';
import { PayoutModal } from './modals/payout-modal';
import { RotationModal } from './modals/rotation-modal';
import { SalesModal } from './modals/sales-modal';
import { SchemeModal } from './modals/scheme-modal';
import { EventTemplateModal } from './modals/event-template-modal';
import { ShiftModal } from './modals/shift-modal';
import { confirmDeleteLocation } from './modals/location-delete';

export function Sidebar() {
  const { t } = useI18n();
  const { format } = useMoney();
  const state = useCalendar();

  const templates = state.templates.filter((template) => !template.archived);
  const positions = state.positions.filter((position) => !position.archived);
  const locations = state.locations.filter((location) => !location.archived);
  const archivedTemplates = state.templates.filter((template) => template.archived);
  const eventTypes = state.eventTemplates.filter((item) => !item.archived);
  const archivedPositions = state.positions.filter((position) => position.archived);

  const [modal, setModal] = useState<null | 'shift' | 'event' | 'sales' | 'location' | 'pattern' | 'rotation' | 'scheme' | 'payout' | 'import' | 'photo' | 'ics' | 'foreign'>(null);
  const [editingShift, setEditingShift] = useState<ShiftTemplate | null>(null);
  const [editingEventType, setEditingEventType] = useState<EventTemplate | null>(null);
  const [editingPosition, setEditingPosition] = useState<SalesPosition | null>(null);
  const [editingLocation, setEditingLocation] = useState<WorkLocation | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const summary = state.summary;
  const previous = state.previousSummary;
  const averages = averagesFor(summary);
  const before = averagesFor(previous);

  const exportCsv = () => {
    const range = summaryRange();

    downloadCsv(`shifter-${range.from}-${range.to}.csv`, daysToCsv(summary.days));
  };

  const exportIcs = () => {
    const range = summaryRange();

    downloadIcs(
      `shifter-${range.from}-${range.to}.ics`,
      buildIcs({ days: summary.days, events: state.events, calendarName: 'Shifter' }),
    );
  };

  return (
    <aside className="order-3 flex w-full flex-none flex-col gap-4 lg:order-none lg:w-64 xl:w-72" data-tour="sidebar">
      {/* ==== Places ==== */}
      <section className="card p-3.5">
        <SectionHead
          title={t('Places')}
          onAdd={() => {
            setEditingLocation(null);
            setModal('location');
          }}
        />

        {locations.length === 0 ? (
          <Teach
            title={t('A place is where the money comes from and when.')}
            example={[
              t('Бар Дым · 10-го и 25-го'),
              t('overtime after 40 h, ×1.5'),
              `${t('night hours ×1.3')} · ${t('meal −80')}`,
            ]}
            action={{
              label: t('Add a place'),
              onClick: () => {
                setEditingLocation(null);
                setModal('location');
              },
            }}
          />
        ) : (
          <ul className="flex flex-col gap-0.5">
            {locations.map((location) => (
              <li key={location.id} className="group flex items-center gap-2 rounded-(--radius) px-1.5 py-1 hover:bg-surface-2">
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: location.colour }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.86rem] font-medium">{location.name}</span>
                  <span className="field-hint">{t(location.pay_period)}</span>
                </span>
                <span className="row-actions gap-0.5">
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    aria-label={t('Edit')}
                    onClick={() => {
                      setEditingLocation(location);
                      setModal('location');
                    }}
                  >
                    <Icon name="brush" size={12} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm btn-danger"
                    aria-label={t('Delete')}
                    onClick={() => confirmDeleteLocation(t, location)}
                  >
                    <Icon name="trash" size={12} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ==== Shifts palette ==== */}
      <section className="card p-3.5">
        <SectionHead
          title={t('Shifts')}
          onAdd={() => {
            setEditingShift(null);
            setModal('shift');
          }}
        />

        {templates.length === 0 ? (
          <Teach
            title={t('A shift is one working day in full: hours, rate, break.')}
            example={[
              t('Вечер · 16:00–02:00 · break 30 min'),
              t('180 / hour × 9.5 h'),
              t('= 1 710 ₴ for the day'),
            ]}
            action={{
              label: t('Add a shift'),
              onClick: () => {
                setEditingShift(null);
                setModal('shift');
              },
            }}
          />
        ) : (
          /* Five rows, then the list scrolls inside itself: the palettes must
             not decide the column's height — the columns line up instead. */
          <ul className="flex max-h-[12.5rem] flex-col gap-1 overflow-y-auto pr-1">
            {templates.map((template) => {
              const active = state.brush?.id === template.id;

              return (
                <li key={template.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-(--radius) border px-2 py-1.5 text-left transition-colors ${
                      active ? 'border-(--accent) bg-(--accent-soft)' : 'border-transparent hover:bg-surface-2'
                    }`}
                    aria-pressed={active}
                    onClick={() => calendarActions.toggleBrush(template)}
                  >
                    <span
                      className="grid h-7 w-7 flex-none place-items-center rounded-lg text-[0.9rem]"
                      style={{
                        background: template.effective_colour
                          ? `color-mix(in srgb, ${template.effective_colour} 25%, transparent)`
                          : 'var(--surface-2)',
                      }}
                    >
                      {template.symbol ?? template.name.charAt(0)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[0.86rem] font-medium">{template.name}</span>
                      {/* Each dot rides with the figure before it, so a
                          wrapped line never opens on a separator. */}
                      <span className="field-hint tabular">
                        {template.start_time}–{template.end_time}
                        {'\u00A0· '}
                        {template.hours} {t('h')}
                        {'\u00A0· '}
                        {rateLabel(template, t)}
                      </span>
                    </span>
                  </button>
                  <span className="row-actions flex-none flex-col gap-0.5">
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      aria-label={t('Edit')}
                      onClick={() => {
                        setEditingShift(template);
                        setModal('shift');
                      }}
                    >
                      <Icon name="brush" size={12} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      aria-label={t('Archive')}
                      onClick={() => void catalogueActions.archiveShift(template.id, true)}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {templates.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {[
              { icon: 'brush', label: 'Weekly pattern', act: () => setModal('pattern') },
              { icon: 'repeat', label: 'Fill a rota', act: () => setModal('rotation') },
              { icon: 'sliders', label: 'Colour schemes', act: () => setModal('scheme') },
              { icon: 'calendar', label: 'Repeat last week', act: copyPreviousWeek },
            ].map((action) => (
              <button
                key={action.label}
                type="button"
                className="btn btn-sm !justify-start !whitespace-normal !py-1.5 text-left leading-tight"
                onClick={action.act}
              >
                <Icon name={action.icon} size={13} />
                {t(action.label)}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ==== Event palette ==== */}
      <section className="card p-3.5">
        <SectionHead
          title={t('Events')}
          onAdd={() => {
            setEditingEventType(null);
            setModal('event');
          }}
        />

        {eventTypes.length === 0 ? (
          <Teach
            title={t('Everything that is not work: English, driving, the gym.')}
            example={[
              t('Английский · Tue and Thu · 19:00–20:30'),
              t('400 ₴ each time'),
              t('= 3 200 ₴ a month, counted apart from earnings'),
            ]}
            action={{
              label: t('Add an event type'),
              onClick: () => {
                setEditingEventType(null);
                setModal('event');
              },
            }}
          />
        ) : (
          <ul className="flex max-h-[12.5rem] flex-col gap-1 overflow-y-auto pr-1">
            {eventTypes.map((item) => {
              const active = state.eventBrush?.id === item.id;

              return (
                <li key={item.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-(--radius) border px-2 py-1.5 text-left transition-colors ${
                      active ? 'border-(--accent) bg-(--accent-soft)' : 'border-transparent hover:bg-surface-2'
                    }`}
                    aria-pressed={active}
                    onClick={() => calendarActions.toggleEventBrush(item)}
                  >
                    <span
                      className="grid h-7 w-7 flex-none place-items-center rounded-lg text-[0.9rem]"
                      style={{ background: `color-mix(in srgb, ${item.colour} 25%, transparent)` }}
                    >
                      {item.symbol ?? item.name.charAt(0)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[0.86rem] font-medium">{item.name}</span>
                      <span className="field-hint tabular">
                        {item.start_time === null
                          ? t('all day')
                          : `${item.start_time}–${item.end_time} · ${item.hours} ${t('h')}`}
                        {/* Money that leaves, marked as such so it can never be
                            mistaken for a line of earnings. */}
                        {item.cost !== null && <> · −{format(item.cost)}</>}
                      </span>
                    </span>
                  </button>
                  <span className="row-actions flex-none flex-col gap-0.5">
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      aria-label={t('Edit')}
                      onClick={() => {
                        setEditingEventType(item);
                        setModal('event');
                      }}
                    >
                      <Icon name="brush" size={12} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      aria-label={t('Archive')}
                      onClick={() => void catalogueActions.archiveEventTemplate(item.id, true)}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ==== Sales positions ==== */}
      <section className="card p-3.5">
        <SectionHead
          title={t('Sales')}
          onAdd={() => {
            setEditingPosition(null);
            setModal('sales');
          }}
        />

        {positions.length === 0 ? (
          <Teach
            title={t('A position is something you sell and keep a share of.')}
            example={[
              t('Кальян · 350 ₴ · 5%'),
              t('5 sold in an evening'),
              t('= 87.50 ₴ on top of the shift'),
            ]}
            action={{
              label: t('Add a position'),
              onClick: () => {
                setEditingPosition(null);
                setModal('sales');
              },
            }}
          />
        ) : (
          <ul className="flex flex-col gap-0.5">
            {positions.map((position) => (
              <li key={position.id} className="group flex items-center gap-2 rounded-(--radius) px-1.5 py-1 hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.86rem] font-medium">{position.name}</span>
                  <span className="field-hint tabular">
                    {position.price} · {position.percentage ?? 0}%
                  </span>
                </span>
                <span className="row-actions gap-0.5">
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    aria-label={t('Edit')}
                    onClick={() => {
                      setEditingPosition(position);
                      setModal('sales');
                    }}
                  >
                    <Icon name="brush" size={12} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    aria-label={t('Archive')}
                    onClick={() => void catalogueActions.archivePosition(position.id, true)}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ==== Archive ==== */}
      {(archivedTemplates.length > 0 || archivedPositions.length > 0) && (
        <section className="card p-3.5">
          <button type="button" className="btn btn-quiet btn-sm w-full" onClick={() => setShowArchive((open) => !open)}>
            {t(showArchive ? 'Hide archived' : 'Show archived')} ({archivedTemplates.length + archivedPositions.length})
          </button>

          {showArchive && (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {archivedTemplates.map((template) => (
                <li key={`shift-${template.id}`} className="flex items-center gap-2 px-1.5 py-1 opacity-70">
                  <span className="min-w-0 flex-1 truncate text-[0.85rem]">{template.name}</span>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => void catalogueActions.archiveShift(template.id, false)}>
                    {t('Restore')}
                  </button>
                </li>
              ))}
              {archivedPositions.map((position) => (
                <li key={`sale-${position.id}`} className="flex items-center gap-2 px-1.5 py-1 opacity-70">
                  <span className="min-w-0 flex-1 truncate text-[0.85rem]">{position.name}</span>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => void catalogueActions.archivePosition(position.id, false)}>
                    {t('Restore')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm btn-danger"
                    aria-label={t('Delete this position')}
                    onClick={() => {
                      if (window.confirm(`${position.name} — ${t('Delete this? It cannot be undone.')}`)) {
                        void catalogueActions.deletePosition(position.id);
                      }
                    }}
                  >
                    <Icon name="trash" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ==== Earnings ==== */}
      <section className="card p-3.5">
        <h2 className="mb-2 text-[0.95rem] font-bold">{t('Earnings')}</h2>

        <div className="mb-3 grid grid-cols-2 gap-1 rounded-(--radius) border border-border bg-surface-2 p-1">
          {SUMMARY_PERIODS.map((period) => (
            <button
              key={period.value}
              type="button"
              className={`seg-btn justify-center text-center !text-[0.76rem] ${state.summaryPeriod === period.value ? 'is-active' : ''}`}
              onClick={() => calendarActions.setSummaryPeriod(period.value)}
            >
              {t(period.label)}
            </button>
          ))}
        </div>

        <dl className="flex flex-col gap-1 text-[0.85rem]">
          <Row label={t('Days worked')}>{summary.days_worked}</Row>
          <Row label={t('Hours')}>
            <span className="tabular">{Math.round(summary.hours * 100) / 100}</span>{' '}
            <Delta percent={change(summary.hours, previous.hours)} />
          </Row>
          <Row label={t('Shifts')}>
            <Money value={summary.shifts_earned} />
          </Row>
          {summary.overtime_hours > 0 && (
            <Row label={`${t('Overtime')} · ${Math.round(summary.overtime_hours * 10) / 10} ${t('h')}`}>
              +<Money value={summary.overtime_earned} />
            </Row>
          )}
          {summary.period_earned > 0 && (
            <Row label={t('Salary')}>
              <Money value={summary.period_earned} />
            </Row>
          )}
          <Row label={t('Sales')}>
            <Money value={summary.sales_earned} />
          </Row>
          <Row label={t('Tips')}>
            <Money value={summary.tips_earned} /> <Delta percent={change(summary.tips_earned, previous.tips_earned)} />
          </Row>
          <div className="flex items-center justify-between gap-2 border-t border-border pt-1.5 text-[0.95rem] font-bold">
            <dt>{t('Earned')}</dt>
            <dd className="text-good-read">
              <Money value={summary.total_earned} />{' '}
              <Delta percent={change(summary.total_earned, previous.total_earned)} />
            </dd>
          </div>
          {summary.tax > 0 && (
            <Row label={t('Take-home')}>
              <Money value={summary.net_earned} />
            </Row>
          )}
          {summary.holiday_accrued > 0 && (
            <Row label={t('Holiday accrued')}>
              <Money value={summary.holiday_accrued} />
            </Row>
          )}
          {summary.planned_earned > 0 && (
            <Row label={t('Still planned')}>
              <Money value={summary.planned_earned} />
            </Row>
          )}
          {summary.paid > 0 && (
            <>
              <Row label={t('Paid')}>
                <Money value={summary.paid} />
              </Row>
              <Row label={t('Difference')}>
                <span className={summary.difference < 0 ? 'text-danger-read' : 'text-good-read'}>
                  <Money value={summary.difference} />
                </span>
              </Row>
            </>
          )}
        </dl>

        {summary.currencies.length > 1 && (
          <p className="field-hint mt-2 !text-warn-read">
            {t('This range mixes currencies')}: {summary.currencies.join(', ')}. {t('Read the per-place figures instead of the totals.')}
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <div className="rounded-(--radius) bg-surface-2 p-2">
            <span className="field-hint block">{t('Per working day')}</span>
            <Money value={averages.perDay} className="text-[0.92rem] font-bold" />{' '}
            <Delta percent={change(averages.perDay, before.perDay)} />
          </div>
          <div className="rounded-(--radius) bg-surface-2 p-2">
            <span className="field-hint block">{t('Per hour')}</span>
            <Money value={averages.perHour} className="text-[0.92rem] font-bold" />{' '}
            <Delta percent={change(averages.perHour, before.perHour)} />
          </div>
        </div>

        {summary.by_location.length > 1 && (
          <dl className="mt-3 flex flex-col gap-1 border-t border-border pt-2 text-[0.82rem]">
            {summary.by_location.map((place) => (
              <div key={place.location_id} className="flex items-center justify-between gap-2">
                <dt className="flex min-w-0 items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 flex-none rounded-full" style={{ background: place.colour }} />
                  <span className="truncate">{place.name}</span>
                </dt>
                <dd className="flex-none tabular">
                  {Math.round(place.hours * 10) / 10}h ·{' '}
                  <Money value={place.earned} currency={place.currency} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <TeamCard />

      {/* ==== Actions ==== */}
      <section className="card flex flex-col gap-1.5 p-3.5">
        <button type="button" className="btn w-full" onClick={() => setModal('payout')}>
          <Icon name="wallet" size={14} />
          {t(summary.paid > 0 ? 'Payments' : 'Record a payment')}
        </button>
        <button type="button" className="btn w-full" onClick={() => setModal('import')}>
          <Icon name="note" size={14} />
          {t('Import a spreadsheet')}
        </button>
        <button type="button" className="btn w-full" onClick={() => setModal('photo')}>
          <Icon name="camera" size={14} />
          {t('Import from a photo')}
        </button>
        <button type="button" className="btn w-full" onClick={() => setModal('ics')}>
          <Icon name="calendar" size={14} />
          {t('Import from a calendar (.ics)')}
        </button>
        <button
          type="button"
          className="btn w-full !whitespace-normal"
          onClick={() => setModal('foreign')}
        >
          <Icon name="download" size={14} />
          {t('Bring in another app’s records')}
        </button>
        <button type="button" className="btn btn-quiet w-full" onClick={exportCsv}>
          <Icon name="download" size={14} />
          {t('Export CSV')}
        </button>
        <button type="button" className="btn btn-quiet w-full" onClick={exportIcs}>
          <Icon name="calendar" size={14} />
          {t('Add to calendar')}
        </button>
      </section>

      {/* ==== Modals ==== */}
      <ShiftModal open={modal === 'shift'} editing={editingShift} onClose={() => setModal(null)} />
      <EventTemplateModal open={modal === 'event'} editing={editingEventType} onClose={() => setModal(null)} />
      <SalesModal open={modal === 'sales'} editing={editingPosition} onClose={() => setModal(null)} />
      <LocationModal open={modal === 'location'} editLocation={editingLocation} onClose={() => setModal(null)} />
      <PatternModal open={modal === 'pattern'} onClose={() => setModal(null)} />
      <RotationModal open={modal === 'rotation'} onClose={() => setModal(null)} />
      <SchemeModal open={modal === 'scheme'} onClose={() => setModal(null)} />
      <PayoutModal open={modal === 'payout'} onClose={() => setModal(null)} />
      <ImportModal open={modal === 'import'} onClose={() => setModal(null)} />
      <PhotoImportModal open={modal === 'photo'} onClose={() => setModal(null)} />
      <IcsImportModal open={modal === 'ics'} onClose={() => setModal(null)} />
      <ForeignImportModal open={modal === 'foreign'} onClose={() => setModal(null)} />
    </aside>
  );
}

function SectionHead({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <div className="mb-1.5 flex items-center justify-between">
      <h2 className="text-[0.95rem] font-bold">{title}</h2>
      <button type="button" className="btn btn-quiet btn-sm -my-1" aria-label={`+ ${title}`} onClick={onAdd}>
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="min-w-0 truncate text-muted">{label}</dt>
      <dd className="flex-none">{children}</dd>
    </div>
  );
}

/** The shared rota, summarised beside the calendar where the day is planned. */
function TeamCard() {
  const { t } = useI18n();
  const [rota, setRota] = useState<Rota | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const teams = await teamApi.list();

        if (teams.length === 0) return;

        const today = todayKey();

        setRota(await teamApi.rota(teams[0].id, today, today));
      } catch {
        // A team failing to load must not break the sidebar.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const day = rota?.days?.[0] ?? null;

  return (
    <section className="card p-3.5">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[0.95rem] font-bold">
        <Icon name="users" size={14} />
        {t('Team')}
      </h3>

      {loading ? (
        <p className="field-hint">{t('Loading…')}</p>
      ) : rota === null ? (
        <>
          <p className="field-hint mb-2">{t('Share a rota with your crew: who is on and when, without anyone’s money.')}</p>
          <Link href="/team" className="btn w-full">
            {t('Join or start a team')}
          </Link>
        </>
      ) : (
        <>
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            <div className="rounded-(--radius) bg-surface-2 p-2 text-center">
              <span className="block text-[1.1rem] font-bold tabular">{day?.on_shift ?? 0}</span>
              <span className="field-hint">{t('on shift today')}</span>
            </div>
            <div className="rounded-(--radius) bg-surface-2 p-2 text-center">
              <span className="block text-[1.1rem] font-bold tabular">{day?.free.length ?? 0}</span>
              <span className="field-hint">{t('free')}</span>
            </div>
          </div>

          {(day?.cover_requests ?? 0) > 0 && (
            <Link href="/schedule" className="mb-2 flex items-center gap-1.5 text-[0.82rem] font-medium text-warn-read">
              <Icon name="swap" size={13} />
              {day!.cover_requests} {t('looking for cover')}
            </Link>
          )}

          <Link href="/schedule" className="btn w-full">
            {t('Open the rota')}
          </Link>
        </>
      )}
    </section>
  );
}
