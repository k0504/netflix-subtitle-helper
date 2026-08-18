// Netflix 字幕助手 - Popup Script (工具列彈窗：字體滑桿與重置)

// 常數模組 handle。config.js 必須在本檔之前載入 (見 popup.html 的 script 順序)。
// 版本號與設定預設值一律由此取得,本檔不出現版本字面值,亦不出現任何預設值字面值。
const CONFIG = window.NetflixSubtitleConfig;

document.addEventListener('DOMContentLoaded', () => {
  const fontSizeSlider = document.getElementById('fontSizeSlider');
  const fontSizeValue = document.getElementById('fontSizeValue');
  const resetBtn = document.getElementById('resetBtn');
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
  
  // 重置按鈕事件
  resetBtn.addEventListener('click', () => {
    // CONFIG.DEFAULTS 的 key 集合即 storage 的完整 schema,故重置一行寫回即可
    chrome.storage.sync.set(CONFIG.DEFAULTS, () => {
      // 更新 UI
      fontSizeSlider.value = CONFIG.DEFAULTS.fontSize;
      fontSizeValue.textContent = `${CONFIG.DEFAULTS.fontSize}px`;

      // 顯示成功訊息
      showStatus('Settings reset!');
      
      // 通知 content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'updateFontSize',
            fontSize: CONFIG.DEFAULTS.fontSize
          });
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'resetPosition' 
          });
        }
      });
    });
  });
  
  // 顯示狀態訊息
  function showStatus(message) {
    status.textContent = message;
    status.style.display = 'block';
    setTimeout(() => {
      status.style.display = 'none';
    }, 2000);
  }
});
