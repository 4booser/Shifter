import * as Haptics from 'expo-haptics';
import { ReactNode, useEffect } from 'react';
import { Pressable, StyleProp, TextInput, TextStyle, ViewStyle } from 'react-native';
import { spaced } from '@/lib/format';
import Animated, {
  FadeInDown,
  withRepeat,
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
 * The shape of what is coming, while it comes.
 *
 * A spinner says "wait" and nothing else, and the screen it sits on jumps
 * when the answer lands. A block the size of the thing being fetched says
 * what is on its way and leaves the layout where it will end up — which is
 * the difference between an app that is loading and an app that is stuck.
 */
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

/**
 * A stack of card-shaped placeholders, for a list that is on its way.
 *
 * The count is small on purpose: three blocks read as "a list is coming" and
 * ten read as a list, which is a lie the moment the real one is shorter.
 */
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
