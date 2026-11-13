import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useEffect } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { buzz } from '@/lib/haptics';
import { t } from '@/lib/i18n';

import { makeRosterStyles } from './styles';

/**
 * The keyboard, kept off what is typed into, on both platforms. An Expo app on
 * Android draws edge to edge, so its window no longer shrinks for the keyboard:
 * a view that does not move itself stays under it.
 */
const KEYBOARD = 'padding';

/**
 * A sheet that rises with the keyboard and goes when the dim behind it is
 * tapped. Mounted only while open, so nothing typed in it can outlive it; one
 * with something to open once it has gone stays mounted, shut, until then.
 */
export function Sheet({
  palette,
  open = true,
  onClose,
  onGone,
  children,
}: {
  palette: Palette;
  open?: boolean;
  onClose: () => void;
  /** Once it is off the screen. iOS drops a screen presented while another is still sliding away. */
  onGone?: () => void;
  children: ReactNode;
}) {
  const styles = makeRosterStyles(palette);
  const insets = useSafeAreaInsets();

  // Only iOS has to wait, and only iOS says when the slide is over. Android
  // takes the dialog down at once, and the web lays a new one over the last.
  useEffect(() => {
    if (!open && Platform.OS !== 'ios') onGone?.();
  }, [open, onGone]);

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      onDismiss={Platform.OS === 'ios' ? onGone : undefined}
    >
      {/* A full-screen «tap outside to close». */}
      <Pressable
        style={styles.backdrop}
        accessibilityRole="button"
        accessibilityLabel={t('Закрыть')}
        onPress={onClose}
      />
      <KeyboardAvoidingView
        style={styles.sheetHolder}
        pointerEvents="box-none"
        behavior={KEYBOARD}
      >
        <ScrollView
          style={styles.sheet}
          contentContainerStyle={[styles.sheetInner, { paddingBottom: insets.bottom + 20 }]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A whole-screen editor with its title and a way out, for forms too long for a sheet. */
export function FullSheet({
  title,
  palette,
  onClose,
  children,
}: {
  title: string;
  palette: Palette;
  onClose: () => void;
  children: ReactNode;
}) {
  const styles = makeRosterStyles(palette);
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={KEYBOARD}
      >
        <ScrollView
          contentContainerStyle={[
            styles.editor,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.editorHead}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {title}
            </Text>
            <Press hitSlop={12} onPress={onClose} accessibilityLabel={t('Закрыть')}>
              <Ionicons name="close" size={26} color={palette.textSecondary} />
            </Press>
          </View>

          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * A row of chips that runs off the side, in a form. A tap on a chip while the
 * keyboard is up has to land on the chip: a scroll view left to itself spends
 * it on putting the keyboard away, whatever the one around it says.
 */
export function ChipScroll({ palette, children }: { palette: Palette; children: ReactNode }) {
  const styles = makeRosterStyles(palette);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipScroll}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/** One of a few, side by side, the chosen one filled. */
export function Segments<T extends string>({
  options,
  value,
  palette,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  palette: Palette;
  onChange: (value: T) => void;
}) {
  const styles = makeRosterStyles(palette);

  return (
    <View style={styles.segmentRow}>
      {options.map((option) => (
        <Press
          key={option.value}
          style={[styles.segment, option.value === value && styles.segmentOn]}
          haptic={false}
          onPress={() => {
            buzz.choose();
            onChange(option.value);
          }}
        >
          <Text
            style={[styles.segmentText, option.value === value && styles.segmentTextOn]}
            numberOfLines={2}
          >
            {option.label}
          </Text>
        </Press>
      ))}
    </View>
  );
}

/** A section that opens in place, with one line of what is in it while it is shut. */
export function Fold({
  title,
  summary,
  open,
  palette,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  palette: Palette;
  onToggle: () => void;
  children: ReactNode;
}) {
  const styles = makeRosterStyles(palette);

  return (
    <>
      <Press style={styles.sectionHead} scale={0.99} onPress={onToggle}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.foldSide}>
          <Text style={styles.sectionSummary} numberOfLines={1}>
            {summary}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={palette.textSecondary} />
        </View>
      </Press>

      {open && children}
    </>
  );
}
