'use client';

import { useEffect, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import { Delivery, IngestResult, Webhook, WebhookKind, WebhookSave, webhookApi } from '@/lib/api/webhooks';
import { calendarApi } from '@/lib/api/calendar';
import { ShiftTemplate } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { useReveal } from '@/lib/fx';
import { Shell } from '@/components/layout/shell';
import { Alert, Money, Segmented } from '@/components/ui/bits';
import { Empty } from '@/components/ui/empty';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Icon } from '@/components/ui/icon';

const MAPPING_EXAMPLE = `{
  "$root": "data.object",
  "date": "closed_at",
  "external_id": "id",
  "tips": "totals.tip_money",
  "sales": "line_items",
  "sales.name": "catalogue.name",
  "sales.quantity": "qty",
  "$divide": { "tips": 100 }
}`;

const PAYLOAD_EXAMPLE: Record<WebhookKind, string> = {
  sales: `{
  "date": "2026-08-20",
  "external_id": "till-991",
  "tips": 42.50,
  "sales": [{ "name": "Wine", "quantity": 3 }]
}`,
  hours: `{
  "date": "2026-08-20",
  "shift": "Evening",
  "start": "17:00",
  "end": "23:30",
  "break_minutes": 30
}`,
  both: `{
  "date": "2026-08-20",
  "hours": 9.5,
  "tips": 42.50,
  "sales": [{ "name": "Wine", "quantity": 3 }]
}`,
};

const KIND_LABEL: Record<WebhookKind, string> = {
  sales: 'Sales for a day',
  hours: 'Hours worked',
  both: 'Sales and hours together',
};

export default function WebhooksPage() {
  return (
    <Shell>
      <Webhooks />
    </Shell>
  );
}

/**
 * The webhook manager: addresses other software can post to, and what it is
 * allowed to write when it does. Built around the two things that actually go
 * wrong — a sender's fields never match ours, and a refused delivery at three
 * in the morning needs its body kept for the morning's replay.
 */
