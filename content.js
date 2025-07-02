// Listen for messages from background.js to show a 1-line summary notification
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'show_summary_notification' && message.oneLineSummary) {
    // Strip markdown, asterisks, and trim whitespace
    let text = message.oneLineSummary.replace(/[*_`#\[\]>-]/g, '').replace(/\s+/g, ' ').trim();
    showSummaryNotification(text);
  }
});

function showSummaryNotification(text) {
  // Remove any existing notification
  const existing = document.getElementById('bht-summary-notification');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.id = 'bht-summary-notification';
  div.textContent = text;
  Object.assign(div.style, {
    position: 'fixed',
    bottom: '32px',
    right: '32px',
    zIndex: 999999,
    background: 'rgba(255,255,255,0.35)',
    color: '#222',
    border: '1px solid #b3d8ff',
    borderRadius: '16px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.13)',
    padding: '16px 28px',
    fontSize: '1.08em',
    fontFamily: 'Segoe UI, Arial, sans-serif',
    backdropFilter: 'blur(12px) saturate(1.5)',
    transition: 'opacity 0.7s cubic-bezier(.4,0,.2,1)',
    opacity: '1',
    pointerEvents: 'none',
    maxWidth: '420px',
    textAlign: 'left',
    fontWeight: '500',
    textShadow: '0 1px 2px rgba(255,255,255,0.2)'
  });
  document.body.appendChild(div);
  setTimeout(() => {
    div.style.opacity = '0';
    setTimeout(() => div.remove(), 1200);
  }, 3500);
} 