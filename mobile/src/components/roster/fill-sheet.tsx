import { useState } from 'react';
import { Text, View } from 'react-native';

import { Press } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { t } from '@/lib/i18n';
import { dayMonth } from '@/lib/roster';

import { Sheet } from './sheet';
import { makeRosterStyles } from './styles';

/**
 * Three ways to fill a month. By working days comes first: «Как в прошлом
 * месяце» copies by weekday, which breaks a 2/2 rhythm. Clearing takes a
 * second press, and never touches a day already gone by.
 */
export function FillSheet({
  open,
  from,
  palette,
  onClose,
  onGone,
  onFill,
  onRepeat,
  onClear,
}: {
  /** False while it slides away with something waiting for it to go. */
  open: boolean;
  /** Where a fill or a clear would start, or null for a month already over. */
  from: string | null;
  palette: Palette;
  onClose: () => void;
  /** Once it is off the screen, for what has to wait for that. */
  onGone: () => void;
  onFill: () => void;
  onRepeat: () => void;
  onClear: () => void;
}) {
  const styles = makeRosterStyles(palette);
  const [arming, setArming] = useState(false);
  const over = from === null;

  return (
    <Sheet palette={palette} open={open} onClose={onClose} onGone={onGone}>
      <Text style={styles.sheetTitle}>{t('Заполнить месяц')}</Text>

      <Press style={[styles.menuRow, over && styles.dimmed]} disabled={over} scale={0.99} onPress={onFill}>
        <Text style={styles.menuText}>{t('По рабочим дням')}</Text>
        <Text style={styles.menuSub}>{over ? t('Этот месяц уже прошёл.') : t('Каждого — в его дни и часы')}</Text>
      </Press>

      <Press style={styles.menuRow} scale={0.99} onPress={onRepeat}>
        <Text style={styles.menuText}>{t('Как в прошлом месяце')}</Text>
      </Press>

      <View style={styles.divider} />

      <Press
        style={[styles.menuRow, over && styles.dimmed]}
        disabled={over}
        scale={0.99}
        onPress={() => (arming ? onClear() : setArming(true))}
      >
        <Text style={[styles.menuText, styles.dangerText]}>
          {arming && from !== null ? `${t('Нажмите ещё раз — уберём смены с')} ${dayMonth(from)}` : t('Очистить месяц')}
        </Text>
        {over && <Text style={styles.menuSub}>{t('Этот месяц уже прошёл.')}</Text>}
      </Press>
    </Sheet>
  );
}
