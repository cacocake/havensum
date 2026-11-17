const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Browser-only code uses Vite; Metro resolves .native files for Android.
module.exports = config;
