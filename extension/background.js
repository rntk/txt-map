// Background script - triggers selection and opens redirect tabs
browser.browserAction.onClicked.addListener((tab) => {
  if (!tab || !tab.id) {
    return;
  }

  browser.tabs.sendMessage(tab.id, { action: "startSelection" })
    .catch(error => {
      console.error("Failed to start selection:", error);
    });
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openNewTab") {
    browser.tabs.create({
      url: message.url,
      active: true
    }).then(() => {
      sendResponse({ status: "tab_opened" });
    }).catch(error => {
      console.error("Failed to open tab:", error);
      sendResponse({ status: "error", error: error.message });
    });
    return true;
  }
});
