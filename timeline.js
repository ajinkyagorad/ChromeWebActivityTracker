function formatTimeSpent(seconds) {
  if (!seconds) return 'Unknown';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;'}[c]));
}

function renderTimeline(pages) {
  const timeline = document.getElementById('timeline');
  timeline.innerHTML = '';
  if (!pages.length) {
    timeline.innerHTML = '<div class="empty">No browsing activity logged yet.</div>';
    return;
  }
  pages.slice().reverse().forEach(page => {
    const node = document.createElement('div');
    node.className = 'node';
    node.innerHTML = `
      <div class="timestamp">${new Date(page.timestamp).toLocaleString()}</div>
      <div class="title">${escapeHTML(page.title || '(No Title)')}</div>
      <div class="url"><a href="${escapeHTML(page.url)}" target="_blank">${escapeHTML(page.url)}</a></div>
      <div class="summary"><b>Summary:</b><br>${escapeHTML(page.summary || 'No summary')}</div>
      <div class="one-line"><b>1-line:</b> <i>${escapeHTML(page.oneLineSummary || '')}</i></div>
      <div class="time-spent"><b>Time spent:</b> ${formatTimeSpent(page.timeSpentSeconds)}</div>
      <div class="details"><b>Details:</b><br>${escapeHTML((page.bodyText || '').substring(0, 600))}${(page.bodyText && page.bodyText.length > 600) ? '...' : ''}</div>
    `;
    timeline.appendChild(node);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (!chrome.storage || !chrome.storage.local) {
    document.getElementById('timeline').innerHTML = '<div class="empty">chrome.storage API not available.</div>';
    return;
  }
  chrome.storage.local.get({ scrapedPages: [] }, (result) => {
    renderTimeline(result.scrapedPages || []);
  });
}); 