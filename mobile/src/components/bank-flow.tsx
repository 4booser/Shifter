import { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Palette } from '@/constants/theme';
import { t } from '@/lib/i18n';
import { FlowBand, balance, spareNames } from '@/lib/mono-flow';
import { money } from '@/lib/types';

/**
 * The month as one picture: what came in, what went out, what stayed.
 *
 * Two lists and two totals is what every banking app shows, and it is exactly
 * the shape that hides the answer — a person can read "доход 42 000" and
 * "расход 39 000" all month without once noticing that a third of the income
 * was a friend paying them back.
 *
 * The middle bar is the honest part. Money is fungible: nobody can say which
 * hryvnia of the wage went on rent, so no ribbon runs from a source straight
 * to a category. Everything pools in the middle and fans out again, which is
 * the only claim the data supports.
 *
 * The two sides always balance. Spend more than came in and the shortfall
 * appears on the left as money taken out of the balance, named, rather than
 * the picture quietly not adding up.
 */

const CURVE = 0.42;

/**
 * A ribbon from one edge to the other: two cubics with mirrored handles, so it
 * leaves horizontal and arrives horizontal and the eye reads it as a flow
 * rather than as a shape.
 */
const ribbon = (
  x1: number, y1: number, h1: number,
  x2: number, y2: number, h2: number,
): string => {
  const c1 = x1 + (x2 - x1) * CURVE;
  const c2 = x2 - (x2 - x1) * CURVE;

  return [
    `M ${x1} ${y1}`,
    `C ${c1} ${y1} ${c2} ${y2} ${x2} ${y2}`,
    `L ${x2} ${y2 + h2}`,
    `C ${c2} ${y2 + h2} ${c1} ${y1 + h1} ${x1} ${y1 + h1}`,
    'Z',
  ].join(' ');
};

/** A colour stepped toward the surface, so rank reads without inventing hues. */
const step = (hex: string, towards: string, share: number): string => {
  const mix = (from: string, to: string) => {
    const one = parseInt(from, 16);
    const two = parseInt(to, 16);

    return Math.round(one + (two - one) * share)
      .toString(16)
      .padStart(2, '0');
  };

  return `#${mix(hex.slice(1, 3), towards.slice(1, 3))}${mix(hex.slice(3, 5), towards.slice(3, 5))}${mix(hex.slice(5, 7), towards.slice(5, 7))}`;
};

