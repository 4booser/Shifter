import { afterEach, describe, expect, it, vi } from 'vitest';

import { rosterApi } from '@/lib/api/roster';

/** The real client in front of a fetch that remembers what it was asked. */
function fetched() {
  const fetch = vi.fn(async (_path: string, _init?: RequestInit) => new Response(null, { status: 204 }));

  vi.stubGlobal('fetch', fetch);

  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the last save on the way out of a page', () => {
  it('reaches fetch as a request that outlives the page', async () => {
    const fetch = fetched();

    await rosterApi.saveCells(7, [], [], true);

    expect(fetch.mock.calls[0][1]?.keepalive).toBe(true);
  });

  it('leaves every other request an ordinary one', async () => {
    const fetch = fetched();

    await rosterApi.saveCells(7, [], []);

    expect(fetch.mock.calls[0][1]?.keepalive).toBeFalsy();
  });
});
