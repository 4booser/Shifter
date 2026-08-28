import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

import { Palette } from '@/constants/theme';

/**
 * Asked once, at load. Both checks matter: the second exists because some iOS
 * 26 betas ship the component without the API behind it, and finding that out
 * at render time means finding it out as a crash.
 */
const GLASS = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

/**
 * A bar that floats over the calendar.
 *
 * On iOS 26 it is real glass and the month moves underneath it, which is the
 * whole reason to float something rather than dock it. Everywhere else it is
 * the card it always was — the same shape, the same shadow, an opaque
 * background — because a translucent panel with nothing behind it to refract
 * is just a washed-out card.
 */
export function Floating({
  children,
  style,
  palette,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  palette: Palette;
}) {
  const shape = [styles.base, { borderColor: palette.border }, style];

  if (!GLASS) {
    return <View style={[shape, { backgroundColor: palette.backgroundElement }]}>{children}</View>;
  }

  return (
    <GlassView style={shape} glassEffectStyle="regular" isInteractive>
      {children}
    </GlassView>
  );
}

/** True where the floating chrome is really glass, for anything that has to know. */
export const glassy = GLASS;

const styles = StyleSheet.create({
  base: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
});
