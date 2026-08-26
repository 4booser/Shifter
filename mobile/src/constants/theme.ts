import { Platform } from 'react-native';

/**
 * Shifter's own palette — the same tokens the web client draws with, so the
 * app is recognisably the same product from the first screen.
 */
export interface Palette {
  text: string;
  textSecondary: string;
  background: string;
  backgroundElement: string;
  backgroundSelected: string;
  border: string;
  accent: string;
  accentSoft: string;
  good: string;
  danger: string;
}

export const Colors: Record<'light' | 'dark', Palette> = {
  light: {
    text: '#26221a',
    textSecondary: '#6f6a5e',
    background: '#f6f1e7',
    backgroundElement: '#fdfaf3',
    backgroundSelected: '#efe8d8',
    border: '#e4dcc9',
    accent: '#4f46e5',
    accentSoft: 'rgba(79, 70, 229, 0.10)',
    good: '#177a4b',
    danger: '#b3372f',
  },
  dark: {
    text: '#ece9e2',
    textSecondary: '#a09b8f',
    background: '#16140f',
    backgroundElement: '#1f1c15',
    backgroundSelected: '#2a2619',
    border: '#332f22',
    accent: '#7b7ef5',
    accentSoft: 'rgba(123, 126, 245, 0.14)',
    good: '#4fc98d',
    danger: '#e06a63',
  },
};

export type ThemeColor = keyof Palette;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', mono: 'ui-monospace' },
  default: { sans: 'normal', mono: 'monospace' },
});
