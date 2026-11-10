# Sfragis: notes for Claude Code

Expo SDK 58 app (React Native, Hermes). Publisher: Meltemi Apps. Bundle ID `com.meltemiapps.sfragis`.
Read README.md first, especially "Decisions that are easy to undo by accident". Do not change them without asking.

## Commands
- `npm ci`, then `npx expo prebuild` to generate ios/ and android/ (both are gitignored; regenerate rather than hand-edit).
- `npx expo run:ios` (Simulator) or `npx expo run:ios --device` (connected iPhone).
- `npm run typecheck`, `npx eslint .`, `npm test` (add `-- --rsa` for RSA 4096).
- Release: `npx expo prebuild --clean`, open `ios/Sfragis.xcworkspace`, set the team, Product > Archive, Distribute to App Store Connect.

## Rules
- Never log passphrases, keys or decrypted text. No analytics, crash reporting or network calls: the App Privacy answer is "Data Not Collected".
- Native config changes go in app.json or plugins/withHardening.js, never only in ios/ or android/.
- After any change to services/, run `npm test` and the in-app Settings > Run self-test on a device.
