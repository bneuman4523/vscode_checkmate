// Greet QA Runner — Background Service Worker

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Ensure content script is injected, then send message
async function ensureContentScript(tabId) {
  try {
    // Try pinging the content script first
    const response = await chrome.tabs.sendMessage(tabId, { type: 'ping' });
    if (response?.ok) return true;
  } catch (e) {
    // Content script not there — inject it
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js']
    });
    // Give it a moment to initialize
    await new Promise(r => setTimeout(r, 300));
    return true;
  } catch (e) {
    console.error('[Greet QA] Failed to inject content script:', e);
    return false;
  }
}

// Relay messages between side panel and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'content') {
    // Forward to content script in the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]) {
        sendResponse({ error: 'No active tab' });
        return;
      }
      const tabId = tabs[0].id;
      const injected = await ensureContentScript(tabId);
      if (!injected) {
        sendResponse({ error: 'Could not inject content script — is this a Greet page?' });
        return;
      }
      try {
        const response = await chrome.tabs.sendMessage(tabId, message);
        sendResponse(response);
      } catch (e) {
        sendResponse({ error: `Content script error: ${e.message}` });
      }
    });
    return true; // async response
  }

  if (message.target === 'sidepanel') {
    // Forward to side panel (it listens via runtime.onMessage)
    chrome.runtime.sendMessage(message);
  }

  if (message.type === 'navigate') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.update(tabs[0].id, { url: message.url });
        sendResponse({ ok: true });
      }
    });
    return true;
  }

  if (message.type === 'screenshot') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      sendResponse({ screenshot: dataUrl });
    });
    return true;
  }

  if (message.type === 'getTabUrl') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ url: tabs[0]?.url || '' });
    });
    return true;
  }
});

// Listen for tab URL changes to detect navigation completion
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    chrome.runtime.sendMessage({
      type: 'navigation-complete',
      tabId,
      url: changeInfo.url
    }).catch(() => {}); // ignore if no listener
  }
});
