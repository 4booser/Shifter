import * as Haptics from 'expo-haptics';
import { ReactNode, useEffect } from 'react';
import { Pressable, StyleProp, TextInput, TextStyle, ViewStyle } from 'react-native';
import { spaced } from '@/lib/format';
import Animated, {
  FadeInDown,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/**
 * The app's movement, in three pieces.
 *
 * There was none: every screen appeared fully formed and every button was a
 * rectangle that changed opacity. Motion is not decoration here — a control
 * that answers the finger is a control people trust, and a number that travels
 * to its new value is a number people notice changed. Kept to three primitives
 * on purpose, because an app where everything moves is an app where nothing
 * reads.
 */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedInput = Animated.createAnimatedComponent(TextInput);

/**
 * A control that gives way under a thumb and springs back.
 *
 * The scale is deliberately small: past about four percent it reads as a
 * gimmick rather than as the surface yielding.
 */
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
        if (haptic) void Haptics.selectionAsync();
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

/**
 * A card that arrives rather than being there already.
 *
 * The stagger is capped: past eight rows the delay is longer than anybody
 * waits, and a list that unrolls slowly reads as a slow app.
 */
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

/**
 * A number that travels to its new value.
 *
 * Driven entirely on the UI thread through an uneditable TextInput, which is
 * the only text in React Native whose content an animation can reach. A
 * setState every frame would work and would re-render the screen sixty times
 * a second to move four digits.
 */
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

  useEffect(() => {
    at.value = withTiming(value, { duration });
  }, [value, duration, at]);

  const props = useAnimatedProps(() => {
    const text = `${prefix}${spaced(at.value)}${suffix}`;

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
      value={`${prefix}${spaced(value)}${suffix}`}
    />
  );
}