export function BankFlow({
  sources,
  categories,
  earned,
  spent,
  palette,
}: {
  sources: FlowBand[];
  categories: FlowBand[];
  earned: number;
  spent: number;
  palette: Palette;
}) {
  const [width, setWidth] = useState(0);
  const styles = useMemo(() => sheet(palette), [palette]);

  // Both sides are made to add to the same number. Where more went out than
  // came in, the difference is money taken out of the balance and it is drawn
  // and named — a picture that silently failed to balance would be worse than
  // no picture.
  const sides = useMemo(
    () => balance(sources, categories, earned, spent),
    [sources, categories, earned, spent],
  );

  // The made-up bands are drawn in the status colours, which here mean what
  // they mean everywhere else: money kept, and money that had to come out of
  // the balance. Marked by name rather than by position so a reordering
  // cannot quietly repaint a category green.
  const spare = spareNames();
  const left = sides.left;
  const right = sides.right;
  const total = sides.total;

  if (total <= 0 || left.length === 0 || right.length === 0) return null;

  const height = 26 * Math.max(left.length, right.length) + 30;
  const column = 9;
  const middle = width / 2 - column / 2;
  const gap = 3;

  // The gaps between bands come out of the drawable height, or a column of six
  // bands is taller than the column of one it is drawn against.
  const usable = (count: number) => height - gap * Math.max(0, count - 1);

  const place = (bands: { total: number }[]) => {
    const scale = usable(bands.length) / total;
    let y = 0;

    return bands.map((band) => {
      const at = y;

      y += band.total * scale + gap;

      return { y: at, h: Math.max(2, band.total * scale) };
    });
  };

  const leftAt = place(left);
  const rightAt = place(right);

  // The middle is one solid bar rather than segments: it is the pool, and
  // segmenting it would imply a source keeps its identity through it.
  let poolIn = 0;
  let poolOut = 0;

  return (
    <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
      <Text style={styles.title}>{t('Куда делся месяц')}</Text>

      {width > 0 && (
        <Svg width={width} height={height}>
          {left.map((band, index) => {
            const from = leftAt[index];
            const share = (from.h / usable(left.length)) * height;
            const at = poolIn;

            poolIn += share;

            return (
              <Path
                key={`in-${band.name}`}
                d={ribbon(column, from.y, from.h, middle, at, share)}
                fill={
                  spare.has(band.name)
                    ? palette.danger
                    : step(palette.accent, palette.background, 0.12 + index * 0.13)
                }
                opacity={0.55}
              />
            );
          })}

          {right.map((band, index) => {
            const to = rightAt[index];
            const share = (to.h / usable(right.length)) * height;
            const at = poolOut;

            poolOut += share;

            return (
              <Path
                key={`out-${band.name}`}
                d={ribbon(middle + column, at, share, width - column, to.y, to.h)}
                fill={
                  spare.has(band.name)
                    ? palette.good
                    : step(OUTWARD, palette.background, 0.12 + index * 0.13)
                }
                opacity={0.55}
              />
            );
          })}

          {left.map((band, index) => (
            <Rect
              key={`inbar-${band.name}`}
              x={0}
              y={leftAt[index].y}
              width={column}
              height={leftAt[index].h}
              rx={3}
              fill={spare.has(band.name) ? palette.danger : step(palette.accent, palette.background, 0.12 + index * 0.13)}
            />
          ))}

          {right.map((band, index) => (
            <Rect
              key={`outbar-${band.name}`}
              x={width - column}
              y={rightAt[index].y}
              width={column}
              height={rightAt[index].h}
              rx={3}
              fill={spare.has(band.name) ? palette.good : step(OUTWARD, palette.background, 0.12 + index * 0.13)}
            />
          ))}

          <Rect x={middle} y={0} width={column} height={height} rx={3} fill={palette.text} opacity={0.22} />
        </Svg>
      )}

      {/* Named beside the picture rather than inside it: six labels crammed
          between two columns on a phone is a picture nobody reads. */}
      <View style={styles.legend}>
        <View style={styles.legendSide}>
          {left.map((band, index) => (
            <View key={`inleg-${band.name}`} style={styles.legendRow}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      spare.has(band.name)
                        ? palette.danger
                        : step(palette.accent, palette.background, 0.12 + index * 0.13),
                  },
                ]}
              />
              <Text style={styles.legendName} numberOfLines={1}>{band.name}</Text>
              <Text style={styles.legendValue}>{money(band.total)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.legendSide}>
          {right.map((band, index) => (
            <View key={`outleg-${band.name}`} style={styles.legendRow}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      spare.has(band.name)
                        ? palette.good
                        : step(OUTWARD, palette.background, 0.12 + index * 0.13),
                  },
                ]}
              />
              <Text style={styles.legendName} numberOfLines={1}>{band.name}</Text>
              <Text style={styles.legendValue}>{money(band.total)}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * A second hue, as far from the accent as this palette goes and on the blue–
 * yellow axis, which is the one axis colour blindness leaves alone.
 */
const OUTWARD = '#a8761b';

const sheet = (palette: Palette) =>
  StyleSheet.create({
    title: { color: palette.text, fontSize: 13, fontWeight: '700', marginBottom: 8 },
    legend: { flexDirection: 'row', gap: 12, marginTop: 10 },
    legendSide: { flex: 1, gap: 4 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 3 },
    legendName: { color: palette.textSecondary, fontSize: 11.5, flex: 1 },
    legendValue: { color: palette.text, fontSize: 11.5, fontWeight: '700' },
  });
