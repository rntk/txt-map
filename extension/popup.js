// Popup script - handles menu interactions
document.addEventListener('DOMContentLoaded', () => {
  const topicsButton = document.getElementById('analyze-topics');
  const insidesButton = document.getElementById('analyze-insides');

  // Handle Topics Analysis button
  topicsButton.addEventListener('click', () => {
    initiateAnalysis('topics');
  });

  // Handle Insides Analysis button
  insidesButton.addEventListener('click', () => {
    initiateAnalysis('insides');
  });

  function initiateAnalysis(analysisType) {
    // Get the active tab
    browser.tabs.query({ active: true, currentWindow: true })
      .then(tabs => {
        const activeTab = tabs[0];

        // Check if we can analyze this page
        if (!activeTab.url ||
          activeTab.url.startsWith('chrome://') ||
          activeTab.url.startsWith('about:') ||
          activeTab.url.startsWith('moz-extension://') ||
          activeTab.url.startsWith('chrome-extension://') ||
          activeTab.url.startsWith('file://')) {
          showError("Cannot analyze this page. Browser internal pages and extension pages are not supported.");
          return;
        }

        // Send message to background script with the analysis type
        browser.runtime.sendMessage({
          action: "startAnalysis",
          analysisType: analysisType,
          tabId: activeTab.id
        }).then(() => {
          // Close the popup after initiating analysis
          window.close();
        }).catch(error => {
          console.error("Error sending message:", error);
          showError("Failed to start analysis. Please try again.");
        });
      })
      .catch(error => {
        console.error("Error querying tabs:", error);
        showError("Failed to access current tab.");
      });
  }

  function showError(message) {
    const footer = document.querySelector('.popup-footer .help-text');
    footer.textContent = `⚠️ ${message}`;
    footer.style.color = '#f44336';
    setTimeout(() => {
      footer.textContent = 'Click an option to start analyzing the current page';
      footer.style.color = '';
    }, 3000);
  }
});
