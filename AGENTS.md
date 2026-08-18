# netflix-subtitle-helper Agent 導航

> 下一層：
> - [`content.js.AGENTS.md`](content.js.AGENTS.md) — 修改 overlay 生命週期、樣式、訊息路由、全螢幕搬移時閱讀
> - [`subtitle-source.js.AGENTS.md`](subtitle-source.js.AGENTS.md) — 修改字幕擷取或監測迴圈時閱讀

Chrome/Edge MV3 擴充：以自製 overlay 取代 Netflix 原生字幕，提供拖動定位、字體調整、雙擊取詞翻譯與播放畫質顯示。

---

## 核心觀念

- 原生字幕**不是被修改，而是被隱藏後重繪**：`content.js` 注入 `.player-timedtext { display: none }` 並建立 `#custom-subtitle-overlay` 掛在 `document.body`；逐幀讀取原生容器文字的是 `subtitle-source.js`，經 hooks 回呼交給 `content.js` 繪製。原生 DOM 仍在運作，僅不可見。
- 七個 content script 共用同一 isolated world，不經 ES module，靠 `manifest.json` 的 `content_scripts.js` **陣列順序**決定初始化次序；被依賴者必須排在前面。
- 字幕子系統拆為三個模組，靜態相依只有一個方向：`content.js` → `drag.js` / `subtitle-source.js`。反向溝通一律走**執行期注入的 callback**（`drag.attach()` 與 `source.start()` 的 hooks 參數），故後兩者不於 top-level 取用任何 `content.js` 的東西——這是避免載入期循環的機制。
- 兩個內部旗標（`TRANSLATION_ENABLED` 翻譯開關、`LOG_LEVEL` console 輸出等級）與三個設定預設值 `DEFAULTS`，**一律定義於 `config.js`**。兩個旗標各由 `translation.js` / `logger.js` 於載入期取一次，並在停用時將導出的 API 換成 no-op，呼叫端不做條件判斷；`DEFAULTS` 的取用端則是 `content.js`（載入期）與 `popup.js`（`DOMContentLoaded` 回呼內）。
- 沒有 build step 與測試框架。驗證方式為載入未封裝擴充後於 Netflix 播放頁實測，或以 `node --check` 檢查語法、以 node 搭配 DOM stub 與 `vm.runInContext` 依 `manifest.json` 宣告順序載入整條鏈（全部模組皆為 classic script，無 ES module，可直接餵字串執行）。`subtitle-source.js` 匯出 `extract()` 即是為此——重建一段 Netflix 字幕 DOM 後可直接呼叫，不需啟動迴圈。

---

## 入口檔

| 檔 | 職責 | per-file doc? |
|----|------|---------------|
| `manifest.json` | 權限、content script 載入順序；`version` 為全擴充版本號的唯一來源 | |
| `config.js` | 零相依常數模組：全擴充唯一的常數來源，匯出 `VERSION` / `LOG_LEVEL` / `TRANSLATION_ENABLED` / `DEFAULTS` 四個符號；content script 與 popup 兩個 realm 共用同一份檔 | |
| `logger.js` | 全擴充共用的分級 console 輸出；等級取自 `CONFIG.LOG_LEVEL` | |
| `translation.js` | 雙擊取詞翻譯（MyMemory API）；啟用與否取自 `CONFIG.TRANSLATION_ENABLED` | |
| `drag.js` | 拖動狀態機：`window.NetflixSubtitleDrag = { attach }`。持有拖動暫態與錨點，定位與落盤由 hooks 注入 | |
| `subtitle-source.js` | 字幕擷取與 30ms 監測迴圈：`window.NetflixSubtitleSource = { start, stop, extract }`。持有去重鍵與 observer | ✓ [`subtitle-source.js.AGENTS.md`](subtitle-source.js.AGENTS.md) |
| `content.js` | 相依樹的根：overlay 生命週期、樣式注入、訊息路由、全螢幕搬移。不註冊任何 `window.NetflixSubtitle*` | ✓ [`content.js.AGENTS.md`](content.js.AGENTS.md) |
| `quality_display.js` | 播放頁標題下方的解析度標籤；自帶 SPA 換片偵測 | |
| `popup.js` / `popup.html` | 工具列彈窗：字體滑桿與重置，經 `chrome.tabs.sendMessage` 下達 | |

