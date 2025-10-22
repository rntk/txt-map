// Background script - handles extension icon clicks
browser.browserAction.onClicked.addListener((tab) => {
  // Check if we can inject content scripts into this tab
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:') ||
      tab.url.startsWith('moz-extension://') || tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('file://')) {
    console.warn("Cannot inject content script into this page:", tab.url);
    showNotification("Cannot analyze this page", "This extension cannot analyze browser internal pages or extension pages.");
    return;
  }

  // Send message to content script to extract content
  sendMessageWithRetry(tab.id, { action: "extractContent" }, 3);
});

// Helper function to retry sending messages to content script
function sendMessageWithRetry(tabId, message, retriesLeft) {
  browser.tabs.sendMessage(tabId, message)
    .then(response => {
      console.log("Content extraction initiated");
    })
    .catch(error => {
      if (retriesLeft > 0) {
        console.log(`Content script not ready, retrying... (${retriesLeft} attempts left)`);
        setTimeout(() => {
          sendMessageWithRetry(tabId, message, retriesLeft - 1);
        }, 500);
      } else {
        console.error("Failed to communicate with content script:", error);
        showNotification("Extension Error", "Content script is not responding. Please refresh the page and try again.");
      }
    });
}

// Listen for messages from content script with API results
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openResultsTab") {
    // Store the API results in local storage
    browser.storage.local.set({ 
      analysisResults: message.data,
      timestamp: Date.now()
    }).then(() => {
      // Open results page in new tab
      browser.tabs.create({
        url: browser.runtime.getURL('results.html'),
        active: true
      }).then(() => {
        sendResponse({ status: "tab_opened" });
      });
    }).catch(error => {
      console.error("Error storing results:", error);
      sendResponse({ status: "error", error: error.message });
    });
    return true; // Keep message channel open for async response
  }
});

// Cross-browser notification helper
function showNotification(title, message) {
  // Try to use notifications API if available
  if (browser.notifications && browser.notifications.create) {
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title: title,
      message: message
    });
  } else {
    // Fallback: use alert (not ideal but works cross-browser)
    alert(`${title}: ${message}`);
  }
}
