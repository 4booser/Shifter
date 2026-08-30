/**
 * expo-notifications, for the test runner. The store schedules a forgotten-
 * shift alarm at start; nothing under test is about the notification centre,
 * so scheduling quietly succeeds and cancelling quietly does nothing.
 */
export const scheduleNotificationAsync = async (): Promise<string> => 'stub-alarm';
export const cancelScheduledNotificationAsync = async (): Promise<void> => undefined;

export const SchedulableTriggerInputTypes = { DATE: 'date' } as const;
