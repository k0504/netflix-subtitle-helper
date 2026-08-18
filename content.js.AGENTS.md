# content.js 內部導航

> 父 folder：[`AGENTS.md`](./AGENTS.md)
> 源檔：[`content.js`](./content.js)

字幕子系統的組裝點：隱藏原生字幕、建立與繪製自製 overlay、路由 popup 訊息、處理全螢幕搬移。擷取邏輯見 [`subtitle-source.js.AGENTS.md`](./subtitle-source.js.AGENTS.md)，拖動狀態機見 `drag.js`，翻譯與畫質顯示皆不在此檔。

---

## 內部結構

整份包在 IIFE 內（理由見 [`AGENTS.md`](./AGENTS.md) 跨檔陷阱第 2 條）。本檔是相依樹的根，不註冊任何 `window.NetflixSubtitle*`。

| Symbol | 行號 | 用途 |
|--------|------|------|
| 五個模組 handle | L13-17 | 順序即 `manifest.json` 載入順序的鏡像；任一排在本檔之後即為 `undefined` |
| `OVERLAY_ID` | L24 | overlay 的 element id，全 repo 唯一持有處；樣式字串、節點建立與查詢皆由此展開 |
| `settings` | L32 | 使用者設定（持久化）。key 集合以 `{ ...CONFIG.DEFAULTS }` 衍生，本檔不列舉任何 key，亦不出現預設值字面值 |
| `overlayElement` | L35 | 唯一的執行期狀態。拖動暫態屬 `drag.js`、去重鍵與 observer 屬 `subtitle-source.js`，皆為該模組私有 |
| `loadSettings()` | L40 | 以 `chrome.storage.sync.get(CONFIG.DEFAULTS, cb)` 讀取後 `Object.assign` 整包覆寫；key 必定有值，故無 truthy 判斷 |
| `saveSettings()` | L54 | `chrome.storage.sync.set(settings)` 整包寫回，不列舉 key |
| `addGlobalStyles()` | L59 | 注入樣式，含隱藏原生字幕的 `.player-timedtext { display: none }` |
| `dragHooks` | L123 | 注入 `drag.js` 的三個 hook：`readPosition` / `applyPosition` / `onDragEnd` |
| `createSubtitleOverlay()` | L134 | 建節點後呼叫 `drag.attach()` 與 `translation.attachTo()`；對既有 overlay 提早回傳 |
| `updateOverlayStyles()` | L156 | 將 `settings.fontSize` 套用至 `.custom-subtitle-text`；overlay 節點本身不帶字體 |
| `updateOverlayPosition()` | L166 | 百分比 → px，viewport 基準 |
| `readOverlayPositionPercent()` | L179 | 上者的逆運算，由 computed style 回讀；`drag.js` 的錨點與落盤值皆經此取得 |
| `renderSubtitle()` / `clearSubtitle()` | L189 / L200 | `subtitle-source.js` 的兩個 hook 實作；不去重、不輸出 log |
| `onMessage` 監聽 | L206 | popup 訊息路由 |
| `handleFullscreenChange()` | L227 | 於 `document.body` 與 `fullscreenElement` 之間搬移 overlay |

---

## 設計邏輯（易誤解者）

**位置百分比的基準是 viewport，不是影片畫面**。`updateOverlayPosition()`（L166）以 `window.innerWidth / innerHeight` 換算，`position: fixed`。影片有黑邊（非 16:9 內容、視窗比例不符）時，字幕與畫面內容不對齊，換片或改變視窗比例後偏移量也會變。修正對齊需改以 `<video>` 的實際渲染矩形為基準，屆時 `chrome.storage` 中既存的百分比語意會改變。

**`settings.positionLeft/Bottom` 全程只表示「已持久化的位置」**。拖動期間的錨點是 `drag.js` 的私有欄位，本檔的 `settings` 不被挪用；`onDragEnd` 落盤才是其唯一的更新時機（另有 `resetPosition` 訊息與 `loadSettings()`）。

