import { MonoClientInfo, MonoStatementItem } from './mono';

/**
 * The bank on a test drive: ninety days of a believable barista's statement,
 * generated in this browser. No token, no requests, nothing stored — the
 * point is to let somebody see what the page does with a statement before
 * deciding to paste a real one into it.
 *
 * Deterministic on purpose: everyone sees the same example, which makes it
 * explainable («на примере видно...») and screenshot-stable.
 */

/** A small seeded generator — Math.random would redraw the demo every reload. */
function rng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;

    return state / 4294967296;
  };
}

const DAY = 86_400;

interface Draft {
  daysAgo: number;
  hour: number;
  description: string;
  mcc: number;
  amount: number;
  cashback?: number;
}

export function demoClient(): MonoClientInfo {
  return {
    clientId: 'demo',
    name: 'Приклад Показовий',
    webHookUrl: '',
    permissions: 'psf',
    accounts: [
      {
        id: 'demo-card',
        sendId: 'demo',
        balance: 0, // filled from the statement's running balance below
        creditLimit: 0,
        type: 'black',
        currencyCode: 980,
        cashbackType: 'UAH',
        maskedPan: ['537541******1234'],
        iban: 'UA000000000000000000000001234',
      },
    ],
    jars: [],
  };
}

export function demoStatement(now: number): MonoStatementItem[] {
  const random = rng(20260831);
  const drafts: Draft[] = [];
  const spread = (base: number, wobble: number) => Math.round(base + (random() - 0.5) * 2 * wobble);

  for (let daysAgo = 90; daysAgo >= 0; daysAgo -= 1) {
    const weekday = new Date((now - daysAgo * DAY) * 1000).getDay();
    const dayOfMonth = new Date((now - daysAgo * DAY) * 1000).getDate();

    // The wage lands twice a month — the credit the whole page anchors on.
    if (dayOfMonth === 5 || dayOfMonth === 20)
      drafts.push({ daysAgo, hour: 11, description: 'Зарплата, ТОВ «Кавова хата»', mcc: 0, amount: spread(19_500_00, 1_500_00) });

    // Groceries most days that are not shifts-heavy.
    if (random() < 0.55)
      drafts.push({ daysAgo, hour: 19, description: random() < 0.5 ? 'АТБ' : 'Сільпо', mcc: 5411, amount: -spread(420_00, 260_00), cashback: 4_00 });

    // Coffee & lunches.
    if (random() < 0.4)
      drafts.push({ daysAgo, hour: 13, description: 'Кав’ярня «Мулен»', mcc: 5814, amount: -spread(160_00, 70_00) });

    // Transport on weekdays; taxi home after weekend nights.
    if (weekday >= 1 && weekday <= 5 && random() < 0.6)
      drafts.push({ daysAgo, hour: 9, description: 'Київ Digital: транспорт', mcc: 4111, amount: -20_00 });
    if ((weekday === 6 || weekday === 0) && random() < 0.5)
      drafts.push({ daysAgo, hour: 2, description: 'Uklon', mcc: 4121, amount: -spread(180_00, 90_00) });

    // The monthly fixed line-up: the subscriptions the detector should find.
    if (dayOfMonth === 3) drafts.push({ daysAgo, hour: 8, description: 'Netflix', mcc: 4899, amount: -199_00 });
    if (dayOfMonth === 7) drafts.push({ daysAgo, hour: 8, description: 'Spotify', mcc: 5968, amount: -125_00 });
    if (dayOfMonth === 11) drafts.push({ daysAgo, hour: 8, description: 'iCloud+', mcc: 5968, amount: -99_00 });
    if (dayOfMonth === 25) drafts.push({ daysAgo, hour: 10, description: 'Київенерго: комуналка', mcc: 4900, amount: -spread(1_650_00, 250_00) });
    if (dayOfMonth === 25) drafts.push({ daysAgo, hour: 10, description: 'lifecell: поповнення', mcc: 4814, amount: -150_00 });

    // A pharmacy run and the odd bigger buy.
    if (random() < 0.12)
      drafts.push({ daysAgo, hour: 17, description: 'Аптека АНЦ', mcc: 5912, amount: -spread(240_00, 150_00) });
    if (random() < 0.06)
      drafts.push({ daysAgo, hour: 15, description: 'Rozetka', mcc: 5732, amount: -spread(1_400_00, 900_00), cashback: 28_00 });

    // Tips arriving as small card transfers now and then.
    if (random() < 0.2)
      drafts.push({ daysAgo, hour: 23, description: 'Переказ від Олег К.', mcc: 4829, amount: spread(250_00, 120_00) });
  }

  // Oldest first for the running balance, newest first for the store.
  drafts.sort((one, two) => two.daysAgo - one.daysAgo || one.hour - two.hour);

  let balance = 6_200_00;
  const items: MonoStatementItem[] = drafts.map((draft, index) => {
    balance += draft.amount;

    return {
      id: `demo-${index}`,
      time: now - draft.daysAgo * DAY - (24 - draft.hour) * 3_600,
      description: draft.description,
      mcc: draft.mcc,
      originalMcc: draft.mcc,
      hold: false,
      amount: draft.amount,
      operationAmount: draft.amount,
      currencyCode: 980,
      commissionRate: 0,
      cashbackAmount: draft.cashback ?? 0,
      balance,
    };
  });

  return items.reverse();
}
