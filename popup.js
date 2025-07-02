// Tooltip show/hide logic for no flicker and smooth animation
// This must be in popup.js due to Chrome extension CSP
const infoWrapper = document.getElementById('infoWrapper');
const infoIcon = document.getElementById('infoIcon');
const infoTooltip = document.getElementById('infoTooltip');
let tooltipTimeout;
function showTooltip() {
  clearTimeout(tooltipTimeout);
  infoWrapper.classList.add('show');
}
function hideTooltip() {
  tooltipTimeout = setTimeout(() => infoWrapper.classList.remove('show'), 120);
}
if (infoIcon && infoTooltip && infoWrapper) {
  infoIcon.addEventListener('mouseenter', showTooltip);
  infoIcon.addEventListener('focus', showTooltip);
  infoIcon.addEventListener('mouseleave', hideTooltip);
  infoIcon.addEventListener('blur', hideTooltip);
  infoTooltip.addEventListener('mouseenter', showTooltip);
  infoTooltip.addEventListener('mouseleave', hideTooltip);
}
// Developer mode tooltip logic
const devWrapper = document.getElementById('devWrapper');
const devIcon = document.getElementById('devIcon');
const devTooltip = document.getElementById('devTooltip');
let devTooltipTimeout;
function showDevTooltip() {
  clearTimeout(devTooltipTimeout);
  devWrapper.classList.add('show');
}
function hideDevTooltip() {
  devTooltipTimeout = setTimeout(() => devWrapper.classList.remove('show'), 120);
}
if (devIcon && devTooltip && devWrapper) {
  devIcon.addEventListener('mouseenter', showDevTooltip);
  devIcon.addEventListener('focus', showDevTooltip);
  devIcon.addEventListener('mouseleave', hideDevTooltip);
  devIcon.addEventListener('blur', hideDevTooltip);
  devTooltip.addEventListener('mouseenter', showDevTooltip);
  devTooltip.addEventListener('mouseleave', hideDevTooltip);
}

function renderPages(pages) {
  const container = document.getElementById('pages');
  container.innerHTML = '';
  if (!pages.length) {
    container.innerHTML = '<p>No pages scraped yet.</p>';
    return;
  }
  pages.slice().reverse().forEach((page, idx) => {
    const div = document.createElement('div');
    div.className = 'page';
    div.innerHTML = `
      <div class="page-content">
        <div class="title">${page.title || '(No Title)'}</div>
        <div class="url"><a href="${page.url}" target="_blank">${page.url.length > 60 ? page.url.slice(0, 60) + '…' : page.url}</a></div>
        <div class="timestamp">${new Date(page.timestamp).toLocaleString()}</div>
        <div class="snippet"><b>Summary:</b><br>${page.summary || '(No summary)'}<br><b>1-line:</b> <i>${page.oneLineSummary || ''}</i></div>
      </div>
      <button class="crossout-btn" title="Remove this entry" data-idx="${pages.length - 1 - idx}">&times;</button>
    `;
    container.appendChild(div);
  });
  // Add event listeners for crossout buttons
  Array.from(document.getElementsByClassName('crossout-btn')).forEach(btn => {
    btn.addEventListener('click', function() {
      const idx = parseInt(this.getAttribute('data-idx'));
      chrome.storage.local.get({ scrapedPages: [] }, (result) => {
        const arr = result.scrapedPages;
        arr.splice(idx, 1);
        chrome.storage.local.set({ scrapedPages: arr }, () => renderPages(arr));
      });
    });
  });
}

document.getElementById('clear').addEventListener('click', () => {
  chrome.storage.local.set({ scrapedPages: [] }, () => {
    renderPages([]);
  });
});

document.getElementById('openTimeline').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('timeline.html') });
});

chrome.storage.local.get({ scrapedPages: [] }, (result) => {
  renderPages(result.scrapedPages);
});

async function summarizePages(pages) {
  const summaryDiv = document.getElementById('summary');
  summaryDiv.style.display = 'block';
  summaryDiv.textContent = 'Summarizing...';
  const combinedText = pages.map(p => `Title: ${p.title}\nURL: ${p.url}\n${p.bodyText}\n`).join('\n---\n').slice(0, 12000);
  // Only use user-supplied API key
  const storage = await new Promise(res => chrome.storage.local.get({ userApiKey: null }, res));
  const apiKey = storage.userApiKey;
  if (!apiKey) {
    summaryDiv.textContent = 'Please enter your OpenAI API key in the settings below.';
    return;
  }
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a helpful assistant that summarizes a user\'s recent browsing activity. Give a concise, readable summary of the main topics and content.' },
          { role: 'user', content: combinedText }
        ],
        max_tokens: 400
      })
    });
    if (!response.ok) throw new Error('OpenAI API error');
    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || 'No summary generated.';
    summaryDiv.textContent = summary;
  } catch (e) {
    summaryDiv.textContent = 'Error: ' + e.message;
  }
}

