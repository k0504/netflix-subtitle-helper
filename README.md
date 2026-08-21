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

## License

Released under the MIT License. See [LICENSE](LICENSE).
