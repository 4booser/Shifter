import { create } from 'zustand';

import { api } from '@/lib/api';

/**
 * The colours this person saved to reuse.
 *
 * Mirrors the web store: the palette lives on the account, so one picked on
 * a laptop is waiting here the same evening. Optimistic on purpose — a
 * swatch that blinks out for a second while a request lands reads as a bug.
 */
interface PaletteState {
  colours: string[];
  loaded: boolean;
  load: () => void;
  save: (colour: string) => void;
  forget: (colour: string) => void;
}

const push = (colours: string[]) =>
  void api('/shifter/v1/auth/colours', { method: 'PUT', body: { colours } }).catch(
    () => undefined,
  );

export const usePalette = create<PaletteState>((set, get) => ({
  colours: [],
  loaded: false,

  load: () => {
    if (get().loaded) return;

    set({ loaded: true });

    void api<{ colour_presets?: string[] | null }>('/shifter/v1/account')
      .then((profile) => set({ colours: profile.colour_presets ?? [] }))
      .catch(() => undefined);
  },

  save: (colour) => {
    const value = colour.trim().toUpperCase();

    if (get().colours.includes(value)) return;

    const was = get().colours;
    const next = [value, ...was].slice(0, 24);

    set({ colours: next });
    push(next);
  },

  forget: (colour) => {
    const was = get().colours;
    const next = was.filter((one) => one !== colour.trim().toUpperCase());

    set({ colours: next });
    push(next);
  },
}));