---

## 跨檔陷阱

1. **載入順序為硬相依：`config.js` → `logger.js` → `translation.js` → `drag.js` → `subtitle-source.js` → `content.js` → `quality_display.js`（`manifest.json` 的 `content_scripts.js`）** — 每個模組於 top-level 就取走其相依的 handle：`logger.js` 取 `window.NetflixSubtitleConfig`；`translation.js` 取 `Config` 與 `Logger` 兩者；`drag.js` / `subtitle-source.js` / `quality_display.js` 取 `Logger`；`content.js` 取上述全部。`config.js` 為唯一的零相依模組，須排在陣列首位。

   順序錯置的症狀特別難查：**載入期不報錯**，handle 靜靜取到 `undefined`，直到該 handle 首次被呼叫才炸（例如 `drag.js` 排在 `content.js` 之後，錯誤發生在 overlay 建立時的 `drag.attach`），且錯誤只在 devtools 切到擴充 isolated world 才看得到。新增模組時一併確認其在陣列中的位置。

   **popup 頁是第二條各自獨立的載入鏈**：`popup.html` 末端的 `<script>` 順序同樣是硬相依，`config.js` 必須排在 `popup.js` 之前（`popup.js` 於 top-level 取 `window.NetflixSubtitleConfig`）。此鏈不受 `manifest.json` 管轄，改動 popup 的 script 標籤時須各別確認；漏加或錯位的症狀是滑桿與重置鈕全無反應，且錯誤只出現在 popup 自己的 devtools（需右鍵「檢查彈出式視窗」）。

2. **每個 content script 一律包成 `(function () { 'use strict'; ... })()`** — 全部 content script 共用同一 isolated world 的全域詞法環境。兩個檔在 top-level 宣告同名 `const`（例如 `log`）時，第二個檔會拋 `SyntaxError: Identifier 'log' has already been declared` 且**整份不執行**，錯誤同樣只在擴充 isolated world 才看得到。已用 node + `vm` 同 realm 實測確認。`content.js` 亦已 IIFE 化；它不被任何模組消費，包起來無對外影響。

3. **`.custom-subtitle-text` 是「拖動 vs 選字」的分流點，且硬編碼於三個檔** — overlay 外觀上是一整塊字幕，實際可拖動的僅有 `padding: 10px 20px` 形成的邊框帶：`drag.js` 的 `handleMouseDown()` 對帶此 class 的目標直接 `return`，把文字區讓給選取與雙擊取詞。因此「拖動字幕」的正確操作是抓字幕**邊緣**——這是刻意取捨，不是 hit-test bug；移除該 `return` 會使選字與翻譯同時失效。

   同一字串同時出現在 `content.js`（樣式定義與 `renderSubtitle()`）、`drag.js`（上述分流）與 `translation.js`（雙擊事件過濾）。**單邊改名不會報錯**：只改 `content.js` 會讓文字區變成可拖動並因此廢掉選字；漏改 `translation.js` 則雙擊取詞失效。

   相對地，**overlay 的 element id 不屬此類，且必須維持不屬此類**：`content.js` 以 `OVERLAY_ID`（L24）單點持有，樣式字串、節點建立與查詢皆由該常數展開；`translation.js` 的外點收起判定改以 `attachTo()` 收到的節點判斷（`overlay.contains(e.target)`），不寫 id 選擇器。故改 overlay id 無跨檔連動，但反向約束成立：`translation.js` 不得改寫回 `closest('#custom-subtitle-overlay')` —— 改寫後只要 `content.js` 單邊改名，該判定即恆為 false-negative，雙擊取詞的 click 成分會立即收起剛彈出的翻譯視窗（彈出後隨即消失，零錯誤訊息）。驗證：`grep -rn "custom-subtitle-overlay" --include=*.js .` 應恰好一行，即 `content.js` 的常數宣告（`content.js.backup` 未被 `manifest.json` 載入，副檔名亦非 `.js`，不落在此 glob 內）。

   `dragging` 亦同時出現於 `content.js`（樣式）與 `drag.js`（`DRAGGING_CLASS`），但單邊改名僅使拖動時的外框光暈失效，無功能影響，不列為陷阱。

