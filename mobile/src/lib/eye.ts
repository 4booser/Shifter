import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'shifter.eye';

/** «Скрыть суммы», phone edition. */
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
