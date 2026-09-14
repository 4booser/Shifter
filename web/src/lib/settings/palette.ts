'use client';

import { create } from 'zustand';

import { accountApi } from '@/lib/api/auth';

/** The colours somebody saved to reuse. */
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
