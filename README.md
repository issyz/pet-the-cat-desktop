# Pet the Cat — Desktop

A desktop app for petting a cat, built with [Tauri 2](https://tauri.app) and TypeScript.
Available for macOS, Windows and Linux.

Stroke the head and back, pull the tail outward to stretch it, pick one of 13 coats,
adjust size and width, toggle purring, moonlight theme and fullscreen.
Keyboard: <kbd>Space</kbd> strokes the back, <kbd>T</kbd> pulls the tail.

## Install

Grab the installer for your OS from the [Releases](../../releases) page. All builds are
produced by CI (see [`release.yml`](../../actions/workflows/release.yml)) and are **unsigned /
not notarized**, so each OS needs a one-time confirmation on first launch.

### macOS

Universal `.dmg` (Apple silicon and Intel, macOS 12+). Open it and drag **Pet the Cat** into Applications.

- macOS 15+: open the app once, then System Settings → Privacy & Security → **Open Anyway**.
- macOS 12–14: right-click the app → **Open** → **Open**.
- If macOS says the app is damaged: `xattr -cr "/Applications/Pet the Cat.app"`.

### Windows

`.msi` or `.exe` (NSIS) installer, x64. Windows SmartScreen will warn about an unknown
publisher: click **More info → Run anyway**. Requires the WebView2 runtime, which ships with
Windows 10/11 (the installer fetches it if missing).

### Linux

`.AppImage` (portable), `.deb` (Debian/Ubuntu) or `.rpm` (Fedora), x64.

```bash
chmod +x "Pet the Cat_0.1.0_amd64.AppImage" && ./"Pet the Cat_0.1.0_amd64.AppImage"
# or
sudo dpkg -i "Pet the Cat_0.1.0_amd64.deb"
```

Needs a WebKitGTK 4.1 runtime (`libwebkit2gtk-4.1-0`), present on most current desktops.

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

Each OS must be built on itself — Tauri bundlers can't cross-compile. The
[`release`](../../actions/workflows/release.yml) workflow builds macOS, Windows and Linux on
their own runners; push a `v*` tag to produce a GitHub Release with every installer attached.

Image assets in `public/assets` are original, generated for this project;
`scripts/prepare_assets.py` turns the raw green-screen renders into the WebP files.
