# Pet the Cat — Desktop

A desktop app for petting a cat, built with [Tauri 2](https://tauri.app) and TypeScript.
macOS first; Windows and Linux to follow.

Stroke the head and back, pull the tail outward to stretch it, pick one of 13 coats,
adjust size and width, toggle purring, moonlight theme and fullscreen.
Keyboard: <kbd>Space</kbd> strokes the back, <kbd>T</kbd> pulls the tail.

## Install on macOS

Download the universal `.dmg` (Apple silicon and Intel, macOS 12+) from the
[Releases](../../releases) page, or from the `pet-the-cat-macos-universal` artifact of the
latest [macOS build](../../actions/workflows/macos.yml) run. Drag **Pet the Cat** into Applications.

The app is not signed with an Apple Developer ID or notarized, so the first launch is blocked:

- macOS 15+: open the app once, then System Settings → Privacy & Security → **Open Anyway**.
- macOS 12–14: right-click the app → **Open** → **Open**.
- If macOS says the app is damaged: `xattr -cr "/Applications/Pet the Cat.app"`.

## Develop

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build                                         # current platform
npx tauri build --target universal-apple-darwin --bundles dmg   # macOS universal .dmg
```

Image assets in `public/assets` are original, generated for this project;
`scripts/prepare_assets.py` turns the raw green-screen renders into the WebP files.
