import { describe, expect, it } from 'vitest';

import { MonoAccount, MonoRate, MonoStatementItem, convert, ratesDay, wealth } from '@/lib/mono';
import {
  counterparties,
  flow,
  incomeSources,
  isTransfer,
  merchantKey,
  monthlyCost,
  oddities,
  recurring,
  refunds,
  chargesAhead,
} from '@/lib/mono-insights';
import {
  CategoryRule,
  categorise,
  isUsable,
  ruleFrom,
  budgetState,
  ruleHits,
  spendingByRules,
} from '@/lib/mono-rules';

const at = (day: string, hour = 12): number =>
  Math.floor(new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).getTime() / 1000);

const item = (over: Partial<MonoStatementItem> & { day?: string }): MonoStatementItem => {
  const { day, ...rest } = over;

  return {
    id: Math.random().toString(36).slice(2),
    time: day === undefined ? at('2026-08-10') : at(day),
    description: 'Something',
    mcc: 5411,
    originalMcc: 5411,
    hold: false,
    amount: -10000,
    operationAmount: -10000,
    currencyCode: 980,
    commissionRate: 0,
    cashbackAmount: 0,
    balance: 100000,
    ...rest,
  };
};

describe('categories the person assigned', () => {
  it('lets a rule beat the code the terminal gave itself', () => {
    // 5541 is a petrol station, and the shop inside one sells groceries.
    const petrol = item({ description: 'WOG SHOP 12', mcc: 5541 });
    const rules: CategoryRule[] = [{ id: '1', contains: 'wog shop', category: 'Продукты' }];

    expect(categorise(petrol, [])).toBe('Транспорт');
    expect(categorise(petrol, rules)).toBe('Продукты');
  });

  it('falls back to the MCC when nothing matches', () => {
    expect(categorise(item({ mcc: 5811 }), [{ id: '1', contains: 'nope', category: 'X' }]))
      .toBe('Кафе и бары');
  });

  it('takes the first matching rule, and the order is the person’s', () => {
    const line = item({ description: 'SILPO 4021', mcc: 5411 });
    const groceries: CategoryRule = { id: '1', contains: 'silpo', category: 'Продукты' };
    const big: CategoryRule = { id: '2', min: 50, category: 'Крупное' };

    expect(categorise(line, [groceries, big])).toBe('Продукты');
    expect(categorise(line, [big, groceries])).toBe('Крупное');
  });

  it('matches on size rather than sign, because that is how people say it', () => {
    const rule: CategoryRule = { id: '1', min: 500, category: 'Крупное' };

    expect(categorise(item({ amount: -60000 }), [rule])).toBe('Крупное');
    expect(categorise(item({ amount: 60000 }), [rule])).toBe('Крупное');
    expect(categorise(item({ amount: -10000 }), [rule])).not.toBe('Крупное');
  });

  it('refuses a rule with nothing to match on', () => {
    // An empty rule would take the whole statement into one category.
    const empty: CategoryRule = { id: '1', category: 'Всё' };

    expect(isUsable(empty)).toBe(false);
    expect(categorise(item({}), [empty])).toBe('Продукты');
  });

  it('counts what each rule caught, so a typo can be seen', () => {
    const items = [
      item({ description: 'SILPO 1' }),
      item({ description: 'SILPO 2' }),
      item({ description: 'ATB 5' }),
    ];
    const rules: CategoryRule[] = [
      { id: 'silpo', contains: 'silpo', category: 'Продукты' },
      { id: 'typo', contains: 'sipo', category: 'Продукты' },
    ];

    expect(ruleHits(items, rules)).toEqual({ silpo: 2, typo: 0 });
  });

  it('shows a shadowed rule the zero it really has', () => {
    const items = [item({ description: 'SILPO 1' })];
    const rules: CategoryRule[] = [
      { id: 'first', contains: 'silpo', category: 'Продукты' },
      { id: 'second', contains: 'silpo', category: 'Другое' },
    ];

    expect(ruleHits(items, rules)).toEqual({ first: 1, second: 0 });
  });

  it('applies the rules to the whole history, not only to what comes next', () => {
    const items = [
      item({ day: '2026-08-01', description: 'WOG SHOP', mcc: 5541, amount: -20000 }),
      item({ day: '2026-08-02', description: 'WOG SHOP', mcc: 5541, amount: -30000 }),
    ];
    const rules: CategoryRule[] = [{ id: '1', contains: 'wog', category: 'Продукты' }];

    const [top] = spendingByRules(items, rules, '2026-08-01', '2026-08-31');

    expect(top).toEqual({ name: 'Продукты', total: 500, count: 2 });
  });

  it('builds a rule out of a line, keeping the whole name', () => {
    // Shortening it would be the app deciding which half of "SILPO 4021 KYIV"
    // is the shop, and it would be wrong about half the time.
    const rule = ruleFrom(item({ description: 'SILPO 4021 KYIV' }), 'Продукты');

    expect(rule.contains).toBe('SILPO 4021 KYIV');
    expect(rule.category).toBe('Продукты');
  });
});

