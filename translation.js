// Netflix 字幕助手 - 單字翻譯模組
// 提供字幕上雙擊單字後的即時翻譯彈窗 (MyMemory API, en -> zh-TW)。
//
// 本模組必須在 config.js、logger.js 之後且 content.js 之前載入 (見 manifest.json 的
// content_scripts.js 順序),content.js 於 init() 階段即會呼叫本模組導出的 API。
(function () {
    'use strict';

    // 功能旗標。停用時的連動事項見 config.js 的 TRANSLATION_ENABLED。
    // 須維持在 IIFE 頂端、於檔尾的匯出三元式之前求值,使 no-op 版本於載入期即定案。
    const TRANSLATION_ENABLED = window.NetflixSubtitleConfig.TRANSLATION_ENABLED;

    const STYLE_ID = 'netflix-subtitle-translation-styles';
    const POPUP_ID = 'translation-popup';
    const API_ENDPOINT = 'https://api.mymemory.translated.net/get';
    const LANG_PAIR = 'en|zh-TW';

    const log = window.NetflixSubtitleLogger;

    let popupElement = null;

    // 注入翻譯彈窗樣式
    function addStyles() {
        const existing = document.getElementById(STYLE_ID);
        if (existing) {
            existing.remove();
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${POPUP_ID} {
                position: fixed !important;
                background: rgba(0, 0, 0, 0.95) !important;
                color: white !important;
                padding: 16px !important;
                padding-top: 12px !important;
                border-radius: 8px !important;
                font-size: 14px !important;
                font-family: Arial, sans-serif !important;
                z-index: 9999999 !important;
                max-width: 300px !important;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5) !important;
                pointer-events: none !important;
                opacity: 0 !important;
                transition: opacity 0.2s ease !important;
            }

            #${POPUP_ID}.show {
                opacity: 1 !important;
                pointer-events: auto !important;
            }

            #${POPUP_ID} .close-btn {
                position: absolute !important;
                top: 8px !important;
                right: 8px !important;
                width: 20px !important;
                height: 20px !important;
                background: rgba(255, 255, 255, 0.2) !important;
                border: none !important;
                border-radius: 50% !important;
                color: white !important;
                font-size: 14px !important;
                line-height: 18px !important;
                cursor: pointer !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                transition: background 0.2s ease !important;
                padding: 0 !important;
            }

            #${POPUP_ID} .close-btn:hover {
                background: rgba(255, 255, 255, 0.3) !important;
            }

            #${POPUP_ID} .translation-word {
                font-weight: bold !important;
                color: #4fc3f7 !important;
                margin-bottom: 6px !important;
                padding-right: 24px !important;
            }

            #${POPUP_ID} .translation-text {
                line-height: 1.5 !important;
            }

            #${POPUP_ID} .translation-loading {
                color: #aaa !important;
            }
        `;

        document.head.appendChild(style);
    }

    // 建立翻譯彈窗 (含關閉按鈕與內容容器)
    // 內容一律以 DOM API 寫入,不使用 innerHTML:
    // 單字取自 Netflix 字幕、譯文取自第三方 API,兩者皆為不可信輸入。
    function createPopup() {
        let popup = document.getElementById(POPUP_ID);
        if (popup) {
            popupElement = popup;
            return popup;
        }

        popup = document.createElement('div');
        popup.id = POPUP_ID;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', hide);

        const wordEl = document.createElement('div');
        wordEl.className = 'translation-word';

        const bodyEl = document.createElement('div');

        popup.appendChild(closeBtn);
        popup.appendChild(wordEl);
        popup.appendChild(bodyEl);

        document.body.appendChild(popup);
        popupElement = popup;

        return popup;
    }

    // 更新彈窗內文 (第二列為狀態或譯文)
    function renderBody(popup, text, isLoading) {
        const bodyEl = popup.lastElementChild;
        bodyEl.className = isLoading ? 'translation-loading' : 'translation-text';
        bodyEl.textContent = text;
    }

    // 呼叫 MyMemory API 翻譯
    async function fetchTranslation(text) {
        try {
            const url = `${API_ENDPOINT}?q=${encodeURIComponent(text)}&langpair=${LANG_PAIR}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.responseStatus === 200 && data.responseData) {
                return data.responseData.translatedText;
            }
            return null;
        } catch (error) {
            log.error('翻譯錯誤:', error);
            return null;
        }
    }

    // 於指定座標顯示翻譯彈窗
    function show(word, x, y) {
        const popup = popupElement || createPopup();

        popup.children[1].textContent = word;
        renderBody(popup, 'Translating...', true);
        popup.style.left = `${x}px`;
        popup.style.top = `${y + 20}px`;
        popup.classList.add('show');

        fetchTranslation(word).then(translation => {
            // 使用者可能在請求返回前就雙擊了別的單字,此時不覆寫新內容
            if (popup.children[1].textContent !== word) {
                return;
            }
            renderBody(popup, translation || 'Translation failed', false);
        });
    }

    function hide() {
        if (popupElement) {
            popupElement.classList.remove('show');
        }
    }

    // 將彈窗移入指定容器 (全螢幕切換時需跟著 fullscreenElement 走,否則會被蓋住)
    function relocateTo(container) {
        if (popupElement && container) {
            container.appendChild(popupElement);
        }
    }

    // 綁定雙擊取詞。overlay 為 content.js 建立的自訂字幕容器。
    function attachTo(overlay) {
        overlay.addEventListener('dblclick', (e) => {
            if (!e.target.classList.contains('custom-subtitle-text')) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            const selectedText = window.getSelection().toString().trim();
            if (selectedText) {
                show(selectedText.split(/\s+/)[0], e.clientX, e.clientY);
            }
        }, true);

        // 點擊字幕與彈窗以外的區域即收起彈窗。
        // 字幕容器一律以 attachTo() 收到的節點判定 (overlay.contains),不得改寫成 overlay 的
        // id 選擇器:該 id 為 content.js 的私有常數,在此寫成字串即形成跨檔硬編碼,content.js
        // 單邊改名後此判定恆為 false-negative,雙擊取詞的 click 成分會立即收起剛彈出的翻譯
        // 視窗——彈出後隨即消失,且零錯誤訊息。
        // overlay 於全螢幕切換時是被 appendChild 搬移的同一個節點,contains 判定不受影響。
        document.addEventListener('click', (e) => {
            if (!overlay.contains(e.target) &&
                !e.target.closest(`#${POPUP_ID}`)) {
                hide();
            }
        });
    }

    function init() {
        addStyles();
        createPopup();
        log.info('✅ 翻譯模組已啟用');
    }

    const noop = () => {};

    window.NetflixSubtitleTranslation = TRANSLATION_ENABLED
        ? { enabled: true, init, attachTo, hide, relocateTo }
        : { enabled: false, init: noop, attachTo: noop, hide: noop, relocateTo: noop };

    if (!TRANSLATION_ENABLED) {
        log.info('ℹ️ 翻譯模組已由內部旗標停用');
    }
})();
