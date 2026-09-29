/**
 * Five colour steps from the quantiles of the distinct values, so a month of
 * identical ₴1 495 days does not swallow four steps; fewer than eight
 * distinct values collapse to «recorded / not».
 */
export function heatThresholds(values: number[]): number[] {
  const unique = [...new Set(values)].sort((a, b) => a - b);

  if (unique.length < 8) return [];

  return [0.2, 0.4, 0.6, 0.8].map((q) => unique[Math.min(unique.length - 1, Math.floor(unique.length * q))]);
}

/** Maps a value to a step 1..5 given the thresholds of its own distribution. */
export function heatStep(values: number[]): (value: number) => 1 | 2 | 3 | 4 | 5 {
  const thresholds = heatThresholds(values);

  return (value) => {
    if (thresholds.length === 0) return 3;

    let step = 1;

    for (const t of thresholds) if (value > t) step += 1;

    return step as 1 | 2 | 3 | 4 | 5;
  };
}
