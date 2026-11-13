import { RosterEdit, editKey } from './edits';

/** How long «Отменить» stays offered after a one-tap put, a swap or a fill: long enough to see the slip, short enough not to undo something since forgotten. */
export const UNDO_FOR = 5000;

export interface Undo {
  /** Offers these, over whatever was offered before, for UNDO_FOR. */
  offer: (edits: RosterEdit[]) => void;
  /** What is on offer, taken back so it cannot run twice. */
  take: () => RosterEdit[];
  /** Withdraws the offer: the month or roster moved on. */
  drop: () => void;
  /** An edit made since. The offer goes if it would put one of the same cells back, since that would wipe this edit out with the action it undoes. */
  touch: (edit: RosterEdit) => void;
}

/** The edits that would put back the last undoable action, there for a few seconds and then let go. */
export function createUndo(onChange: (edits: RosterEdit[] | null) => void): Undo {
  let held: RosterEdit[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const become = (edits: RosterEdit[] | null): void => {
    held = edits;
    onChange(edits);
  };

  const drop = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;

    if (held !== null) become(null);
  };

  return {
    offer: (edits) => {
      drop();

      if (edits.length === 0) return;

      become(edits);
      timer = setTimeout(drop, UNDO_FOR);
    },

    take: () => {
      const edits = held ?? [];

      drop();

      return edits;
    },

    drop,

    touch: (edit) => {
      const key = editKey(edit);

      if (held?.some((back) => editKey(back) === key) === true) drop();
    },
  };
}
