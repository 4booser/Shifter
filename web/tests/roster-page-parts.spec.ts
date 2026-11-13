import { readFileSync, readdirSync } from 'node:fs';
import { ReactElement, ReactNode, createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CellForm, usualLine } from '@/components/roster/editors';
import { FillMenu, TOOLBAR_ICON } from '@/components/roster/fill-menu';
import { WeekRowsEditor } from '@/components/roster/hours-editor';
import { HOLD, longPress } from '@/components/roster/long-press';
import { MonthPick, PatternFields } from '@/components/roster/pattern-fields';
import { PeopleStrip } from '@/components/roster/people-strip';
import { ToolRow } from '@/components/roster/roster-table';
import { SaveLine } from '@/components/roster/save-line';
import RosterSettings from '@/components/roster/settings-dialog';
import type { RosterMonth, RosterPattern, RosterPerson } from '@/lib/api/roster';
import type { WeekHours } from '@/lib/calendar/models';
import { BARE, Tool, USUAL, toggleTool, toolInUse } from '@/lib/roster/brushes';
import { RosterEdit, fillScope } from '@/lib/roster/edits';
import { INHERIT, NO_PATTERN, cleanPerson, draftOf } from '@/lib/roster/people';
import { hasUsualTime } from '@/lib/roster/rules';
import { SaveState } from '@/lib/roster/save-queue';
import { UNDO_FOR, createUndo } from '@/lib/roster/undo';

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, n: (count: number) => `${count}`, lang: 'en' }),
}));

const CSS = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

const line = (state: SaveState) =>
  renderToStaticMarkup(createElement(SaveLine, { state, failure: null, onRetry: () => undefined }));

/** The class list of the first tag matching. */
const classesOf = (html: string, tag: RegExp) => (tag.exec(html)?.[1] ?? '').split(' ');

/** The zero-height float the save line starts with, which holds no other box. */
const floatOf = (html: string) => html.slice(0, html.indexOf('</div>') + '</div>'.length);

describe('the save pill floating over the page', () => {
  it.each(['idle', 'saving', 'saved', 'failed'] as const)('takes no press of its own when %s', (state) => {
    expect(classesOf(line(state), /<div class="([^"]*)"/)).toContain('pointer-events-none');
  });

  it('gives presses back to Try again, and only there', () => {
    expect(classesOf(line('failed'), /<button[^>]*class="([^"]*)"/)).toContain('pointer-events-auto');
    expect(line('failed').match(/pointer-events-auto/g)).toHaveLength(1);
    expect(line('saved')).not.toContain('pointer-events-auto');
    expect(line('saving')).not.toContain('pointer-events-auto');
  });

  it('fades once saved, so it does not sit on a name for good', () => {
    expect(line('saved')).toContain('fade-away');
    expect(line('saving')).not.toContain('fade-away');
    expect(line('failed')).not.toContain('fade-away');
  });

  it('stays gone once it has faded', () => {
    const rule = /\.fade-away\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '';
    const frames = /@keyframes fade-away\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? '';

    expect(rule).toMatch(/animation:\s*fade-away\b.*\bforwards/);
    expect(frames).toMatch(/opacity:\s*0/);
  });

  it('says nothing at all when there is nothing to say', () => {
    expect(line('idle')).not.toContain('card');
  });

  it('lets a failure be read and pressed', () => {
    expect(line('failed')).toContain('Not saved');
    expect(line('failed')).toContain('Try again');
  });

  it('keeps Undo out of the float over the names, down at the bottom clear of the tab bar', () => {
    const html = renderToStaticMarkup(
      createElement(SaveLine, { state: 'saved', failure: null, onRetry: () => undefined, undo: () => undefined }),
    );
    const float = floatOf(html);

    expect(float).not.toContain('Undo');
    expect(float).not.toContain('pointer-events-auto');
    expect(html.slice(float.length)).toContain('Undo');
    expect(classesOf(html.slice(float.length), /<div class="([^"]*)"/)).toEqual(
      expect.arrayContaining(['fixed', 'bottom-24', 'md:bottom-6']),
    );
  });
});

const person = (id: number, name: string, positionId: number | null = null, pattern: RosterPattern = NO_PATTERN): RosterPerson => ({
  id,
  name,
  position_id: positionId,
  position: null,
  colour: '#6366f1',
  hours: INHERIT,
  pattern,
});

/** Every element of a tree a component returned, without rendering the components inside it, so a test can press a button. */
function elementsIn(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elementsIn);
  if (!isValidElement<Record<string, unknown>>(node)) return [];

  return [node, ...elementsIn(node.props.children as ReactNode)];
}