describe('who the money went to', () => {
  it('reads both spellings of one shop as one shop', () => {
    expect(merchantKey('МАКДОНАЛЬДЗ №42')).toBe(merchantKey('MAKDONALDZ 42'));
    expect(merchantKey('SILPO 4021')).toBe(merchantKey('Silpo  8890 '));
  });

  it('keeps two differently-named shops apart rather than guessing', () => {
    // Stripping a trailing word would merge these, and would also merge every
    // pair of shops whose names happen to start alike. Being wrong quietly is
    // worse here than showing one shop on two rows.
    expect(merchantKey('COFFEE HOUSE')).not.toBe(merchantKey('COFFEE SHOP'));
    expect(merchantKey('SILPO KYIV')).not.toBe(merchantKey('SILPO'));
  });

  it('adds up a counterparty and keeps its tidiest name', () => {
    const items = [
      item({ day: '2026-08-02', description: 'SILPO 4021', amount: -20000 }),
      item({ day: '2026-08-09', description: 'SILPO', amount: -10000 }),
      item({ day: '2026-08-20', description: 'ATB 5', amount: -50000 }),
    ];

    const [biggest, second] = counterparties(items, '2026-08-01', '2026-08-31');

    expect(biggest.name).toBe('ATB 5');
    expect(biggest.total).toBe(500);
    expect(second.name).toBe('SILPO');
    expect(second.total).toBe(300);
    expect(second.count).toBe(2);
    expect(second.average).toBe(150);
    expect(second.first).toBe('2026-08-02');
    expect(second.last).toBe('2026-08-09');
  });

  it('leaves money coming in out of it', () => {
    const items = [item({ description: 'SALARY', amount: 500000 })];

    expect(counterparties(items, '2026-08-01', '2026-08-31')).toEqual([]);
  });
});

