# Sfragis

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
- **Screen exposure:** the app is covered in the task switcher. Android blocks screenshots while plaintext or a private key is displayed. Clipboard copies of sensitive data clear after 60 seconds while the app is running.
- **Scanned keys:** imported public keys are marked unverified until the fingerprint is compared. Scanning the owner's fingerprint code marks a key verified. A scanned private key requires confirmation.

Out of scope: a compromised OS, malware with accessibility access, and clipboard readers within the 60-second window. This code has had no independent security audit.

## Testing

```bash
npm run typecheck
npm test                 # Node, native WebCrypto; add -- --rsa for RSA 4096
HERMES_BIN=/path/to/hermes npm run test:hermes
```

`test:hermes` bundles the suite through the app's Metro and Babel configuration and runs it on a bare Hermes VM. Native modules cannot load there, so a test double built on noble stands in for `react-native-quick-crypto`. The on-device self-test covers the real provider.

## Release checklist

- [ ] Confirm the bundle ID `com.meltemiapps.sfragis`. It cannot be changed after first upload.
- [ ] Set `PUBLISHER_URL` and `SOURCE_CODE_URL` in `utils/constants.ts`.
- [ ] Run the self-test on a physical iPhone, an Android device and an Apple-silicon Mac.
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
