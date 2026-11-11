'use client';

import { useEffect, useRef, useState } from 'react';

import { RosterRefusal, createRosterSaves, watchLeaving } from './saves';
import { SaveState } from './save-queue';

/** The roster's saves as the page sees them: where they stand, and a queue for each roster. */
export function useRosterSaves(onRefused: (refusal: RosterRefusal) => void) {
  const [state, setState] = useState<SaveState>('idle');
  const [failure, setFailure] = useState<string | null>(null);

  // Held in a ref: a queue lives far longer than the render that made it.
  const refused = useRef(onRefused);

  useEffect(() => {
    refused.current = onRefused;
  });

  const [saves] = useState(() =>
    createRosterSaves({
      onChange: (overall, reason) => {
        setState(overall);
        setFailure(reason);
      },
      onRefused: (refusal) => refused.current(refusal),
    }),
  );

  // Leaving, in every sense: another tab, another page, the app put away.
  useEffect(() => {
    const stop = watchLeaving(saves, window, document);

    return () => {
      stop();
      saves.flush();
    };
  }, [saves]);

  return { state, failure, queueFor: saves.queueFor, flush: saves.flush };
}
