import { describe, expect, it } from 'vitest';

import { balance, top } from '@/lib/mono-flow';

const band = (name: string, total: number) => ({ name, total });

const sum = (bands: { total: number }[]) =>
  bands.reduce((total, one) => total + one.total, 0);

describe('the two sides of the picture', () => {
  it('adds up on both sides when more came in than went out', () => {
    const sides = balance(
      [band('Зарплата', 30_000), band('Оля', 2_000)],
      [band('Продукты', 12_000), band('Аренда', 15_000)],
      32_000,
      27_000,
    );

    expect(sum(sides.left)).toBe(32_000);
    expect(sum(sides.right)).toBe(32_000);
    expect(sides.right.at(-1)).toEqual({ name: 'осталось', total: 5_000 });
  });

  it('names the shortfall rather than letting the picture not add up', () => {
    // Spending more than arrived is an ordinary month, and the difference came
    // from somewhere. Drawing it as a gap would leave the reader to work out
    // that the money came out of their balance.
    const sides = balance(
      [band('Зарплата', 20_000)],
      [band('Аренда', 25_000)],
      20_000,
      25_000,
    );

    expect(sides.left.at(-1)).toEqual({ name: 'из остатка', total: 5_000 });
    expect(sum(sides.left)).toBe(25_000);
    expect(sum(sides.right)).toBe(25_000);
  });

  it('adds nothing to either side when the month came out even', () => {
    const sides = balance([band('Зарплата', 20_000)], [band('Аренда', 20_000)], 20_000, 20_000);

    expect(sides.left).toHaveLength(1);
    expect(sides.right).toHaveLength(1);
  });
});

describe('gathering the tail', () => {
  it('keeps the largest few and gathers the rest rather than dropping it', () => {
    // Dropping the tail would make the two sides stop adding up, which is the
    // one thing this picture must never do.
    const bands = [1_000, 900, 800, 700, 600, 500, 400].map((total, index) =>
      band(`#${index}`, total),
    );

    const kept = top(bands, 5);

    expect(kept).toHaveLength(6);
    expect(kept.at(-1)).toEqual({ name: 'остальное', total: 900 });
    expect(sum(kept)).toBe(sum(bands));
  });

  it('leaves a short list alone', () => {
    const bands = [band('a', 10), band('b', 5)];

    expect(top(bands, 5)).toEqual([band('a', 10), band('b', 5)]);
  });

  it('drops bands worth nothing, which would draw as invisible slivers', () => {
    expect(top([band('a', 10), band('b', 0)], 5)).toEqual([band('a', 10)]);
  });

  it('orders by size, because the picture is read top down', () => {
    expect(top([band('small', 1), band('big', 100)], 5).map((one) => one.name))
      .toEqual(['big', 'small']);
  });
});