document.getElementById('summarize').addEventListener('click', () => {
  chrome.storage.local.get({ scrapedPages: [] }, (result) => {
    if (!result.scrapedPages.length) {
      const summaryDiv = document.getElementById('summary');
      summaryDiv.style.display = 'block';
      summaryDiv.textContent = 'No pages to summarize.';
      return;
    }
    summarizePages(result.scrapedPages);
  });
});

// Tracking toggle logic
const toggleBtn = document.getElementById('toggleTracking');
const statusSpan = document.getElementById('trackingStatus');
function setTrackingUI(isOn) {
  statusSpan.textContent = isOn ? 'ON' : 'OFF';
  toggleBtn.style.background = isOn ? '#d4f7d4' : '#f7d4d4';
}
chrome.storage.local.get({ trackingOn: true }, (result) => {
  setTrackingUI(result.trackingOn);
});
toggleBtn.addEventListener('click', () => {
  chrome.storage.local.get({ trackingOn: true }, (result) => {
    const newState = !result.trackingOn;
    chrome.storage.local.set({ trackingOn: newState }, () => {
      setTrackingUI(newState);
    });
  });
});

// Realtime summary toggle logic
const realtimeBtn = document.getElementById('toggleRealtime');
const realtimeSpan = document.getElementById('realtimeStatus');
function setRealtimeUI(isOn) {
  realtimeSpan.textContent = isOn ? 'ON' : 'OFF';
  realtimeBtn.style.background = isOn ? '#d4f7d4' : '#f7d4d4';
}
chrome.storage.local.get({ realTimeSummaryOn: true }, (result) => {
  setRealtimeUI(result.realTimeSummaryOn);
});
realtimeBtn.addEventListener('click', () => {
  chrome.storage.local.get({ realTimeSummaryOn: true }, (result) => {
    const newState = !result.realTimeSummaryOn;
    chrome.storage.local.set({ realTimeSummaryOn: newState }, () => {
      setRealtimeUI(newState);
    });
  });
});

// API Key settings logic
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKey');
const settingsStatus = document.getElementById('settings-status');
chrome.storage.local.get({ userApiKey: '' }, (result) => {
  apiKeyInput.value = result.userApiKey || '';
});
saveApiKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  chrome.storage.local.set({ userApiKey: key }, () => {
    settingsStatus.textContent = 'Saved!';
    setTimeout(() => settingsStatus.textContent = '', 1500);
  });
});

// Theme toggle logic
const themeToggle = document.getElementById('themeToggle');
const themeToggleBtn = document.getElementById('themeToggleBtn');
function applyTheme(theme) {
  document.body.classList.remove('glass', 'normal');
  document.body.classList.add(theme);
  if (theme === 'glass') {
    themeToggle.checked = true;
    themeToggleBtn.textContent = '🟢 Glass';
    themeToggleBtn.classList.add('active');
  } else {
    themeToggle.checked = false;
    themeToggleBtn.textContent = '⚪ Normal';
    themeToggleBtn.classList.remove('active');
  }
}
chrome.storage.local.get({ theme: 'glass' }, (result) => {
  applyTheme(result.theme);
});
themeToggle.addEventListener('change', () => {
  const theme = themeToggle.checked ? 'glass' : 'normal';
  chrome.storage.local.set({ theme }, () => applyTheme(theme));
});
themeToggleBtn.addEventListener('click', () => {
  themeToggle.checked = !themeToggle.checked;
  const theme = themeToggle.checked ? 'glass' : 'normal';
  chrome.storage.local.set({ theme }, () => applyTheme(theme));
});

// Summary density slider logic
const densitySlider = document.getElementById('densitySlider');
const densityLabel = document.getElementById('densityLabel');
const densityLevels = [
  { label: 'High', color: '#e74c3c' },
  { label: 'Medium', color: '#f1c40f' },
  { label: 'Low', color: '#2ecc40' }
];
function setDensityUI(val) {
  const { label, color } = densityLevels[val];
  densityLabel.textContent = label;
  densityLabel.style.color = color;
  densitySlider.style.accentColor = color;
}
chrome.storage.local.get({ summaryDensity: 0 }, (result) => {
  densitySlider.value = result.summaryDensity;
  setDensityUI(result.summaryDensity);
});
densitySlider.addEventListener('input', () => {
  const val = parseInt(densitySlider.value);
  chrome.storage.local.set({ summaryDensity: val });
  setDensityUI(val);
}); 