const buttonsIn = (node: ReactNode) => elementsIn(node).filter((element) => element.type === 'button');

/** The text a button says, as far as plain strings go. */
const textOf = (node: ReactNode): string =>
  Array.isArray(node)
    ? node.map(textOf).join('')
    : typeof node === 'string' || typeof node === 'number'
      ? `${node}`
      : isValidElement<{ children?: ReactNode }>(node)
        ? textOf(node.props.children)
        : '';

/** Open every day but Sunday, noon to midnight. */
const VENUE: WeekHours[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start_time: '12:00', end_time: '00:00' }));

describe('the people strip', () => {
  const long = { ...person(1, 'W'.repeat(40)), position: 'W'.repeat(40) };

  const strip = (count: number) =>
    renderToStaticMarkup(
      createElement(PeopleStrip, {
        people: Array.from({ length: count }, (_, index) => ({ ...long, id: index + 1 })),
        onPerson: () => undefined,
        onAdd: () => undefined,
      }),
    );

  it('holds a chip to the width it has, however long the word in it', () => {
    expect(classesOf(strip(1), /<button[^>]*class="([^"]*)"/)).toContain('max-w-full');
  });

  it('lets the text give way inside the chip, and not the dot', () => {
    const html = strip(1);

    expect(classesOf(html, /<span class="(min-w-0[^"]*)"/)).toContain('truncate');
    expect(classesOf(html, /<span class="([^"]*rounded-full[^"]*)"/)).toContain('flex-none');
  });

  it('still folds a big crew away', () => {
    expect(strip(8)).not.toContain('<details');
    expect(strip(9)).toContain('<details');
  });
});

describe('the tools', () => {
  const crew = [person(1, 'Толик'), person(2, 'Гриша', 3)];
  const positions = [{ id: 3, name: 'Уборка', hours: { mode: 'none', start_time: null, end_time: null, week_hours: [] } }];

  const row = (tool: Tool | null, onTool: (tool: Tool | null) => void = () => undefined) =>
    ToolRow({ brushes: [{ start: '11:00', end: '22:00' }], tool, onTool, onMake: () => undefined });

  const chip = (tool: Tool | null, label: string, onTool?: (tool: Tool | null) => void) =>
    buttonsIn(row(tool, onTool)).find((button) => textOf(button.props.children as ReactNode) === label);

  it('starts with no tool when nothing gives anybody a time', () => {
    expect(hasUsualTime(crew, positions, [])).toBe(false);
    expect(toolInUse(undefined, hasUsualTime(crew, positions, []))).toBeNull();
    expect(chip(null, 'As usual')?.props['aria-pressed']).toBe(false);
  });

  it('starts on the usual tool when something gives a time', () => {
    const ready = hasUsualTime(crew, positions, VENUE);

    expect(ready).toBe(true);
    expect(toolInUse(undefined, ready)).toEqual(USUAL);
    expect(chip(USUAL, 'As usual')?.props['aria-pressed']).toBe(true);
    expect(chip(USUAL, 'No set time')?.props['aria-pressed']).toBe(false);
  });

  it('pressing the active tool again lets a click open the cell', () => {
    const picked: (Tool | null)[] = [];

    (chip(USUAL, 'As usual', (tool) => picked.push(tool))?.props.onClick as () => void)();
    (chip(USUAL, 'No set time', (tool) => picked.push(tool))?.props.onClick as () => void)();

    expect(picked).toEqual([null, BARE]);
    expect(toggleTool(BARE, BARE)).toBeNull();
    // Put down on purpose, it stays down, though something gives a time.
    expect(toolInUse(null, true)).toBeNull();
  });

  it('says a right-click opens a day only while a tool is in hand', () => {
    const said = (tool: Tool | null) => renderToStaticMarkup(createElement(ToolRow, { brushes: [], tool, onTool: () => undefined, onMake: () => undefined }));

    expect(said(USUAL)).toContain('Right-click opens a day.');
    expect(said(USUAL)).toContain('A day with other hours opens instead.');
    expect(said(BARE)).toContain('A day with hours opens instead.');
    expect(said(null)).not.toContain('Right-click');
  });
});

