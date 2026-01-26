// Background script - handles extension icon clicks and messages
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle analysis request from popup
  if (message.action === "startAnalysis") {
    const { analysisType, tabId } = message;

    // Send message to content script with analysis type
    sendMessageWithRetry(tabId, {
      action: "extractContent",
      analysisType: analysisType
    }, 3);

    sendResponse({ status: "started" });
    return true;
  }

  // Handle results from content script
  if (message.action === "openResultsTab") {
    const { data, pageType } = message;

    // Store the API results in local storage
    browser.storage.local.set({
      analysisResults: data,
      pageType: pageType || 'topics',
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

  // Handle opening a new tab from content script
  if (message.action === "openNewTab") {
    browser.tabs.create({
      url: message.url,
      active: true
    }).then(() => {
      sendResponse({ status: "tab_opened" });
    });
    return true;
  }
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
