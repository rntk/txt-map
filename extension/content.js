// Content script - extracts page content
(function() {
  // Listen for messages from background script
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "extractContent") {
      extractAndAnalyze();
      sendResponse({ status: "started" });
    }
    return true;
  });

  function extractAndAnalyze() {
    // Extract all text content from the page
    const pageContent = document.body.innerText || document.body.textContent;
    
    console.log("Extracting page content...", pageContent.substring(0, 100));

    // Send POST request to the API
    fetch("http://127.0.0.1:8000/api/themed-post", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        article: pageContent
      })
    })
    .then(response => response.json())
    .then(data => {
      console.log("API response received:", data);
      // Send results to background script to open in new tab
      browser.runtime.sendMessage({
        action: "openResultsTab",
        data: data
      });
    })
    .catch(error => {
      console.error("Error calling API:", error);
      alert("Error analyzing page content: " + error.message);
    });
  }
})();

