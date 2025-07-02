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

// Hierarchical summarization system
const SUMMARY_LEVELS = {
  LEVEL_0: 0, // Individual page entries
  LEVEL_1: 1, // Summary of 10 Level 0 entries
  LEVEL_2: 2, // Summary of 10 Level 1 summaries
  LEVEL_3: 3  // Summary of 10 Level 2 summaries
};

const ENTRIES_PER_SUMMARY = 10;

// Initialize hierarchical storage structure
function initializeHierarchicalStorage() {
  chrome.storage.local.get({
    hierarchicalData: {
      level0: [], // Individual page entries
      level1: [], // Level 1 summaries
      level2: [], // Level 2 summaries  
      level3: []  // Level 3 summaries
    }
  }, (result) => {
    if (!result.hierarchicalData) {
      chrome.storage.local.set({
        hierarchicalData: {
          level0: [],
          level1: [],
          level2: [],
          level3: []
        }
      });
    }
  });
}

// Add new page entry and trigger hierarchical summarization
async function addPageToHierarchy(pageData) {
  const storage = await new Promise(resolve => {
    chrome.storage.local.get({
      hierarchicalData: {
        level0: [],
        level1: [],
        level2: [],
        level3: []
      }
    }, resolve);
  });

  const data = storage.hierarchicalData;
  
  // Add to Level 0 (individual entries)
  data.level0.push({
    ...pageData,
    level: SUMMARY_LEVELS.LEVEL_0,
    timestamp: Date.now(),
    timeRange: {
      start: new Date(pageData.timestamp).toISOString(),
      end: new Date(pageData.timestamp).toISOString()
    }
  });

  // Check if we need to trigger Level 1 summarization
  if (data.level0.length % ENTRIES_PER_SUMMARY === 0) {
    await triggerLevelSummarization(SUMMARY_LEVELS.LEVEL_1, data);
  }

  // Save updated data
  chrome.storage.local.set({ hierarchicalData: data });
}

// Trigger summarization for a specific level
async function triggerLevelSummarization(level, data) {
  const sourceLevel = level - 1;
  const sourceKey = `level${sourceLevel}`;
  const targetKey = `level${level}`;
  
  // Get the last 10 entries from source level
  const entriesToSummarize = data[sourceKey].slice(-ENTRIES_PER_SUMMARY);
  
  if (entriesToSummarize.length === 0) return;

  // Create summary content
  const summaryContent = createSummaryContent(entriesToSummarize, level);
  
  // Get API key
  const apiKey = await getApiKey();
  if (!apiKey) {
    console.log('No API key available for summarization');
    return;
  }

  try {
    const summary = await generateSummary(summaryContent, level);
    
    // Create time range
    const timeRange = {
      start: entriesToSummarize[0].timeRange.start,
      end: entriesToSummarize[entriesToSummarize.length - 1].timeRange.end
    };

    // Add summary to target level
    data[targetKey].push({
      level: level,
      timestamp: Date.now(),
      timeRange: timeRange,
      summary: summary,
      entryCount: entriesToSummarize.length,
      sourceEntries: entriesToSummarize.map(entry => ({
        id: entry.timestamp,
        title: entry.title || entry.summary || 'Untitled'
      }))
    });

    // Check if we need to trigger next level summarization
    if (data[targetKey].length % ENTRIES_PER_SUMMARY === 0 && level < SUMMARY_LEVELS.LEVEL_3) {
      await triggerLevelSummarization(level + 1, data);
    }

  } catch (error) {
    console.error(`Error generating Level ${level} summary:`, error);
  }
}

// Create summary content based on level
function createSummaryContent(entries, level) {
  if (level === SUMMARY_LEVELS.LEVEL_1) {
    // Summarize individual page entries
    return entries.map(entry => 
      `Title: ${entry.title || 'No Title'}\nURL: ${entry.url}\nContent: ${entry.bodyText || entry.summary || 'No content'}\n`
    ).join('\n---\n');
  } else {
    // Summarize existing summaries
    return entries.map(entry => 
      `Time Period: ${new Date(entry.timeRange.start).toLocaleDateString()} - ${new Date(entry.timeRange.end).toLocaleDateString()}\nSummary: ${entry.summary}\n`
    ).join('\n---\n');
  }
}

// Generate summary using OpenAI API
async function generateSummary(content, level) {
  const apiKey = await getApiKey();
  if (!apiKey) return 'No API key available';

  const levelDescriptions = {
    [SUMMARY_LEVELS.LEVEL_1]: 'recent browsing activity',
    [SUMMARY_LEVELS.LEVEL_2]: 'browsing sessions',
    [SUMMARY_LEVELS.LEVEL_3]: 'browsing periods'
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that creates hierarchical summaries of ${levelDescriptions[level]}. Provide concise, informative summaries that capture the main themes and activities.`
        },
        {
          role: 'user',
          content: `Please summarize the following ${levelDescriptions[level]}:\n\n${content}`
        }
      ],
      max_tokens: level === SUMMARY_LEVELS.LEVEL_1 ? 300 : 200
    })
  });

  if (!response.ok) {
    throw new Error('OpenAI API error');
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No summary generated';
}

// Get hierarchical data for a specific level
async function getHierarchicalData(level = SUMMARY_LEVELS.LEVEL_0) {
  const storage = await new Promise(resolve => {
    chrome.storage.local.get({
      hierarchicalData: {
        level0: [],
        level1: [],
        level2: [],
        level3: []
      }
    }, resolve);
  });

  return storage.hierarchicalData[`level${level}`] || [];
}

// Update the existing scrapeAndSummarize function to use hierarchical system
async function scrapeAndSummarize(tab) {
  // ... existing scraping code ...
  
  const pageData = {
    title: tab.title,
    url: tab.url,
    bodyText: bodyText,
    timestamp: Date.now()
  };

  // Add to hierarchical system instead of flat storage
  await addPageToHierarchy(pageData);
  
  // Also maintain backward compatibility with existing flat storage
  chrome.storage.local.get({ scrapedPages: [] }, (result) => {
    const pages = result.scrapedPages;
    pages.push(pageData);
    chrome.storage.local.set({ scrapedPages: pages });
  });
}

// Initialize hierarchical storage when extension loads
initializeHierarchicalStorage();

// Message handler for timeline page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getHierarchicalData') {
    getHierarchicalData(request.level).then(data => {
      sendResponse({ data: data });
    });
    return true; // Keep message channel open for async response
  }
}); 