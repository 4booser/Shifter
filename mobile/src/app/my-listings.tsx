import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { Gig, payLine, tradeOf } from '@/lib/gigs';
import { t } from '@/lib/i18n';

/**
 * The employer's half of the board, finally in the pocket. The reply already
 * arrives as a push; taking the person used to require finding a laptop —
 * and a candidate not answered by evening is a candidate somewhere else.
 */
interface Reply {
  id: number;
  user_id: number;
  name: string;
  message: string | null;
  phone: string | null;
  telegram: string | null;
  accepted: boolean;
  stage: 'quiet' | 'direct' | 'invited' | 'open';
  worker_rating: number | null;
  worker_count: number;
  created_at: string;
}

interface Row {
  gig: Gig;
  replies: Reply[];
}

export default function MyListingsScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [contacts, setContacts] = useState<{ phone: string | null; telegram: string | null }>({
    phone: null,
    telegram: null,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [mine, profile] = await Promise.all([
        api<Row[]>('/shifter/v1/gigs/mine'),
        api<{ contact_phone: string | null; contact_telegram: string | null }>('/shifter/v1/account'),
      ]);

      setRows(mine);
      setContacts({ phone: profile.contact_phone, telegram: profile.contact_telegram });
      setError(null);
    } catch {
      setError(t('Не дотянулись до сервера.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (gig: Gig, status: 'open' | 'filled' | 'closed') => {
    try {
      await api(`/shifter/v1/gigs/${gig.id}/status`, { method: 'PUT', body: { status } });
      await load();
    } catch {
      Alert.alert(t('Не сохранилось.'));
    }
  };

  const accept = (gig: Gig, reply: Reply) => {
    const leaving = [contacts.phone, contacts.telegram].filter((part) => part !== null).join(' · ');

    Alert.alert(
      reply.stage === 'quiet' ? t('Пригласить?') : t('Взять?'),
      leaving === ''
        ? t('В профиле нет контактов — человек получит только «да», без способа связаться. Впишите телефон или телеграм на сайте.')
        : `${t('Человеку уйдёт')}: ${leaving}`,
      [
        { text: t('Оставить'), style: 'cancel' },
        {
          text: reply.stage === 'quiet' ? t('Пригласить') : t('Взять'),
          onPress: () =>
            void api(`/shifter/v1/gigs/${gig.id}/replies/${reply.id}/accept`, {
              body: contacts,
            })
              .then(load)
              .catch(() => Alert.alert(t('Не отправилось.'))),
        },
      ],
    );
  };

  const STATUS: Record<string, { label: string; tone: 'good' | 'muted' | 'danger' }> = {
    open: { label: t('Открыто'), tone: 'good' },
    filled: { label: t('Нашли'), tone: 'muted' },
    closed: { label: t('Закрыто'), tone: 'danger' },
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <View style={styles.head}>
        <Text style={styles.title}>{t('Мои объявления')}</Text>
        <View style={styles.headActions}>
          <Press hitSlop={10} onPress={() => router.push('/create-gig')}>
            <Ionicons name="add-circle-outline" size={26} color={palette.accent} />
          </Press>
          <Press hitSlop={12} onPress={() => router.back()}>
            <Ionicons name="close" size={26} color={palette.textSecondary} />
          </Press>
        </View>
      </View>

      {rows === null && error === null && <ActivityIndicator color={palette.accent} />}
      {error !== null && <Text style={styles.error}>{error}</Text>}

      {rows !== null && rows.length === 0 && (
        <Press style={styles.emptyCreate} onPress={() => router.push('/create-gig')}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.emptyCreateText}>{t('Создать объявление')}</Text>
        </Press>
      )}

      {(rows ?? []).map(({ gig, replies }) => {
        const status = STATUS[gig.status] ?? STATUS.open;

        return (
          <View key={gig.id} style={styles.card}>
            <View style={styles.rowTop}>
              <Text style={styles.gigTitle} numberOfLines={1}>
                {tradeOf(gig.category).emoji} {gig.title}
              </Text>
              <Text
                style={[
                  styles.status,
                  status.tone === 'good' && { color: palette.good },
                  status.tone === 'danger' && { color: palette.danger },
                ]}
              >
                {status.label}
              </Text>
            </View>
            <Text style={styles.meta}>
              {gig.date.slice(8)}.{gig.date.slice(5, 7)} · {gig.start.slice(0, 5)}–{gig.end.slice(0, 5)} · {gig.city}
            </Text>
            <Text style={styles.meta}>{payLine(gig)}</Text>

            <View style={styles.statusRow}>
              {gig.status === 'open' && (
                <>
                  <Press style={styles.smallButton} onPress={() => void setStatus(gig, 'filled')}>
                    <Text style={styles.smallButtonText}>{t('Нашли человека')}</Text>
                  </Press>
                  <Press style={[styles.smallButton, styles.smallDanger]} onPress={() => void setStatus(gig, 'closed')}>
                    <Text style={[styles.smallButtonText, { color: palette.danger }]}>{t('Закрыть')}</Text>
                  </Press>
                </>
              )}
              {gig.status !== 'open' && (
                <Press style={styles.smallButton} onPress={() => void setStatus(gig, 'open')}>
                  <Text style={styles.smallButtonText}>{t('Открыть заново')}</Text>
                </Press>
              )}
            </View>

            {replies.length === 0 ? (
              <Text style={styles.quietLine}>{t('Откликов пока нет.')}</Text>
            ) : (
              replies.map((reply) => (
                <View key={reply.id} style={styles.reply}>
                  <View style={styles.replyTop}>
                    <Text style={styles.replyName}>
                      {reply.name || t('Кто-то')}
                      {reply.worker_rating !== null && (
                        <Text style={styles.rating}> ★ {reply.worker_rating.toFixed(1)} · {reply.worker_count}</Text>
                      )}
                    </Text>
                    {reply.accepted ? (
                      <Text style={[styles.stage, { color: palette.good }]}>{t('Взят')}</Text>
                    ) : reply.stage === 'quiet' ? (
                      <Text style={styles.stage}>{t('Пока спрашивает')}</Text>
                    ) : reply.stage === 'invited' ? (
                      <Text style={[styles.stage, { color: palette.accent }]}>{t('Ждём его ответа')}</Text>
                    ) : null}
                  </View>
                  {reply.message !== null && <Text style={styles.message}>«{reply.message}»</Text>}
                  <View style={styles.replyActions}>
                    {reply.phone !== null && (
                      <Press onPress={() => void Linking.openURL(`tel:${reply.phone}`)}>
                        <Text style={styles.contact}>{reply.phone}</Text>
                      </Press>
                    )}
                    {reply.telegram !== null && (
                      <Press
                        onPress={() =>
                          void Linking.openURL(`https://t.me/${reply.telegram!.replace(/^@/, '')}`)
                        }
                      >
                        <Text style={styles.contact}>{reply.telegram}</Text>
                      </Press>
                    )}
                    {!reply.accepted && (
                      <Press style={styles.takeButton} onPress={() => accept(gig, reply)}>
                        <Text style={styles.takeText}>
                          {reply.stage === 'quiet' ? t('Пригласить') : t('Взять')}
                        </Text>
                      </Press>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 16, paddingBottom: 48, gap: 10 },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    headActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    emptyCreate: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accent, borderRadius: 14, paddingVertical: 13 },
    emptyCreateText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    title: { color: palette.text, fontSize: 24, fontWeight: '800' },
    lead: { color: palette.textSecondary, fontSize: 14, lineHeight: 20 },
    error: { color: palette.danger, fontSize: 14 },
    card: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.border,
      padding: 14,
    },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
    gigTitle: { color: palette.text, fontSize: 15.5, fontWeight: '700', flex: 1 },
    status: { fontSize: 12.5, fontWeight: '700', color: palette.textSecondary },
    meta: { color: palette.textSecondary, fontSize: 12.5, marginTop: 2 },
    statusRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    smallButton: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: palette.background,
    },
    smallDanger: { borderColor: palette.danger },
    smallButtonText: { color: palette.text, fontSize: 13, fontWeight: '600' },
    quietLine: { color: palette.textSecondary, fontSize: 13, marginTop: 10 },
    reply: {
      borderTopWidth: 1,
      borderTopColor: palette.border,
      marginTop: 10,
      paddingTop: 10,
    },
    replyTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    replyName: { color: palette.text, fontSize: 14, fontWeight: '700', flex: 1 },
    rating: { color: palette.textSecondary, fontSize: 12.5, fontWeight: '400' },
    stage: { color: palette.textSecondary, fontSize: 12.5, fontWeight: '600' },
    message: { color: palette.textSecondary, fontSize: 13, marginTop: 4, fontStyle: 'italic' },
    replyActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
    contact: { color: palette.accent, fontSize: 13.5, fontWeight: '600' },
    takeButton: {
      marginLeft: 'auto',
      backgroundColor: palette.accent,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    takeText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  });
