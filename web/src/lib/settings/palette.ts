'use client';

import { create } from 'zustand';

import { accountApi } from '@/lib/api/auth';

/**
 * The colours somebody saved to reuse.
 *
 * Kept on the account rather than in this browser: a palette picked on a
 * laptop should be waiting on the phone the same evening. The store is
 * optimistic — a swatch appears the moment it is saved and steps back if the
 * server refuses, because a colour that vanishes for a second reads as a bug.
 */
interface PaletteState {
  colours: string[];
  loaded: boolean;
  load: () => void;
  save: (colour: string) => void;
  forget: (colour: string) => void;
}

export const usePalette = create<PaletteState>((set, get) => ({
  colours: [],
  loaded: false,

  load: () => {
    if (get().loaded) return;

    set({ loaded: true });

    void accountApi
      .get()
      .then((profile) => set({ colours: profile.colour_presets ?? [] }))
      .catch(() => undefined);
  },

  save: (colour) => {
    const value = colour.trim().toUpperCase();

    if (get().colours.includes(value)) return;

    const was = get().colours;
    const next = [value, ...was].slice(0, 24);

    set({ colours: next });
    void accountApi.setColours(next).catch(() => set({ colours: was }));
  },

  forget: (colour) => {
    const was = get().colours;
    const next = was.filter((one) => one !== colour.trim().toUpperCase());

    set({ colours: next });
    void accountApi.setColours(next).catch(() => set({ colours: was }));
  },
}));
