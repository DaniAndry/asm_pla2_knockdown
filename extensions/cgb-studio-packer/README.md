# CGB Studio packer

Cocos Creator `>=3.8.3 <4` extension for producing network-ready single-HTML
web-mobile playable ads.

## Version 1.8.1

The packer manages ordered build variations with independent scenes, Start
Scene and Splash overrides. Shared settings include Base64/Base122 encoding,
obfuscation, Feature Cropping, native-code mode, output layout and targets.
Selected variations build sequentially and an error in one variation does not
stop the rest of the queue.

Builder tasks are reused when scenes, Start Scene, variation name, project
assets or packer-only settings change. A new task is created only when the base
task, game/build/output paths, orientation, Feature Cropping, native-code mode,
effective Splash or inherited web-mobile options change.

## Targets and lifecycle

`Default` is an optional generic browser target and replaces the old mandatory
`common` and `common_min` outputs. Its compressed HTML is also used by **Estimate
size**, independently of whether the target is enabled. Preview opens Default
first, then the newest enabled non-ZIP HTML.

AppLovin, IronSource MRAID, MRAID Universal, Unity, Liftoff, Snapchat and legacy
AdColony use one shared MRAID lifecycle. Resources are not unpacked until MRAID
is ready and viewable; exposure, size, orientation and audio changes are handled
consistently. Bigo uses the same controller through `BGY_MRAID`. IronSource DAPI
and proprietary targets remain independent. Mintegral exposes validator-visible
`gameStart()`, `gameClose()`, `gameReady()` and `gameEnd()` integration.

Generated filenames omit the `Cocos Creator - ` prefix and use `%`, for example
`Playable%default.html`. Managed variation output is staged and promoted to:

```text
build/cgb-playable-ready/<variation>/
  default/
  applovin/
  google/
  ...
```

Target folders can be disabled for flat variation output. Repacking replaces
only matching current files; other variations and legacy outputs are retained.

## Developer overrides

Double-click the version badge to create or open:

```text
settings/cgb-studio-packer.networks.js
```

The project-level file supports partial `prepend`, `replace` and `append`
changes to adapter head/script text, plus documented profile fields. It is read
before every build pack, Pack existing and Size Estimate. The file runs in a
restricted VM without filesystem, network, `require`, `process` or Editor
access. Target identities, shared MRAID lifecycle and paths outside a variation
cannot be overridden. Mandatory Google, Snapchat, Unity and Mintegral
assertions run after customization.

## AdsManager project API

New projects can install a small dependency-free module from **Packer settings
→ Game API → Install AdsManager**. It is created once at:

```text
assets/Scripts/CGB/AdsManager.ts
```

Use it from game scripts:

```ts
import AdsManager from './CGB/AdsManager';

AdsManager.download();
AdsManager.gameEnd();
```

It also provides `gameReady()`, `isDownloadHidden()`, `setGooglePlayUrl()` and
`setAppStoreUrl()`. Calls are safe in Editor preview and non-playable builds.
Store URLs continue to be detected from the start-scene project scripts; no
variation setting is required. Existing `super_html_playable.ts` projects keep
working and can migrate call sites at their own pace.

## Size estimate and assets

**Estimate size** performs a real temporary web-mobile build and calculates the
exact UTF-8 size of the complete Default HTML for Base64 and Base122. It warns
independently above 5120 KB and reports approximate Raw/ZIP/encoded category
contributions. The diagnostic build remains at:

```text
build/cgb-size-estimate/<variation>/web-mobile
```

TTF, OTF, WOFF, WOFF2, EOT and TTC stay as original binary bytes. Dynamic
`@font-face` URLs are synchronously rewritten to persistent Blob URLs before a
style enters the DOM. Base122 remains experimental; its pinned MIT attribution
is in `LICENSES/Base122-MIT.txt`.

Settings use schema v6 in `settings/cgb-studio-packer.json`; older settings are
migrated automatically and `Default` is enabled during migration.

## Development

```bash
npm install
npm run build
npm test
```

Restart Cocos Creator after rebuilding the installed extension.
