// Netflix 字幕助手 - 拖動狀態機
// 以滑鼠拖動 overlay 改變其位置。本模組只管「拖動期間的暫態」,不知道 overlay 如何定位、
// 位置如何持久化——三者皆由 content.js 於 attach() 時以 hooks 注入。
//
// 本模組必須在 logger.js 之後、content.js 之前載入 (見 manifest.json 的 content_scripts.js
// 順序)。本模組不得於 top-level 取用任何 content.js 的 handle:content.js 是相依樹的根,
// 反向取用會構成載入期循環相依。與 content.js 的溝通一律走執行期注入的 hooks。
(function () {
    'use strict';

    const log = window.NetflixSubtitleLogger;

    // overlay 內文字節點的 class。同一字串亦硬編碼於 content.js (樣式與 render) 與
    // translation.js (雙擊過濾);單邊改名不會報錯,但會靜默廢掉選字或取詞翻譯。
    const TEXT_CLASS = 'custom-subtitle-text';
    const DRAGGING_CLASS = 'dragging';

    let overlayEl = null;
    let hooks = null;

    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    // 拖動錨點:mousedown 當下的位置百分比,拖動期間不變,作為 delta 的基準。
    // 此欄位為本模組私有,content.js 的 settings.positionLeft/Bottom 全程只表示「已持久化的位置」。
    let anchorLeft = 0;
    let anchorBottom = 0;

    function clampPercent(value) {
        return Math.max(0, Math.min(100, value));
    }

    // 三件事件抑制缺一不可,且三個監聽皆須為 capture 階段:否則拖動期間的滑鼠事件會傳到
    // Netflix 播放器,偶發觸發播放/暫停或彈出控制列。症狀非必現,不可「整理」掉任何一個。
    function suppress(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    }

    function handleMouseDown(e) {
        if (e.button !== 0) return;

        // 點擊文字區時直接讓給選取與雙擊取詞,不啟動拖動。
        // 不變式:移除此 return 會使選字與取詞翻譯同時失效 (可拖動區僅剩 overlay 的 padding 邊框帶)。
        if (e.target.classList.contains(TEXT_CLASS)) {
            return;
        }

        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;

        const start = hooks.readPosition();
        anchorLeft = start.left;
        anchorBottom = start.bottom;

        overlayEl.classList.add(DRAGGING_CLASS);

        suppress(e);

        log.verbose('🖱️ 開始拖動');
    }

    // 每秒觸發數十次,不得加入任何 log
    function handleMouseMove(e) {
        if (!isDragging) return;

        const deltaXPercent = ((e.clientX - dragStartX) / window.innerWidth) * 100;
        const deltaYPercent = ((e.clientY - dragStartY) / window.innerHeight) * 100;

        hooks.applyPosition(
            clampPercent(anchorLeft + deltaXPercent),
            clampPercent(anchorBottom - deltaYPercent)
        );

        suppress(e);
    }

    function handleMouseUp(e) {
        if (!isDragging) return;

        isDragging = false;
        overlayEl.classList.remove(DRAGGING_CLASS);

        // 刻意重新自 computed style 回讀,而非沿用 mousemove 最後算出的值
        const final = hooks.readPosition();
        hooks.onDragEnd(final.left, final.bottom);

        log.verbose(`✅ 拖動結束: left=${final.left.toFixed(2)}%, bottom=${final.bottom.toFixed(2)}%`);

        suppress(e);
    }

    // 由 content.js 的 createSubtitleOverlay() 呼叫,恰好一次
    // (該函式對既有 overlay 提早回傳,故不需重入保護)。
    // hooks 三個成員皆為必填的同步函式:
    //   readPosition()                  -> { left, bottom }  當前位置百分比 (viewport 基準)
    //   applyPosition(left, bottom)     -> void              寫入 inline style
    //   onDragEnd(left, bottom)         -> void              落盤
    function attach(overlay, dragHooks) {
        overlayEl = overlay;
        hooks = dragHooks;

        overlay.addEventListener('mousedown', handleMouseDown, true);
        document.addEventListener('mousemove', handleMouseMove, true);
        document.addEventListener('mouseup', handleMouseUp, true);

        log.info('✅ 拖動功能已設置');
    }

    window.NetflixSubtitleDrag = { attach };
})();
