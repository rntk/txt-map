// Content script - extracts page content and creates overlay
(function() {
  let overlayIframe = null;

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
      showOverlay(data);
    })
    .catch(error => {
      console.error("Error calling API:", error);
      alert("Error analyzing page content: " + error.message);
    });
  }

  function showOverlay(apiData) {
    // Remove existing overlay if present
    if (overlayIframe) {
      overlayIframe.remove();
    }

    // Create iframe for overlay
    overlayIframe = document.createElement('iframe');
    overlayIframe.id = 'rsstag-overlay';
    overlayIframe.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: none;
      z-index: 2147483647;
      background: white;
    `;
    
    // Set the iframe src to the overlay HTML
    overlayIframe.src = browser.runtime.getURL('overlay.html');
    
    document.body.appendChild(overlayIframe);

    // Wait for iframe to load, then send data
    overlayIframe.onload = function() {
      overlayIframe.contentWindow.postMessage({
        type: 'RSSTAG_DATA',
        data: apiData
      }, '*');
    };
  }

  // Listen for close message from overlay
  window.addEventListener('message', (event) => {
    if (event.data.type === 'RSSTAG_CLOSE') {
      if (overlayIframe) {
        overlayIframe.remove();
        overlayIframe = null;
      }
    }
  });
})();
