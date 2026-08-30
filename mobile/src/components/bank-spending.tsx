import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Appear, Press } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { t } from '@/lib/i18n';
import { MonoStatementItem, dayOf } from '@/lib/mono';
import {
  Counterparty,
  cashback,
  counterparties,
  flow,
  incomeSources,
  monthlyCost,
  oddities,
  recurring,
} from '@/lib/mono-insights';
import {
  Budget,
  CategoryRule,
  budgetState,
  categorise,
  ruleFrom,
  ruleHits,
  spendingByRules,
} from '@/lib/mono-rules';
import { categoryDeltas, categoryStyle, dailySpend, merchantsIn, usualDay } from '@/lib/spend-viz';
import { money } from '@/lib/types';
import { statementCsv } from '@/lib/mono-export';
import { shareStatement } from '@/lib/mono-share';

type View3 = 'categories' | 'who' | 'standing';

const CATEGORY_CHOICES = [
  'Продукты',
  'Кафе и бары',
  'Транспорт',
  'Одежда',
  'Здоровье',
  'Дом',
  'Связь и подписки',
  'Развлечения',
  'Работа',
  'Другое',
];

/**
 * Where the money went, read three ways: by category, by who took it, and by
 * what takes it again every month.
 *
 * The three answer the same question at different distances. A category tells
 * somebody they spend on food; a counterparty tells them which place; a
 * standing charge tells them about the money that leaves whether they think
 * about it or not — which is the only one of the three nobody can see by
 * remembering.
 */