4. **console 過於吵雜時調 `config.js` 的 `LOG_LEVEL`，而非逐處刪 log** — 等級為 `off` / `error` / `info` / `verbose`，預設 `info`。字幕更新與清除訊息由 `subtitle-source.js` 的 30ms 監測迴圈驅動，歸類於 `verbose`，預設不輸出；排查字幕擷取問題時改為 `verbose`。旗標拼錯會靜默回退為 `info`。`logger.js` 於載入期讀取此值一次，並據以把停用的等級**綁定成 no-op 函式**；因此 `config.js` 不得提供 `setLogLevel()`、不得把 `LOG_LEVEL` 改寫成 getter、不得改為自 `chrome.storage` 非同步讀取——任一項都會使等級退化為呼叫期判斷，30ms 迴圈的 verbose 訊息會在 `info` 等級下重新刷屏，且症狀不是報錯而是刷屏。

5. **停用翻譯須連動三處，非僅改旗標** — 將 `config.js` 的 `TRANSLATION_ENABLED` 設為 `false` 後，另須移除 `manifest.json` 中 `api.mymemory.translated.net` 的 `host_permissions`（否則索取用不到的權限），並修正 `popup.html` 的功能說明——Features 清單的兩個翻譯條目與 Tips 第 3 點皆為靜態標記，`popup.js` 目前不依旗標增減任何條目。popup 為獨立 realm 但同樣載入 `config.js`（見 `popup.html` 末端的 script 順序），故 `popup.js` 讀得到 `CONFIG.TRANSLATION_ENABLED`；不願手改 HTML 時，改由 `popup.js` 於執行期隱藏該三處亦可，兩者擇一。`content.js` 不須改動——`translation.js` 於停用時把四個導出方法全綁成同一個 no-op。

6. **`config.js` 的 `CONFIG.DEFAULTS` 同時是預設值與 storage schema 的唯一來源** — 字體與位置的預設值只此一份，`content.js` 與 `popup.js` 皆自此取用，兩檔不得再出現預設值字面值。兩個慣用法依賴此物件：讀取一律 `chrome.storage.sync.get(CONFIG.DEFAULTS, cb)`（Chrome 的 `get(object)` 語義即「以該物件為預設值字典」，故回呼取得的 key 集合恆等於 `DEFAULTS` 且每個 key 必定有值，呼叫端不做 truthy 判斷），重置一律 `chrome.storage.sync.set(CONFIG.DEFAULTS)`。

   **key 集合亦不得於使用端重列**：`content.js` 的三個接觸點全部由 `DEFAULTS` 衍生——初值 `const settings = { ...CONFIG.DEFAULTS }`（L32）、回填 `Object.assign(settings, result)`（L42）、落盤 `chrome.storage.sync.set(settings)`（L55）。因此於 `config.js` 增設一個設定項後，`content.js` 無須同步修改即會讀取、保留並持久化該項。改回列舉 key 的字面值會使新增項「讀得到、存不進」——`get()` 帶回該 key 但使用端不接、`set()` 不寫回，無錯誤亦無 log。

   由此衍生三條約束：**`DEFAULTS` 的 key 集合必須恰好等於 `chrome.storage.sync` 的 key 集合**，混入非持久化常數（滑桿 `min`/`max`、輪詢間隔）會被 `set()` 一併寫進使用者 storage 並被 `get()` 多帶回一個 key，屬靜默污染；**`content.js` 的 `settings` 物件同受此約束**，不得混入執行期暫態，`saveSettings()` 是整包寫回；以及 **`DEFAULTS` 已凍結，使用端不得寫成 `const settings = CONFIG.DEFAULTS` 的別名**，必須淺拷貝，否則對其指派會失敗。滑桿 `min`/`max` 屬 UI 範圍而非預設值，留在 `popup.html`；輪詢間隔 `POLL_INTERVAL_MS` 留在 `subtitle-source.js`，兩者皆僅存在一處。

