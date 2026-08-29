import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'shifter.eye';

/**
 * «Скрыть суммы», phone edition.
 *
 * Same construction as the language for the same reason: money() is a plain
 * function called from thirty modules, half of them not components, so the
 * shutter has to be readable synchronously at module load — and flipping it
 * remounts the root (the layout keys on it), which repaints every figure at
 * once instead of asking thirty screens to subscribe.
 */
const stored = (): boolean => {
  try {
    return SecureStore.getItem(KEY) === 'shut';
  } catch {
    return false;
  }
};

let shut = stored();

/** For plain functions. Components go through useEye so the toggle row updates. */
export const eyeShut = (): boolean => shut;

interface EyeState {
  shut: boolean;
  set: (value: boolean) => void;
}

export const useEye = create<EyeState>((setState) => ({
  shut,

  set: (value) => {
    shut = value;
    setState({ shut: value });

    try {
      SecureStore.setItem(KEY, value ? 'shut' : 'open');
    } catch {
      // An eye that would not save is still shut for this run.
    }
  },
}));
