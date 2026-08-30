import { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import Constants from 'expo-constants';

import { Palette } from '@/constants/theme';

/**
 * A date the finger can pick. On iOS this is SwiftUI's own compact picker
 * via @expo/ui — the calendar people already know from Settings; anywhere
 * it cannot mount (Android for now, or a runtime without the native view)
 * the field falls back to the plain YYYY-MM-DD input it replaces.
 */
let DatePicker: null | ((props: {
  selection?: Date;
  displayedComponents?: ('date' | 'hourAndMinute')[];
  onDateChange?: (date: Date) => void;
}) => React.JSX.Element) = null;

// Expo Go does not ship @expo/ui's native views — mounting one takes the
// whole app down, and a JS try/catch never sees a native crash. The picker
// therefore only exists in a dev/production build; Go keeps the text field.
const inExpoGo = Constants.appOwnership === 'expo';

if (Platform.OS === 'ios' && !inExpoGo) {
  try {
    DatePicker = require('@expo/ui/swift-ui').DatePicker;
  } catch {
    DatePicker = null;
  }
}

const key = (date: Date): string => {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${mm}-${dd}`;
};

export function DateField({
  value,
  onChange,
  palette,
  placeholder = '2026-09-05',
}: {
  /** YYYY-MM-DD, the shape the forms already speak. */
  value: string;
  onChange: (value: string) => void;
  palette: Palette;
  placeholder?: string;
}) {
  const styles = makeStyles(palette);
  const [broken, setBroken] = useState(false);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date();

  if (DatePicker !== null && !broken) {
    try {
      return (
        <View style={styles.pickerBox}>
          <DatePicker
            selection={parsed}
            displayedComponents={['date']}
            onDateChange={(date) => onChange(key(date))}
          />
        </View>
      );
    } catch {
      setBroken(true);
    }
  }

  return (
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={palette.textSecondary}
      autoCapitalize="none"
    />
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    pickerBox: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 10,
      backgroundColor: palette.backgroundElement,
      paddingHorizontal: 6,
      paddingVertical: 4,
      minHeight: 42,
      justifyContent: 'center',
    },
    input: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: palette.text,
      backgroundColor: palette.backgroundElement,
    },
  });
