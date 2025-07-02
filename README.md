# ChromeWebActivityTracker

A privacy-friendly Chrome extension that tracks your browsing activity, summarizes every page you visit using OpenAI GPT-4o, and provides a beautiful, interactive timeline of your web history.

---

## ✨ Features
- **Automatic Text Scraping:** Extracts main content from every page you visit (including dynamic sites like Twitter).
- **AI Summaries:** Uses your OpenAI GPT-4o API key to generate:
  - A bullet-point summary (density adjustable)
  - A single, dense, fact-focused 1-line summary for notifications
- **Timeline Viewer:** See your browsing history as a beautiful, scrollable timeline (`timeline.html`).
- **Realtime Notification:** Shows a softly fading, bottom-right notification with a 1-line summary after each page visit (optional).
- **Theme Toggle:** Switch between a modern "glass" (frosted) theme and a standard theme.
- **Summary Density Slider:** Choose how detailed you want your summaries (High/Medium/Low).
- **Privacy-First:** All data is stored locally. Your API key is never shared.
- **Developer Mode:** Easily edit and extend the extension using Cursor or your favorite code editor.

---

## 🚀 Installation
1. **Clone this repository:**
   ```sh
   git clone https://github.com/ajinkyagorad/ChromeWebActivityTracker.git
   cd ChromeWebActivityTracker
   ```
2. **Open Chrome and go to** `chrome://extensions/`
3. **Enable Developer Mode** (top right)
4. **Click "Load unpacked"** and select this folder

---

## 🛠️ Usage
- **Tracking:** Make sure "Tracking" is ON in the popup.
- **Realtime Summary:** Toggle "Realtime Summary" ON for instant AI summaries and notifications.
- **Timeline:** Click "Open Timeline" in the popup to view your full browsing timeline.
- **Remove Entries:** Click the ❌ next to any entry in the popup to remove it.
- **Set API Key:** Enter your OpenAI API key in the settings section and click "Save".
- **Summary Density:** Use the slider to control summary detail (High/Medium/Low).
- **Theme:** Use the theme toggle to switch between glass and normal themes.

---

## ⚙️ Settings
- **OpenAI API Key:** Required for AI summaries. Get yours at [OpenAI](https://platform.openai.com/).
- **Theme:** Choose between "Glass" and "Normal" for the popup UI.
- **Summary Density:** Adjust how detailed your summaries are.

---

## 👩‍💻 Developer Instructions
**Warning: For developer-friendly users only!**

1. **Locate the extension folder on your computer.**
2. **Open it in [Cursor](https://www.cursor.so/) or your favorite code editor.**
3. **Edit any file (HTML, JS, CSS, manifest, etc.).**
4. **Reload the extension in** `chrome://extensions/` **after making changes.**
5. **Test your changes in Chrome.**

If you break something, reload the original files or ask for help!

---

## 🌐 Publishing to Chrome Web Store
1. **Remove any sensitive info or test API keys.**
2. **Zip the extension folder.**
3. **Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).**
4. **Upload your ZIP, fill out the listing, and submit for review.**

---

## 📄 License
MIT 