import * as Haptics from 'expo-haptics';

/**
 * The haptics map — one vocabulary for the whole app, so a save feels the
 * same on every screen and nobody re-decides «light or medium?» per call:
 *
 * - choose  flicking between options: segment, tab, swatch. Barely there.
 * - touch   a light tap on something that reacts without committing.
 * - commit  a medium thump for «this changed something»: apply, save, paint.
 * - won     success said by the server: money recorded, period closed.
 * - lost    failure: the server said no, the paint did not stick.
 */
export const buzz = {
  choose: () => void Haptics.selectionAsync(),
  touch: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  commit: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  won: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  lost: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};
