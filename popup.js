// Netflix 字幕助手 - Popup Script (工具列彈窗：字體滑桿與重置)

// 常數模組 handle。config.js 必須在本檔之前載入 (見 popup.html 的 script 順序)。
// 版本號與設定預設值一律由此取得,本檔不出現版本字面值,亦不出現任何預設值字面值。
const CONFIG = window.NetflixSubtitleConfig;

document.addEventListener('DOMContentLoaded', () => {
  const fontSizeSlider = document.getElementById('fontSizeSlider');
  const fontSizeValue = document.getElementById('fontSizeValue');
  const resetPositionBtn = document.getElementById('resetPositionBtn');
  const resetFontSizeBtn = document.getElementById('resetFontSizeBtn');
  const resetAllBtn = document.getElementById('resetAllBtn');
  const status = document.getElementById('status');

  // 版本標籤:數字取自 manifest,前綴 v 由此補上,HTML 不留版本字面值
  document.getElementById('versionLabel').textContent = 'v' + CONFIG.VERSION;
  
  // 先以預設值同步填好 UI,再由 storage 覆寫。
  // chrome.storage.sync.get 是非同步的,若只在回呼內賦值,回呼抵達前滑桿會停在
  // UA 預設位置 (min 與 max 的中點) 且數值標籤是空白,開啟彈窗時看得到跳動。
  // 修法是提前賦值而非把字面值寫回 popup.html —— 後者會重新製造第二份預設值來源。
  applySettings(CONFIG.DEFAULTS);

  // 以 CONFIG.DEFAULTS 作為 get() 的預設值字典,fontSize 必定有值,故無條件覆寫。
  chrome.storage.sync.get(CONFIG.DEFAULTS, applySettings);

  function applySettings(settings) {
    fontSizeSlider.value = settings.fontSize;
    fontSizeValue.textContent = `${settings.fontSize}px`;
  }
  
  // 字體大小滑桿事件
  fontSizeSlider.addEventListener('input', () => {
    const fontSize = parseInt(fontSizeSlider.value);
    fontSizeValue.textContent = `${fontSize}px`;
    
    // 儲存設定
    chrome.storage.sync.set({ fontSize: fontSize });
    
    // 通知 content script 更新字體大小
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'updateFontSize',
          fontSize: fontSize 
        }, (response) => {
          if (response && response.success) {
            showStatus('Font size updated!');
          }
        });
      }
    });
  });
  
  // 三顆重置按鈕的差異僅在「寫回哪些 key」。新增持久化設定項時,除了在 CONFIG.DEFAULTS
  // 加 key,還須把該 key 歸入下列其中一組,否則它只會被「全部重置」清掉,局部重置摸不到它。
  // ALL_KEYS 自 DEFAULTS 衍生,故「全部重置」永遠涵蓋完整 schema,不需隨新增項修改。
  const POSITION_KEYS = ['positionLeft', 'positionBottom'];
  const FONT_SIZE_KEYS = ['fontSize'];
  const ALL_KEYS = Object.keys(CONFIG.DEFAULTS);

  resetPositionBtn.addEventListener('click', () => {
    resetSettings(POSITION_KEYS, 'Position reset!');
  });

  resetFontSizeBtn.addEventListener('click', () => {
    resetSettings(FONT_SIZE_KEYS, 'Font size reset!');
  });

  resetAllBtn.addEventListener('click', () => {
    resetSettings(ALL_KEYS, 'Settings reset!');
  });

  // 重置的共同流程:寫回 DEFAULTS 的指定子集 → 同步 popup UI → 通知 content script。
  // 只寫入子集而非整包 DEFAULTS,是因為 chrome.storage.sync.set 為 merge 語義:
  // 未列入 patch 的 key 保持原值,故「只重置位置」不會連帶把字體大小打回預設。
  //
  // content script 收到訊息後會以自己記憶體中的 settings 整包寫回 storage (saveSettings),
  // 該物件除了本次重置的欄位外皆為分頁當前值,故兩次寫入的結果一致,無覆寫風險。
  // 分頁不在 Netflix 時 sendMessage 無人接收,storage 仍已更新,重置於下次載入生效。
  function resetSettings(keys, statusMessage) {
    const patch = {};
    keys.forEach((key) => {
      patch[key] = CONFIG.DEFAULTS[key];
    });

    chrome.storage.sync.set(patch, () => {
      if ('fontSize' in patch) {
        applySettings(patch);
      }

      showStatus(statusMessage);

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) {
          return;
        }

        if ('fontSize' in patch) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'updateFontSize',
            fontSize: patch.fontSize
          });
        }

        // resetPosition 不帶參數,content script 自行讀 CONFIG.DEFAULTS 的座標。
        if ('positionLeft' in patch) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'resetPosition' });
        }
      });
    });
  }
  
  // 顯示狀態訊息
  function showStatus(message) {
    status.textContent = message;
    status.style.display = 'block';
    setTimeout(() => {
      status.style.display = 'none';
    }, 2000);
  }
});
