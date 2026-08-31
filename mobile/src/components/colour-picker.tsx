import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Press } from '@/components/motion';
import { buzz } from '@/lib/haptics';
import { Palette } from '@/constants/theme';
import { t } from '@/lib/i18n';
import { usePalette } from '@/store/palette';

/**
 * Picking a colour, with the palette this person keeps.
 *
 * The saved colours sit above the stock ones, because somebody who took the
 * trouble to save their venue's violet wants that violet first. A long press
 * on a saved swatch forgets it — a menu for six pixels would be worse than
 * the gesture.
 */
export const MARK_COLOURS = [
  '#FF5C7A', '#FFA53D', '#F5C518', '#5CD65C', '#22C55E', '#14B8A6',
  '#38BDF8', '#6366F1', '#A855F7', '#EC4899', '#64748B', '#334155',
];

export function ColourPicker({
  palette,
  value,
  onPick,
  saveable = true,
}: {
  palette: Palette;
  value: string | null;
  onPick: (colour: string | null) => void;
  saveable?: boolean;
}) {
  const styles = makeStyles(palette);
  const saved = usePalette((state) => state.colours);
  const savePalette = usePalette((state) => state.save);
  const forgetPalette = usePalette((state) => state.forget);

  const kept = value !== null && saved.includes(value.toUpperCase());

  return (
    <View style={styles.wrap}>
      {saved.length > 0 && (
        <>
          <Text style={styles.mineLabel}>{t('Мои цвета')}</Text>
          <View style={styles.row}>
            {saved.map((colour) => (
              <Press
                key={colour}
                style={[
                  styles.swatch,
                  { backgroundColor: colour },
                  value?.toUpperCase() === colour && styles.swatchOn,
                ]}
                onPress={() => {
                  buzz.choose();
                  onPick(colour);
                }}
                onLongPress={() => {
                  buzz.commit();
                  forgetPalette(colour);
                }}
              >
                <Ionicons
                  name="checkmark"
                  size={15}
                  color={value?.toUpperCase() === colour ? '#fff' : 'transparent'}
                />
              </Press>
            ))}
          </View>
        </>
      )}

      <View style={styles.row}>
        {MARK_COLOURS.map((colour) => (
          <Press
            key={colour}
            style={[
              styles.swatch,
              { backgroundColor: colour },
              value?.toUpperCase() === colour && styles.swatchOn,
            ]}
            onPress={() => {
              buzz.choose();
              // Tapping the picked colour again clears it: the template goes
              // back to borrowing its place's.
              onPick(value?.toUpperCase() === colour ? null : colour);
            }}
          >
            <Ionicons
              name="checkmark"
              size={15}
              color={value?.toUpperCase() === colour ? '#fff' : 'transparent'}
            />
          </Press>
        ))}

        {saveable && value !== null && !kept && (
          <Press
            style={[styles.swatch, styles.saveSwatch]}
            onPress={() => {
              buzz.won();
              savePalette(value);
            }}
          >
            <Ionicons name="add" size={16} color={palette.textSecondary} />
          </Press>
        )}
      </View>
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    wrap: { gap: 6 },
    mineLabel: {
      color: palette.textSecondary,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    swatch: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatchOn: { borderWidth: 2, borderColor: palette.text },
    saveSwatch: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: palette.border,
    },
  });
