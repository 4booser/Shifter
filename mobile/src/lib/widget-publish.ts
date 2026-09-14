import { ExtensionStorage } from '@bacons/apple-targets';

import { WIDGET_GROUP, WIDGET_KEY, WidgetSnapshot } from '@/lib/widget';

/** The native half, kept apart from the contract. */

/** Hands it to the widget and asks it to redraw. */
export function publishSnapshot(snapshot: WidgetSnapshot): void {
  try {
    const storage = new ExtensionStorage(WIDGET_GROUP);

    storage.set(WIDGET_KEY, JSON.stringify(snapshot));

    ExtensionStorage.reloadWidget();
  } catch {
    // Nothing to report and nobody to report it to.
  }
}
