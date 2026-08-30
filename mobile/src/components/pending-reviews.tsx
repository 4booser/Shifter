import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { Press } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { api, ApiError } from '@/lib/api';
import { t } from '@/lib/i18n';

/**
 * The debt collector, in the friendliest sense: after a worked gig both
 * sides owe each other a verdict, and this card keeps offering until every
 * one is settled. Empty — invisible; the board owes nobody a banner.
 */
interface PendingReview {
  listing_id: number;
  listing_title: string;
  date: string;
  target_user_id: number;
  target_name: string;
  by_employer: boolean;
}

const WORKER_CHIPS = ['punctual', 'fast', 'self-starter', 'would-rehire'] as const;
const EMPLOYER_CHIPS = ['pays-on-time', 'as-promised', 'good-crew', 'would-return'] as const;

const CHIP_LABEL: Record<string, string> = {
  punctual: 'пунктуален',
  fast: 'быстрый',
  'self-starter': 'сам разобрался',
  'would-rehire': 'позвали бы снова',
  'pays-on-time': 'платят вовремя',
  'as-promised': 'условия как обещали',
  'good-crew': 'дружная команда',
  'would-return': 'вернулся бы',
};

export function PendingReviewsCard({ palette, onChanged }: { palette: Palette; onChanged?: () => void }) {
  const styles = makeStyles(palette);
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [chips, setChips] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    void api<PendingReview[]>('/shifter/v1/gigs/reviews/pending')
      .then(setPending)
      .catch(() => setPending([]));

  useEffect(refresh, []);

  if (pending.length === 0) return null;

  const review = pending[0];
  const options = review.by_employer ? WORKER_CHIPS : EMPLOYER_CHIPS;

  const send = async () => {
    setBusy(true);
    setError(null);

    try {
      await api(`/shifter/v1/gigs/${review.listing_id}/reviews`, {
        body: {
          target_user_id: review.target_user_id,
          rating,
          chips,
          text: text.trim() === '' ? null : text.trim(),
        },
      });
      setOpen(false);
      setRating(0);
      setChips([]);
      setText('');
      refresh();
      onChanged?.();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('Сеть молчит. Сервер доступен?'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.star}>⭐</Text>
        <Text style={styles.lead}>
          <Text style={styles.leadStrong}>{t('Смена состоялась — оцените.')}</Text>{' '}
          {review.by_employer ? t('Как вам') : t('Каково работалось в')}{' '}
          <Text style={styles.leadStrong}>{review.target_name}</Text> («{review.listing_title}»)?
        </Text>
        {pending.length > 1 && <Text style={styles.more}>+{pending.length - 1}</Text>}
      </View>

      {!open ? (
        <Press style={styles.rateButton} onPress={() => setOpen(true)}>
          <Text style={styles.rateText}>{t('Оценить')}</Text>
        </Press>
      ) : (
        <>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Press key={value} hitSlop={6} onPress={() => setRating(value)}>
                <Text style={[styles.starPick, value <= rating && styles.starOn]}>★</Text>
              </Press>
            ))}
          </View>

          <View style={styles.chipsRow}>
            {options.map((chip) => (
              <Press
                key={chip}
                style={[styles.chip, chips.includes(chip) && styles.chipOn]}
                onPress={() =>
                  setChips((have) =>
                    have.includes(chip) ? have.filter((entry) => entry !== chip) : [...have, chip],
                  )
                }
              >
                <Text style={[styles.chipText, chips.includes(chip) && styles.chipTextOn]}>
                  {t(CHIP_LABEL[chip])}
                </Text>
              </Press>
            ))}
          </View>

          <TextInput
            style={styles.input}
            placeholder={t('Пара слов для следующего (необязательно)')}
            placeholderTextColor={palette.textSecondary}
            value={text}
            onChangeText={setText}
            maxLength={280}
          />

          {error !== null && <Text style={styles.error}>{error}</Text>}

          <Press style={[styles.rateButton, rating === 0 && styles.rateOff]} disabled={busy || rating === 0} onPress={() => void send()}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.rateText}>{t('Отправить отзыв')}</Text>}
          </Press>
        </>
      )}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: '#e0a63c',
      backgroundColor: palette.backgroundElement,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
    },
    headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    star: { fontSize: 18 },
    lead: { flex: 1, color: palette.textSecondary, fontSize: 13.5, lineHeight: 19 },
    leadStrong: { color: palette.text, fontWeight: '700' },
    more: { color: palette.textSecondary, fontSize: 12.5, fontWeight: '700' },
    rateButton: {
      backgroundColor: palette.accent,
      borderRadius: 10,
      alignItems: 'center',
      paddingVertical: 10,
      marginTop: 10,
    },
    rateOff: { backgroundColor: palette.border },
    rateText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    starsRow: { flexDirection: 'row', gap: 10, marginTop: 10, justifyContent: 'center' },
    starPick: { fontSize: 30, color: palette.border },
    starOn: { color: '#e0a63c' },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    chip: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    chipOn: { borderColor: palette.accent, backgroundColor: palette.accentSoft },
    chipText: { color: palette.text, fontSize: 12.5 },
    chipTextOn: { color: palette.accent, fontWeight: '700' },
    input: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      color: palette.text,
      marginTop: 10,
      backgroundColor: palette.background,
    },
    error: { color: palette.danger, fontSize: 13, marginTop: 8 },
  });
