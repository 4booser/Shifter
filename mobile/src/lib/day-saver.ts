import { failureOf, same } from './outbox';
import { CalendarDayData, DayShiftEntry, DeductionReason, DaySave, toSavePayload } from './types';

/**
 * Saving a day without being asked to, with nothing native in it.
 *
 * One save at a time, always the newest draft: anything typed while one is out
 * goes in the next, sent with the version the last one came back with. The
 * screen only reports what changed and folds the answers in.
 */

/** How long the screen waits after the last change before it saves. */
export const QUIET_BEFORE_SAVE = 500;

export type SaveState = 'clean' | 'waiting' | 'saving' | 'saved' | 'failed' | 'conflict';

/** The boxes the day screen keeps beside the day itself. */
export interface DayTyped {
  quantities: Record<number, number>;
  tips: string;
  tipPool: string;
  deductions: string;
  deductionReason: DeductionReason | null;
  note: string;
}

/** Which part of the day each box stands for. */
const BOXES = [
  ['quantities', 'sales'],
  ['tips', 'tips'],
  ['tipPool', 'tip_pool'],
  ['deductions', 'deductions'],
  ['deductionReason', 'deduction_reason'],
  ['note', 'note'],
] as const;

/** "12,5" off a numeric keyboard with a Ukrainian locale is a number too. */
const typedAmount = (text: string): number | null =>
  text.trim() === '' ? null : Number(text.replace(',', '.')) || 0;

/** The day as it stands on the screen, ready to send. */
export const dayDraft = (day: CalendarDayData, typed: DayTyped): DaySave => {
  const payload = toSavePayload(day);

  payload.sales = Object.entries(typed.quantities)
    .map(([id, quantity]) => ({ sales_id: Number(id), quantity }))
    .filter((entry) => entry.quantity > 0);
  payload.tips = typedAmount(typed.tips);
  // Same clamp again: the total has just been retyped, and the cash half
  // the phone cannot show must not be left larger than it.
  payload.tips_cash =
    payload.tips_cash == null ? null : Math.min(payload.tips_cash, payload.tips ?? 0);
  payload.tip_pool = typedAmount(typed.tipPool);
  payload.deductions = typedAmount(typed.deductions);
  // A reason without a fine is noise; the server drops it too.
  payload.deduction_reason = (payload.deductions ?? 0) > 0 ? typed.deductionReason : null;
  payload.note = typed.note.trim() === '' ? null : typed.note.trim();

  return payload;
};

/** The boxes as a day fills them, whichever side wrote it. */
export const dayBoxes = (
  day: Pick<DaySave, 'tips' | 'tip_pool' | 'deductions' | 'deduction_reason' | 'note'> &
    Pick<CalendarDayData, 'sales' | 'fine'>,
): DayTyped => {
  const fine = day.fine ?? day.deductions;

  return {
    quantities: Object.fromEntries((day.sales ?? []).map((row) => [row.sales_id, row.quantity])),
    tips: `${day.tips ?? ''}`,
    tipPool: `${day.tip_pool ?? ''}`,
    deductions: fine ? `${fine}` : '',
    deductionReason: day.deduction_reason ?? null,
    note: day.note ?? '',
  };
};

/**
 * Two drafts that read the same need no save. Only what somebody can change on
 * this screen counts: the server fills in the rest, and a difference it made
 * itself must not read as an edit that needs sending back.
 */
export const fingerprint = (payload: DaySave): string =>
  JSON.stringify({
    ...payload,
    version: 0,
    tips_cash: null,
    shifts: payload.shifts.map(({ break_minutes: _break, auto_closed: _closed, ...own }) => own),
  });

/** What on a shift is the person's to change, and so might be newer here than in an answer. */
const OWN = [
  'worked',
  'needs_cover',
  'actual_start',
  'actual_end',
  'revenue',
  'guests',
  'zone',
] as const;

/**
 * A row as this screen puts it on a day. It remembers what it started as: with
 * no save of its own behind it there is nothing else to tell what was typed on
 * it from what it was put on with, once an answer brings the same shift back.
 */
export const putOn = (row: DayShiftEntry): DayShiftEntry => ({ ...row, placedAs: { ...row } });

