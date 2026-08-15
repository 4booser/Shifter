import { Pipe, PipeTransform, inject } from '@angular/core';

import { SettingsStore } from '../../core/settings/settings-store';

/**
 * Formats an amount with the currency chosen in settings. Impure on purpose:
 * the output depends on the settings signal, and a pure pipe would keep the old
 * currency on screen until the value itself happened to change.
 */
@Pipe({ name: 'money', pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly settings = inject(SettingsStore);

  transform(value: number | null | undefined): string {
    return this.settings.format(value ?? 0);
  }
}
