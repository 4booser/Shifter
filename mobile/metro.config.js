const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

/*
 * The arithmetic both clients read lives in ../shared, outside this project.
 * Metro refuses to resolve anything above its root unless the folder is
 * watched, and tsconfig paths alone will not save it: types would pass and
 * the bundle would fail at run time, which is the worst of the two orders to
 * find out in.
 */
config.watchFolders = [path.resolve(__dirname, '../shared')];

module.exports = withNativeWind(config, { input: './global.css' });