/**
 * Folds what the server says into the day on the screen. Its money and hours
 * are taken as they come. A field somebody has touched since `known`, the last
 * thing the server saw, stays as typed; the rest follows the server, which is
 * how a shift the server closed in the meantime reaches the screen. A row put
 * on here goes by what it started as, `known` having never heard of it. Rows go
 * the same way, or the next save would undo a write this screen did not make:
 * one the answer brought arrives, one it lacks goes unless somebody has been at
 * it here, and one put on or taken off here since `known` stays that way.
 */
export const adoptAnswer = (
  shown: CalendarDayData,
  known: DaySave,
  answer: CalendarDayData,
): CalendarDayData => ({
  ...shown,
  version: answer.version ?? shown.version,
  earned: answer.earned,
  planned: answer.planned,
  hours: answer.hours,
  shifts: [
    ...shown.shifts.flatMap((entry) => {
      const fresh = answer.shifts.find((row) => row.shift_id === entry.shift_id);
      const sent = known.shifts.find((row) => row.shift_id === entry.shift_id);
      const began = sent ?? entry.placedAs;
      const touched = (field: (typeof OWN)[number]) =>
        began !== undefined && entry[field] !== began[field];

      // Put on the day after that save left, the server has not heard of it;
      // worked on here since, this side has the later word.
      if (fresh === undefined) return sent === undefined || OWN.some(touched) ? [entry] : [];

      const merged: DayShiftEntry =
        sent === undefined ? { ...fresh, placedAs: entry.placedAs } : { ...fresh };

      for (const field of OWN) {
        if (touched(field)) Object.assign(merged, { [field]: entry[field] });
      }

      return [merged];
    }),
    ...answer.shifts.filter(
      (row) =>
        !shown.shifts.some((entry) => entry.shift_id === row.shift_id)
        && !known.shifts.some((entry) => entry.shift_id === row.shift_id),
    ),
  ],
});

/**
 * Folds a write this screen did not make into the boxes. One nobody has touched
 * since `known` follows it, or the next save would send the empty box back over
 * tips that just landed. Its own saves stay out of this: an answer to those has
 * nothing to tell a box. Where the server only repeats what the box holds the
 * box stays exactly as typed: "12,5" is not turned into "12.5" under somebody's
 * thumb.
 */
export const adoptBoxes = (typed: DayTyped, known: DaySave, answer: CalendarDayData): DayTyped => {
  const theirs = dayBoxes(answer);
  const had = dayBoxes(known);
  const shown = dayDraft(answer, typed);
  const boxes = { ...typed };

  for (const [box, field] of BOXES) {
    if (same(shown[field], known[field]) && !same(theirs[box], had[box])) {
      (boxes as Record<string, unknown>)[box] = theirs[box];
    }
  }

  return boxes;
};

/**
 * What becomes of a draft a save could not deliver. Someone watching can tap
 * retry. With nobody watching it goes in the queue while the server might yet
 * take it, because a phone in a pocket can be killed with the draft in memory.
 */
export const afterFailure = (caught: unknown, watched: boolean): 'retry' | 'hold' | 'refused' => {
  if (watched) return 'retry';

  return failureOf(caught) === 'offline' ? 'hold' : 'refused';
};

export interface DaySaver {
  /** The newest draft. The first one is the baseline: what the server already has. */
  edit: (draft: DaySave) => void;
  /** Saves now rather than after the quiet. Resolves once nothing is left to send. */
  flush: () => Promise<void>;
  /** Something said about the day outside a save. Only taken while it is still the version this screen holds. */
  overhear: (answer: CalendarDayData, ownWrite?: boolean) => void;
  /** Stops trying after a conflict that ended in keeping the other version. */
  abandon: () => void;
  /** Resumes after a conflict that ended in writing over the other version. */
  overrule: (version: number) => void;
  /** Whether everything typed has reached the server. */
  clean: () => boolean;
}

