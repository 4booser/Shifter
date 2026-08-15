import { Pipe, PipeTransform, Service, computed, inject } from '@angular/core';

import { SettingsStore } from '../settings/settings-store';
import { RU, UK } from './dictionaries';

export type Lang = 'en' | 'ru' | 'uk';

export const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
  { value: 'uk', label: 'Українська' },
];

/**
 * Runtime translation keyed by the English string itself. English needs no
 * dictionary, an untranslated key falls back to itself instead of breaking,
 * and the templates stay readable.
 */
@Service()
export class I18n {
  private readonly settings = inject(SettingsStore);

  readonly lang = computed(() => this.settings.settings().language);

  private readonly dictionary = computed(() => {
    switch (this.lang()) {
      case 'ru':
        return RU;
      case 'uk':
        return UK;
      default:
        return null;
    }
  });

  t(key: string): string {
    return this.dictionary()?.[key] ?? key;
  }
}

/** Impure: the output follows the language signal, not the key. */
@Pipe({ name: 't', pure: false })
export class TPipe implements PipeTransform {
  private readonly i18n = inject(I18n);

  transform(key: string): string {
    return this.i18n.t(key);
  }
}
