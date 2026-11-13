'use client';

import { useEffect, useState } from 'react';

/** How long a finger stays down before a press becomes a hold. */
export const HOLD = 500;

/** What a button needs to tell a press from a hold. */
export interface LongPressHandlers {
  onPointerDown: (event: { pointerType: string }) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (event: { preventDefault: () => void }) => void;
  onKeyDown: () => void;
  onClick: () => void;
}

/**
 * A press and a hold on the same button: a plain press does the quick thing, a
 * hold or a right-click opens the day. One for a whole list, since only one
 * finger holds at a time. The click a finger makes on lifting after a hold is
 * swallowed, or the hold would do the press as well.
 */
export function longPress() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  // A touch hold already opened the day, so the click that follows is not a press.
  let held = false;

  const stop = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const bind = (onPress: () => void, onHold: () => void): LongPressHandlers => ({
    onPointerDown: (event) => {
      held = false;
      stop();

      // A mouse has its right button for this.
      if (event.pointerType === 'mouse') return;

      timer = setTimeout(() => {
        timer = null;
        held = true;
        onHold();
      }, HOLD);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    // The page scrolled under the finger: that was never a press.
    onPointerCancel: stop,
    onContextMenu: (event) => {
      event.preventDefault();

      // Android says contextmenu about when the timer fires; one opening is enough.
      if (held) return;

      const touching = timer !== null;

      stop();
      held = touching;
      onHold();
    },
    // A key press is never the tail of a hold.
    onKeyDown: () => {
      held = false;
    },
    onClick: () => {
      if (held) {
        held = false;

        return;
      }

      onPress();
    },
  });

  return { bind, stop };
}

/** longPress for a component's lifetime. */
export function useLongPress(): (onPress: () => void, onHold: () => void) => LongPressHandlers {
  const [presses] = useState(longPress);

  useEffect(() => presses.stop, [presses]);

  return presses.bind;
}
