/**
 * The widget target.
 *
 * A widget is the only part of this app somebody sees without opening it, and
 * for most people that is the whole reason it stays installed. It reads a
 * snapshot the app left in a shared container — it never talks to the server,
 * never holds a token, and cannot ask a question. Everything it can show has
 * to be written down for it in advance.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'widget',
  name: 'ShifterWidget',
  displayName: 'Shifter',
  // The same indigo the app and the site draw with, so a widget on a home
  // screen is recognisably the same product.
  colors: {
    $accent: { color: '#4F46E5', darkColor: '#8B8EF7' },
    $widgetBackground: { color: '#FDFCFA', darkColor: '#1F2126' },
  },
  frameworks: ['SwiftUI', 'WidgetKit'],
  entitlements: {
    // The same group as the app, or the widget reads an empty container and
    // has no way to say why it is empty.
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
  deploymentTarget: '17.0',
});
