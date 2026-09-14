import { ReactNode, useEffect } from 'react';
import { Pressable, StyleProp, TextInput, TextStyle, ViewStyle } from 'react-native';
import { cssInterop } from 'nativewind';

import { eyeShut } from '@/lib/eye';
import { spaced } from '@/lib/format';
import { buzz } from '@/lib/haptics';
import Animated, {
  FadeInDown,
  withRepeat,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/** The app's movement, in three pieces. */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedInput = Animated.createAnimatedComponent(TextInput);

/** A control that gives way under a thumb and springs back. */
export function Press({
  children,
  style,
  onPress,
  onLongPress,
  disabled = false,
  /** Off where a press already has its own feedback, like a paint stroke. */
  haptic = true,
  scale = 0.965,
  hitSlop,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** NativeWind's door: mapped onto `style` via cssInterop below. */
  className?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  haptic?: boolean;
  scale?: number;
  hitSlop?: number;
  accessibilityLabel?: string;
}) {
  const down = useSharedValue(0);
  const shape = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - down.value * (1 - scale) }],
    opacity: 1 - down.value * 0.12,
  }));

  return (
    <AnimatedPressable
      style={[style, shape]}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => {
        down.value = withTiming(1, { duration: 80 });
        if (haptic) buzz.choose();
      }}
      onPressOut={() => {
        down.value = withSpring(0, { damping: 15, stiffness: 320, mass: 0.5 });
      }}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {children}
    </AnimatedPressable>
  );
}

/** A card that arrives rather than being there already. */
export function Appear({
  children,
  index = 0,
  style,
}: {
  children: ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      style={style}
      entering={FadeInDown.delay(Math.min(index, 8) * 45)
        .duration(300)
        .springify()
        .damping(18)}
    >
      {children}
    </Animated.View>
  );
}

/** The shape of what is coming, while it comes. */
export function Skeleton({
  width,
  height,
  radius = 12,
  colour,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  colour: string;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useSharedValue(0.4);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.9, { duration: 850 }), -1, true);
  }, [pulse]);

  const fade = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: colour }, fade, style]}
    />
  );
}

/** A stack of card-shaped placeholders, for a list that is on its way. */
export function Loading({
  colour,
  rows = 3,
  height = 92,
  style,
}: {
  colour: string;
  rows?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View style={[{ gap: 10 }, style]}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} width="100%" height={height} radius={18} colour={colour} />
      ))}
    </Animated.View>
  );
}

/** A number that travels to its new value. */
export function Roll({
  value,
  prefix = '',
  suffix = '',
  style,
  duration = 650,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  style?: StyleProp<TextStyle>;
  duration?: number;
}) {
  const at = useSharedValue(value);

  // Captured per render: the root remounts when the eye flips, so a stale
  // closure over it cannot outlive the toggle.
  const shuttered = eyeShut();

  useEffect(() => {
    at.value = withTiming(value, { duration });
  }, [value, duration, at]);

  const props = useAnimatedProps(() => {
    const text = shuttered ? `${prefix}•••${suffix}` : `${prefix}${spaced(at.value)}${suffix}`;

    return { text, defaultValue: text };
  });

  return (
    <AnimatedInput
      editable={false}
      // The caret and the platform's own padding both have to go, or the
      // number sits a few pixels off from the text beside it.
      caretHidden
      underlineColorAndroid="transparent"
      style={[{ padding: 0 }, style]}
      animatedProps={props}
      value={shuttered ? `${prefix}•••${suffix}` : `${prefix}${spaced(value)}${suffix}`}
    />
  );
}

// NativeWind: let `className` land on Press/Appear as their style prop, so
// migrated screens can speak Tailwind to the same primitives.
cssInterop(Press, { className: 'style' });
cssInterop(Appear, { className: 'style' });
