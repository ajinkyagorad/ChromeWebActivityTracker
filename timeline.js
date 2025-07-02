// Level descriptions for UI
const LEVEL_DESCRIPTIONS = {
  0: 'Viewing individual page entries (raw browsing history)',
  1: 'Viewing summaries of 10-page browsing sessions',
  2: 'Viewing summaries of browsing sessions (10 Level 1 summaries)',
  3: 'Viewing summaries of browsing periods (10 Level 2 summaries)'
};

// Level names for UI
const LEVEL_NAMES = {
  0: 'Individual Pages',
  1: 'Page Summaries', 
  2: 'Session Summaries',
  3: 'Period Summaries'
};

let currentLevel = 0;

function formatTimeSpent(seconds) {
  if (!seconds) return 'Unknown';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;'}[c]));
}

function formatTimeRange(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  // If same day, show time range
  if (startDate.toDateString() === endDate.toDateString()) {
    return `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  }
  
  // Different days, show date range
  return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
}

function renderTimeline(data, level) {
  const timeline = document.getElementById('timeline');
  timeline.innerHTML = '';
  
  if (!data || !data.length) {
    timeline.innerHTML = `<div class="empty">No ${LEVEL_NAMES[level].toLowerCase()} available yet.</div>`;
    return;
  }
  
  // Update level info
  const levelInfo = document.getElementById('levelInfo');
  levelInfo.textContent = LEVEL_DESCRIPTIONS[level];
  
  data.slice().reverse().forEach(entry => {
    const node = document.createElement('div');
    node.className = `node level-${level}`;
    
    if (level === 0) {
      // Individual page entries
      node.innerHTML = `
        <div class="timestamp">${new Date(entry.timestamp).toLocaleString()}</div>
        <div class="title">${escapeHTML(entry.title || '(No Title)')}</div>
        <div class="url"><a href="${escapeHTML(entry.url)}" target="_blank">${escapeHTML(entry.url)}</a></div>
        <div class="summary"><b>Summary:</b><br>${escapeHTML(entry.summary || 'No summary')}</div>
        <div class="one-line"><b>1-line:</b> <i>${escapeHTML(entry.oneLineSummary || '')}</i></div>
        <div class="time-spent"><b>Time spent:</b> ${formatTimeSpent(entry.timeSpentSeconds)}</div>
        <div class="details"><b>Details:</b><br>${escapeHTML((entry.bodyText || '').substring(0, 600))}${(entry.bodyText && entry.bodyText.length > 600) ? '...' : ''}</div>
      `;
    } else {
      // Summary entries (Level 1, 2, 3)
      const timeRange = formatTimeRange(entry.timeRange.start, entry.timeRange.end);
      node.innerHTML = `
        <div class="time-range">📅 ${timeRange}</div>
        <div class="timestamp">Generated: ${new Date(entry.timestamp).toLocaleString()}</div>
        <div class="title">${LEVEL_NAMES[level]} Summary</div>
        <div class="summary">${escapeHTML(entry.summary || 'No summary available')}</div>
        <div class="entry-count">📊 Summarizes ${entry.entryCount} ${level === 1 ? 'pages' : 'summaries'}</div>
        ${entry.sourceEntries && entry.sourceEntries.length > 0 ? `
          <div class="details">
            <b>Source ${level === 1 ? 'Pages' : 'Summaries'}:</b><br>
            ${entry.sourceEntries.slice(0, 5).map(source => 
              `• ${escapeHTML(source.title)}`
            ).join('<br>')}
            ${entry.sourceEntries.length > 5 ? `<br>... and ${entry.sourceEntries.length - 5} more` : ''}
          </div>
        ` : ''}
      `;
    }
    
    timeline.appendChild(node);
  });
}

async function loadHierarchicalData(level) {
  const timeline = document.getElementById('timeline');
  timeline.innerHTML = '<div class="loading">Loading timeline data...</div>';
  
  try {
    // Get hierarchical data from background script
    const response = await chrome.runtime.sendMessage({
      action: 'getHierarchicalData',
      level: level
    });
    
    if (response && response.data) {
      renderTimeline(response.data, level);
    } else {
      renderTimeline([], level);
    }
  } catch (error) {
    console.error('Error loading hierarchical data:', error);
    timeline.innerHTML = '<div class="empty">Error loading timeline data.</div>';
  }
}

function setupLevelSelector() {
  const levelButtons = document.querySelectorAll('.level-btn');
  
  levelButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const level = parseInt(btn.getAttribute('data-level'));
      
      // Update active button
      levelButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Load data for selected level
      currentLevel = level;
      loadHierarchicalData(level);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (!chrome.storage || !chrome.storage.local) {
    document.getElementById('timeline').innerHTML = '<div class="empty">chrome.storage API not available.</div>';
    return;
  }
  
  setupLevelSelector();
  
  // Load initial data (Level 0)
  loadHierarchicalData(0);
}); 