export function createDaySaver(options: {
  send: (payload: DaySave) => Promise<CalendarDayData | undefined>;
  /** Folds an answer into the screen and hands back the draft as it now stands. `own` is the answer to a save of this screen's. */
  adopt: (answer: CalendarDayData, known: DaySave, own: boolean) => DaySave;
  onState: (state: SaveState) => void;
  /** The server refused the version. Nothing more goes out until overrule or abandon. */
  onConflict: (payload: DaySave) => void;
  /** Handed the newest draft, not the one that failed, and what the server last had of it. */
  onFailed: (caught: unknown, payload: DaySave, known: DaySave) => void;
  quiet?: number;
}): DaySaver {
  const quiet = options.quiet ?? QUIET_BEFORE_SAVE;

  let known: DaySave | null = null;
  let draft: DaySave | null = null;
  let version = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flying: Promise<void> | null = null;
  // This phone's own writes, answered while a save was out. Their versions can
  // only be judged once that save has landed.
  let heard: CalendarDayData[] = [];
  let again = false;
  let saved = false;
  let failed = false;
  let conflict = false;

  const dirty = () =>
    known !== null && draft !== null && fingerprint(draft) !== fingerprint(known);

  const report = () => {
    if (conflict) options.onState('conflict');
    else if (flying !== null) options.onState('saving');
    else if (failed) options.onState('failed');
    else if (dirty()) options.onState('waiting');
    else options.onState(saved ? 'saved' : 'clean');
  };

  const disarm = () => {
    if (timer !== null) clearTimeout(timer);

    timer = null;
  };

  /** Takes an answer in. Where nothing was typed since, the day after it is the new baseline. */
  const land = (answer: CalendarDayData, base: DaySave, own = false) => {
    const typed = draft !== null && fingerprint(draft) !== fingerprint(base);

    if (typeof answer.version === 'number') version = answer.version;

    draft = options.adopt(answer, base, own);
    known = typed ? base : draft;
  };

  /** Takes in the writes of this phone's that follow on from the version held. Says whether any did. */
  const landHeard = (): boolean => {
    const waiting = heard;
    let took = false;

    heard = [];

    for (const answer of waiting) {
      if (answer.version === version + 1) {
        land(answer, known as DaySave);
        took = true;
      }
    }

    return took;
  };

  const sendOnce = async () => {
    const payload: DaySave = { ...(draft as DaySave), version };

    try {
      const answer = await options.send(payload);

      known = payload;
      saved = true;

      if (answer !== undefined) land(answer, payload, true);

      landHeard();
    } catch (caught) {
      if ((caught as { status?: number } | null)?.status === 409) {
        // Refused for a version this phone moved itself, and it knows what to:
        // nobody else is involved, so the draft simply goes again over it.
        if (landHeard()) {
          again = true;

          return;
        }

        conflict = true;
        options.onConflict(payload);
      } else {
        failed = true;
        // Typing can have gone on past what was out, and whoever takes this
        // over may be the last to see it: the closed screen keeps nothing.
        options.onFailed(caught, { ...(draft as DaySave), version }, known as DaySave);
      }
    }
  };

  const run = async () => {
    do {
      again = false;
      await sendOnce();
    } while (again && dirty() && !conflict && !failed);

    flying = null;
    report();
  };

  const flush = (): Promise<void> => {
    disarm();

    if (flying !== null) {
      again = true;

      return flying;
    }

    if (conflict || !dirty()) return Promise.resolve();

    failed = false;
    flying = run();
    report();

    return flying;
  };

  return {
    edit: (next) => {
      if (known === null) {
        known = next;
        version = next.version ?? 0;
      }

      draft = next;
      disarm();

      if (dirty() && !conflict) {
        failed = false;
        timer = setTimeout(() => void flush(), quiet);
      }

      report();
    },

    flush,

    overhear: (answer, ownWrite = false) => {
      if (known === null) return;

      if (flying !== null) {
        if (ownWrite) heard.push(answer);

        return;
      }

      // A version this screen never saw is somebody else's edit, and the next
      // save is what has to raise that. A close from the server moves no
      // version at all; one this phone wrote itself moves it by exactly one.
      if (answer.version !== version + (ownWrite ? 1 : 0)) return;

      land(answer, known);
      report();
    },

    abandon: () => {
      disarm();
      draft = known;
      conflict = false;
      report();
    },

    overrule: (taken) => {
      version = taken;
      conflict = false;
      report();
    },

    clean: () => !dirty() && !conflict && !failed,
  };
}
