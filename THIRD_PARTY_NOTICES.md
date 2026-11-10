# Third-party notices

Sfragis's own source code is MIT licensed. The distributed app also contains the components below, under their own licences.

## OpenPGP.js

- Licence: GNU Lesser General Public License v3.0 or later. Full text in [LICENSES/OpenPGP.js-LGPL-3.0.txt](LICENSES/OpenPGP.js-LGPL-3.0.txt).
- Source: https://github.com/openpgpjs/openpgpjs
- Sfragis uses the unmodified published package, with runtime configuration applied from `services/pgpService.ts`.
- To use a modified OpenPGP.js, replace the package or the path in `metro.config.js`, then rebuild from this repository.

## Other runtime components

| Component | Licence |
|---|---|
| Expo and Expo modules | MIT |
| React and React Native | MIT |
| react-native-quick-crypto | MIT (includes OpenSSL, Apache-2.0) |
| react-native-nitro-modules | MIT |
| react-native-qrcode-svg | MIT |
| react-native-svg | MIT |
| @noble/ciphers and @noble/hashes | MIT |
| web-streams-polyfill | MIT |

Run `npx license-checker --production` for the full transitive list before each release.
