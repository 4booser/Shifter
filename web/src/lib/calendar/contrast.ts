/**
 * Which ink stays readable on a given background.
 *
 * A filled day used to state its number in white whatever colour was under it.
 * That held while the only fills were dark, but the palette now runs from a
 * pale lemon to near-black and the light themes mix the fill towards a white
 * surface rather than a dark one — white on pale green is not a colour scheme,
 * it is a missing number.
 */

/** sRGB relative luminance, per WCAG 2.1. */
export function luminance(hex: string): number {
  const rgb = toRgb(hex);

  if (rgb === null) return 0;

  const channel = (value: number): number => {
    const v = value / 255;

    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/**
 * Near-black rather than pure black: the ink sits on a saturated ground, and
 * #000 against colour reads as a hole punched in the cell.
 */
export function readableInk(hex: string): string {
  // The crossover, not a guess: the two inks give the same contrast ratio where
  // (L + 0.05)² = 1.05 × (L_ink + 0.05), which for this near-black lands at
  // L ≈ 0.199. Sky blue sits at 0.44 — picking the midpoint instead would hand
  // it white text at 2.1:1, well under the 4.5:1 this has to clear.
  return luminance(hex) > 0.199 ? '#16181d' : '#ffffff';
}

function toRgb(hex: string): [number, number, number] | null {
  const value = hex.trim().replace('#', '');

  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}
