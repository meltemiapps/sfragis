# Sfragis

[![CI](https://github.com/meltemiapps/sfragis/actions/workflows/ci.yml/badge.svg)](https://github.com/meltemiapps/sfragis/actions/workflows/ci.yml)

Sfragis (Greek *σφραγίς*, "seal") is an open-source, local-first OpenPGP key manager and encryption app for iOS, Android and Apple-silicon Macs. It has no accounts, analytics or telemetry. Published by Meltemi Apps.

## What it does

- Generates Ed25519/X25519 and RSA 4096 key pairs.
- Lists keys with fingerprint, user IDs, creation date and expiry.
- Imports keys from pasted text, files (armored or binary) and QR codes.
- Exports public and private keys, and revokes or deletes keys behind confirmations.
- Encrypts and signs text, decrypts it, and reports the signature result.
- Copies results to the clipboard, shares them through the OS, or shows them as QR codes.
- Shows large payloads as a looping multi-part QR sequence, and uses the `OPENPGP4FPR:` format for compact fingerprint verification.

## Getting started

Sfragis uses native modules, so it runs in a development build. Expo Go will not work.

```bash
npm ci
npx expo prebuild
npm run ios       # or: npm run android
```

To run on a Mac, select the "My Mac (Designed for iPad)" destination in Xcode.

Open **Settings > Check this device > Run self-test** on the first run of each new build. It exercises the native crypto provider end to end.

## Architecture

```
app/          Expo Router routes (thin re-exports of screens)
screens/      Screen components
components/   Shared UI, the passphrase prompt, QR display and seal glyph
services/     pgpService (the only OpenPGP.js caller), vault, QR transport, keyring state
utils/        Runtime polyfills, theme, clipboard and formatting
plugins/      Native hardening config plugin
tests/        Behavioural suite for Node and Hermes
scripts/      GnuPG interop check, Hermes runner, e2e fixture generator
e2e/          Maestro end-to-end flows, App Store screenshot flow, manual device tests
store/        App Store screenshots
```

### Decisions that are easy to undo by accident

| Decision | Reason |
|---|---|
| `index.ts` imports `utils/polyfills` first | OpenPGP.js reads WebCrypto when the module loads. |
| `react-native-quick-crypto` installs the `crypto` global | OpenPGP.js 6 requires WebCrypto and Hermes has none. It also makes RSA 4096 generation practical. |
| `metro.config.js` pins OpenPGP.js to its browser build | The package's exports map otherwise selects the Node build on native. |
| `restorePacketListSpecies()` in `pgpService` | Hermes ignores `Symbol.species`, which otherwise breaks verification of signed messages. |
| Iterated S2K, v4 keys, SEIPDv1 | Argon2 needs WebAssembly, which Hermes lacks. v4 and SEIPDv1 work with every GnuPG install. |
| Keyring is a sealed file with its key in SecureStore | Keychain entries are too small for RSA 4096 private keys. |

## Security model

- **At rest:** the keyring is sealed with XChaCha20-Poly1305 under a random 256-bit key, held in the OS keychain/keystore as `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Each private key is also protected by its own OpenPGP passphrase.
- **Passphrases:** never stored or logged, and at least 12 characters for new keys. JavaScript strings cannot be zeroed, so a passphrase can remain in process memory until garbage collection. Unlocked key parameters are wiped after each operation.
- **Fail closed:** a keyring without its master key is reported and left intact, never overwritten.
- **Network:** the app makes no network requests. Android release builds also remove the `INTERNET` permission. iOS has no equivalent control.
- **Device backup:** Android backup is disabled and keychain items do not migrate, so a new device needs exported keys.
- **Screen exposure:** the app is covered in the task switcher. While decrypted text or an exported private key is mounted, screenshots and screen recordings are blocked on Android and come out blank on iOS. The decrypted text stays mounted when you switch tabs, so the block lasts until you clear it or leave the app. Clipboard copies of sensitive data clear after 60 seconds while the app is running.
- **Scanned keys:** imported public keys are marked unverified until the fingerprint is compared. Scanning the owner's fingerprint code marks a key verified. A scanned private key requires confirmation.

Out of scope: a compromised OS, malware with accessibility access, and clipboard readers within the 60-second window. This code has had no independent security audit.

## Testing

```bash
npm run typecheck
npx eslint .
npm test                 # Node, native WebCrypto; add -- --rsa for RSA 4096
npm run test:gpg         # interoperability with GnuPG (needs gpg 2.2+ on PATH)
HERMES_BIN=/path/to/hermes npm run test:hermes
```

CI runs typecheck, lint, `npm test` and `npm test -- --rsa` on every push and pull request.

`test:gpg` uses `services/pgpService.ts` against `gpg` in a throwaway `GNUPGHOME`, for Ed25519 and RSA 4096. It checks key import both ways, encrypt and sign in each direction with verification on the other side, cross-use of exported private keys, and revocation.

### End-to-end tests

The flows in `e2e/flows/` drive a Release build in the iOS Simulator with [Maestro](https://maestro.dev). They cover the self-test, generate, encrypt, sign, decrypt and verify, wrong-passphrase retry, import by paste, revoke and delete, persistence across relaunch, and erasing the keyring.

```bash
brew install mobile-dev-inc/tap/maestro openjdk@21
npx expo run:ios --configuration Release --device "<simulator>" --no-bundler
e2e/run.sh "<simulator name or UDID>"           # all flows, or pass flow files
e2e/screenshots.sh                                # App Store screenshots
```

`e2e/run.sh` turns off Maestro's CLI analytics. The QR scanner, share sheet, clipboard clearing and screenshot blocking need real hardware. They are listed in [e2e/MANUAL-TESTS.md](e2e/MANUAL-TESTS.md).

`test:hermes` bundles the suite through the app's Metro and Babel configuration and runs it on a bare Hermes VM. Native modules cannot load there, so a test double built on noble stands in for `react-native-quick-crypto`. The on-device self-test covers the real provider.

## Release checklist

- [ ] Confirm the bundle ID `com.meltemiapps.sfragis`. It cannot be changed after first upload.
- [x] Set `PUBLISHER_URL` and `SOURCE_CODE_URL` in `utils/constants.ts`.
- [x] Set the iOS `buildNumber` in app.json (currently `1`). Raise it for every upload.
- [x] Pass `npm test -- --rsa`, `npm run test:gpg` and every flow in `e2e/flows` on the iPhone 17 Pro Max and iPad Pro 13-inch Simulators.
- [x] Capture App Store screenshots for 6.9-inch iPhone and 13-inch iPad (`e2e/screenshots.sh`, saved in `store/screenshots/`).
- [ ] Run the self-test on a physical iPhone, an Android device and an Apple-silicon Mac.
- [ ] Work through [e2e/MANUAL-TESTS.md](e2e/MANUAL-TESTS.md) on each of those devices.
- [ ] Confirm the release APK has no `INTERNET` permission: `aapt dump permissions app-release.apk`.
- [ ] Commission an independent security review before promoting the app for high-risk use.
- [ ] Complete trademark clearance through counsel before filing or launch.
- [ ] Complete App Store Connect export-compliance answers. `ITSAppUsesNonExemptEncryption` is set to `true`.
- [ ] Take advice on French encryption declaration requirements and US export classification.
- [ ] Publish the corresponding source and `THIRD_PARTY_NOTICES.md`, and take advice on LGPL obligations for App Store distribution.
- [ ] In App Store Connect, enable availability on Apple-silicon Mac.

Suggested store name, within Apple's 30-character limit: **Sfragis: PGP Encrypt & Keys**.

## Licence

Sfragis is MIT licensed. See [LICENSE](LICENSE). It bundles OpenPGP.js under LGPL-3.0-or-later. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
