import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** The class joiner shadcn's primitives expect. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