function Webhooks() {
  const revealHost = useReveal<HTMLDivElement>();
  const { t, lang, num } = useI18n();

  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [revealed, setRevealed] = useState<number | null>(null);
  const [logFor, setLogFor] = useState<number | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [testFor, setTestFor] = useState<number | null>(null);
  const [testBody, setTestBody] = useState('');
  const [testResult, setTestResult] = useState<IngestResult | null>(null);

  // The form.
  const [name, setName] = useState('');
  const [kind, setKind] = useState<WebhookKind>('sales');
  const [active, setActive] = useState(true);
  const [defaultShiftId, setDefaultShiftId] = useState<number | null>(null);
  const [mapping, setMapping] = useState('');
  const [signatureHeader, setSignatureHeader] = useState('');
  const [signatureSecret, setSignatureSecret] = useState('');

  const load = () =>
    void webhookApi
      .list()
      .then(setHooks)
      .catch((caught) => setError(apiErrorMessage(caught)))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();

    void calendarApi
      .shifts()
      .then((list) => setTemplates(list.filter((template) => !template.archived)))
      .catch(() => setTemplates([]));
  }, []);

  const needsTemplate = kind !== 'sales';

  const startNew = () => {
    setEditing('new');
    setName('');
    setKind('sales');
    setActive(true);
    setDefaultShiftId(null);
    setMapping('');
    setSignatureHeader('');
    setSignatureSecret('');
  };

  const startEdit = (hook: Webhook) => {
    setEditing(hook.id);
    setName(hook.name);
    setKind(hook.kind);
    setActive(hook.active);
    setDefaultShiftId(hook.default_shift_id);
    setMapping(hook.mapping ?? '');
    setSignatureHeader(hook.signature_header ?? '');
    setSignatureSecret(hook.signature_secret ?? '');
  };

  const run = async (call: Promise<unknown>, message: string, after?: () => void) => {
    setBusy(true);
    setError(null);
    setSaved(null);

    try {
      await call;
      setSaved(t(message));
      after?.();
      load();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (editing === null) return;

    const body: WebhookSave = {
      name: name.trim(),
      kind,
      active,
      default_shift_id: needsTemplate ? defaultShiftId : null,
      mapping: mapping.trim() === '' ? null : mapping,
      signature_header: signatureHeader.trim() || null,
      signature_secret: signatureSecret.trim() || null,
    };

    void run(
      editing === 'new' ? webhookApi.create(body) : webhookApi.update(editing, body),
      'Saved',
      () => setEditing(null),
    );
  };

  const toggleLog = (hook: Webhook) => {
    if (logFor === hook.id) {
      setLogFor(null);

      return;
    }

    setLogFor(hook.id);
    setDeliveries([]);

    void webhookApi
      .deliveries(hook.id)
      .then(setDeliveries)
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  const tryPayload = (hook: Webhook, apply: boolean) => {
    setBusy(true);
    setError(null);
    setTestResult(null);

    void webhookApi
      .test(hook.id, testBody, apply)
      .then(setTestResult)
      .catch((caught) => setError(apiErrorMessage(caught)))
      .finally(() => setBusy(false));
  };

  const when = (value: string | null) =>
    value === null
      ? t('never')
      : new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

  return (
    <div ref={revealHost} className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-[1.3rem] font-bold tracking-tight">{t('Webhooks')}</h1>
        <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={startNew}>
          <Icon name="plus" size={13} />
          {t('New endpoint')}
        </button>
      </div>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {saved && <Alert kind="good" onDismiss={() => setSaved(null)}>{saved}</Alert>}

      {/* ==== What this is ==== */}
      <section className="card reveal p-4">
        <h2 className="mb-1 flex items-center gap-2 text-[0.98rem] font-bold">
          <Icon name="swap" size={15} />
          {t('Let other software fill the calendar in')}
        </h2>
        <p className="field-hint">
          {t('An endpoint is an address a till, a rota exporter or an automation can post to. What arrives is written straight onto the day it names: the takings, or the hours. Each endpoint has its own key, and each switches off on its own.')}
        </p>

        <details className="mt-2">
          <summary className="cursor-pointer text-[0.85rem] text-muted">{t('How a sender should post')}</summary>
          <div className="field-hint mt-2 flex flex-col gap-2">
            <p>{t('POST the JSON body to the endpoint address, and prove it is you in one of two ways.')}</p>
            <p>
              <strong>{t('Simple')}</strong>: {t('send the key in the header')} <code>X-Shifter-Secret</code>.
            </p>
            <p>
              <strong>{t('Signed')}</strong>: <code>X-Shifter-Timestamp</code> + <code>X-Shifter-Signature</code> ={' '}
              <code>sha256=</code>HMAC-SHA256({t('key')}, <code>timestamp.body</code>). {t('Accepted within five minutes.')}
            </p>
            <pre className="overflow-x-auto rounded-(--radius) border border-border bg-surface-2 p-2.5 text-[0.72rem] leading-relaxed">
              {PAYLOAD_EXAMPLE.both}
            </pre>
            <p>
              {t('Positions are matched to your catalogue by name. Fields left out are left alone, so a delivery of tips cannot erase anything else on the day. Send replace as true to let the delivery own the whole day, and send external_id so a retry is recognised instead of counted twice.')}
            </p>
          </div>
        </details>
      </section>

      {/* ==== The form ==== */}
      {editing !== null && (
        <section className="card reveal p-4">
          <h2 className="mb-3 text-[0.98rem] font-bold">{t(editing === 'new' ? 'New endpoint' : 'Edit endpoint')}</h2>

          <div className="flex flex-col gap-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="field-label">{t('Name')}</span>
                <input className="field-input" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                <span className="field-label">{t('What it brings')}</span>
                <select className="field-input" value={kind} onChange={(event) => setKind(event.target.value as WebhookKind)}>
                  {(Object.keys(KIND_LABEL) as WebhookKind[]).map((option) => (
                    <option key={option} value={option}>
                      {t(KIND_LABEL[option])}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {needsTemplate && (
              <label>
                <span className="field-label">{t('Default shift template')}</span>
                <select
                  className="field-input"
                  value={defaultShiftId ?? ''}
                  onChange={(event) => setDefaultShiftId(event.target.value === '' ? null : Number(event.target.value))}
                >
                  <option value="">{t('None — the payload must name one')}</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <span className="field-hint mt-1 block">
                  {t('Used when the payload does not say which shift it is. The rate comes from the template.')}
                </span>
              </label>
            )}

            <label>
              <span className="field-label">{t('Field mapping')}</span>
              <textarea
                rows={7}
                spellCheck={false}
                className="field-input font-mono !text-[0.78rem]"
                value={mapping}
                placeholder={MAPPING_EXAMPLE}
                onChange={(event) => setMapping(event.target.value)}
              />
              <span className="field-hint mt-1 block">
                {t('Leave empty when the sender already speaks the shape above. Otherwise name where each field lives in its payload: $root skips an envelope, $divide turns cents into money, and a value starting with = is written as a constant.')}
              </span>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="field-label">{t('Sender signs under this header')}</span>
                <input
                  className="field-input"
                  maxLength={120}
                  placeholder="X-Syrve-Signature"
                  value={signatureHeader}
                  onChange={(event) => setSignatureHeader(event.target.value)}
                />
              </label>
              <label>
                <span className="field-label">{t("Sender's own key")}</span>
                <input
                  className="field-input"
                  maxLength={200}
                  placeholder="whsec_…"
                  value={signatureSecret}
                  onChange={(event) => setSignatureSecret(event.target.value)}
                />
              </label>
            </div>
            <p className="field-hint -mt-2">
              {t('Fill both in when the sender cannot be told which headers to use: it keeps signing its own way, and this endpoint checks it. Reads the common form t=1787600865,v1=… — HMAC-SHA256 over the timestamp and the body. Leave empty and the sender must use the key above.')}
            </p>

            <label className="flex items-center gap-2 text-[0.88rem]">
              <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
              {t('Accepting deliveries')}
            </label>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-quiet" onClick={() => setEditing(null)}>
                {t('Cancel')}
              </button>
              <button type="button" className="btn btn-primary" disabled={busy || name.trim() === ''} onClick={save}>
                {t('Save')}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ==== Endpoints ==== */}
      {loading ? (
        <SkeletonRows rows={2} height="3.75rem" />
      ) : hooks.length === 0 ? (
        <Empty icon="zap" title={t('Nothing listens yet')}>
          {t('No endpoints yet. Make one, then paste its address into whatever should feed the calendar.')}
        </Empty>
      ) : (
        hooks.map((hook) => (
          <section key={hook.id} className={`card p-4 ${hook.active ? '' : 'opacity-70'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <Icon name={hook.kind === 'hours' ? 'clock' : hook.kind === 'both' ? 'swap' : 'coins'} size={16} className="text-(--accent-read)" />
              <h2 className="text-[1rem] font-bold">{hook.name}</h2>
              <span className="chip">{t(KIND_LABEL[hook.kind])}</span>
              {!hook.active && <span className="chip chip-danger">{t('Switched off')}</span>}
            </div>

            <div className="mt-2.5 flex flex-col gap-1.5">
              <ValueRow label={t('Address')} value={`${location.origin}${hook.url_path}`} onCopy={() => setSaved(t('Address copied'))} />
              <ValueRow
                label={t('Key')}
                value={hook.secret}
                masked={revealed !== hook.id}
                onReveal={() => setRevealed((current) => (current === hook.id ? null : hook.id))}
                onCopy={() => setSaved(t('Key copied'))}
              />
            </div>

            <p className="field-hint mt-2">
              {t('Last delivery')}: {when(hook.last_delivery_at)}
              {(hook.recent_applied > 0 || hook.recent_failed > 0) && (
                <>
                  {' '}· {hook.recent_applied} {t('applied')}
                  {hook.recent_failed > 0 && (
                    <>
                      {' '}· <span className="text-danger-read">{hook.recent_failed} {t('failed')}</span>
                    </>
                  )}{' '}
                  {t('in the last week')}
                </>
              )}
              {hook.default_shift_name && <> · {t('default')}: {hook.default_shift_name}</>}
              {hook.signature_header && (
                <>
                  {' '}· {t('signed by the sender')}: <code>{hook.signature_header}</code>
                </>
              )}
            </p>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <button type="button" className="btn btn-sm" onClick={() => startEdit(hook)}>
                <Icon name="sliders" size={13} />
                {t('Edit')}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  if (testFor === hook.id) {
                    setTestFor(null);

                    return;
                  }

                  setTestFor(hook.id);
                  setTestResult(null);
                  setTestBody(PAYLOAD_EXAMPLE[hook.kind]);
                }}
              >
                <Icon name="spark" size={13} />
                {t('Try a payload')}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => toggleLog(hook)}>
                <Icon name="note" size={13} />
                {t('What arrived')}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={() =>
                  void run(
                    webhookApi.update(hook.id, {
                      name: hook.name,
                      kind: hook.kind,
                      active: !hook.active,
                      default_shift_id: hook.default_shift_id,
                      mapping: hook.mapping,
                      signature_header: hook.signature_header,
                      signature_secret: hook.signature_secret,
                    }),
                    hook.active ? 'Switched off' : 'Switched on',
                  )
                }
              >
                {t(hook.active ? 'Switch off' : 'Switch on')}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={() => void run(webhookApi.rotate(hook.id), 'New address and key. Update the sender.', () => setRevealed(hook.id))}
              >
                <Icon name="key" size={13} />
                {t('New key')}
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-sm btn-danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`${hook.name} — ${t('Delete this? It cannot be undone.')}`)) {
                    void run(webhookApi.remove(hook.id), 'Deleted');
                  }
                }}
              >
                <Icon name="trash" size={13} />
                {t('Delete')}
              </button>
            </div>

            {/* ==== Try a payload ==== */}
            {testFor === hook.id && (
              <div className="rise mt-3 flex flex-col gap-2 border-t border-border pt-3">
                <span className="field-label">{t('Paste a payload as the sender would send it')}</span>
                <textarea
                  aria-label={t('Paste a payload as the sender would send it')}
                  rows={9}
                  spellCheck={false}
                  className="field-input font-mono !text-[0.78rem]"
                  value={testBody}
                  onChange={(event) => setTestBody(event.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => tryPayload(hook, false)}>
                    {t('Read it')}
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => tryPayload(hook, true)}>
                    {t('Read it and write it')}
                  </button>
                </div>

                {testResult && (
                  <div className="rounded-(--radius) border border-border bg-surface-2 p-3 text-[0.85rem]">
                    <p className="font-semibold">
                      {t(testResult.status)}
                      {testResult.date && <span className="field-hint"> · {testResult.date}</span>}
                    </p>
                    {testResult.preview?.shift && (
                      <p className="field-hint">
                        {testResult.preview.shift.name} · {testResult.preview.shift.start_time}–{testResult.preview.shift.end_time} ·{' '}
                        {num(testResult.preview.shift.hours)} {t('h')} · {t(testResult.preview.shift.worked ? 'worked' : 'planned')}
                      </p>
                    )}
                    {testResult.preview?.sales.map((line) => (
                      <p key={line.sales_id} className="field-hint">
                        {line.name} × {line.quantity} · <Money value={line.earned} />
                      </p>
                    ))}
                    {testResult.preview?.tips !== null && testResult.preview !== null && (
                      <p className="field-hint">
                        {t('Tips')}: <Money value={testResult.preview.tips} />
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ==== The log ==== */}
            {logFor === hook.id && (
              <div className="rise mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
                {deliveries.length === 0 ? (
                  <p className="field-hint">{t('Nothing has arrived here yet.')}</p>
                ) : (
                  deliveries.map((delivery) => (
                    <div
                      key={delivery.id}
                      className={`rounded-(--radius) border p-2.5 ${
                        delivery.status === 'rejected' || delivery.status === 'failed' ? 'border-danger/40' : 'border-border'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`chip ${
                            delivery.status === 'applied'
                              ? 'border-good/40 text-good-read'
                              : delivery.status === 'rejected' || delivery.status === 'failed'
                                ? 'border-danger/40 text-danger-read'
                                : ''
                          }`}
                        >
                          {t(delivery.status)}
                        </span>
                        <span className="field-hint">{when(delivery.received_at)}</span>
                        {delivery.applied_date && <span className="field-hint tabular">· {delivery.applied_date}</span>}
                        <span className="ml-auto flex gap-1">
                          <button
                            type="button"
                            className="btn btn-quiet btn-sm"
                            onClick={() => {
                              setTestFor(hook.id);
                              setTestResult(null);
                              setTestBody(delivery.payload);
                            }}
                          >
                            {t('Edit as a test')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-quiet btn-sm"
                            disabled={busy}
                            onClick={() =>
                              void run(webhookApi.replay(delivery.id), 'Replayed', () => toggleLog(hook))
                            }
                          >
                            <Icon name="repeat" size={12} />
                            {t('Replay')}
                          </button>
                        </span>
                      </div>
                      {delivery.error && <p className="mt-1 text-[0.8rem] text-danger-read">{delivery.error}</p>}
                      <details className="mt-1">
                        <summary className="field-hint cursor-pointer">{t('What was sent')}</summary>
                        <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded border border-border bg-surface-2 p-2 text-[0.7rem]">
                          {delivery.payload}
                        </pre>
                      </details>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}

function ValueRow({
  label,
  value,
  masked = false,
  onReveal,
  onCopy,
}: {
  label: string;
  value: string;
  masked?: boolean;
  onReveal?: () => void;
  onCopy: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2">
      <span className="field-hint">{label}</span>
      <code className="truncate rounded-(--radius) border border-border bg-surface-2 px-2 py-1 text-[0.78rem]">
        {masked ? '••••••••••••••••••••' : value}
      </code>
      <span className="flex gap-1">
        {onReveal && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={onReveal} aria-label={t(masked ? 'Show' : 'Hide')}>
            <Icon name={masked ? 'eye' : 'eye-off'} size={13} />
          </button>
        )}
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            onCopy();
          }}
          aria-label={t('Copy')}
        >
          <Icon name="copy" size={13} />
        </button>
      </span>
    </div>
  );
}
