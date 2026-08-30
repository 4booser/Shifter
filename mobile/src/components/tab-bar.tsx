import { Ionicons } from '@expo/vector-icons';
// Through expo-router rather than from @react-navigation directly: the router
// re-exports the navigator it actually mounts, and the two can be different
// copies with incompatible types.
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Palette } from '@/constants/theme';
import { buzz } from '@/lib/haptics';

const PILL_HEIGHT = 30;

/**
 * The bar that is on screen the whole time.
 *
 * The default one is five grey icons that turn blue, and it is the single
 * most-looked-at piece of the app. A pill that travels to the tab you picked
 * says where you are with a shape rather than with a colour, which survives
 * being glanced at, and it answers the thumb: a tab that taps back is a tab
 * people trust they hit.
 */
export function TabBar({
  state,
  descriptors,
  navigation,
  palette,
  icons,
}: BottomTabBarProps & {
  palette: Palette;
  /** Route name to icon, so the bar owns no knowledge of the screens. */
  icons: Record<string, keyof typeof Ionicons.glyphMap>;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const styles = makeStyles(palette);

  const count = state.routes.length;
  const slot = width / count;
  const pillWidth = Math.min(slot - 18, 62);
  const at = useSharedValue(state.index);

  useEffect(() => {
    at.value = withSpring(state.index, { damping: 18, stiffness: 210, mass: 0.6 });
  }, [state.index, at]);

  const pill = useAnimatedStyle(() => ({
    transform: [{ translateX: at.value * slot + (slot - pillWidth) / 2 }],
  }));

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom || 8 }]}>
      <Animated.View
        style={[styles.pill, { width: pillWidth, height: PILL_HEIGHT }, pill]}
        pointerEvents="none"
      />

      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = typeof options.title === 'string' ? options.title : route.name;
        const active = state.index === index;

        return (
          <Pressable
            key={route.key}
            style={styles.tab}
            accessibilityRole="button"
            accessibilityState={active ? { selected: true } : {}}
            accessibilityLabel={label}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (active || event.defaultPrevented) return;

              buzz.choose();
              navigation.navigate(route.name);
            }}
          >
            <Ionicons
              // The filled variant for the tab you are on: the difference
              // reads at a glance where a colour change alone does not.
              name={active ? icons[route.name] : (`${icons[route.name]}-outline` as never)}
              size={21}
              color={active ? palette.accent : palette.textSecondary}
            />
            <Text
              style={[styles.label, active && styles.labelOn]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      backgroundColor: palette.backgroundElement,
      borderTopWidth: 1,
      borderTopColor: palette.border,
      paddingTop: 8,
    },
    pill: {
      position: 'absolute',
      top: 4,
      left: 0,
      borderRadius: 12,
      backgroundColor: palette.accentSoft,
    },
    tab: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 2 },
    label: { color: palette.textSecondary, fontSize: 10, fontWeight: '600' },
    labelOn: { color: palette.accent, fontWeight: '800' },
  });
