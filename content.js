// Netflix 字幕助手 - 字幕 overlay 核心 (overlay 生命週期、樣式注入、訊息路由、全螢幕搬移)
// 版本號一律取自 manifest.json (chrome.runtime.getManifest),本檔不標示版本,避免與 manifest 不一致。
// 拖動狀態機見 drag.js;字幕擷取與監測迴圈見 subtitle-source.js;翻譯見 translation.js;畫質見 quality_display.js。
//
// 本檔是相依樹的根,不註冊任何 window.NetflixSubtitle*。整份包在 IIFE 內是硬性要求:
// 全部 content script 共用同一個 isolated world 的全域詞法作用域,兩個檔在 top-level 宣告同名
// const (例如 log) 會使第二個檔整份不執行,且錯誤僅在 devtools 切到擴充 isolated world 才看得到。
(function () {
    'use strict';

    // 以下五個 handle 於 top-level 取得,順序即 manifest.json 的 content_scripts.js 順序的鏡像;
    // 任一模組排在本檔之後即為 undefined,字幕功能整組不啟動。
    const CONFIG = window.NetflixSubtitleConfig;
    const log = window.NetflixSubtitleLogger;
    const translation = window.NetflixSubtitleTranslation;
    const drag = window.NetflixSubtitleDrag;
    const source = window.NetflixSubtitleSource;

    log.info(`🎬 Netflix 字幕助手 v${CONFIG.VERSION} 已載入`);

    // overlay 的 element id,本檔為唯一持有者:樣式字串、建立與查詢皆由此常數展開。
    // translation.js 以 attachTo() 收到的節點判定命中 (overlay.contains),不以 id 字串跨檔指涉,
    // 故此處改名無跨檔連動;不得為了「省一次參數傳遞」把 id 字串複製回 translation.js。
    const OVERLAY_ID = 'custom-subtitle-overlay';

    // 使用者設定 (持久化)。key 集合直接衍生自 CONFIG.DEFAULTS,本檔不重列任何 key——
    // 讀取回填走 Object.assign(settings, result)、落盤走 set(settings),
    // 因此於 config.js 新增設定項後,本檔無須同步修改即會讀取並持久化該項。
    // 淺拷貝而非別名:CONFIG.DEFAULTS 已凍結,'use strict' 下對其指派會拋 TypeError。
    // 由此衍生一條約束:settings 不得混入非持久化欄位 (執行期暫態、UI 範圍值),
    // saveSettings() 會把整個物件寫入 chrome.storage.sync。
    const settings = { ...CONFIG.DEFAULTS };

    // 執行期狀態。拖動暫態屬 drag.js、去重鍵與 observer 屬 subtitle-source.js,皆為該模組私有。
    let overlayElement = null;

    // 從 storage 載入設定
    // 以 CONFIG.DEFAULTS 作為 get() 的預設值字典:回呼取得的 key 集合恆等於 DEFAULTS,
    // 且每個 key 必定有值,故整包覆寫即可,無須 truthy 判斷,亦不逐欄列舉 key。
    function loadSettings() {
        chrome.storage.sync.get(CONFIG.DEFAULTS, (result) => {
            Object.assign(settings, result);
            log.info(`📏 載入字體大小: ${settings.fontSize}px`);

            // 如果 overlay 已經存在,更新樣式
            if (overlayElement) {
                updateOverlayStyles();
            }
        });
    }

    // 儲存設定。settings 的 key 集合即 chrome.storage.sync 的完整 schema,故整包寫回;
    // 不得改回列舉 key 的字面值,那會使新增設定項時靜默漏寫 (讀得到、存不進)。
    function saveSettings() {
        chrome.storage.sync.set(settings);
    }

    // 添加全域樣式
    function addGlobalStyles() {
        const style = document.createElement('style');
        style.id = 'netflix-subtitle-helper-styles';
        style.textContent = `
        /* 隱藏原始 Netflix 字幕 */
        .player-timedtext {
            display: none !important;
        }

        /* 自定義字幕 overlay */
        #${OVERLAY_ID} {
            position: fixed !important;
            z-index: 999999 !important;
            pointer-events: auto !important;
            user-select: text !important;
            cursor: move !important;
            padding: 10px 20px !important;
            transition: box-shadow 0.2s ease !important;
        }

        #${OVERLAY_ID}:hover {
            box-shadow: 0 0 20px rgba(255, 255, 255, 0.5) !important;
        }

        /* dragging 由 drag.js 於拖動期間掛上 (該檔的 DRAGGING_CLASS);
           單邊改名只會使拖動時的外框光暈失效,無功能影響 */
        #${OVERLAY_ID}.dragging {
            box-shadow: 0 0 30px rgba(255, 255, 255, 0.8) !important;
            cursor: grabbing !important;
        }

        /* 字幕文字樣式 */
        .custom-subtitle-text {
            line-height: normal !important;
            font-weight: bolder !important;
            color: #ffffff !important;
            text-shadow: #000000 0px 0px 7px !important;
            font-family: Netflix Sans, Helvetica Neue, Helvetica, Arial, sans-serif !important;
            white-space: pre-wrap !important;
            text-align: center !important;
            display: inline-block !important;
            pointer-events: auto !important;
            user-select: text !important;
            cursor: text !important;
        }

        /* 單字選取樣式 */
        .custom-subtitle-text::selection {
            background: rgba(255, 255, 0, 0.3) !important;
        }

    `;

        const oldStyle = document.getElementById('netflix-subtitle-helper-styles');
        if (oldStyle) {
            oldStyle.remove();
        }

        document.head.appendChild(style);
        log.info('✅ 全域樣式已添加');
    }

    // 注入給 drag.js 的三個 hook。拖動期間 settings 不被挪用為錨點,
    // 錨點由 drag.js 私有持有;settings 全程只表示「已持久化的位置」。
    const dragHooks = {
        readPosition: readOverlayPositionPercent,
        applyPosition: (left, bottom) => updateOverlayPosition(overlayElement, left, bottom),
        onDragEnd: (left, bottom) => {
            settings.positionLeft = left;
            settings.positionBottom = bottom;
            saveSettings();
        }
    };

    // 創建自定義字幕 overlay
    function createSubtitleOverlay() {
        let overlay = document.getElementById(OVERLAY_ID);
        if (overlay) {
            return overlay;
        }

        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;

        updateOverlayPosition(overlay, settings.positionLeft, settings.positionBottom);

        document.body.appendChild(overlay);
        overlayElement = overlay;

        drag.attach(overlay, dragHooks);
        translation.attachTo(overlay);

        log.info('✅ 自定義字幕 overlay 已創建');
        return overlay;
    }

    // 更新 overlay 樣式
    function updateOverlayStyles() {
        if (overlayElement) {
            const textElement = overlayElement.querySelector('.custom-subtitle-text');
            if (textElement) {
                textElement.style.fontSize = `${settings.fontSize}px`;
            }
        }
    }

    // 更新 overlay 位置
    function updateOverlayPosition(overlay, leftPercent, bottomPercent) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const leftPx = (leftPercent / 100) * viewportWidth;
        const bottomPx = (bottomPercent / 100) * viewportHeight;

        overlay.style.left = `${leftPx}px`;
        overlay.style.bottom = `${bottomPx}px`;
        overlay.style.transform = 'translateX(-50%)';
    }

    // 由 computed style 回讀當前位置百分比 (updateOverlayPosition 的逆運算)
    function readOverlayPositionPercent() {
        const computedStyle = window.getComputedStyle(overlayElement);

        return {
            left: (parseFloat(computedStyle.left) / window.innerWidth) * 100,
            bottom: (parseFloat(computedStyle.bottom) / window.innerHeight) * 100
        };
    }

    // 繪製字幕。由 subtitle-source.js 於內容確實變更時呼叫,故此處不做去重、不輸出 log。
    function renderSubtitle(text) {
        const textElement = document.createElement('span');
        textElement.className = 'custom-subtitle-text';
        textElement.style.fontSize = `${settings.fontSize}px`;
        textElement.textContent = text;

        overlayElement.innerHTML = '';
        overlayElement.appendChild(textElement);
    }

    // 清除字幕。同樣由 subtitle-source.js 驅動,不做去重、不輸出 log。
    function clearSubtitle() {
        overlayElement.innerHTML = '';
    }

    // 監聽來自 popup 的訊息
    // 須註冊於 IIFE 頂層而非 init() 內:播放器就緒前抵達的 popup 訊息否則無人回應。
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'updateFontSize') {
            settings.fontSize = request.fontSize;
            updateOverlayStyles();
            saveSettings();
            log.info(`📏 字體大小已更新: ${settings.fontSize}px`);
            sendResponse({ success: true });
        } else if (request.action === 'resetPosition') {
            settings.positionLeft = CONFIG.DEFAULTS.positionLeft;
            settings.positionBottom = CONFIG.DEFAULTS.positionBottom;
            if (overlayElement) {
                updateOverlayPosition(overlayElement, settings.positionLeft, settings.positionBottom);
            }
            saveSettings();
            log.info('🔄 位置已重置');
            sendResponse({ success: true });
        }
        return true;
    });

    // 處理全螢幕模式切換
    function handleFullscreenChange() {
        const isFullscreen = document.fullscreenElement !== null;
        log.info(`🖥️ 全螢幕模式: ${isFullscreen ? '開啟' : '關閉'}`);

        if (overlayElement) {
            // 確保字幕 overlay 始終在最上層
            overlayElement.style.zIndex = '999999';

            // 如果在全螢幕模式,將 overlay 移到 fullscreen element
            if (isFullscreen && document.fullscreenElement) {
                document.fullscreenElement.appendChild(overlayElement);
                log.info('✅ 字幕已移至全螢幕容器');
            } else {
                // 退出全螢幕,移回 body
                document.body.appendChild(overlayElement);
                log.info('✅ 字幕已移回 body');
            }

            // 重新應用位置和樣式。appendChild 保留 inline style,但百分比基準隨 viewport 改變,
            // 不重算即偏移;搬移的是同一個節點,已渲染的字幕與去重鍵因此仍然對齊。
            updateOverlayPosition(overlayElement, settings.positionLeft, settings.positionBottom);
            updateOverlayStyles();
        }

        translation.relocateTo(isFullscreen && document.fullscreenElement
            ? document.fullscreenElement
            : document.body);
    }

    // 初始化
    function init() {
        log.info('🔍 開始初始化...');

        addGlobalStyles();
        translation.init();
        loadSettings();

        // 監聽全螢幕切換事件
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('msfullscreenchange', handleFullscreenChange);
        log.info('✅ 全螢幕監聽已設置');

        const checkPlayer = setInterval(() => {
            const playerContainer = document.querySelector('.watch-video--player-view');

            if (playerContainer) {
                clearInterval(checkPlayer);
                log.info('✅ Netflix 播放器已就緒');

                // source.start() 必須在 createSubtitleOverlay() 之後:
                // renderSubtitle / clearSubtitle 不對 overlayElement 做空值防護。
                createSubtitleOverlay();
                source.start({ onText: renderSubtitle, onClear: clearSubtitle });

                log.info(`🚀 Netflix 字幕助手 v${CONFIG.VERSION} 準備就緒!`);
                log.info(translation.enabled
                    ? '💡 提示: 拖動字幕邊緣可移動位置,雙擊單字可查看翻譯!'
                    : '💡 提示: 拖動字幕邊緣可移動位置。');
            }
        }, 1000);
    }

    // 啟動
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
