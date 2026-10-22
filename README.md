# Woodshed Metronome

Metronome and tuner, pulled out of Woodshed as a standalone iOS app.

## Stack

- React 19 + TypeScript + Vite, Tailwind CSS v4
- Tone.js (metronome click, swing via Transport `8n` subdivision)
- Pitchy + AudioWorklet (tuner pitch detection)
- Capacitor 7 (iOS shell)
- Fonts bundled locally via Fontsource, so the app works offline

## Layout

- `src/App.tsx` - tab switch (Metronome / Tuner). Each view tears down its audio on unmount.
- `src/components/MetronomeView.tsx` - tempo, presets, swing, accent 2 & 4, start/stop. Holds a screen wake lock while clicking.
- `src/components/TunerView.tsx` - mic tuner, starts on open, releases the mic on leave.
- `src/audio/` - `metronome.ts`, `click.ts`, `pitchDetect.ts`, `sharedMicPitch.ts`, `context.ts` (iOS audio session handling)
- `src/lib/globalTempo.ts` - persisted bpm + swing

## Dev

```
npm install
npm run dev            # browser; mic needs HTTPS off localhost (drop mkcert *.pem files in ./certs)
npm run build
npm run lint
```

## iOS

```
npm run ios:sync       # tsc + vite build + cap sync ios
npm run ios:open       # opens ios/App/App.xcworkspace
```

Run `ios:sync` after every web change, then Cmd+R in Xcode.

- Bundle ID: `io.davidrosario.woodshedtools` (set in `capacitor.config.ts` and `PRODUCT_BUNDLE_IDENTIFIER` in the Xcode project)
- Signing team: `9P93S9F9NN` (same as Woodshed), automatic signing
- Deployment target: iOS 15.0. The Podfile `post_install` forces pods to 15.0 because current Xcode rejects the 14.0 the Capacitor 7 podspecs pin.
- `NSMicrophoneUsageDescription` and `ITSAppUsesNonExemptEncryption = false` are set in `ios/App/App/Info.plist`
- iPhone: portrait only. iPad: all orientations.
- App icon: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024px, rendered from `public/icon.svg`)

## TestFlight

1. In Xcode select "Any iOS Device (arm64)".
2. Bump `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in the target's General tab if needed.
3. Product > Archive, then Distribute App > App Store Connect.
4. Create the app record in App Store Connect first with the bundle ID above.
