# devicon

Makes the dev variant of an Xcode app icon: the app's real icon with a yellow "DEV" ribbon across the top-right corner, written as an `AppIcon-Dev.appiconset`. Debug builds use it, Release never changes. It is the native twin of the knobs dev favicon and follows the same drawing spec (below).

One self-contained Swift file, no dependencies (Foundation, CoreGraphics, ImageIO, CoreText). Apps vendor a copy, for example as `scripts/devicon.swift`.

## Usage

```sh
swift devicon.swift --icon App/AppIcon.icon --platform macOS --out DevIcon.xcassets/AppIcon-Dev.appiconset
swift devicon.swift --png master-1024.png --platform iOS --out DevIcon.xcassets/AppIcon-Dev.appiconset
```

- `--icon` renders an Icon Composer file with Xcode's `ictool` (Xcode 26 or later), one render per pixel size.
- `--png` takes a square PNG master. A macOS master keeps its own transparent margin; an iOS master is full bleed.
- `--platform macOS` writes `mac` images 16, 32, 128, 256 and 512 pt at 1x and 2x. `--platform iOS` writes one universal 1024 px image with no alpha channel.
- The set gets a `.devicon-source` stamp (a hash of every input file, the platform and the tool version). When it matches, the run exits at once without rendering, so a build phase costs about half a second. `--force` renders anyway.
- `--check` renders nothing: exit 0 when the set is fresh, 1 when it is stale (CI or a warning phase).
- Bad input exits 2 with a message.

When the parent folder is a `.xcassets` without a `Contents.json`, devicon adds one.

## Wire it into an XcodeGen project

```yaml
targets:
  App:
    sources:
      - App
      - DevIcon.xcassets
    settings:
      base:
        ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon
        ENABLE_USER_SCRIPT_SANDBOXING: NO
      configs:
        Debug:
          ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon-Dev
    preBuildScripts:
      - name: Dev icon
        basedOnDependencyAnalysis: false
        script: |
          [ "$CONFIGURATION" = Debug ] || exit 0
          xcrun --sdk macosx swift "$SRCROOT/scripts/devicon.swift" --icon "$SRCROOT/App/AppIcon.icon" --platform macOS --out "$SRCROOT/DevIcon.xcassets/AppIcon-Dev.appiconset"
```

- Commit `DevIcon.xcassets`, so a fresh clone builds before the script ever runs and the stamp keeps the phase cheap.
- `xcrun --sdk macosx` matters for iOS targets: Xcode sets `SDKROOT` to the iPhone SDK, and a bare `swift` then fails to load the standard library.
- The phase needs `ENABLE_USER_SCRIPT_SANDBOXING: NO` on the target: the sandbox allows only the exact declared paths, not files inside a declared folder, and ImageIO writes through a temp file next to each target, so declaring inputs and outputs cannot work.
- Release builds keep `AppIcon`; actool leaves the unused `AppIcon-Dev` set out of the bundle. Optionally exclude `DevIcon.xcassets` in Release with `EXCLUDED_SOURCE_FILE_NAMES` for clarity.

## Spec

Shared with the knobs favicon. `S` is the bitmap size in pixels; each size is drawn at its own size, never scaled down from a big render, since the rules depend on `S`.

1. Draw the source unchanged into the `S` x `S` canvas. For `--icon` on macOS, ictool exports the shape full bleed, so devicon places it in Apple's tile area: `round(S * 824 / 1024)` px, centered.
2. Tile box `b`: the bounding box of pixels with alpha above 128, made square around its center. A fully opaque source, and every iOS icon, uses the whole canvas.
3. Clip to a rounded rect over `b`, corner radius `0.225 * b.s`.
4. Move the origin to the tile's top-right corner and rotate 45 degrees clockwise (y down). Local +y points into the icon.
5. Band width `w = 0.30 * b.s`, distance from the corner `d = 0.22 * b.s` (`0.20 * b.s` when `S <= 20`), black edge `e = max(1, b.s / 40)`.
6. Fill local x in `[-2 * b.s, 2 * b.s]`, y in `[d - e, d + w + e]` with `#111111`, then y in `[d, d + w]` with `#FFD60A`.
7. When `S >= 32`: "DEV" in the bold system font, size `f = 0.62 * w`, `#111111`, centered at local x 0, em box middle at `d + w / 2 + 0.04 * f` (canvas `textBaseline = "middle"`).

iOS PNGs are flattened onto black, since app icons there carry no alpha. Only the default (light) appearance is made; dark and tinted variants are not.
