// Netflix 字幕助手 - 字幕擷取與監測迴圈
// 自 Netflix 原生字幕容器擷取文字,以 30ms 輪詢搭配三個 MutationObserver 雙軌觸發,
// 去重後經 hooks 通知使用端。本模組不碰 overlay,不知道字幕如何被繪製。
//
// 本模組必須在 logger.js 之後、content.js 之前載入 (見 manifest.json 的 content_scripts.js
// 順序)。本模組不得於 top-level 取用任何 content.js 的 handle:content.js 是相依樹的根,
// 反向取用會構成載入期循環相依。與 content.js 的溝通一律走執行期注入的 hooks。
//
// 不變式與已知陷阱見 subtitle-source.js.AGENTS.md。
(function () {
    'use strict';

    const log = window.NetflixSubtitleLogger;

    const POLL_INTERVAL_MS = 30;
    const TEXT_CONTAINER_SELECTOR = '.player-timedtext-text-container';
    // 備援選擇器鏈是為原生容器改名而留,不是為取值失敗而留;
    // 僅在 text-container 存在但取不到內容時才走到此處 (見 extract() 的 early return)。
    const FALLBACK_SELECTORS = [
        '[class*="subtitle"]',
        '.player-timedtext span',
        '[class*="player-timedtext"] span',
        '[class*="timedtext"] [class*="container"]',
        '.ltr-1yifpob span'
    ];
    const OBSERVE_TARGETS = [
        '.watch-video--player-view',
        '.watch-video',
        'body'
    ];

    // 去重鍵。30ms 輪詢與三個 observer 併發觸發同一個 tick(),去重是迴圈端的責任:
    // 每次都通知使用端重建 DOM 會持續清除使用者正在進行的文字選取,取詞翻譯無法操作。
    let lastSubtitleText = '';
    let checkInterval = null;
    let observers = [];
    let hooks = null;

    // 讀取元素文字並保留 <br> 造成的換行
    // 注意: 不可改用 innerText。content.js 的 CSS 將原生字幕容器設為 display:none,
    // 而 innerText 對不可見元素會退化成 textContent 的行為,不做排版,<br> 一樣會被吃掉。
    function readTextWithLineBreaks(element) {
        let text = '';

        (function walk(node) {
            node.childNodes.forEach(child => {
                if (child.nodeType === Node.TEXT_NODE) {
                    text += child.textContent;
                } else if (child.nodeName === 'BR') {
                    text += '\n';
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    walk(child);
                }
            });
        })(element);

        return normalizeLines(text);
    }

    // 逐行去除首尾空白並移除空行,避免 <br> 前後的排版空白殘留
    function normalizeLines(text) {
        return text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n');
    }

    // 擷取當前字幕文字,無字幕時回傳 null。
    // 公開此方法是為了讓 node + vm stub 可直接驗證擷取邏輯 (本 repo 唯一的自動化驗證途徑)。
    function extract() {
        // 優先嘗試抓取所有 text-container (英文字幕會分段)
        const textContainers = document.querySelectorAll(TEXT_CONTAINER_SELECTOR);

        // 如果有 text-container,處理它們
        if (textContainers.length > 0) {
            // 合併所有分段的文字
            const texts = Array.from(textContainers)
                .map(el => readTextWithLineBreaks(el))
                .filter(text => text.length > 0);

            if (texts.length > 0) {
                // 用換行符號連接多段文字
                return texts.join('\n');
            }
        }

        // 如果 text-container 數量為 0,表示字幕已消失,不要使用備用選擇器
        // 直接返回 null
        if (textContainers.length === 0) {
            return null;
        }

        // 以下備用方案只在 text-container 存在但沒有內容時使用
        for (const selector of FALLBACK_SELECTORS) {
            const element = document.querySelector(selector);
            if (element) {
                const text = readTextWithLineBreaks(element);
                if (text) {
                    return text;
                }
            }
        }

        // 最終備案: 直接抓 player-timedtext 的所有內容
        const timedtext = document.querySelector('.player-timedtext');
        if (timedtext) {
            const text = readTextWithLineBreaks(timedtext);
            if (text) {
                return text;
            }
        }

        return null;
    }

    // 由 30ms 輪詢與三個 MutationObserver 共同驅動,故此處的訊息一律走 log.verbose
    function tick() {
        const text = extract();

        // 有新字幕且與上次不同,立即通知
        if (text && text !== lastSubtitleText) {
            lastSubtitleText = text;
            hooks.onText(text);
            log.verbose('📝 字幕更新:', text);
        }
        // 沒有字幕,立即通知清除
        else if (!text && lastSubtitleText) {
            lastSubtitleText = '';
            hooks.onClear();
            log.verbose('🧹 字幕已清除');
        }
    }

    // hooks 兩個成員皆為必填的同步函式:
    //   onText(text)  -> void   字幕內容變更 (已去重,故不需自帶條件判斷)
    //   onClear()     -> void   字幕消失
    function start(sourceHooks) {
        hooks = sourceHooks;

        checkInterval = setInterval(tick, POLL_INTERVAL_MS);

        // 設置多個 MutationObserver 監聽不同層級
        OBSERVE_TARGETS.forEach(selector => {
            const target = document.querySelector(selector);
            if (target) {
                const observer = new MutationObserver(tick);

                observer.observe(target, {
                    childList: true,
                    subtree: true,
                    characterData: true,
                    attributes: true,
                    attributeFilter: ['class', 'style']
                });

                observers.push(observer);
                log.info(`👀 MutationObserver 已綁定到: ${selector}`);
            }
        });

        log.info(`🔄 字幕監測已開始 (每 ${POLL_INTERVAL_MS}ms + MutationObserver)`);
    }

    // 目前無呼叫端。提供此入口是因為本模組私有持有一個無限期 interval 與三個 observer,
    // 隱藏而無關閉路徑即為設計缺陷。補 SPA 換頁 cleanup 時由此進入
    // (見 AGENTS.md 跨檔陷阱第 7 條:content.js 目前不處理 SPA 換頁)。
    function stop() {
        clearInterval(checkInterval);
        checkInterval = null;

        observers.forEach(observer => observer.disconnect());
        observers = [];

        lastSubtitleText = '';
    }

    window.NetflixSubtitleSource = { start, stop, extract };
})();
