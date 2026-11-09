import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictModal } from '@/components/dashboard/modals/conflict-modal';
import { DaySave } from '@/lib/calendar/models';
import { catalogueActions } from '@/lib/store/calendar';

const state = vi.hoisted(() => ({ conflict: null as unknown, days: new Map() }));

vi.mock('@/lib/store/calendar', () => ({
  useCalendar: (select: (held: typeof state) => unknown) => select(state),
  catalogueActions: { dropConflict: vi.fn(), leaveConflict: vi.fn(), overwriteConflict: vi.fn() },
}));

vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/settings/money', () => ({ useMoney: () => ({ format: (value: number) => `${value}` }) }));

const mine = { shifts: [], sales: [], tips: 100, note: null } as unknown as DaySave;

/** The modal as it would be drawn, without drawing it. */
const drawn = () => ConflictModal() as unknown as { props: { onClose: () => void; children: unknown } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the conflict modal', () => {
  it('closed with Escape or the backdrop leaves the question unanswered rather than keeping theirs', () => {
    state.conflict = { date: '2026-11-06', mine, queuedAt: 1 };

    drawn().props.onClose();

    expect(catalogueActions.leaveConflict).toHaveBeenCalledTimes(1);
    expect(catalogueActions.dropConflict).not.toHaveBeenCalled();
  });

  it('says what keeping theirs gives up on a queued copy, and only there', () => {
    state.conflict = { date: '2026-11-06', mine, queuedAt: 1 };

    expect(JSON.stringify(drawn().props.children)).toContain('Keeping theirs gives up only that');

    state.conflict = { date: '2026-11-06', mine };

    expect(JSON.stringify(drawn().props.children)).toContain('Nothing is merged');
  });
});
