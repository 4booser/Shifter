import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const KEY = 'shifter.lock';

/**
 * The app lock. What it protects is not a secret in the usual sense — it is
 * how much somebody earns, which people hand their unlocked phone to a
 * colleague without thinking about. So the lock is off by default and worth
 * offering, rather than on by default and worth resenting.
 */
export const lockStore = {
  async enabled(): Promise<boolean> {
    return (await SecureStore.getItemAsync(KEY)) === 'on';
  },

  async set(on: boolean): Promise<void> {
    if (on) await SecureStore.setItemAsync(KEY, 'on');
    else await SecureStore.deleteItemAsync(KEY);
  },
};

/** What this phone can actually ask for, in the words its owner would use. */
export async function lockKind(): Promise<'face' | 'finger' | 'code' | null> {
  if (!(await LocalAuthentication.hasHardwareAsync())) return null;

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

  // Enrolment matters more than hardware: a phone with Face ID and no face
  // registered can still fall back to the passcode, and offering a lock that
  // cannot open is worse than not offering one.
  if (!(await LocalAuthentication.isEnrolledAsync())) {
    return (await LocalAuthentication.getEnrolledLevelAsync())
      === LocalAuthentication.SecurityLevel.SECRET
      ? 'code'
      : null;
  }

  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'finger';

  return 'code';
}

export type LockKind = 'face' | 'finger' | 'code' | null;

export const lockName = (kind: LockKind): string =>
  kind === 'face' ? 'Face ID' : kind === 'finger' ? 'отпечаток' : kind === 'code' ? 'код' : 'замок';

/**
 * The same word after "по". Russian declines and English does not, so the two
 * forms have to be written out rather than glued together at the call site.
 */
export const lockNameBy = (kind: LockKind): string =>
  kind === 'face' ? 'Face ID' : kind === 'finger' ? 'отпечатку' : kind === 'code' ? 'коду' : 'замку';

/** Asks the phone. True means the person is who the phone thinks they are. */
export async function unlock(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Откройте Shifter',
    cancelLabel: 'Отмена',
    // The device passcode is the honest fallback: a wet thumb or a mask
    // should not lock somebody out of their own shifts.
    disableDeviceFallback: false,
  });

  return result.success;
}
