import { ExtensionStorage } from '@bacons/apple-targets';

import { WIDGET_GROUP, WIDGET_KEY, WidgetSnapshot } from '@/lib/widget';

/**
 * The native half, kept apart from the contract.
 *
 * Importing the extension module runs native code at load, which the contract
 * itself must not need — the rules about hiding money are worth checking
 * without a simulator, and a test that cannot import them is a rule nobody
 * checks.
 */

/**
 * Hands it to the widget and asks it to redraw.
 *
 * Swallows everything. The widget is a courtesy; a phone that cannot write to
 * the shared container — an old build without the App Group, a simulator, an
 * Android — must carry on as though the feature did not exist.
 */
export function publishSnapshot(snapshot: WidgetSnapshot): void {
  try {
    const storage = new ExtensionStorage(WIDGET_GROUP);

    storage.set(WIDGET_KEY, JSON.stringify(snapshot));

    ExtensionStorage.reloadWidget();
  } catch {
    // Nothing to report and nobody to report it to.
  }
}
