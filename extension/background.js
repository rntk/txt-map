/**
 * Background service worker for RSS Submission Analyzer Extension.
 * Acts as a cross-origin fetch proxy for content scripts (required in Manifest V3).
 */

importScripts('config.js');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'submitContent') {
    chrome.storage.local.get(['sessionToken']).then(({ sessionToken }) => {
      if (!sessionToken) {
        sendResponse({ success: false, error: 'Not authenticated. Please login via extension popup.' });
        return;
      }

      fetch(`${API_URL}/api/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          html: request.html,
          source_url: request.sourceUrl
        })
      })
        .then(async (response) => {
          if (response.ok) {
            const data = await response.json();
            sendResponse({ success: true, data, status: response.status });
          } else {
            const errorText = await response.text().catch(() => 'Unknown error');
            sendResponse({
              success: false,
              status: response.status,
              error: `Server error: ${response.status} - ${errorText}`
            });
          }
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message || 'Network error' });
        });
    });
    return true; // Keep message channel open for async response
  }

  return false;
});