describe('a press and a hold', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const rig = () => {
    const pressed = vi.fn();
    const held = vi.fn();
    const presses = longPress();

    return { pressed, held, button: presses.bind(pressed, held) };
  };

  it('a right-click opens the cell whatever the tool', () => {
    const { pressed, held, button } = rig();
    const event = { preventDefault: vi.fn() };

    button.onPointerDown({ pointerType: 'mouse' });
    button.onContextMenu(event);

    expect(held).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(pressed).not.toHaveBeenCalled();

    button.onPointerDown({ pointerType: 'mouse' });
    button.onClick();

    expect(pressed).toHaveBeenCalledTimes(1);
  });

  it('opens on a finger held half a second, and swallows the click it lifts with', () => {
    vi.useFakeTimers();

    const { pressed, held, button } = rig();

    button.onPointerDown({ pointerType: 'touch' });
    vi.advanceTimersByTime(HOLD);
    // Android also says contextmenu about now.
    button.onContextMenu({ preventDefault: () => undefined });
    button.onPointerUp();
    button.onClick();

    expect(held).toHaveBeenCalledTimes(1);
    expect(pressed).not.toHaveBeenCalled();
  });

  it('is a plain press when the finger lifts in time, or the page scrolls', () => {
    vi.useFakeTimers();

    const { pressed, held, button } = rig();

    button.onPointerDown({ pointerType: 'touch' });
    vi.advanceTimersByTime(HOLD - 100);
    button.onPointerUp();
    button.onClick();

    button.onPointerDown({ pointerType: 'touch' });
    button.onPointerCancel();
    vi.advanceTimersByTime(HOLD);

    expect(pressed).toHaveBeenCalledTimes(1);
    expect(held).not.toHaveBeenCalled();
  });
});

describe('undo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows undo after a one-tap put and takes it away after five seconds', () => {
    vi.useFakeTimers();

    let offered: RosterEdit[] | null = null;
    const undo = createUndo((edits) => {
      offered = edits;
    });
    const back: RosterEdit = { kind: 'clear', person_id: 1, date: '2026-11-02' };
    const line = () =>
      renderToStaticMarkup(
        createElement(SaveLine, {
          state: 'saved',
          failure: null,
          onRetry: () => undefined,
          undo: offered === null ? undefined : () => undefined,
        }),
      );

    expect(line()).not.toContain('Undo');

    undo.offer([back]);

    expect(offered).toEqual([back]);
    expect(line()).toContain('Undo');
    expect(floatOf(line())).not.toContain('Undo');

    vi.advanceTimersByTime(UNDO_FOR - 1);

    expect(line()).toContain('Undo');

    vi.advanceTimersByTime(1);

    expect(offered).toBeNull();
    expect(line()).not.toContain('Undo');
  });

  it('goes once a cell it would put back is edited by hand, and stays for any other edit', () => {
    let offered: RosterEdit[] | null = null;
    const undo = createUndo((edits) => {
      offered = edits;
    });
    const back: RosterEdit = { kind: 'clear', person_id: 1, date: '2026-11-25' };
    const byHand = (personId: number): RosterEdit => ({
      kind: 'set',
      shift: { person_id: personId, date: '2026-11-25', start_time: '12:00', end_time: '20:00' },
    });

    undo.offer([back]);
    undo.touch(byHand(2));
    undo.touch({ kind: 'title', title: 'Кухня' });

    expect(offered).toEqual([back]);

    // The put cell set to 12–20 by hand: undoing the put now would delete that shift.
    undo.touch(byHand(1));

    expect(offered).toBeNull();
    expect(undo.take()).toEqual([]);
  });

  it('runs once: taken, it is gone', () => {
    let offered: RosterEdit[] | null = null;
    const undo = createUndo((edits) => {
      offered = edits;
    });
    const back: RosterEdit = { kind: 'clear', person_id: 1, date: '2026-11-02' };

    undo.offer([back]);

    expect(undo.take()).toEqual([back]);
    expect(offered).toBeNull();
    expect(undo.take()).toEqual([]);
  });
});

