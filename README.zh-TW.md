# Netflix Subtitle Helper

[English](README.md) | 繁體中文

一款 Chrome / Edge 擴充功能（Manifest V3），隱藏 Netflix 原生字幕層並改以自訂覆蓋層渲染字幕，使字幕得以移動位置、調整尺寸、以文字形式選取，並支援單字翻譯。當前播放解析度亦顯示於影片標題下方。

## 功能

| 功能 | 說明 |
| --- | --- |
| 字幕位置可調 | 可將覆蓋層拖曳至視窗任意位置。位置以視窗百分比儲存，故於視窗縮放與全螢幕切換後仍維持一致。 |
| 字型大小可調 | 字型大小由工具列彈出視窗的滑桿控制（20-80 px），並即時套用。 |
| 字幕文字可選取 | 覆蓋層將字幕渲染為一般可選取文字，而非影片圖層。 |
| 單字翻譯 | 於字幕中雙擊單字，即透過 MyMemory API 查詢（英文轉繁體中文）並以彈出視窗顯示結果。 |
| 播放品質顯示 | 當前解析度及其標籤（例如 `1920x1080 (Full HD)`）插入於影片標題下方，每兩秒更新一次。 |
| 設定持久化 | 字型大小與位置儲存於 `chrome.storage.sync`。 |

## 安裝

本擴充功能未上架任何商店，請以未封裝擴充功能方式載入。

1. Clone 或下載本儲存庫。
2. 開啟 `chrome://extensions/` 或 `edge://extensions/`。
3. 啟用**開發人員模式**。
4. 選擇**載入未封裝項目**，並指定本儲存庫目錄。
5. 重新載入任何已開啟的 Netflix 分頁。

## 使用方式

1. 於 Netflix 播放影片，並在播放器中啟用字幕。
2. 原生字幕層將被隱藏，改由自訂覆蓋層取代。
3. 將游標移至覆蓋層上以確認其可互動，隨後拖曳至新位置。位置於拖曳結束時儲存。
4. 雙擊單字以顯示翻譯。點擊字幕與翻譯彈出視窗以外的任何位置即關閉該彈出視窗。
5. 開啟工具列彈出視窗以調整字型大小，或將位置與尺寸重設為預設值。

## 內部旗標

[`config.js`](config.js) 中宣告兩個旗標。兩者皆於載入時讀取一次，變更任一者均須重新載入擴充功能。

| 旗標 | 值 | 作用 |
| --- | --- | --- |
| `LOG_LEVEL` | `off`、`error`、`info`（預設）、`verbose` | 主控台輸出層級。逐句字幕更新與拖曳座標僅於 `verbose` 輸出，故 `info` 於播放期間不會產生連續輸出。無法識別的值回退為 `info`。 |
| `TRANSLATION_ENABLED` | `true`（預設）、`false` | 設為 false 時，翻譯模組匯出空實作：不注入樣式、不建立彈出視窗、不註冊事件監聽器、不發出 API 請求。停用時應一併移除 `manifest.json` 中 `host_permissions` 的 MyMemory 條目，並修改 `popup.html` 的功能清單。 |

預設字型大小與位置以 `DEFAULTS` 宣告於同一檔案，該常數同時即為 `chrome.storage.sync` 的完整 schema。

## 專案結構

Content script 共用單一 isolated world，並依 `manifest.json` 宣告的順序載入。該順序為唯一可用的依賴機制：各模組於頂層讀取其依賴的 handle，故列於過早位置的模組將觀察到 `undefined`。

| 檔案 | 職責 |
| --- | --- |
| `config.js` | 常數與內部旗標。零依賴；亦由 `popup.html` 載入。 |
| `logger.js` | 依層級輸出主控台訊息。各通道於載入時繫結至主控台或空實作。 |
| `translation.js` | 單字翻譯彈出視窗與 MyMemory 請求，受 `TRANSLATION_ENABLED` 控制。 |
| `drag.js` | 拖曳狀態機。位置的讀取與寫入以 hook 形式注入。 |
| `subtitle-source.js` | 自原生 DOM 擷取字幕，以及監控迴圈。 |
| `content.js` | 覆蓋層生命週期、樣式注入、訊息路由與全螢幕重新定位。依賴樹的根節點。 |
| `quality_display.js` | 播放解析度指示器。 |
| `popup.html`、`popup.js` | 工具列彈出視窗。於獨立 realm 中優先載入 `config.js`。 |

`AGENTS.md` 及各 per-file `*.AGENTS.md` 文件記錄跨檔不變式與已知陷阱；修改字幕路徑前應先行參閱。

版本字串僅存在於 `manifest.json`，並透過 `chrome.runtime.getManifest()` 取得；任何原始碼檔案均不含版本字面值。

## 運作原理

原生字幕容器以 CSS 隱藏，其文字內容複製至自訂覆蓋層元素。擷取程序走訪容器的子節點，並將 `<br>` 元素轉換為換行字元，藉以保留多行字幕。此處不可使用 `innerText`：隱藏元素不產生 layout，`innerText` 將退化為 `textContent` 語意而丟失換行。

覆蓋層由 30 ms 輪詢迴圈搭配 mutation observer 更新。重複更新透過與前次渲染文字比對而抑制，避免在文字選取進行中重建 DOM。

## 權限與隱私

| 權限 | 用途 |
| --- | --- |
| `activeTab`、`storage` | 將設定套用至當前分頁並持久化。 |
| `https://www.netflix.com/*` | 讀取原生字幕 DOM 並注入覆蓋層。 |
| `https://api.mymemory.translated.net/*` | 單字翻譯請求。 |

僅有被雙擊的單字會送往 MyMemory API，且僅於 `TRANSLATION_ENABLED` 為 true 時發生。其餘資料一律不離開瀏覽器；設定僅存放於 `chrome.storage.sync`。

## 授權條款

以 MIT License 釋出。詳見 [LICENSE](LICENSE)。