describe('standing charges', () => {
  const monthly = (name: string, amount: number, days: string[]) =>
    days.map((day) => item({ day, description: name, amount: -amount * 100 }));

  it('finds a charge that comes round every month', () => {
    const items = monthly('NETFLIX', 199, ['2026-06-05', '2026-07-05', '2026-08-05']);

    const [found] = recurring(items, '2026-08-31');

    expect(found.name).toBe('NETFLIX');
    expect(found.amount).toBe(199);
    expect(found.period).toBe('month');
    expect(found.charges).toBe(3);
    expect(found.last).toBe('2026-08-05');
    // 30.5 rounds to 31: the honest «через месяц» lands on the 5th in
    // every timezone now, not just west of Greenwich.
    expect(found.next).toBe('2026-09-05');
  });

  it('will not call two charges a subscription', () => {
    // Two is a coincidence, and calling it one puts an invented figure into
    // somebody's forecast.
    const items = monthly('GYM', 500, ['2026-07-05', '2026-08-05']);

    expect(recurring(items, '2026-08-31')).toEqual([]);
  });

  it('ignores a shop visited on a rhythm for whatever it costs', () => {
    const items = [
      item({ day: '2026-06-05', description: 'SILPO', amount: -20000 }),
      item({ day: '2026-07-05', description: 'SILPO', amount: -95000 }),
      item({ day: '2026-08-05', description: 'SILPO', amount: -41000 }),
    ];

    expect(recurring(items, '2026-08-31')).toEqual([]);
  });

  it('will not stretch a rhythm across a gap that breaks it', () => {
    const items = monthly('X', 100, ['2026-01-05', '2026-02-05', '2026-08-05']);

    expect(recurring(items, '2026-08-31')).toEqual([]);
  });

  it('marks something that started inside the window as new', () => {
    const weekly = monthly('NEW THING', 80, ['2026-08-15', '2026-08-22', '2026-08-29']);
    const old = monthly('OLD THING', 80, [
      '2026-07-04', '2026-07-11', '2026-07-18', '2026-07-25',
      '2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29',
    ]);

    const rows = recurring([...weekly, ...old], '2026-08-31');

    expect(rows.find((row) => row.name === 'NEW THING')?.fresh).toBe(true);
    expect(rows.find((row) => row.name === 'OLD THING')?.fresh).toBe(false);
  });

it('drops a rhythm that stopped instead of predicting a past date', () => {
    // Three clean weekly charges, then silence for a month: the series is
    // over, and «next around 10.08» said in September is a dead row talking.
    const stopped = monthly('OLD PASS', 70, ['2026-07-20', '2026-07-27', '2026-08-03']);

    expect(recurring(stopped, '2026-09-01')).toEqual([]);
  });

  it('costs a month the same however often it comes round', () => {
    const weekly = monthly('PASS', 70, ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22']);
    const rows = recurring(weekly, '2026-08-31');

    expect(rows[0].period).toBe('week');
    expect(Math.round(monthlyCost(rows))).toBe(300);
  });
});

describe('refunds', () => {
  it('pairs a refund with the purchase it undoes', () => {
    const purchase = item({ day: '2026-08-02', description: 'ZARA 12', amount: -150000 });
    const refund = item({ day: '2026-08-09', description: 'ZARA 12', amount: 150000 });

    const [pair] = refunds([purchase, refund]);

    expect(pair.purchase.id).toBe(purchase.id);
    expect(pair.refund.id).toBe(refund.id);
  });

  it('leaves a credit alone when nothing matches it', () => {
    const wage = item({ day: '2026-08-09', description: 'SALARY', amount: 1500000 });

    expect(refunds([wage])).toEqual([]);
  });

  it('does not take a purchase that came after the refund', () => {
    const refund = item({ day: '2026-08-02', description: 'ZARA', amount: 150000 });
    const later = item({ day: '2026-08-09', description: 'ZARA', amount: -150000 });

    expect(refunds([refund, later])).toEqual([]);
  });
});

describe('what the money did', () => {
  it('counts a transfer as neither earned nor spent', () => {
    // Counted as both, a month looks twice as rich and twice as wasteful,
    // and neither figure is true.
    const items = [
      item({ day: '2026-08-01', description: 'На власну картку', mcc: 4829, amount: -100000 }),
      item({ day: '2026-08-02', description: 'ATB', mcc: 5411, amount: -20000 }),
      item({ day: '2026-08-03', description: 'SALARY', mcc: 4829, amount: 1500000 }),
    ];

    const totals = flow(items, '2026-08-01', '2026-08-31');

    expect(isTransfer(items[0])).toBe(true);
    expect(totals.spent).toBe(200);
    expect(totals.earned).toBe(0);
    expect(totals.moved).toBe(16_000);
  });

  it('nets a refunded purchase out of both sides', () => {
    const items = [
      item({ day: '2026-08-02', description: 'ZARA', mcc: 5651, amount: -150000 }),
      item({ day: '2026-08-09', description: 'ZARA', mcc: 5651, amount: 150000 }),
      item({ day: '2026-08-10', description: 'ATB', mcc: 5411, amount: -20000 }),
    ];

    const totals = flow(items, '2026-08-01', '2026-08-31');

    expect(totals.spent).toBe(200);
    expect(totals.earned).toBe(0);
    expect(totals.returned).toBe(1500);
  });
});

describe('lines worth a second look', () => {
  it('asks about a charge far bigger than the usual one there', () => {
    const usual = ['2026-08-01', '2026-08-05', '2026-08-09', '2026-08-13'].map((day) =>
      item({ day, description: 'COFFEE', amount: -8000 }),
    );
    const big = item({ day: '2026-08-20', description: 'COFFEE', amount: -60000 });

    const [odd] = oddities([...usual, big], '2026-08-01', '2026-08-31');

    expect(odd.item.id).toBe(big.id);
  });

  it('says nothing about a shop it has only seen twice', () => {
    const items = [
      item({ day: '2026-08-01', description: 'NEW', amount: -8000 }),
      item({ day: '2026-08-20', description: 'NEW', amount: -80000 }),
    ];

    expect(oddities(items, '2026-08-01', '2026-08-31')).toEqual([]);
  });
});

describe('what somebody has, across accounts', () => {
  const account = (over: Partial<MonoAccount>): MonoAccount => ({
    id: Math.random().toString(36).slice(2),
    sendId: '',
    balance: 0,
    creditLimit: 0,
    type: 'black',
    currencyCode: 980,
    cashbackType: 'UAH',
    maskedPan: [],
    iban: '',
    ...over,
  });

  const rates: MonoRate[] = [
    { currencyCodeA: 840, currencyCodeB: 980, date: 1_790_000_000, rateBuy: 41, rateSell: 42 },
    { currencyCodeA: 978, currencyCodeB: 980, date: 1_790_000_000, rateBuy: 45, rateSell: 46 },
  ];

  it('never adds the bank’s money to the person’s', () => {
    // "12 400 on the card, 2 400 of it yours" is two numbers and two different
    // feelings. Adding them tells somebody they are five times richer.
    const totals = wealth([account({ balance: 1_240_000, creditLimit: 1_000_000 })], [], rates);

    expect(totals.own).toBe(2_400);
    expect(totals.credit).toBe(10_000);
  });

  it('converts at the published mid-rate', () => {
    const totals = wealth([account({ balance: 10_000, currencyCode: 840 })], [], rates);

    // A hundred dollars, between 41 and 42.
    expect(totals.own).toBe(4_150);
  });

  it('counts a jar apart from a card', () => {
    const jar = { id: 'j', sendId: '', title: 'Macbook', description: '', currencyCode: 980, balance: 64_200 };

    const totals = wealth([account({ balance: 274_700 })], [jar], rates);

    expect(totals.own).toBe(2_747);
    expect(totals.jars).toBe(642);
  });

  it('says how many it could not convert rather than guessing', () => {
    const totals = wealth([account({ balance: 10_000, currencyCode: 985 })], [], rates);

    expect(totals.own).toBe(0);
    expect(totals.unconverted).toBe(1);
  });

  it('goes through the hryvnia when the pair is not quoted', () => {
    // Dollars into euro: the bank quotes both against the hryvnia and neither
    // against the other.
    const got = convert(100, 840, 978, rates);

    expect(got).not.toBeNull();
    expect(Math.round(got!)).toBe(91);
  });

  it('names the day the rate was published', () => {
    expect(ratesDay(rates)).toBe(new Date(1_790_000_000 * 1000).toISOString().slice(0, 10));
    expect(ratesDay([])).toBeNull();
  });
});

describe('a limit and the pace inside the month', () => {
  const spending = [{ name: 'Продукты', total: 6_200 }, { name: 'Кафе и бары', total: 900 }];

  it('is comfortable on the twentieth and alarming on the eighth', () => {
    // The same 62% of a limit, read two ways. Without the pace the number
    // says nothing at all.
    const late = budgetState([{ category: 'Продукты', limit: 10_000 }], spending, 20, 31)[0];
    const early = budgetState([{ category: 'Продукты', limit: 10_000 }], spending, 8, 31)[0];

    expect(late.heading).toBe(false);
    expect(early.heading).toBe(true);
    expect(Math.round(early.projected)).toBe(24_025);
  });

  it('says over rather than heading once it is over', () => {
    const row = budgetState([{ category: 'Продукты', limit: 5_000 }], spending, 20, 31)[0];

    expect(row.over).toBe(true);
    expect(row.heading).toBe(false);
  });

  it('will not project from the first days of a month', () => {
    // One coat on the 2nd projects to five times the limit and says nothing
    // except that somebody bought a coat.
    const row = budgetState([{ category: 'Продукты', limit: 10_000 }], spending, 2, 31)[0];

    expect(row.heading).toBe(false);
  });

  it('puts the tightest budget first', () => {
    const rows = budgetState(
      [
        { category: 'Кафе и бары', limit: 10_000 },
        { category: 'Продукты', limit: 8_000 },
      ],
      spending,
      15,
      31,
    );

    expect(rows.map((row) => row.category)).toEqual(['Продукты', 'Кафе и бары']);
  });

  it('ignores a limit of nothing', () => {
    expect(budgetState([{ category: 'Продукты', limit: 0 }], spending, 15, 31)).toEqual([]);
  });

  it('counts a category with no spending as untouched rather than missing', () => {
    const row = budgetState([{ category: 'Одежда', limit: 3_000 }], spending, 15, 31)[0];

    expect(row.spent).toBe(0);
    expect(row.over).toBe(false);
    expect(row.heading).toBe(false);
  });
});

describe('where the money came from', () => {
  const range = ['2026-08-01', '2026-08-31'] as const;

  it('names the sources instead of summing them', () => {
    // "Доход 42 000" answers nothing a person did not already know. Which
    // part was wages and which was a friend paying back is the whole point.
    const sources = incomeSources(
      [
        item({ day: '2026-08-05', amount: 3_000_000, description: 'ТОВ БАР' }),
        item({ day: '2026-08-20', amount: 3_000_000, description: 'ТОВ БАР' }),
        item({ day: '2026-08-12', amount: 40_000, description: 'Оля К.' }),
      ],
      ...range,
    );

    expect(sources.map((row) => [row.name, row.total, row.count])).toEqual([
      ['ТОВ БАР', 60_000, 2],
      ['Оля К.', 400, 1],
    ]);
  });

  it('does not count moving your own money as earning it', () => {
    // Money pulled out of savings would otherwise turn a thin month into a
    // good one, and the person would be the only one who knew it had not been.
    const sources = incomeSources(
      [item({ day: '2026-08-05', amount: 5_000_000, description: 'З банки', mcc: 6012 })],
      ...range,
    );

    expect(sources).toEqual([]);
  });

  it('does not count a refund as income', () => {
    // The shop is giving back money that was already counted as spending;
    // counting it again makes the month look like it earned from a return.
    const bought = item({ day: '2026-08-05', amount: -120_000, description: 'ROZETKA' });
    const back = item({ day: '2026-08-08', amount: 120_000, description: 'ROZETKA' });

    expect(incomeSources([bought, back], ...range)).toEqual([]);
  });

  it('ignores what has not settled', () => {
    expect(
      incomeSources(
        [item({ day: '2026-08-05', amount: 100_000, description: 'ТОВ БАР', hold: true })],
        ...range,
      ),
    ).toEqual([]);
  });

  it('keeps the tidiest spelling of a repeated payer', () => {
    const sources = incomeSources(
      [
        item({ day: '2026-08-05', amount: 100_000, description: 'ТОВ БАР 4' }),
        item({ day: '2026-08-20', amount: 100_000, description: 'ТОВ БАР' }),
      ],
      ...range,
    );

    expect(sources).toHaveLength(1);
    expect(sources[0].name).toBe('ТОВ БАР');
  });

  it('does not merge two payers whose names merely start alike', () => {
    // Branch numbers fold together; extra words do not. "ТОВ БАР" and
    // "ТОВ БАР ЛТД" could be one company or two, and guessing wrong here
    // sums two employers into one wage.
    const sources = incomeSources(
      [
        item({ day: '2026-08-05', amount: 100_000, description: 'ТОВ БАР ЛТД' }),
        item({ day: '2026-08-20', amount: 100_000, description: 'ТОВ БАР' }),
      ],
      ...range,
    );

    expect(sources).toHaveLength(2);
  });
});

describe('standing charges projected forward (mirrored from web runway.spec)', () => {
  it('lands a monthly charge once and a weekly one every week', () => {
    const ahead = chargesAhead(
      [
        { name: 'Аренда', amount: 8_000, next: '2026-09-11', everyDays: 30 },
        { name: 'Спортзал', amount: 300, next: '2026-09-03', everyDays: 7 },
      ],
      '2026-09-01',
      14,
    );

    expect(ahead.filter((c) => c.name === 'Аренда')).toHaveLength(1);
    expect(ahead.filter((c) => c.name === 'Спортзал').map((c) => c.on)).toEqual([
      '2026-09-03',
      '2026-09-10',
    ]);
  });

  it('brings an overdue charge into the first projected day', () => {
    const ahead = chargesAhead(
      [{ name: 'Аренда', amount: 8_000, next: '2026-08-28', everyDays: 30 }],
      '2026-09-01',
      14,
    );

    expect(ahead[0].on).toBe('2026-09-01');
  });

  it('ignores what falls beyond the horizon', () => {
    const ahead = chargesAhead(
      [{ name: 'Аренда', amount: 8_000, next: '2026-10-20', everyDays: 30 }],
      '2026-09-01',
      14,
    );

    expect(ahead).toEqual([]);
  });
});
