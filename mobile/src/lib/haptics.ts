import * as Haptics from 'expo-haptics';

/** The haptics map — one vocabulary for the whole app, so a save feels the same on every screen and nobody… */
export const buzz = {
  choose: () => void Haptics.selectionAsync(),
  touch: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  commit: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  won: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  lost: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};
