# Manual device tests

These checks need a camera, a second screen or real OS behaviour, so the Simulator
cannot run them. Run them on a physical iPhone, an Android phone and an
Apple-silicon Mac before each release. Use test keys with invented names only
(for example Maria Vlachou, maria.vlachou@example.org). Never use real keys.

Record the device, OS version, build number and result for each check.

## Setup

1. Install the release candidate on the device under test.
2. Open **Settings > Check this device > Run self-test**. Expect a green
   "Passed" banner with Ed25519 and RSA 4096 timings. Note the timings.
3. On a second device or a computer, keep the Sfragis Simulator or another
   phone ready to *display* QR codes.

## QR scanner

| # | Check | Expected |
|---|---|---|
| 1 | Scan tab on first use | "Allow camera access" with **Allow camera**. The OS prompt text matches app.json. Deny it: the screen shows "Camera access is off" with **Open settings** and **Import by text or file**. |
| 2 | Single QR: on the second device open a contact key, tap **Fingerprint QR** for a *short* payload, or **Show QR** for an Ed25519 public key that fits one code. Scan it. | "… added to your keyring." with **Open key**. It is marked **Unverified contact**. Scanning it again says "… updated." and does not duplicate it. |
| 3 | Multi-part QR: show an RSA 4096 public key (10 frames) and scan the looping sequence. | A progress count (for example 4 of 10) rises, then the key imports. Frames can arrive in any order and repeats are ignored. |
| 4 | Interrupted multi-part: move the camera away halfway, then come back. | Scanning resumes and completes without restarting. |
| 5 | Corrupt or foreign QR (any web URL or Wi-Fi QR). | "This QR code does not contain a PGP key, message or fingerprint." Nothing is imported. |
| 6 | Encrypted message QR: on the second device encrypt a message and tap **Show QR**. Scan it. | The app switches to **Encrypt > Decrypt** with the message filled in. |
| 7 | Private key QR: reveal a test private key on the second device and show it as QR. Scan it. | "Import a private key?" asks for confirmation. **Cancel** imports nothing. **Import** stores it. |

## Camera switch

| # | Check | Expected |
|---|---|---|
| 8 | On the Scan tab, tap **Switch camera**. | The preview flips between back and front cameras. Scanning still works on each. |
| 9 | Mac (Designed for iPad) and front-camera-only iPads. | The front camera is used or can be selected, and a QR held up to it scans. |

## Fingerprint verification

| # | Check | Expected |
|---|---|---|
| 10 | Import a contact public key by paste (it shows **Unverified contact**). On the owner's device tap **Fingerprint QR** and scan it. | "Fingerprint matches … This key is now verified." The key list now shows **Verified contact** and the warning banner on the key detail is gone. |
| 11 | Scan a Fingerprint QR for a key you do *not* hold. | "No key in your keyring has this fingerprint…" and no key changes trust. |
| 12 | Scan your *own* key's Fingerprint QR. | It is recognised and its trust stays **Your key**. |
| 13 | Compare the fingerprint QR with another OpenPGP app (OpenKeychain on Android). | Both apps read each other's `OPENPGP4FPR:` codes. |

## Share sheet

| # | Check | Expected |
|---|---|---|
| 14 | Key detail > **Share** on a public key. | The OS share sheet opens with the armored public key as text. Sending to Notes or Mail produces a block that imports back cleanly. |
| 15 | Encrypt a message, then **Share** in the output panel. | The share sheet carries the armored PGP message. |
| 16 | Decrypt a message, then **Share**. | The plaintext is shared only because you chose to. Confirm that nothing is shared automatically. |

## Clipboard clearing

| # | Check | Expected |
|---|---|---|
| 17 | Decrypt a message, tap **Copy**. Stay in the app for 65 seconds, then paste in another app. | The note "The clipboard clears in 60 seconds." appears. After 60 seconds the clipboard is empty. |
| 18 | Repeat, but send the app to the background straight after copying. | Documented limit: the OS may suspend the timer, so the clipboard may *not* clear. Note what happens on each OS. |
| 19 | Copy a public key or ciphertext. | No clearing note. The clipboard is left alone (it is public material). |
| 20 | iOS paste: tap **Paste** on Import or Decrypt. | iOS shows its "Allow Paste" prompt. Nothing is read without consent. |

## Screen exposure

| # | Check | Expected |
|---|---|---|
| 21 | Android: decrypt a message and try a screenshot and a screen recording. | The screenshot is blocked or black. |
| 22 | Android: export a private key and try a screenshot. | Blocked. After leaving the screen, screenshots work again. |
| 23 | iOS and Android: with plaintext or a private key on screen, open the app switcher. | The app preview is covered by the plain background. |
| 24 | iOS: take a screenshot while plaintext is shown. | iOS has no screenshot block. Confirm and note it as a known platform limit (it is not a bug). |

## Release build only

| # | Check | Expected |
|---|---|---|
| 25 | Android release APK: `aapt dump permissions app-release.apk` | No `android.permission.INTERNET`. |
| 26 | Turn on airplane mode and use every feature. | Everything works. The app never needs a network. |
| 27 | Delete and reinstall the app. | The keyring is gone (keychain items are device-only). Exported keys import again. |
