let activeTabId = null;
let activeTabStart = null;
let lastUrl = null;

// Helper: Get API key from storage
async function getApiKey() {
  return new Promise(resolve => {
    chrome.storage.local.get({ userApiKey: null }, result => {
      resolve(result.userApiKey || null);
    });
  });
}

// Helper: Summarize text with OpenAI (bullet points + 1-line)
async function summarizeText(title, url, bodyText, apiKey) {
  // Get summary density from storage
  const densityMap = [
    'high detail (as much as possible, very dense, no filler)',
    'medium detail (medium density, concise but not too brief)',
    'low detail (very brief, only the most essential points)'
  ];
  const densityIdx = await new Promise(res => chrome.storage.local.get({ summaryDensity: 0 }, r => res(r.summaryDensity)));
  const density = densityMap[densityIdx] || densityMap[0];
  const prompt = `Summarize the following web page for later review.\nTitle: ${title}\nURL: ${url}\nContent: ${bodyText.slice(0, 4000)}\n\nGive me:\n1. A bullet-point summary of the main content (${density}), max 5 bullets, no markdown, no asterisks, just plain text.\n2. A single, dense, fact-focused, plain text line (no markdown, no asterisks, no casual words, no filler, no intro, no summary, just the core info) describing what this page is about, for a notification.\nFormat:\nBULLETS:\n- ...\n- ...\nONELINE:\n...`;
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
          { role: 'system', content: 'You are a helpful assistant that summarizes web pages for a user\'s browsing history.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 400
      })
    });
    if (!response.ok) throw new Error('OpenAI API error');
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    // Parse bullet points and 1-line summary
    let bullets = '', oneLine = '';
    const bulletMatch = content.match(/BULLETS:\s*([\s\S]*?)ONELINE:/);
    if (bulletMatch) bullets = bulletMatch[1].trim();
    const oneLineMatch = content.match(/ONELINE:\s*([\s\S]*)/);
    if (oneLineMatch) oneLine = oneLineMatch[1].trim().replace(/\n/g, ' ');
    return { bullets, oneLine, raw: content };
  } catch (e) {
    return { bullets: 'Summary unavailable.', oneLine: 'No summary.', raw: '' };
  }
}

// Wait for main content (Twitter/dynamic sites)
function waitForMainContent(tabId, url, callback) {
  let selector = 'body';
  if (url.includes('twitter.com')) selector = 'main[role="main"]';
  // Add more site-specific selectors as needed
  chrome.scripting.executeScript({
    target: { tabId },
    func: (sel) => {
      return new Promise(resolve => {
        function check() {
          const el = document.querySelector(sel);
          if (el && el.innerText && el.innerText.length > 100) {
            resolve({
              text: el.innerText,
              title: document.title,
              url: window.location.href,
              timestamp: new Date().toISOString()
            });
          } else {
            setTimeout(check, 600);
          }
        }
        check();
      });
    },
    args: [selector],
    world: 'MAIN'
  }, (results) => {
    if (results && results[0] && results[0].result) {
      callback(results[0].result);
    } else {
      // fallback to body.innerText
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({
          text: document.body.innerText,
          title: document.title,
          url: window.location.href,
          timestamp: new Date().toISOString()
        })
      }, (fallbackResults) => {
        if (fallbackResults && fallbackResults[0] && fallbackResults[0].result) {
          callback(fallbackResults[0].result);
        }
      });
    }
  });
}

// Track tab activation and time spent
function handleTabActivated(tabId) {
  const now = Date.now();
  if (activeTabId !== null && activeTabStart !== null) {
    chrome.tabs.get(activeTabId, (tab) => {
      if (chrome.runtime.lastError || !tab || !tab.url || !tab.url.startsWith('http')) return;
      chrome.storage.local.get({ scrapedPages: [] }, (result) => {
        const scrapedPages = result.scrapedPages;
        for (let i = scrapedPages.length - 1; i >= 0; i--) {
          if (scrapedPages[i].url === tab.url && !scrapedPages[i].timeSpentSeconds) {
            scrapedPages[i].timeSpentSeconds = Math.round((now - activeTabStart) / 1000);
            break;
          }
        }
        chrome.storage.local.set({ scrapedPages });
      });
    });
  }
  activeTabId = tabId;
  activeTabStart = now;
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.storage.local.get({ trackingOn: true }, (result) => {
    if (!result.trackingOn) return;
    handleTabActivated(tabId);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
    chrome.storage.local.get({ trackingOn: true, realTimeSummaryOn: true }, (result) => {
      if (!result.trackingOn) return;
      handleTabActivated(tabId);
      waitForMainContent(tabId, tab.url, async ({ text, title, url, timestamp }) => {
        // Save scrape
        chrome.runtime.sendMessage({ bodyText: text, title, url, timestamp });
        // Real-time summary/notification
        if (result.realTimeSummaryOn) {
          const apiKey = await getApiKey();
          const { bullets, oneLine } = await summarizeText(title, url, text, apiKey);
          // Store in log
          chrome.storage.local.get({ scrapedPages: [] }, (res) => {
            const scrapedPages = res.scrapedPages;
            scrapedPages.push({ title, url, timestamp, bodyText: text, summary: bullets, oneLineSummary: oneLine, timeSpentSeconds: null });
            chrome.storage.local.set({ scrapedPages });
          });
          // Notify content script
          chrome.tabs.sendMessage(tabId, { type: 'show_summary_notification', oneLineSummary: oneLine });
        }
      });
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  chrome.storage.local.get({ trackingOn: true, scrapedPages: [] }, async (result) => {
    if (!result.trackingOn) return;
    const { title, url, timestamp, bodyText } = message;
    // If realTimeSummaryOn is off, summarize and store here
    chrome.storage.local.get({ realTimeSummaryOn: true }, async (r) => {
      if (!r.realTimeSummaryOn) {
        const apiKey = await getApiKey();
        const { bullets, oneLine } = await summarizeText(title, url, bodyText, apiKey);
        const pageEntry = { title, url, timestamp, bodyText, summary: bullets, oneLineSummary: oneLine, timeSpentSeconds: null };
        const scrapedPages = result.scrapedPages;
        scrapedPages.push(pageEntry);
        chrome.storage.local.set({ scrapedPages });
      }
    });
  });
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (tabId === activeTabId && activeTabStart !== null) {
    handleTabActivated(null);
    activeTabId = null;
    activeTabStart = null;
  }
}); 