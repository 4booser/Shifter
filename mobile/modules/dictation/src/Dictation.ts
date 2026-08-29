import { requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

/**
 * Dictation, for hands that are busy.
 *
 * "Записал тысячу двести чаевых" is faster than any form, and in this trade
 * the hands holding the phone have just put down a tray. What comes back is
 * text and only text — the app's own parser decides what the sentence meant,
 * and the person sees that reading before anything is saved.
 *
 * Optional at every level, like the lock-screen module: absent in Expo Go, on
 * Android, and in any build made before this shipped. Every function does
 * nothing rather than throwing, and `available()` is asked before the button
 * is offered rather than after it fails.
 */

interface Native {
  isAvailable(language: string): boolean;
  isOnDevice(language: string): boolean;
  permission(): Promise<'granted' | 'denied' | 'undetermined'>;
  start(language: string): Promise<void>;
  stop(): Promise<void>;
  addListener(event: string, listener: (payload: { text?: string }) => void): EventSubscription;
}

const native = requireOptionalNativeModule<Native>('DictationModule');

/** Whether this phone can listen in this language at all. */
export function speechAvailable(language: string): boolean {
  try {
    return native?.isAvailable(language) ?? false;
  } catch {
    return false;
  }
}

/**
 * Whether the phone does it by itself.
 *
 * Worth saying once, where it is said: speech about somebody's wages either
 * stays on the phone or travels to Apple, and that is a difference a person
 * is entitled to know about before they hold the button.
 */
export function speechOnDevice(language: string): boolean {
  try {
    return native?.isOnDevice(language) ?? false;
  } catch {
    return false;
  }
}

export async function askToListen(): Promise<boolean> {
  try {
    return (await native?.permission()) === 'granted';
  } catch {
    return false;
  }
}

export interface Listening {
  stop: () => void;
}

/**
 * Listens until told to stop, or until the speaker does.
 *
 * Partial results arrive as the words are said, which is what makes dictation
 * feel alive and — more usefully — lets somebody watch the app mishear them
 * before they commit anything.
 */
export function listen(
  language: string,
  onText: (text: string, final: boolean) => void,
  onStopped: () => void,
): Listening {
  if (native === null) {
    onStopped();

    return { stop: () => undefined };
  }

  const subscriptions: EventSubscription[] = [
    native.addListener('onPartial', (payload) => onText(payload.text ?? '', false)),
    native.addListener('onResult', (payload) => onText(payload.text ?? '', true)),
    native.addListener('onError', () => onStopped()),
  ];

  const release = () => {
    for (const subscription of subscriptions) subscription.remove();
  };

  native.start(language).catch(() => {
    release();
    onStopped();
  });

  return {
    stop: () => {
      void native.stop().catch(() => undefined);
      release();
    },
  };
}