export function BankSpending({
  items,
  rules,
  budgets,
  from,
  to,
  palette,
  onRules,
  onBudget,
}: {
  items: MonoStatementItem[];
  rules: CategoryRule[];
  budgets: Budget[];
  from: string;
  to: string;
  palette: Palette;
  onRules: (rules: CategoryRule[]) => void;
  onBudget: (category: string, limit: number) => void;
}) {
  const styles = makeStyles(palette);
  const [view, setView] = useState<View3>('categories');
  const [assigning, setAssigning] = useState<Counterparty | null>(null);
  const [search, setSearch] = useState('');

  const inRange = useMemo(
    () => items.filter((item) => !item.hold && dayOf(item) >= from && dayOf(item) <= to),
    [items, from, to],
  );

  const categories = useMemo(
    () => spendingByRules(items, rules, from, to),
    [items, rules, from, to],
  );
  const people = useMemo(() => counterparties(items, from, to), [items, from, to]);
  const standing = useMemo(() => recurring(items, to), [items, to]);
  const odd = useMemo(() => oddities(items, from, to), [items, from, to]);
  const totals = useMemo(() => flow(items, from, to), [items, from, to]);
  const sources = useMemo(() => incomeSources(items, from, to), [items, from, to]);
  const hits = useMemo(() => ruleHits(inRange, rules), [inRange, rules]);

  // Last stretch of the same width, for the signed percent on each row.
  const previousRange = useMemo(() => {
    const start = new Date(`${from}T12:00:00`);
    const end = new Date(`${to}T12:00:00`);
    const width = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const prevEnd = new Date(start.getTime() - 86400000);
    const prevStart = new Date(prevEnd.getTime() - (width - 1) * 86400000);
    const key = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    return { from: key(prevStart), to: key(prevEnd) };
  }, [from, to]);

  const previous = useMemo(
    () => spendingByRules(items, rules, previousRange.from, previousRange.to),
    [items, rules, previousRange],
  );
  const deltas = useMemo(() => categoryDeltas(categories, previous), [categories, previous]);
  const days = useMemo(() => dailySpend(items, from, to), [items, from, to]);
  const usual = useMemo(() => usualDay(days), [days]);

  // One denominator for bar, shares and headline: everything that left the
  // card. flow() keeps transfers out of its totals — right for «пришло»,
  // wrong for a bar that must sum to its own category list.
  const spentAll = useMemo(() => deltas.reduce((sum, row) => sum + row.total, 0), [deltas]);
  const previousAll = useMemo(() => previous.reduce((sum, row) => sum + row.total, 0), [previous]);
  const spentDelta = previousAll > 0 ? Math.round(((spentAll - previousAll) / previousAll) * 100) : null;
  const [opened, setOpened] = useState<string | null>(null);

  // The bank puts a figure on every line and the app was throwing it away.
  const back = useMemo(
    () => cashback(items, (item) => categorise(item, rules), from, to),
    [items, rules, from, to],
  );

  // The pace inside the month, which is the whole of what makes a limit mean
  // anything: 62% spent is comfortable on the 20th and alarming on the 8th.
  const limits = useMemo(() => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    return budgetState(budgets, categories, now.getDate(), daysInMonth);
  }, [budgets, categories]);

  const [editing, setEditing] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [limitText, setLimitText] = useState('');

  const needle = search.trim().toLocaleLowerCase();
  const shown = needle === ''
    ? people
    : people.filter((row) => row.name.toLocaleLowerCase().includes(needle));

  if (items.length === 0) {
    return <Text style={styles.empty}>{t('Пока нечего разбирать — загрузите выписку.')}</Text>;
  }

  const peak = Math.max(1, ...categories.map((row) => row.total));

  return (
    <View style={styles.list}>
      {/* The headline: what the stretch took, and how that compares. */}
      <Appear>
        <View style={styles.headline}>
          <View style={{ flex: 1 }}>
            <Text style={styles.flowLabel}>{t('Потрачено за отрезок')}</Text>
            <Text style={[styles.headlineValue, { color: palette.danger }]}>
              {money(spentAll)}
            </Text>
            {spentDelta !== null && (
              <Text
                style={[
                  styles.headlineDelta,
                  { color: spentDelta > 8 ? palette.danger : spentDelta < -8 ? palette.good : palette.textSecondary },
                ]}
              >
                {spentDelta > 0 ? '▲' : spentDelta < 0 ? '▼' : '='} {Math.abs(spentDelta)}% {t('к прошлому отрезку')}
              </Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={styles.rowMeta}>
              {t('Пришло')} <Text style={{ color: palette.good, fontWeight: '700' }}>{money(totals.earned)}</Text>
            </Text>
            {usual > 0 && (
              <Text style={styles.rowMeta}>
                {t('Обычный день')} <Text style={{ fontWeight: '700', color: palette.text }}>{money(usual)}</Text>
              </Text>
            )}
          </View>
        </View>

        {/* One bar that sums to its own list; colour follows the category. */}
        <View style={styles.stack}>
          {deltas.slice(0, 8).map((row) => (
            <View
              key={row.name}
              style={{
                flexGrow: row.total,
                flexBasis: 1,
                backgroundColor: categoryStyle(row.name).hue,
                minWidth: 4,
              }}
            >
              {spentAll > 0 && row.total / spentAll > 0.16 && (
                <Text style={styles.stackLabel}>{Math.round((row.total / spentAll) * 100)}%</Text>
              )}
            </View>
          ))}
          {deltas.length > 8 && (
            <View style={{ flexGrow: deltas.slice(8).reduce((sum, row) => sum + row.total, 0), flexBasis: 1, backgroundColor: palette.backgroundSelected, minWidth: 4 }} />
          )}
        </View>

        {back.total > 0 && (
          <Text style={styles.note}>
            {t('Кешбэк вернул')} {money(back.total)}
            {back.byCategory.length > 0 && (
              <>
                {' — '}
                {t('больше всего с категории')} «{back.byCategory[0].name}»:{' '}
                {money(back.byCategory[0].earned)}
              </>
            )}
          </Text>
        )}

        {totals.moved > 0 && (
          <Text style={styles.note}>
            {t('Ещё')} {money(totals.moved)} {t('прошло переводами — они не в этих итогах: чей там счёт, выписка не говорит.')}
          </Text>
        )}
        {totals.returned > 0 && (
          <Text style={styles.note}>
            {money(totals.returned)} {t('вернулось — покупка и возврат сведены и не считаются дважды.')}
          </Text>
        )}
      </Appear>

      {/* What cannot be exported does not belong to the person holding it.
          It takes the window and the rules that are on the screen, so the
          file cannot disagree with the page it came from. */}
      <Press
        style={styles.export}
        onPress={() => {
          if (sharing) return;

          setSharing(true);

          void shareStatement(
            statementCsv(items, (item) => categorise(item, rules), from, to),
            from,
            to,
          ).finally(() => setSharing(false));
        }}
      >
        <Ionicons name="share-outline" size={14} color={palette.textSecondary} />
        <Text style={styles.exportText}>{t('Выгрузить выписку')}</Text>
      </Press>

      <View style={styles.tabs}>
        {(
          [
            ['categories', t('По категориям')],
            ['who', t('Кому')],
            ['standing', t('Регулярные')],
          ] as [View3, string][]
        ).map(([value, label]) => (
          <Press
            key={value}
            style={[styles.tab, view === value && styles.tabOn]}
            onPress={() => setView(value)}
          >
            <Text style={[styles.tabText, view === value && styles.tabTextOn]}>{label}</Text>
          </Press>
        ))}
      </View>

      {view === 'categories' && (
        <Appear>
          {limits.length > 0 && (
            <View style={styles.rules}>
              <Text style={styles.rulesHead}>{t('Лимиты на месяц')}</Text>
              {limits.map((row) => (
                <View key={row.category} style={{ gap: 4 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName} numberOfLines={1}>{row.category}</Text>
                    <Text
                      style={[
                        styles.rowValue,
                        row.over && { color: palette.danger },
                        row.heading && { color: palette.accent },
                      ]}
                    >
                      {money(row.spent)} / {money(row.limit)}
                    </Text>
                  </View>
                  {/* Two marks on one bar: what has gone, and how much of the
                      month has. The gap between them is the warning. */}
                  <View style={styles.track}>
                    <View
                      style={[
                        styles.fill,
                        {
                          width: `${Math.min(100, (row.spent / row.limit) * 100)}%`,
                          backgroundColor: row.over
                            ? palette.danger
                            : row.heading
                              ? palette.accent
                              : palette.good,
                        },
                      ]}
                    />
                    <View style={[styles.mark, { left: `${row.through * 100}%` }]} />
                  </View>
                  {(row.over || row.heading) && (
                    <Text style={styles.rowMeta}>
                      {row.over
                        ? t('Уже за лимитом.')
                        : `${t('Таким темпом к концу месяца выйдет')} ${money(Math.round(row.projected))}.`}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {deltas.slice(0, 10).map((row) => (
            <Press
              key={row.name}
              style={styles.row}
              onPress={() => setOpened(opened === row.name ? null : row.name)}
            >
              <View style={styles.rowTop}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View style={[styles.catDot, { backgroundColor: categoryStyle(row.name).hue }]}>
                    <Text style={styles.catMark}>{categoryStyle(row.name).mark}</Text>
                  </View>
                  <Text style={styles.rowName} numberOfLines={1}>{row.name}</Text>
                </View>
                <Text style={styles.rowValue}>{money(row.total)}</Text>
              </View>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${spentAll > 0 ? (row.total / spentAll) * 100 : 0}%`,
                      backgroundColor: categoryStyle(row.name).hue,
                    },
                  ]}
                />
              </View>
              <Text style={styles.rowMeta}>
                ×{row.count}
                {row.percent !== null && (
                  <Text style={{ color: row.percent > 10 ? palette.danger : row.percent < -10 ? palette.good : palette.textSecondary }}>
                    {' '}· {row.percent > 0 ? '+' : ''}{row.percent}%
                  </Text>
                )}
                {row.percent === null && row.previous === 0 && <Text style={{ color: palette.accent }}> · {t('новое')}</Text>}
                {opened === row.name ? '' : ` · ${t('тап — что внутри')}`}
              </Text>

              {opened === row.name && (
                <View style={styles.inside}>
                  {merchantsIn(items, rules, row.name, from, to).map((shop) => (
                    <View key={shop.name} style={styles.rowTop}>
                      <Text style={styles.insideName} numberOfLines={1}>{shop.name}</Text>
                      <Text style={styles.insideValue}>
                        {money(shop.total)}{shop.count > 1 ? ` ×${shop.count}` : ''}
                      </Text>
                    </View>
                  ))}
                  {row.previous > 0 && (
                    <Text style={styles.rowMeta}>{t('В прошлый отрезок было')} {money(row.previous)}.</Text>
                  )}
                  <Press
                    style={styles.limitLink}
                    onPress={() => {
                      setEditing(editing === row.name ? null : row.name);
                      setLimitText(`${budgets.find((one) => one.category === row.name)?.limit ?? ''}`);
                    }}
                  >
                    <Text style={{ color: palette.accent, fontSize: 12.5 }}>
                      {budgets.some((one) => one.category === row.name) ? t('Изменить лимит') : t('Поставить лимит на месяц')}
                    </Text>
                  </Press>
                </View>
              )}

              {editing === row.name && (
                <View style={styles.limitRow}>
                  <TextInput
                    style={styles.limitInput}
                    value={limitText}
                    onChangeText={setLimitText}
                    keyboardType="decimal-pad"
                    placeholder={t('Лимит на месяц')}
                    placeholderTextColor={palette.textSecondary}
                    autoFocus
                  />
                  <Press
                    style={styles.limitSave}
                    onPress={() => {
                      onBudget(row.name, Number(limitText.replace(',', '.')) || 0);
                      setEditing(null);
                    }}
                  >
                    <Text style={styles.limitSaveText}>{t('Ок')}</Text>
                  </Press>
                </View>
              )}
            </Press>
          ))}

          {days.some((day) => day.total > 0) && (
            <View style={{ marginTop: 4 }}>
              <Text style={styles.rulesHead}>{t('Месяц по дням')}</Text>
              {usual > 0 && (
                <Text style={styles.rowMeta}>
                  {t('Пунктиром — обычный день')}: {money(usual)}. {t('Медиана: один загул её не утащит.')}
                </Text>
              )}
              <View style={styles.rhythm}>
                {days.map((day) => {
                  const peakDay = Math.max(1, ...days.map((one) => one.total));
                  const weekend = [0, 6].includes(new Date(`${day.day}T12:00:00`).getDay());

                  return (
                    <View
                      key={day.day}
                      style={[
                        styles.rhythmBar,
                        {
                          height: `${Math.max(3, (day.total / peakDay) * 100)}%`,
                          backgroundColor: day.total === 0
                            ? palette.backgroundSelected
                            : weekend ? palette.accentSoft && palette.accent : palette.accent,
                          opacity: day.total === 0 ? 0.6 : weekend ? 0.95 : 0.75,
                        },
                      ]}
                    />
                  );
                })}
              </View>
              {(() => {
                const heaviest = days.reduce((best, day) => (day.total > best.total ? day : best), days[0]);

                if (heaviest === undefined || heaviest.total === 0) return null;

                const receipts = items
                  .filter((item) => item.amount < 0 && !item.hold && dayOf(item) === heaviest.day)
                  .sort((one, two) => one.amount - two.amount)
                  .slice(0, 2)
                  .map((item) => item.description)
                  .join(' + ');

                return (
                  <Text style={styles.rowMeta}>
                    {t('Тяжелее всего')} — {heaviest.day.slice(8)}.{heaviest.day.slice(5, 7)}, {money(heaviest.total)}
                    {receipts !== '' ? `: ${receipts}` : ''}. {t('Факт, не упрёк.')}
                  </Text>
                );
              })()}
            </View>
          )}

          {rules.length > 0 && (
            <View style={styles.rules}>
              <Text style={styles.rulesHead}>{t('Ваши правила')}</Text>
              {rules.map((rule) => (
                <View key={rule.id} style={styles.ruleRow}>
                  <View style={styles.grow}>
                    <Text style={styles.ruleName} numberOfLines={1}>
                      {rule.contains ?? `MCC ${rule.mcc}`} → {rule.category}
                    </Text>
                    <Text
                      style={[
                        styles.ruleMeta,
                        hits[rule.id] === 0 && { color: palette.danger },
                      ]}
                    >
                      {/* A rule that catches nothing is a typo, not a setting,
                          and nobody finds that out except by being told. */}
                      {hits[rule.id] === 0
                        ? t('ничего не поймало')
                        : `${t('поймало')} ${hits[rule.id]}`}
                    </Text>
                  </View>
                  <Press
                    hitSlop={10}
                    onPress={() => onRules(rules.filter((one) => one.id !== rule.id))}
                  >
                    <Ionicons name="close" size={18} color={palette.textSecondary} />
                  </Press>
                </View>
              ))}
            </View>
          )}
        </Appear>
      )}

      {view === 'who' && (
        <Appear>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={palette.textSecondary} />
            <TextInput
              style={styles.search}
              value={search}
              onChangeText={setSearch}
              placeholder={t('Найти по названию')}
              placeholderTextColor={palette.textSecondary}
            />
          </View>

          {shown.length === 0 && <Text style={styles.empty}>{t('Ничего не нашлось.')}</Text>}

          {shown.slice(0, 40).map((row) => (
            <Press key={row.key} style={styles.row} onPress={() => setAssigning(row)}>
              <View style={styles.rowTop}>
                <Text style={styles.rowName} numberOfLines={1}>{row.name}</Text>
                <Text style={styles.rowValue}>{money(row.total)}</Text>
              </View>
              <Text style={styles.rowMeta}>
                {row.count} {t('раз')} · {t('в среднем')} {money(row.average)} ·{' '}
                {t('с')} {row.first.slice(8)}.{row.first.slice(5, 7)}
              </Text>
            </Press>
          ))}

          {assigning !== null && (
            <View style={styles.sheet}>
              <Text style={styles.sheetHead} numberOfLines={1}>
                {assigning.name}
              </Text>
              <Text style={styles.sheetSub}>{t('Всегда считать это:')}</Text>
              <View style={styles.chips}>
                {CATEGORY_CHOICES.map((category) => (
                  <Press
                    key={category}
                    style={styles.chip}
                    onPress={() => {
                      onRules([
                        {
                          ...ruleFrom(
                            { description: assigning.name } as MonoStatementItem,
                            category,
                          ),
                          id: `${assigning.key}-${Date.now()}`,
                        },
                        ...rules,
                      ]);
                      setAssigning(null);
                    }}
                  >
                    <Text style={styles.chipText}>{category}</Text>
                  </Press>
                ))}
              </View>
              <Press style={styles.cancel} onPress={() => setAssigning(null)}>
                <Text style={styles.cancelText}>{t('Отмена')}</Text>
              </Press>
            </View>
          )}
        </Appear>
      )}

      {view === 'standing' && (
        <Appear>
          {standing.length === 0 ? (
            <Text style={styles.empty}>
              {t('Ничего регулярного не нашлось. Нужно хотя бы три списания подряд одинаковой суммы.')}
            </Text>
          ) : (
            <>
              <Text style={styles.total}>
                {standing.length} {t('регулярных на')} {money(monthlyCost(standing))} {t('в месяц')}
              </Text>

              {standing.map((row) => (
                <View key={row.key} style={styles.row}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {row.name}
                      {row.fresh && <Text style={styles.fresh}>  {t('новое')}</Text>}
                    </Text>
                    <Text style={styles.rowValue}>{money(row.amount)}</Text>
                  </View>
                  <Text style={styles.rowMeta}>
                    {row.period === 'week' ? t('раз в неделю') : t('раз в месяц')} ·{' '}
                    {t('следующее')} {row.next.slice(8)}.{row.next.slice(5, 7)} ·{' '}
                    {row.charges} {t('раз')}
                  </Text>
                </View>
              ))}
            </>
          )}
        </Appear>
      )}

      {odd.length > 0 && (
        <Appear>
          <View style={styles.rules}>
            <Text style={styles.rulesHead}>{t('Стоит посмотреть')}</Text>
            {odd.slice(0, 5).map((row) => (
              <View key={row.item.id} style={styles.ruleRow}>
                <View style={styles.grow}>
                  <Text style={styles.ruleName} numberOfLines={1}>
                    {row.item.description}
                  </Text>
                  {/* A question, never a finding: the app can see the size and
                      cannot see whether anything was wrong. */}
                  <Text style={styles.ruleMeta}>{t(row.because)}</Text>
                </View>
                <Text style={styles.rowValue}>{money(Math.abs(row.item.amount) / 100)}</Text>
              </View>
            ))}
          </View>
        </Appear>
      )}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    list: { gap: 12 },
    empty: { color: palette.textSecondary, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
    grow: { flex: 1, minWidth: 0 },

    headline: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
    headlineValue: { fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] },
    headlineDelta: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
    stack: { flexDirection: 'row', height: 26, borderRadius: 9, overflow: 'hidden', gap: 2, marginTop: 10 },
    stackLabel: { color: 'rgba(255,255,255,0.95)', fontSize: 10.5, fontWeight: '700', textAlign: 'center', lineHeight: 26 },
    catDot: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    catMark: { fontSize: 13 },
    inside: { marginTop: 8, borderRadius: 10, backgroundColor: palette.background, padding: 10, gap: 4 },
    insideName: { color: palette.text, fontSize: 12.5, flex: 1 },
    insideValue: { color: palette.text, fontSize: 12.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
    limitLink: { marginTop: 4 },
    rhythm: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 72, marginTop: 6 },
    rhythmBar: { flex: 1, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
    flow: { flexDirection: 'row', gap: 10 },
    flowPart: {
      flex: 1,
      backgroundColor: palette.backgroundElement,
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    flowLabel: { color: palette.textSecondary, fontSize: 11.5, marginBottom: 3 },
    flowValue: { color: palette.text, fontSize: 17, fontWeight: '800' },
    picture: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 16,
      padding: 12,
      marginTop: 10,
    },
    note: { color: palette.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 8 },

    export: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 10,
      paddingVertical: 9,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
    },
    exportText: { color: palette.textSecondary, fontSize: 12.5, fontWeight: '600' },

    tabs: { flexDirection: 'row', gap: 6, marginTop: 4 },
    tab: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: 9,
      alignItems: 'center',
      backgroundColor: palette.backgroundElement,
    },
    tabOn: { backgroundColor: palette.accentSoft },
    tabText: { color: palette.textSecondary, fontSize: 13, fontWeight: '600' },
    tabTextOn: { color: palette.accent, fontWeight: '800' },

    total: { color: palette.text, fontSize: 14, fontWeight: '700', marginTop: 2 },
    row: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 14,
      padding: 12,
      gap: 6,
    },
    rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    rowName: { flex: 1, color: palette.text, fontSize: 14.5, fontWeight: '600' },
    rowValue: { color: palette.text, fontSize: 14.5, fontWeight: '800' },
    rowMeta: { color: palette.textSecondary, fontSize: 12 },
    fresh: { color: palette.accent, fontSize: 12, fontWeight: '700' },

    track: { height: 5, borderRadius: 999, backgroundColor: palette.border },
    fill: { height: '100%', borderRadius: 999 },
    mark: {
      position: 'absolute',
      top: -3,
      width: 2,
      height: 11,
      borderRadius: 1,
      backgroundColor: palette.text,
    },
    limitRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    limitInput: {
      flex: 1,
      color: palette.text,
      fontSize: 14,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    limitSave: {
      backgroundColor: palette.accent,
      borderRadius: 10,
      paddingHorizontal: 16,
      justifyContent: 'center',
    },
    limitSaveText: { color: '#fff', fontSize: 14, fontWeight: '700' },

    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: palette.backgroundElement,
      borderRadius: 12,
      paddingHorizontal: 12,
      marginBottom: 4,
    },
    search: { flex: 1, color: palette.text, fontSize: 14, paddingVertical: 10 },

    rules: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 14,
      padding: 12,
      gap: 8,
      marginTop: 4,
    },
    rulesHead: { color: palette.textSecondary, fontSize: 12, fontWeight: '700' },
    ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    ruleName: { color: palette.text, fontSize: 13.5 },
    ruleMeta: { color: palette.textSecondary, fontSize: 11.5, marginTop: 1 },

    sheet: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 16,
      padding: 14,
      gap: 10,
      borderWidth: 1,
      borderColor: palette.accent,
    },
    sheetHead: { color: palette.text, fontSize: 15, fontWeight: '700' },
    sheetSub: { color: palette.textSecondary, fontSize: 13 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    chipText: { color: palette.text, fontSize: 13 },
    cancel: { alignItems: 'center', paddingVertical: 8 },
    cancelText: { color: palette.textSecondary, fontSize: 14 },
  });