7. **`quality_display.js` 自行處理 SPA 換頁，字幕子系統不處理** — 前者以 MutationObserver 監看 `location.href` 變化並 cleanup／重建；後者僅在載入時輪詢一次播放器容器。跨影片行為異常時，兩者的排查路徑不同。要補字幕子系統的換頁 cleanup 時，入口是 `subtitle-source.js` 的 `stop()`（已提供，目前無呼叫端），另須一併處理去重鍵殘留，見 [`subtitle-source.js.AGENTS.md`](subtitle-source.js.AGENTS.md)。

8. **版本號唯一來源為 `manifest.json` 的 `version`** — 其餘一律於執行期取自 `chrome.runtime.getManifest().version`，集中於 `config.js` 求值一次後以 `CONFIG.VERSION` 匯出（字串，不含前綴 `v`，由使用端自行補上）。`.js` 與 `.html` 不得再出現版本字面值，註解亦然——此處歷來必然腐化（曾出現 manifest 為 6.4 而 `content.js` 自稱 6.3；`popup.js` 檔頭一度停在 6.1）。驗證：`grep -rn "v[0-9]\+\.[0-9]" --include=*.js --include=*.html .` 應零命中（`content.js.backup` 未被 `manifest.json` 載入，不在此列）。`README.md` 亦不標示版本號（安裝說明與版本解耦，且不記載更新紀錄），故文件端無版本字樣需同步維護。

---

## 欲修改 X 應讀何處

| 目標 | 入口 |
|------|------|
| 字幕文字抓不到／內容有誤 | [`subtitle-source.js.AGENTS.md`](subtitle-source.js.AGENTS.md) 的「不變式」與「已知陷阱」 |
| 字幕拖不動、抓不到文字區 | 上方「跨檔陷阱」第 3 條，再讀 `drag.js` |
| 字幕位置跑掉、與畫面不對齊 | [`content.js.AGENTS.md`](content.js.AGENTS.md) 的「設計邏輯」 |
| 字幕顯示異常但擷取正常 | [`content.js.AGENTS.md`](content.js.AGENTS.md) 的「不變式」 |
| 補字幕子系統的 SPA 換頁 cleanup | `subtitle-source.js` 的 `stop()`，並見上方「跨檔陷阱」第 7 條 |
| 開關翻譯功能 | `config.js` 的 `TRANSLATION_ENABLED`，並見上方「跨檔陷阱」第 5 條的連動三處 |
| console 太吵／要看字幕擷取細節 | `config.js` 的 `LOG_LEVEL`，見上方「跨檔陷阱」第 4 條 |
| 改字體／位置預設值 | `config.js` 的 `DEFAULTS`，唯一來源；見上方「跨檔陷阱」第 6 條 |
| 新增一個持久化設定項 | `config.js` 的 `DEFAULTS` 加一個 key 即完成讀取與落盤（`content.js` 全由該物件衍生，無須同步修改）；UI 控制項另見下方「新增 popup 控制項」 |
| 換翻譯 API 或語言對 | `translation.js:15-16` 的 `API_ENDPOINT` / `LANG_PAIR`，並同步 `manifest.json` 的 `host_permissions` |
| 新增 popup 控制項 | `popup.html` 加元素 → `popup.js` 綁事件並 `sendMessage` → `content.js:206` 的 `onMessage` 分支加 action |
| 改版本號 | 只改 `manifest.json` 的 `version`，其餘自動連動；見上方「跨檔陷阱」第 8 條 |
| 畫質標籤位置或分級 | `quality_display.js:42` 的 `getCurrentQuality()`、`quality_display.js:142` 的 `insertIntoControls()` |
| 新增 content script | `manifest.json` 的 `js` 陣列，注意上方陷阱第 1、2 條的順序與 IIFE 約束 |
