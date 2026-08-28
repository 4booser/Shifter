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
import { money } from '@/lib/types';

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
  const standing = useMemo(() => recurring(items, from, to), [items, from, to]);
  const odd = useMemo(() => oddities(items, from, to), [items, from, to]);
  const totals = useMemo(() => flow(items, from, to), [items, from, to]);
  const hits = useMemo(() => ruleHits(inRange, rules), [inRange, rules]);

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
      {/* What the money did, before what it was spent on. */}
      <Appear>
        <View style={styles.flow}>
          <View style={styles.flowPart}>
            <Text style={styles.flowLabel}>{t('Пришло')}</Text>
            <Text style={[styles.flowValue, { color: palette.good }]}>
              {money(totals.earned)}
            </Text>
          </View>
          <View style={styles.flowPart}>
            <Text style={styles.flowLabel}>{t('Ушло')}</Text>
            <Text style={[styles.flowValue, { color: palette.danger }]}>
              {money(totals.spent)}
            </Text>
          </View>
          <View style={styles.flowPart}>
            <Text style={styles.flowLabel}>{t('Осталось')}</Text>
            <Text style={styles.flowValue}>{money(totals.left)}</Text>
          </View>
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
            {t('Ещё')} {money(totals.moved)} {t('переложено между своими счетами — это не доход и не трата.')}
          </Text>
        )}
        {totals.returned > 0 && (
          <Text style={styles.note}>
            {money(totals.returned)} {t('вернулось — покупка и возврат сведены и не считаются дважды.')}
          </Text>
        )}
      </Appear>

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

          {categories.map((row) => (
            <Press
              key={row.name}
              style={styles.row}
              onPress={() => {
                setEditing(row.name);
                setLimitText(
                  `${budgets.find((one) => one.category === row.name)?.limit ?? ''}`,
                );
              }}
            >
              <View style={styles.rowTop}>
                <Text style={styles.rowName}>{row.name}</Text>
                <Text style={styles.rowValue}>{money(row.total)}</Text>
              </View>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    { width: `${(row.total / peak) * 100}%`, backgroundColor: palette.accent },
                  ]}
                />
              </View>
              <Text style={styles.rowMeta}>
                {row.count} {t('операций')}
                {editing === row.name ? '' : ` · ${t('тап — лимит')}`}
              </Text>

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
    note: { color: palette.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 8 },

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
