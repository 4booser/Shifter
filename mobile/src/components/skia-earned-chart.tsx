import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SkiaClimb } from '@/components/skia-climb';
import { Palette } from '@/constants/theme';
import { running } from '@/lib/pace';
import { t } from '@/lib/i18n';
import { CalendarDayData, money } from '@/lib/types';

/**
 * The period's money as a climb, the way the site draws it: a filled line of
 * what is recorded, and the previous period as a pale ghost underneath — the
 * comparison that turns «₴47 000» into «and last month this day was ₴21 000».
 * GPU-drawn (Victory XL over Skia); a finger on it names the day.
 */
const dayCount = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

export function SkiaEarnedChart({
  palette,
  days,
  from,
  to,
  today,
  ghost,
  format = money,
}: {
  palette: Palette;
  days: CalendarDayData[];
  from: string;
  to: string;
  /** Today's key — the fact line stops here on a period still running. */
  today: string;
  ghost: { days: CalendarDayData[]; from: string; to: string } | null;
  format?: (value: number) => string;
}) {
  const styles = makeStyles(palette);
  const [picked, setPicked] = useState<number | null>(null);

  const fact = useMemo(() => running(days, from, to), [days, from, to]);
  const pale = useMemo(
    () => (ghost === null ? null : running(ghost.days, ghost.from, ghost.to)),
    [ghost],
  );

  // A period still running stops its line at today; a finished one runs whole.
  const cut = today >= from && today <= to ? dayCount(from, today) : fact.length;

  // Nothing recorded, nothing to climb: the card's absence is the empty state.
  if (fact.length < 3 || fact.length > 400 || (fact[cut - 1] ?? 0) === 0) return null;

  const value = picked !== null ? (picked <= cut ? fact[picked - 1] : null) : null;
  const was = picked !== null && pale !== null ? (pale[picked - 1] ?? null) : null;

  return (
    <View>
      <Text style={styles.hint}>
        {picked !== null
          ? `${t('День')} ${picked}${value !== null ? ` — ${format(value)}` : ''}${
              was !== null ? ` · ${t('было')} ${format(was)}` : ''
            }`
          : pale !== null
            ? t('Плотная линия — этот период, бледная — прошлый. Веди пальцем — цифры дня.')
            : t('Веди пальцем — цифры дня.')}
      </Text>
      <SkiaClimb fact={fact} ghost={pale} cut={cut} palette={palette} onPick={setPicked} />
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    hint: { color: palette.textSecondary, fontSize: 12, lineHeight: 16, marginBottom: 8 },
  });
