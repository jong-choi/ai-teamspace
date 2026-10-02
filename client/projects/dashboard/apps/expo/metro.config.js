const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

module.exports = withNativeWind(config, {
  configPath: path.resolve(projectRoot, 'tailwind.config.js'),
  inlineRem: 16,
  input: './src/globals.css',
  typescriptEnvPath: 'src/nativewind-env.d.ts',
});
