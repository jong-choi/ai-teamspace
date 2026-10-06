const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);
const productSourceRoot = path.resolve(projectRoot, '../../src');

config.watchFolders = [...new Set([...config.watchFolders, productSourceRoot])];

module.exports = withNativeWind(config, {
  configPath: path.resolve(projectRoot, 'tailwind.config.js'),
  inlineRem: 16,
  input: './src/globals.css',
  typescriptEnvPath: 'src/nativewind-env.d.ts',
});
