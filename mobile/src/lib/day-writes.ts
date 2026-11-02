import { CalendarDayData } from './types';

/**
 * This phone's own writes to one day.
 *
 * The day screen saves a day and a running clock writes the same day, and a
 * day takes one version at a time: raced against each other they would refuse
 * one another, and the refusal reads as an edit from another device. So they
 * take turns, and a write that did not come from the screen tells the screen
 * what came back, before anything else can be sent.
 */

type Listener = (answer: CalendarDayData) => void;

const lines = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<Listener>>();

/** Runs a write once every earlier one for that date has finished, however it finished. */
export const inTurn = <T>(date: string, write: () => Promise<T>): Promise<T> => {
  const turn = (lines.get(date) ?? Promise.resolve()).then(write);
  const finished = turn.catch(() => undefined);

  lines.set(date, finished);

  void finished.then(() => {
    if (lines.get(date) === finished) lines.delete(date);
  });

  return turn;
};

/** Listens for what this phone's clock writes to a date. Hands back how to stop. */
export const hearDay = (date: string, listener: Listener): (() => void) => {
  const known = listeners.get(date) ?? new Set<Listener>();

  known.add(listener);
  listeners.set(date, known);

  return () => {
    known.delete(listener);

    if (known.size === 0 && listeners.get(date) === known) listeners.delete(date);
  };
};

/** Tells whoever has the date open what a clock write came back with. */
export const tellDay = (date: string, answer: CalendarDayData): void => {
  for (const listener of listeners.get(date) ?? []) listener(answer);
};
