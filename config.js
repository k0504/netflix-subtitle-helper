// Netflix 字幕助手 - 常數模組
// 零相依純資料：只碰 window 與 chrome.runtime.getManifest(),不引用 logger、不呼叫 log.*、
// 不碰 DOM、不註冊事件。此規則是化解「logger 需要常數、常數又想寫 log」循環相依的全部機制。
//
// 本模組必須排在其餘 content script 之前 (見 manifest.json 的 content_scripts.js 順序);
// popup 頁為另一個 realm,於 popup.js 之前載入同一份檔 (見 popup.html)。兩份副本皆凍結且無執行期變更。
//
// 禁止事項:不得新增 setLogLevel()、不得把 LOG_LEVEL 改寫成 getter、不得改為自 chrome.storage
// 非同步讀取。任一項都會使 logger.js 由「載入期讀一次、綁一次」退化為「呼叫期判斷」,
// 30ms 監測迴圈的 verbose 訊息會在 info 等級下重新刷屏;非同步讀取更會讓 logger 載入時取到 undefined。
(function () {
    'use strict';

    // 版本一律由 manifest 取得;node DOM stub 無 chrome 時退化為 '' (僅驗證路徑會遇到)。
    // 不得補上版本字面值當 fallback,那會重新製造第二個版本來源。
    const VERSION = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest)
        ? chrome.runtime.getManifest().version
        : '';

    window.NetflixSubtitleConfig = Object.freeze({
        VERSION,   // string,取自 manifest 的 version 欄位;不含前綴 v,由使用端自行補上

        // ===== logger.js 的輸出等級旗標 =====
        // 'off'     完全不輸出
        // 'error'   僅錯誤
        // 'info'    錯誤 + 生命週期訊息 (載入、就緒、設定變更、全螢幕切換)  <- 預設
        // 'verbose' 全部,含每句字幕的更新與清除、拖動座標等高頻訊息
        //
        // 字幕更新訊息由字幕監測迴圈驅動 (每 30ms 一次比對),故歸類於 verbose;
        // 'info' 以下不會隨播放持續刷屏。拼錯時 logger.js 靜默回退為 'info'。
        LOG_LEVEL: 'info',

        // ===== translation.js 的功能旗標 =====
        // 設為 false 即完全停用翻譯功能: 不注入樣式、不建立彈窗、不綁定事件、
        // 不發出任何翻譯 API 請求。導出的 API 會全部退化為 no-op,
        // content.js 無須為此加任何條件判斷。
        //
        // 停用時亦應一併移除 manifest.json 中 api.mymemory.translated.net 的
        // host_permissions,以免擴充索取用不到的權限,並修正 popup.html 的功能清單。
        TRANSLATION_ENABLED: true,

        // ===== chrome.storage.sync 的完整 schema =====
        // 本物件的 key 集合必須恰好等於 chrome.storage.sync 的 key 集合,不得混入任何
        // 非持久化常數 (滑桿 min/max 留在 popup.html,輪詢間隔留在使用端模組)。
        // 此約束是下列兩個慣用法的前提,破壞它會直接寫髒使用者的 storage:
        //   讀取:chrome.storage.sync.get(CONFIG.DEFAULTS, cb) —— Chrome 的 get(object) 語義即
        //         「以該物件作為預設值字典」,回呼取得的每個 key 必定有值,呼叫端不需 truthy 判斷。
        //   寫入預設:chrome.storage.sync.set(patch) —— popup.js 的重置流程自本物件取出欲重置的
        //         key 子集作為 patch;set() 為 merge 語義,未列入的 key 保持原值,故「只重置位置」
        //         不會連帶重置字體大小。全部重置即以 Object.keys(DEFAULTS) 為子集。
        // 使用端不得寫成 const settings = CONFIG.DEFAULTS:該物件已凍結,'use strict' 下對其
        // 指派會拋 TypeError;正確做法是逐欄複製。
        DEFAULTS: Object.freeze({
            fontSize: 43,
            positionLeft: 50,      // 百分比,viewport 基準
            positionBottom: 13     // 百分比,viewport 基準
        })
    });
})();
