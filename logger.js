// Netflix 字幕助手 - 日誌模組
// 全擴充共用的分級 console 輸出。
//
// 本模組必須在 config.js 之後、其餘 content script 之前載入 (見 manifest.json 的
// content_scripts.js 順序),其餘模組於 top-level 即取用 window.NetflixSubtitleLogger。
(function () {
    'use strict';

    // 輸出等級旗標。四個等級的定義與調整時機見 config.js 的 LOG_LEVEL。
    // 於載入期讀取一次即定案,下方的 no-op 綁定因此是靜態的,呼叫端不做任何條件判斷。
    const LOG_LEVEL = window.NetflixSubtitleConfig.LOG_LEVEL;

    const LEVELS = { off: 0, error: 1, info: 2, verbose: 3 };
    // 旗標拼錯時回退為 info，且對外回報回退後的實際等級,不回報原字串。
    // 必須用 hasOwnProperty 而非 !== undefined:後者對 'constructor' / 'toString' 等
    // Object.prototype 上的 key 會取到繼承來的函式而誤判為合法等級,結果是所有頻道
    // (含 error) 全部靜音、level 又回報那個無效字串,失效方式完全無聲。
    const isValid = Object.prototype.hasOwnProperty.call(LEVELS, LOG_LEVEL);
    const effective = isValid ? LOG_LEVEL : 'info';
    const current = LEVELS[effective];

    const noop = () => {};

    window.NetflixSubtitleLogger = {
        level: effective,
        error: current >= LEVELS.error ? console.error.bind(console) : noop,
        info: current >= LEVELS.info ? console.log.bind(console) : noop,
        verbose: current >= LEVELS.verbose ? console.log.bind(console) : noop,
    };
})();
