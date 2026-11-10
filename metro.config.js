const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const openpgpBrowserBuild = path.resolve(__dirname, 'node_modules/openpgp/dist/openpgp.min.mjs');
const harnessCryptoStub = path.resolve(__dirname, 'tests/stubs/react-native-quick-crypto.ts');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // On native, the package's exports map selects the Node build, which imports `crypto`.
  if (moduleName === 'openpgp') {
    return { type: 'sourceFile', filePath: openpgpBrowserBuild };
  }
  // Only set by `npm run test:hermes`, which runs without native modules.
  if (process.env.SFRAGIS_HARNESS === '1' && moduleName === 'react-native-quick-crypto') {
    return { type: 'sourceFile', filePath: harnessCryptoStub };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
