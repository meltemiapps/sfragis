# Contributing to Sfragis

Thanks for helping. Sfragis handles private keys, so changes are reviewed with care. Small, focused pull requests are the easiest to review.

## Security issues

**Do not open a public issue for a vulnerability.** Follow [SECURITY.md](SECURITY.md) and report it privately through the Security tab.

## Build

Sfragis uses native modules, so it needs a development build. Expo Go will not work.

```bash
npm ci
npx expo prebuild          # generates ios/ and android/ (both gitignored)
npx expo run:ios           # or: npx expo run:android
```

Native configuration lives in `app.json` and `plugins/withHardening.js`. Do not edit `ios/` or `android/` by hand. Regenerate them instead.

Before changing anything listed under "Decisions that are easy to undo by accident" in [README.md](README.md), open an issue to discuss it.

## Test

```bash
npm run typecheck
npx eslint .
npm test                   # add -- --rsa for RSA 4096
npm run test:gpg           # interoperability with GnuPG (needs gpg on PATH)
e2e/run.sh "<simulator name or UDID>"   # Maestro end-to-end flows on an iOS Simulator
```

After any change to `services/`, also run **Settings > Check this device > Run self-test** on a real device. [e2e/MANUAL-TESTS.md](e2e/MANUAL-TESTS.md) lists the checks the Simulator cannot run.

## Rules for changes

- No analytics, crash reporting, network calls or third-party SDKs that phone home. The app's privacy answer is "Data Not Collected".
- Never log passphrases, keys or decrypted text, and never put them in error messages.
- Test data uses invented names and `example.org` addresses. Never commit real keys or passphrases.
- Keep `services/pgpService.ts` the only module that calls OpenPGP.js.

## Licence

By contributing you agree that your contribution is licensed under the [MIT licence](LICENSE).