| 概念 | 在此檔中的名稱 | 說明 |
|---|---|---|
| 自製 overlay | `OVERLAY_ID`（值 `custom-subtitle-overlay`，L24） | 掛在 body 或 fullscreenElement。id 字串僅存在於此常數，其餘檔案不得以 id 選擇器指涉，見 [`AGENTS.md`](./AGENTS.md) 跨檔陷阱第 3 條 |
| overlay 內的文字節點 | `.custom-subtitle-text` | 字體大小的實際套用對象；同一字串亦硬編碼於 `drag.js` 與 `translation.js`，見 [`AGENTS.md`](./AGENTS.md) 跨檔陷阱第 3 條 |

---

## 不變式（改動前須確認其仍成立）

1. **全螢幕搬移後須重新套用位置與字體**（`handleFullscreenChange()` L227）—— `appendChild` 會保留 inline style，但百分比基準隨 viewport 改變，不重算即偏移。

2. **搬移必須是 `appendChild` 同一個 overlay 節點，不得改為重建** —— 已渲染的 `.custom-subtitle-text` 隨之一併移動，`subtitle-source.js` 的去重鍵因此仍然對齊。改成重建 overlay 會使去重鍵殘留舊值，字幕須等下一句才重新出現（見 [`subtitle-source.js.AGENTS.md`](./subtitle-source.js.AGENTS.md) 的「去重鍵為私有狀態」）。

3. **`source.start()` 必須排在 `createSubtitleOverlay()` 之後**（`init()` L257）—— `renderSubtitle()` / `clearSubtitle()` 不對 `overlayElement` 做空值防護。

4. **`onMessage` 監聽須註冊於 IIFE 頂層，不得移入 `init()`** —— 否則播放器就緒前抵達的 popup 訊息無人回應。

5. **`renderSubtitle()` / `clearSubtitle()` 不得自行去重、不得輸出 log** —— 去重與 verbose 訊息皆由 `subtitle-source.js` 的迴圈端負責，兩邊都做會重複輸出；本檔改用 `log.info` 更會隨播放持續刷屏。等級定義見 `config.js` 的 `LOG_LEVEL`。

6. **`settings`（L32）只放持久化欄位，且不得於本檔列舉其 key** —— `saveSettings()`（L54）是 `chrome.storage.sync.set(settings)` 整包寫回，混入執行期暫態即寫髒使用者 storage；反向若把三個接觸點（初值、`Object.assign` 回填、落盤）改回列舉 key 的字面值，於 `config.js` 新增的設定項會「讀得到、存不進」，無錯誤亦無 log（見 [`AGENTS.md`](./AGENTS.md) 跨檔陷阱第 6 條）。

---

## 改動 checklist

- [ ] 改動 overlay 生命週期後，確認上方不變式第 2、3 條仍成立（兩者皆會使字幕靜默停止更新，無錯誤訊息）
- [ ] 需要改預設字體或位置、或新增持久化設定項時，只改 `config.js` 的 `CONFIG.DEFAULTS`；本檔與 `popup.js` 皆不得出現預設值字面值或 key 列舉（見 [`AGENTS.md`](./AGENTS.md) 跨檔陷阱第 6 條與上方不變式第 6 條）
- [ ] 新增 `chrome.runtime.onMessage` 分支後，確認 `popup.js` 有對應送出端
- [ ] 改動 `.custom-subtitle-text` 的 class 名稱時，已同步 `drag.js` 與 `translation.js`（見 [`AGENTS.md`](./AGENTS.md) 跨檔陷阱第 3 條）
- [ ] 改動 `OVERLAY_ID` 時，確認 `translation.js` 仍以 `overlay.contains()` 判定而非 id 選擇器：`grep -rn "custom-subtitle-overlay" --include=*.js .` 應僅命中本檔的常數宣告（見 [`AGENTS.md`](./AGENTS.md) 跨檔陷阱第 3 條）
- [ ] 新增的 log 呼叫已依頻率選定等級：每句字幕觸發者用 `log.verbose`，其餘用 `log.info`