describe('the cell editor', () => {
  const cell = (over: Partial<Parameters<typeof CellForm>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(CellForm, {
        shift: null,
        usual: null,
        brushes: [{ start: '11:00', end: '22:00' }],
        free: [],
        focused: false,
        onSet: () => undefined,
        onClear: () => undefined,
        onSwap: () => undefined,
        onClose: () => undefined,
        ...over,
      }),
    );

  it('the cell editor offers only no time when nothing gives a time', () => {
    expect(cell()).toContain('No set time');
    expect(cell()).not.toContain('As usual');
    expect(cell({ usual: { start: '18:00', end: '02:00' } })).toContain('As usual · <span class="tabular">18-2</span>');
  });

  it('marks a day with no time on its chip and leaves the hours empty', () => {
    const html = cell({ shift: { person_id: 1, date: '2026-11-02', start_time: null, end_time: null } });

    expect(html).toMatch(/aria-pressed="true"[^>]*>No set time/);
    expect(html).not.toMatch(/type="time"[^>]*value="\d/);
  });

  it('the cell editor offers the day’s free people to replace with', () => {
    const free = [person(2, 'Гриша'), person(3, 'Паша')];
    const filled = cell({ shift: { person_id: 1, date: '2026-11-02', start_time: '11:00', end_time: '22:00' }, free });

    expect(filled).toContain('Replace with');
    expect(filled.indexOf('Гриша')).toBeLessThan(filled.indexOf('Паша'));
    expect(cell({ free })).not.toContain('Replace with');
    expect(cell({ shift: { person_id: 1, date: '2026-11-02', start_time: '11:00', end_time: '22:00' } })).not.toContain(
      'Replace with',
    );
  });
});

describe('the working days', () => {
  const november = { year: 2026, month: 11 };
  const cycle = (from: string | null): RosterPattern => ({ kind: 'cycle', weekdays: [], on: 2, off: 2, from });

  it('the month grid highlights the working days and a tap sets the first day', () => {
    const picked: string[] = [];
    const grid = MonthPick({ month: november, pattern: cycle('2026-11-13'), onPick: (from) => picked.push(from) });
    const days = buttonsIn(grid);
    const works = days.filter((day) => day.props['data-works'] === true).map((day) => Number(textOf(day.props.children as ReactNode)));

    expect(days).toHaveLength(30);
    expect(works).toEqual([1, 2, 5, 6, 9, 10, 13, 14, 17, 18, 21, 22, 25, 26, 29, 30]);
    expect(days.filter((day) => day.props['aria-pressed'] === true).map((day) => textOf(day.props.children as ReactNode))).toEqual(['13']);

    (days.find((day) => textOf(day.props.children as ReactNode) === '20')?.props.onClick as () => void)();

    expect(picked).toEqual(['2026-11-20']);
  });

  it('a first day outside the shown month is sent unchanged', () => {
    const pattern = cycle('2026-10-30');
    const html = renderToStaticMarkup(createElement(MonthPick, { month: november, pattern, onPick: () => undefined }));
    const changed: RosterPattern[] = [];
    const fields = PatternFields({ pattern, month: november, onChange: (next) => changed.push(next) });

    expect(html).toContain('Starts on');
    expect(html).not.toContain('aria-pressed="true"');
    // From 30 October, two on and two off: the 1st and 2nd of November are off, the 3rd and 4th on.
    expect(html).toMatch(/data-works="true"[^>]*>3</);
    expect(html).not.toMatch(/data-works="true"[^>]*>1</);

    (buttonsIn(fields).find((button) => textOf(button.props.children as ReactNode) === '3/3')?.props.onClick as () => void)();

    expect(changed).toEqual([{ ...pattern, on: 3, off: 3 }]);
    expect(
      cleanPerson({ name: 'Толик', colour: '#6366f1', positionId: null, hours: draftOf(INHERIT), pattern })?.pattern.from,
    ).toBe('2026-10-30');
  });

  it('fill with nobody on working days opens the working-days list', () => {
    const crew = [person(1, 'Толик'), person(2, 'Гриша')];

    expect(fillScope(crew)).toBe('ask');
    expect(fillScope([...crew, person(3, 'Паша', null, cycle('2026-11-13'))])).toEqual({ leftOut: ['Толик', 'Гриша'] });

    const sheet: RosterMonth = {
      id: 1,
      title: 'Бар',
      share_slug: null,
      month: '2026-11',
      venue_hours: [],
      positions: [],
      people: crew,
      shifts: [],
    };
    const settings = (forFill: boolean) =>
      renderToStaticMarkup(
        createElement(RosterSettings, {
          tab: 'days',
          onTab: () => undefined,
          forFill,
          sheet,
          busy: false,
          onSaveVenue: async () => true,
          onAddPosition: async () => null,
          onSavePosition: async () => true,
          onRemovePosition: async () => true,
          onEditPerson: () => undefined,
        }),
      );

    expect(settings(true)).toContain('Mark who works which days, then press “Fill the month” again.');
    expect(settings(true)).toContain('Толик');
    expect(settings(false)).not.toContain('Fill the month');
  });
});

describe('the working days of a whole crew', () => {
  it('names whose position and days each control changes, since tabbing passes the names by', () => {
    const sheet: RosterMonth = {
      id: 1,
      title: 'Бар',
      share_slug: null,
      month: '2026-11',
      venue_hours: [],
      positions: [{ id: 3, name: 'Бармен', hours: { mode: 'none', start_time: null, end_time: null, week_hours: [] } }],
      people: [person(1, 'Толик', 3), person(2, 'Гриша')],
      shifts: [],
    };
    const html = renderToStaticMarkup(
      createElement(RosterSettings, {
        tab: 'days',
        onTab: () => undefined,
        forFill: false,
        sheet,
        busy: false,
        onSaveVenue: async () => true,
        onAddPosition: async () => null,
        onSavePosition: async () => true,
        onRemovePosition: async () => true,
        onEditPerson: () => undefined,
      }),
    );

    expect(html).toContain('role="group" aria-label="Толик: Position"');
    expect(html).toContain('role="group" aria-label="Гриша: Position"');
    expect(html).toContain('aria-label="Толик, Working days: By hand"');
    expect(html).toContain('aria-label="Гриша, Working days: By hand"');
  });
});

describe('the rows of a week', () => {
  const rows = (start: string, end: string, weekdays = [1, 2, 3, 4, 5, 6, 7]) =>
    renderToStaticMarkup(
      createElement(WeekRowsEditor, {
        rows: [{ weekdays, start, end }],
        start: '12:00',
        end: '00:00',
        onChange: () => undefined,
        emptyHint: 'Closed on the other days.',
      }),
    );

  it('says why a row holds the save back: equal times, or one missing', () => {
    // A bar open round the clock, written as it is said.
    expect(rows('00:00', '00:00')).toContain('Start and end time must differ.');
    expect(rows('', '02:00')).toContain('Fill in both times.');
    expect(rows('18:00', '')).toContain('Fill in both times.');
    expect(rows('', '')).not.toContain('must differ');
  });

  it('says nothing about a row that is whole', () => {
    expect(rows('12:00', '00:00')).not.toContain('must differ');
    expect(rows('12:00', '00:00')).not.toContain('Fill in both times.');
    expect(rows('12:00', '00:00', [])).toContain('Pick the days for each set of hours, or remove the row.');
  });
});

describe('a person’s own hours, folded', () => {
  // 18–02, and to four on Fridays.
  const own = { mode: 'own' as const, start: '18:00', end: '02:00', rows: [{ weekdays: [5], start: '18:00', end: '04:00' }] };
  const said = (hours: typeof own, today: string) => usualLine(hours, null, [], [], (key) => key, today);

  it('says today’s time, a weekday of its own included', () => {
    expect(said(own, '2026-11-13')).toBe('Own hours · 18-4');
    expect(said(own, '2026-11-12')).toBe('Own hours · 18-2');
  });

  it('goes by the main pair while a row is half set, as a save would', () => {
    expect(said({ ...own, rows: [{ weekdays: [], start: '18:00', end: '04:00' }] }, '2026-11-13')).toBe('Own hours · 18-2');
  });
});

describe('focus', () => {
  /** The text inside each ref={…} of a source, braces matched. */
  function refsIn(source: string): string[] {
    const found: string[] = [];

    for (let at = source.indexOf('ref={'); at !== -1; at = source.indexOf('ref={', at + 1)) {
      let depth = 0;
      let end = at + 'ref='.length;

      do {
        if (source[end] === '{') depth += 1;
        else if (source[end] === '}') depth -= 1;

        end += 1;
      } while (depth > 0 && end < source.length);

      found.push(source.slice(at + 'ref={'.length, end - 1));
    }

    return found;
  }

  it('is never taken from a ref, which React runs again on every render and would pull the caret from the box being typed in', () => {
    const dirs = [new URL('../src/components/roster/', import.meta.url), new URL('../src/app/roster/', import.meta.url)];

    for (const dir of dirs) {
      for (const file of readdirSync(dir).filter((name) => name.endsWith('.tsx'))) {
        for (const ref of refsIn(readFileSync(new URL(file, dir), 'utf8'))) {
          expect(ref, `${file}: ref={${ref}}`).not.toMatch(/\.focus\(/);
        }
      }
    }
  });
});

describe('the month toolbar', () => {
  it('drops its leading icons under 360 px, where the three words alone share one row down to 320', () => {
    const html = renderToStaticMarkup(
      createElement(FillMenu, {
        over: false,
        from: '2026-11-13',
        busy: false,
        onFill: () => undefined,
        onRepeat: () => undefined,
        onClear: () => undefined,
      }),
    );
    const summary = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(html)?.[1] ?? '';
    const icons = [...summary.matchAll(/<svg[^>]*>/g)].map(([tag]) => (/class="([^"]*)"/.exec(tag)?.[1] ?? '').split(' '));

    expect(TOOLBAR_ICON).toBe('max-[360px]:hidden');
    // The spark goes; the chevron that says it is a menu stays.
    expect(icons[0]).toContain(TOOLBAR_ICON);
    expect(icons[1]).not.toContain(TOOLBAR_ICON);
  });
});
