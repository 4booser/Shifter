import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const KEY = 'shifter.lock';
const BANK_KEY = 'shifter.lock.bank';

/** The app lock. */
export const lockStore = {
  async enabled(): Promise<boolean> {
    return (await SecureStore.getItemAsync(KEY)) === 'on';
  },

  async set(on: boolean): Promise<void> {
    if (on) await SecureStore.setItemAsync(KEY, 'on');
    else await SecureStore.deleteItemAsync(KEY);
  },
};

/** The bank tab's own lock, separate from the app's. */
export const bankLock = {
  async enabled(): Promise<boolean> {
    return (await SecureStore.getItemAsync(BANK_KEY)) === 'on';
  },

  async set(on: boolean): Promise<void> {
    if (on) await SecureStore.setItemAsync(BANK_KEY, 'on');
    else await SecureStore.deleteItemAsync(BANK_KEY);
  },
};

/** What this phone can actually ask for, in the words its owner would use. */
export async function lockKind(): Promise<'face' | 'finger' | 'code' | null> {
  if (!(await LocalAuthentication.hasHardwareAsync())) return null;

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

  // Enrolment matters more than hardware: a phone with Face ID and no face registered can still fall back to the…
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

/** The same word after "по". */
export const lockNameBy = (kind: LockKind): string =>
  kind === 'face' ? 'Face ID' : kind === 'finger' ? 'отпечатку' : kind === 'code' ? 'коду' : 'замку';

/** Asks the phone. True means the person is who the phone thinks they are. */
export async function unlock(reason = 'Откройте Shifter'): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Отмена',
    // The device passcode is the honest fallback: a wet thumb or a mask
    // should not lock somebody out of their own shifts.
    disableDeviceFallback: false,
  });

  return result.success;
}
