# Netflix Subtitle Helper

English | [繁體中文](README.zh-TW.md)

A Chrome / Edge extension (Manifest V3) that hides the native Netflix subtitle layer and renders subtitles in a custom overlay, so they can be repositioned, resized, selected as text and translated word by word. The current playback resolution is also displayed beneath the video title.

## Features

| Feature | Description |
| --- | --- |
| Repositionable subtitles | Drag the overlay anywhere in the viewport. The position is stored as a viewport percentage, so it holds across window resizing and fullscreen transitions. |
| Adjustable size | Font size is controlled by a slider in the toolbar popup (20-80 px) and applied in real time. |
| Selectable subtitle text | The overlay renders subtitles as ordinary selectable text rather than as a video layer. |
| Word translation | Double-click a word in the subtitle to look it up (English to Traditional Chinese) through the MyMemory API and display the result in a popup. |
| Playback quality display | The current resolution and its label, for example `1920x1080 (Full HD)`, are inserted beneath the video title and refreshed every two seconds. |
| Persistent settings | Font size and position are stored in `chrome.storage.sync`. |

## Installation

The extension is not published on any store; load it as an unpacked extension.

1. Clone or download this repository.
2. Open `chrome://extensions/` or `edge://extensions/`.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the repository directory.
5. Reload any open Netflix tab.

## Usage

1. Play a title on Netflix with subtitles enabled in the player.
2. The native subtitle layer is hidden and replaced by the custom overlay.
3. Hover the overlay to confirm it is interactive, then drag it to a new position. The position is persisted when the drag ends.
4. Double-click a word to display its translation. Clicking anywhere outside the subtitle and the translation popup dismisses the popup.
5. Open the toolbar popup to adjust the font size, or to reset position and size to their defaults.

## Internal flags

Two flags are declared in [`config.js`](config.js). Both are read once at load time; changing either requires reloading the extension.

| Flag | Values | Effect |
| --- | --- | --- |
| `LOG_LEVEL` | `off`, `error`, `info` (default), `verbose` | Console verbosity. Per-cue subtitle updates and drag coordinates are emitted at `verbose` only, so `info` produces no continuous output during playback. An unrecognised value falls back to `info`. |
| `TRANSLATION_ENABLED` | `true` (default), `false` | When false, the translation module exports no-ops: no styles, no popup, no event listeners and no API requests. Disabling it should be accompanied by removing the MyMemory entry from `host_permissions` in `manifest.json` and by amending the feature list in `popup.html`. |

Default font size and position are declared in the same file as `DEFAULTS`, which also serves as the complete `chrome.storage.sync` schema.

## Project layout

Content scripts share a single isolated world and are loaded in the order declared in `manifest.json`. That order is the only dependency mechanism available: each module reads the handles of its dependencies at top level, so a module listed too early observes `undefined`.

| File | Responsibility |
| --- | --- |
| `config.js` | Constants and internal flags. Zero dependencies; also loaded by `popup.html`. |
| `logger.js` | Level-based console output. Each channel is bound either to the console or to a no-op at load time. |
| `translation.js` | Word lookup popup and MyMemory request, gated by `TRANSLATION_ENABLED`. |
| `drag.js` | Drag state machine. Position reads and writes are supplied as hooks. |
| `subtitle-source.js` | Subtitle extraction from the native DOM, and the monitoring loop. |
| `content.js` | Overlay lifecycle, style injection, message routing and fullscreen relocation. Root of the dependency tree. |
| `quality_display.js` | Playback resolution indicator. |
| `popup.html`, `popup.js` | Toolbar popup. Loads `config.js` first, in a separate realm. |

`AGENTS.md` and the per-file `*.AGENTS.md` documents record cross-file invariants and known traps; consult them before modifying the subtitle path.

The version string exists only in `manifest.json` and is obtained through `chrome.runtime.getManifest()`; no source file contains a version literal.

## How it works

The native subtitle container is hidden by CSS and its text is copied into a custom overlay element. Extraction walks the container child nodes and converts `<br>` elements into newline characters, which preserves multi-line cues. `innerText` cannot be used here: a hidden element produces no layout, so `innerText` degrades to `textContent` semantics and discards the line breaks.

The overlay is refreshed by a 30 ms polling loop combined with mutation observers. Redundant updates are suppressed by comparing against the previously rendered text, which prevents the DOM from being rebuilt while a text selection is in progress.

## Permissions and privacy

| Permission | Reason |
| --- | --- |
| `activeTab`, `storage` | Applying settings to the active tab and persisting them. |
| `https://www.netflix.com/*` | Reading the native subtitle DOM and injecting the overlay. |
| `https://api.mymemory.translated.net/*` | Word translation requests. |

Only the double-clicked word is sent to the MyMemory API, and only while `TRANSLATION_ENABLED` is true. No other data leaves the browser; settings are held exclusively in `chrome.storage.sync`.

## License

Released under the MIT License. See [LICENSE](LICENSE).
