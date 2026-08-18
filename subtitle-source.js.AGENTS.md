# subtitle-source.js 內部導航

> 父 folder：[`AGENTS.md`](./AGENTS.md)
> 源檔：[`subtitle-source.js`](./subtitle-source.js)

自 Netflix 原生字幕容器擷取文字，經去重後以 `hooks.onText` / `hooks.onClear` 通知使用端。本檔不碰 overlay，不知道字幕如何被繪製；繪製端見 [`content.js.AGENTS.md`](./content.js.AGENTS.md)。

---

## 內部結構

| Symbol | 行號 | 用途 |
|--------|------|------|
| `lastSubtitleText` | L34 | 去重鍵。本模組私有，使用端無從讀取或重置 |
| `readTextWithLineBreaks()` | L42 | 遞迴走訪子節點，`BR` 映射為 `\n` |
| `extract()` | L71 | 主選擇器 + 備援鏈；字幕消失判定亦在此。匯出以供 node stub 直接驗證 |
| `tick()` | L118 | 比對去重後呼叫 hook；由輪詢與三個 observer 共同驅動 |
| `start(hooks)` | L138 | 啟動 30ms 輪詢與三個 MutationObserver |
| `stop()` | L168 | 關閉輪詢與 observer 並重置去重鍵。**目前無呼叫端** |

---

## 設計邏輯（易誤解者）

**去重是迴圈端的責任，不是繪製端的**。30ms 輪詢與三個 MutationObserver 併發觸發同一個 `tick()`，故 `hooks.onText` 只在文字確實變更時被呼叫一次。使用端的 render callback 因此不需自帶條件判斷——反過來說，使用端亦不可假設每次輪詢都會收到通知。

**`stop()` 無呼叫端是刻意的，不是遺漏**。本模組私有持有一個無限期 `setInterval` 與三個 observer，隱藏而無關閉路徑即為設計缺陷，故提供此入口。補 SPA 換頁 cleanup 時由此進入（見 [`AGENTS.md`](./AGENTS.md) 跨檔陷阱第 7 條）。

**去重鍵為私有狀態，無 invalidate 入口**。若使用端未來在 `onText` / `onClear` 以外的路徑清空或重建 overlay（新增「暫時隱藏字幕」開關、SPA 換頁 cleanup），`lastSubtitleText` 會殘留舊值，字幕須等到文字內容改變才會重新出現——症狀為「字幕突然不動了」且零錯誤訊息。引入該類路徑時須同時補上 invalidate 入口。`handleFullscreenChange()` 以 `appendChild` 搬移同一個 overlay 節點（連同已渲染的 span），不屬此類路徑，故現行安全。

| 概念 | 在此檔中的名稱 | 說明 |
|---|---|---|
| Netflix 原生字幕容器 | `.player-timedtext` | 被 `content.js` 的 CSS 隱藏，但仍持續更新 |
| 原生字幕的單句分段 | `.player-timedtext-text-container` | 一句可能被拆成多個，亦可能單一內含 `<br>` |

---

## 不變式（改動前須確認其仍成立）

1. **擷取字幕不得改用 `innerText`** —— `content.js` 注入了 `.player-timedtext { display: none }`，而 `innerText` 對未渲染元素會退回 `textContent` 語義，`<br>` 一樣被吃掉。看似等價的簡化會直接重現黏行 bug。必須走 `readTextWithLineBreaks()`（L42）遞迴映射 `BR` 節點。

2. **`textContainers.length === 0` 時必須直接回傳 `null`，不得往下走備援選擇器**（`extract()` L71 內的 early return）—— 該處看似冗餘的判斷是「字幕已消失」的唯一判定。備援鏈會抓到 `.player-timedtext` 的殘留內容，導致字幕停在畫面上不消失。

3. **一句字幕的多行來源有兩種，兩者都須處理** —— 多個 `.player-timedtext-text-container`（以 `\n` join），以及單一 container 內部的 `<br>`。只處理其一即會漏行或黏行。

4. **`tick()`（L118）必須靠 `lastSubtitleText` 去重** —— 30ms 輪詢與三個 MutationObserver 併發觸發同一函式，若每次都通知使用端重建 DOM，使用者正在進行的文字選取會被持續清除，取詞翻譯無法操作。

5. **本檔內的訊息一律走 `log.verbose`** —— `tick()` 由 30ms 輪詢驅動，改用 `log.info` 會使 console 隨播放持續刷屏，淹沒初始化與錯誤訊息。`start()` 內的綁定訊息屬一次性，走 `log.info`。等級定義見 `config.js` 的 `LOG_LEVEL`。

---

## 已知陷阱

1. **`textContent` 吃掉 `<br>`（`readTextWithLineBreaks()` L42）** — 雙人對白與長句折行在同一 container 內以 `<br>` 分行，直接讀 `textContent` 會得到 `- Line A- Line B` 這種無分隔的黏連字串。單行字幕不受影響，故症狀為間歇性。修正見 commit `0dbb948`。

2. **備援選擇器鏈是為容器改名而留，不是為取值失敗而留（`FALLBACK_SELECTORS` L19）** — 其中數個選擇器（`[class*="subtitle"]` 等）匹配範圍寬，一旦在錯誤時機被觸及即抓到非字幕內容。修改 `extract()` 時須維持「先確認容器存在、再取值」的順序。

---

## 改動 checklist

- [ ] 已閱讀上方「不變式」，確認改動未違反第 1、2 條（兩者皆曾造成使用者可見的 bug）
- [ ] 改動擷取邏輯後，於「單行／雙人對白／長句折行／多 container／字幕消失」五種情形驗證。僅測單行無法暴露黏行與殘留問題；node + DOM stub 可直接呼叫匯出的 `extract()` 重建這五種 DOM
- [ ] 新增的 log 呼叫已依頻率選定等級：`tick()` 內或每句字幕觸發者用 `log.verbose`，`start()` / `stop()` 內用 `log.info`
- [ ] 若新增了「使用端在 `onText` / `onClear` 以外清空 overlay」的路徑，已一併提供去重鍵的 invalidate 入口
