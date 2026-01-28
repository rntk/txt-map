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
  if (message.action === "submitSelection") {
    (async () => {
      try {
        const response = await fetch("http://127.0.0.1:8000/api/submit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(message.payload || {})
        });

        const data = await response.json();
        sendResponse({ ok: true, data });
      } catch (error) {
        console.error("Error submitting content:", error);
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

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
