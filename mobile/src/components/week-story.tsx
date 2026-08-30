import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import { Press } from '@/components/motion';
import { buzz } from '@/lib/haptics';
import { Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { todayKey } from '@/lib/calendar';
import { eyeShut } from '@/lib/eye';
import { t } from '@/lib/i18n';
import { CalendarDayData, money } from '@/lib/types';

/**
 * The week as a story card: a dark 9:16 picture for wherever pictures go.
 *
 * Safe by its nature — hours, shifts and the shape of the week. Money is a
 * switch that starts off, and stays off while the eye is shut: a story is
 * the one screen guaranteed to be looked at by people who were never meant
 * to see a wage.
 */
interface WeekFacts {
  from: string;
  to: string;
  hours: number;
  shifts: number;
  earned: number;
  byDay: number[];
}

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const keyOf = (date: Date) =>
  `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;

/** Monday-to-Sunday around today, shifted back a week when asked. */
function weekRange(weeksBack = 0): { from: string; to: string } {
  const now = new Date(`${todayKey()}T12:00:00`);
  const monday = new Date(now);

  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) - weeksBack * 7);

  const sunday = new Date(monday);

  sunday.setDate(monday.getDate() + 6);

  return { from: keyOf(monday), to: keyOf(sunday) };
}

/** The picture itself, drawn at story scale. */
function StoryFace({ facts, showMoney, palette }: { facts: WeekFacts; showMoney: boolean; palette: Palette }) {
  const peak = Math.max(1, ...facts.byDay);

  return (
    <View style={face.card}>
      <Text style={face.eyebrow}>{t('МОЯ НЕДЕЛЯ')}</Text>
      <Text style={face.range}>
        {facts.from.slice(8)}.{facts.from.slice(5, 7)} — {facts.to.slice(8)}.{facts.to.slice(5, 7)}
      </Text>

      <Text style={face.big}>{Math.round(facts.hours)}</Text>
      <Text style={face.bigLabel}>{t('часов на сменах')}</Text>

      <Text style={face.meta}>
        {facts.shifts} {t('смен')}
        {showMoney ? ` · ${money(facts.earned)}` : ''}
      </Text>

      <View style={face.bars}>
        {facts.byDay.map((value, index) => (
          <View key={index} style={face.barSlot}>
            <View
              style={[
                face.bar,
                {
                  height: value === 0 ? 3 : Math.max(8, (value / peak) * 96),
                  backgroundColor: value === 0 ? '#3A3C44' : '#7C7FF2',
                },
              ]}
            />
            <Text style={face.barLabel}>{DAY_NAMES[index]}</Text>
          </View>
        ))}
      </View>

      <Text style={face.brand}>Shifter</Text>
    </View>
  );
}

export function WeekStoryCard({ palette }: { palette: Palette }) {
  const styles = makeStyles(palette);
  const shot = useRef<View>(null);
  const [facts, setFacts] = useState<WeekFacts | null>(null);
  const [showMoney, setShowMoney] = useState(false);
  const [busy, setBusy] = useState(false);
  const shuttered = eyeShut();

  useEffect(() => {
    const weigh = async (weeksBack: number): Promise<WeekFacts> => {
      const range = weekRange(weeksBack);
      const data = await api<{ days: CalendarDayData[]; hours: number; total_earned: number }>(
        `/shifter/v1/days?from=${range.from}&to=${range.to}`,
      );
      const byDay = new Array(7).fill(0) as number[];
      let shifts = 0;

      for (const day of data.days) {
        const at = (new Date(`${day.date}T12:00:00`).getDay() + 6) % 7;

        for (const shift of day.shifts) {
          if (!shift.worked) continue;

          byDay[at] += shift.hours;
          shifts += 1;
        }
      }

      return { ...range, hours: data.hours, shifts, earned: data.total_earned, byDay };
    };

    // A week that only just started has no story yet — on a fresh Monday the
    // card shows the week that actually happened, not seven empty bars.
    void weigh(0)
      .then(async (now) => setFacts(now.shifts > 0 ? now : await weigh(1)))
      .catch(() => setFacts(null));
  }, []);

  if (facts === null || facts.shifts === 0) return null;

  const share = async () => {
    setBusy(true);

    try {
      const uri = await captureRef(shot, { format: 'png', quality: 1 });

      await Sharing.shareAsync(uri, { mimeType: 'image/png' });
      buzz.won();
    } catch {
      buzz.lost();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('Неделя картинкой')}</Text>
      <Text style={styles.hint}>
        {t('Тёмная карточка для сторис: часы, смены и форма недели. Заработок — только если сами включите.')}
      </Text>

      {/* The story is rendered once at full size for the camera, off-screen,
          and once scaled for the eye. Same JSX, no drift between the two. */}
      <View style={styles.offstage} pointerEvents="none">
        <View ref={shot} collapsable={false}>
          <StoryFace facts={facts} showMoney={showMoney && !shuttered} palette={palette} />
        </View>
      </View>

      <View style={styles.previewBox}>
        <View style={styles.previewInner}>
          <StoryFace facts={facts} showMoney={showMoney && !shuttered} palette={palette} />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.grow}>
          <Text style={styles.rowTitle}>{t('Показать заработок')}</Text>
          {shuttered && <Text style={styles.rowHint}>{t('Суммы скрыты глазом — сначала откройте их.')}</Text>}
        </View>
        <Switch
          value={showMoney && !shuttered}
          disabled={shuttered}
          onValueChange={(value) => {
            setShowMoney(value);
            buzz.choose();
          }}
          trackColor={{ true: palette.accent, false: palette.border }}
        />
      </View>

      <Press style={styles.share} disabled={busy} onPress={() => void share()}>
        <Text style={styles.shareText}>{busy ? t('Секунду…') : t('Поделиться')}</Text>
      </Press>
    </View>
  );
}

/** Story-face styles: fixed dark, deliberately ignoring the app theme — a
    story lands on other people's screens, not in this app's palette. */
const face = StyleSheet.create({
  card: {
    width: 360,
    height: 640,
    backgroundColor: '#16171B',
    borderRadius: 24,
    padding: 32,
    justifyContent: 'flex-end',
  },
  eyebrow: { color: '#8B8EF7', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  range: { color: '#9DA0A8', fontSize: 15, marginTop: 4 },
  big: { color: '#FFFFFF', fontSize: 96, fontWeight: '800', lineHeight: 100, marginTop: 18 },
  bigLabel: { color: '#9DA0A8', fontSize: 17, marginTop: 2 },
  meta: { color: '#FFFFFF', fontSize: 17, fontWeight: '600', marginTop: 14 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 28 },
  barSlot: { flex: 1, alignItems: 'center', gap: 6 },
  bar: { width: '100%', borderRadius: 6 },
  barLabel: { color: '#6E7178', fontSize: 11 },
  brand: { color: '#4A4C55', fontSize: 13, fontWeight: '700', marginTop: 26 },
});

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      gap: 10,
    },
    cardTitle: { color: palette.text, fontSize: 16, fontWeight: '700' },
    hint: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 17 },
    offstage: { position: 'absolute', left: -9999, top: 0 },
    previewBox: {
      width: 360 * 0.45,
      height: 640 * 0.45,
      overflow: 'hidden',
      borderRadius: 12,
      alignSelf: 'center',
    },
    // A full-size story scaled about its centre, then pulled back so the
    // centre lands in the little window: (360−162)/2 and (640−288)/2.
    previewInner: {
      position: 'absolute',
      left: -(360 - 360 * 0.45) / 2,
      top: -(640 - 640 * 0.45) / 2,
      transform: [{ scale: 0.45 }],
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    grow: { flex: 1 },
    rowTitle: { color: palette.text, fontSize: 15, fontWeight: '600' },
    rowHint: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
    share: {
      backgroundColor: palette.accent,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    shareText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
