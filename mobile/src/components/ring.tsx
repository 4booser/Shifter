import { useEffect } from 'react';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** How far through the shift you are, as a ring. */
export function Ring({
  progress,
  size = 268,
  width = 14,
  colour,
  track,
  children,
}: {
  /** 0..1, clamped by the caller where it can exceed one. */
  progress: number;
  size?: number;
  width?: number;
  colour: string;
  track: string;
  children?: React.ReactNode;
}) {
  const radius = (size - width) / 2;
  const circumference = 2 * Math.PI * radius;
  const at = useSharedValue(progress);

  // In an effect, not in the render body.
  useEffect(() => {
    at.value = withTiming(progress, { duration: 900 });
  }, [progress, at]);

  const sweep = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - Math.max(0, Math.min(1, at.value))),
  }));

  return (
    <Animated.View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={track}
          strokeWidth={width}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colour}
          strokeWidth={width}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={sweep}
          // Twelve o'clock rather than three: a clock face is the only thing
          // anybody has ever read a ring as.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      {children}
    </Animated.View>
  );
}
