/** Whether the owner has had the word about positions, opening hours and filling the month. Said once per device. */

const KEY = 'shifter.roster.news.positions';

/** Private mode can throw on storage, and a throw reads as seen: a note that cannot be put away should not show at all. */
export function newsSeen(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return true;
  }
}

export function markNewsSeen(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Nowhere to keep it; the note goes for this visit all the same.
  }
}
