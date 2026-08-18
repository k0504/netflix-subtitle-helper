// Netflix 畫質顯示模組 (由 netflix_1080_fixed 移植)
// 在播放頁面標題下方顯示當前解析度,例如 1920×1080 (Full HD)。
// 只讀取 video.videoWidth/Height 與 DOM,不需頁面 context,直接以 content script 執行。
(function() {
    'use strict';

    const log = window.NetflixSubtitleLogger;

    let updateInterval = null;
    let lastQuality = '';

    // 創建畫質顯示元素 (垂直排列在標題下方)
    function createQualityDisplay() {
        const display = document.createElement('div');
        display.id = 'netflix-quality-display';
        display.style.cssText = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 2px 8px;
            margin-top: 4px;
            margin-left: 0;
            color: rgba(255, 255, 255, 0.7);
            background: rgba(0, 0, 0, 0.35);
            border-radius: 3px;
            font-family: 'Netflix Sans', 'Helvetica Neue', Arial, sans-serif;
            font-size: 11px;
            font-weight: 400;
            white-space: nowrap;
            cursor: default;
            user-select: none;
            transition: background 0.3s, color 0.3s;
            flex-shrink: 0;
            align-self: center;
        `;
        display.textContent = 'Detecting...';

        return display;
    }

    // 獲取當前畫質
    function getCurrentQuality() {
        const video = document.querySelector('video');
        if (!video) return null;

        const width = video.videoWidth;
        const height = video.videoHeight;

        if (width === 0 || height === 0) return null;

        // 判斷畫質等級
        let qualityLabel = '';
        if (height >= 2160) {
            qualityLabel = '4K UHD';
        } else if (height >= 1440) {
            qualityLabel = '2K QHD';
        } else if (height >= 1080) {
            qualityLabel = 'Full HD';
        } else if (height >= 720) {
            qualityLabel = 'HD';
        } else if (height >= 480) {
            qualityLabel = 'SD';
        } else {
            qualityLabel = 'Low';
        }

        return `${width}×${height} (${qualityLabel})`;
    }

    // 設置 video 事件監聽,立即偵測畫質變化
    function setupVideoListeners() {
        const video = document.querySelector('video');
        if (!video) return false;

        // 移除舊的監聽器(如果存在)
        if (video._qualityListenersAdded) return true;

        // 畫質改變時立即更新
        const immediateUpdate = () => {
            setTimeout(updateQualityDisplay, 100);
        };

        video.addEventListener('loadedmetadata', immediateUpdate);
        video.addEventListener('resize', immediateUpdate);
        video.addEventListener('playing', immediateUpdate);

        // 標記已添加監聽器
        video._qualityListenersAdded = true;

        log.info('Video 事件監聽器已設置:畫質變化將立即偵測');
        return true;
    }

    // 更新畫質顯示
    function updateQualityDisplay() {
        let display = document.getElementById('netflix-quality-display');

        // 如果元素被 Netflix UI 重新渲染移除了,重新插入
        if (!display) {
            const reinserted = insertIntoControls();
            if (!reinserted) {
                // 如果無法重新插入,下次再試
                return;
            }
            display = document.getElementById('netflix-quality-display');

            // 如果之前已經有畫質資訊,立即顯示(避免顯示「檢測中」)
            if (lastQuality) {
                display.textContent = lastQuality;
                return;
            }
        }

        const quality = getCurrentQuality();

        if (quality && quality !== lastQuality) {
            display.textContent = quality;
            lastQuality = quality;

            // 新畫質時柔和的高亮效果(垂直排列下不用太顯眼)
            display.style.color = 'rgba(255, 255, 255, 0.95)';
            display.style.background = 'rgba(0, 0, 0, 0.5)';
            setTimeout(() => {
                display.style.color = 'rgba(255, 255, 255, 0.7)';
                display.style.background = 'rgba(0, 0, 0, 0.35)';
            }, 2000);
        } else if (!quality && lastQuality) {
            // 暫時無法取得畫質,但保持顯示上次的值
            display.textContent = lastQuality;
            display.style.opacity = '0.5';
        } else if (!quality && !lastQuality) {
            // 從未取得過畫質
            display.textContent = 'Detecting...';
            display.style.opacity = '0.4';
        } else {
            // 畫質未改變,保持正常顯示
            display.style.opacity = '1';
        }
    }

    // 插入到標題旁邊
    function insertIntoControls() {
        // 找到電影標題元素
        const titleElement = document.querySelector('[data-uia="video-title"]');
        if (!titleElement) {
            return false;
        }

        // 檢查是否已插入
        if (document.getElementById('netflix-quality-display')) {
            return true;
        }

        // 保持標題原有的垂直排列,畫質顯示在標題下方
        const qualityDisplay = createQualityDisplay();

        // 在標題元素後面插入
        titleElement.after(qualityDisplay);

        log.info('畫質顯示已插入到標題旁邊');
        return true;
    }

    // 初始化畫質顯示
    function initQualityDisplay() {
        // 檢查是否在播放頁面
        if (!/netflix.com\/watch\//.test(window.location.href)) {
            return;
        }

        let isInitialized = false;

        // 等待播放器和控制列載入
        const checkControls = setInterval(() => {
            const video = document.querySelector('video');
            const titleElement = document.querySelector('[data-uia="video-title"]');

            // 確保播放器和標題都已載入
            if (video && titleElement && !isInitialized) {
                const controlsReady = insertIntoControls();
                const videoListenersReady = setupVideoListeners();

                if (controlsReady && videoListenersReady) {
                    clearInterval(checkControls);
                    isInitialized = true;

                    // 開始定期更新(作為備用,主要靠事件監聽)
                    updateInterval = setInterval(updateQualityDisplay, 2000);

                    // 立即更新一次
                    setTimeout(updateQualityDisplay, 100);

                    log.info('Netflix 畫質顯示已啟用 (事件監聽 + 定期更新)');
                }
            }
        }, 500);

        // 30秒後仍未找到元素則停止檢查
        setTimeout(() => {
            clearInterval(checkControls);
            if (!isInitialized) {
                log.info('無法初始化畫質顯示:未找到必要元素');
            }
        }, 30000);
    }

    // 清理函數
    function cleanup() {
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }

        const display = document.getElementById('netflix-quality-display');
        if (display) {
            display.remove();
        }

        // 移除 video 事件監聽器標記
        const video = document.querySelector('video');
        if (video) {
            video._qualityListenersAdded = false;
        }

        lastQuality = '';
    }

    // 監聽 URL 變化 (Netflix 為 SPA,切換影片不會重新載入頁面)
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;

            // 離開播放頁面時清理
            if (!/netflix.com\/watch\//.test(url)) {
                cleanup();
            } else {
                // 進入新的播放頁面
                cleanup();
                setTimeout(initQualityDisplay, 1000);
            }
        }
    }).observe(document, {subtree: true, childList: true});

    // 初始化
    if (/netflix.com\/watch\//.test(window.location.href)) {
        setTimeout(initQualityDisplay, 1000);
    }

})();
