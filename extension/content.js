// Content script - extracts page content
(function () {
  let selectionMode = false;
  let selectedElement = null;
  let selectionToolbar = null;
  let highlightOverlay = null;
  let currentAnalysisType = 'topics'; // Default to topics

  // Listen for messages from background script
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "extractContent") {
      currentAnalysisType = message.analysisType || 'topics';
      showSelectionToolbar();
      sendResponse({ status: "started" });
    }
    return true;
  });

  function showSelectionToolbar() {
    // Remove existing toolbar if any
    if (selectionToolbar) {
      selectionToolbar.remove();
    }

    // Set toolbar title based on analysis type
    let analysisTitle = '📝 Topics Analysis';
    let actionText = 'Analyze Topics';

    if (currentAnalysisType === 'insides') {
      analysisTitle = '💡 Insides Analysis';
      actionText = 'Extract Insides';
    }

    // Create floating toolbar
    selectionToolbar = document.createElement('div');
    selectionToolbar.id = 'rsstag-selection-toolbar';
    selectionToolbar.innerHTML = `
      <span id="rsstag-toolbar-text">${analysisTitle}: Select content</span>
      <button id="rsstag-select-btn">🎯 Select Block</button>
      <button id="rsstag-fullpage-btn">📄 ${actionText} (Full Page)</button>
      <button id="rsstag-cancel-btn">✖ Cancel</button>
    `;

    document.body.appendChild(selectionToolbar);

    // Add event listeners
    document.getElementById('rsstag-select-btn').addEventListener('click', toggleSelectionMode);
    document.getElementById('rsstag-fullpage-btn').addEventListener('click', () => {
      extractAndAnalyze();
      cleanupSelection();
    });
    document.getElementById('rsstag-cancel-btn').addEventListener('click', cleanupSelection);
  }

  function toggleSelectionMode() {
    selectionMode = !selectionMode;
    const selectBtn = document.getElementById('rsstag-select-btn');
    const toolbarText = document.getElementById('rsstag-toolbar-text');

    if (selectionMode) {
      selectBtn.classList.add('active');
      selectBtn.textContent = '✓ Selection Active';
      toolbarText.textContent = '👆 Click on any text block to select it';
      enableSelection();
    } else {
      selectBtn.classList.remove('active');
      selectBtn.textContent = '🎯 Select Block';
      toolbarText.textContent = '📝 Select content to analyze';
      disableSelection();
    }
  }

  function enableSelection() {
    document.addEventListener('mouseover', highlightElement);
    document.addEventListener('mouseout', unhighlightElement);
    document.addEventListener('click', selectElement, true);
  }

  function disableSelection() {
    document.removeEventListener('mouseover', highlightElement);
    document.removeEventListener('mouseout', unhighlightElement);
    document.removeEventListener('click', selectElement, true);

    // Remove all highlights
    document.querySelectorAll('.rsstag-element-highlight').forEach(el => {
      el.classList.remove('rsstag-element-highlight');
    });
  }

  function highlightElement(e) {
    if (!selectionMode) return;
    if (e.target.closest('#rsstag-selection-toolbar')) return;

    const element = e.target;
    if (element && element !== document.body && element !== document.documentElement) {
      element.classList.add('rsstag-element-highlight');
    }
  }

  function unhighlightElement(e) {
    if (!selectionMode) return;
    if (e.target.closest('#rsstag-selection-toolbar')) return;

    const element = e.target;
    if (element && !element.classList.contains('rsstag-selected')) {
      element.classList.remove('rsstag-element-highlight');
    }
  }

  function selectElement(e) {
    if (!selectionMode) return;
    if (e.target.closest('#rsstag-selection-toolbar')) return;

    e.preventDefault();
    e.stopPropagation();

    // Remove previous selection
    if (selectedElement) {
      selectedElement.classList.remove('rsstag-selected');
    }

    selectedElement = e.target;
    selectedElement.classList.add('rsstag-selected');

    // Update toolbar
    const toolbarText = document.getElementById('rsstag-toolbar-text');
    toolbarText.textContent = '✅ Block selected! Click button to analyze';

    // Determine button text based on analysis type
    let actionText = 'Analyze Topics';
    if (currentAnalysisType === 'insides') {
      actionText = 'Extract Insides';
    }

    // Add analyze button
    let analyzeBtn = document.getElementById('rsstag-analyze-btn');
    if (!analyzeBtn) {
      analyzeBtn = document.createElement('button');
      analyzeBtn.id = 'rsstag-analyze-btn';
      analyzeBtn.textContent = `🚀 ${actionText}`;
      analyzeBtn.style.cssText = 'background: #ffd700; color: #333; font-weight: bold;';
      analyzeBtn.addEventListener('click', () => {
        extractAndAnalyze(selectedElement);
        cleanupSelection();
      });

      const toolbar = document.getElementById('rsstag-selection-toolbar');
      const fullPageBtn = document.getElementById('rsstag-fullpage-btn');
      toolbar.insertBefore(analyzeBtn, fullPageBtn);
    }

    // Disable selection mode but keep the selected element
    selectionMode = false;
    disableSelection();
    selectedElement.classList.add('rsstag-selected'); // Re-add after disableSelection

    const selectBtn = document.getElementById('rsstag-select-btn');
    selectBtn.classList.remove('active');
    selectBtn.textContent = '🎯 Reselect';
  }

  function cleanupSelection() {
    if (selectionToolbar) {
      selectionToolbar.remove();
      selectionToolbar = null;
    }

    if (selectedElement) {
      selectedElement.classList.remove('rsstag-selected');
      selectedElement = null;
    }

    selectionMode = false;
    disableSelection();
  }

  function extractAndAnalyze(element = null) {
    // Extract HTML content from selected element or full page
    let htmlContent;
    const sourceUrl = window.location.href;

    if (element) {
      htmlContent = element.innerHTML;
      console.log("Extracting selected HTML...", htmlContent.substring(0, 100));
    } else {
      // Clone the body to avoid modifying the original DOM
      const bodyClone = document.body.cloneNode(true);

      // Remove extension-specific elements that should not be analyzed
      const extensionElements = bodyClone.querySelectorAll('#rsstag-selection-toolbar, #rsstag-analyze-btn, .rsstag-element-highlight, .rsstag-selected');
      extensionElements.forEach(el => el.remove());

      htmlContent = bodyClone.innerHTML;
      console.log("Extracting full page HTML...", htmlContent.substring(0, 100));
    }

    console.log("Submitting content to new submission API");

    // Send POST request to the new submit API
    fetch("http://127.0.0.1:8000/api/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        html: htmlContent,
        source_url: sourceUrl
      })
    })
      .then(response => response.json())
      .then(data => {
        console.log("Submission created:", data.submission_id);
        // Redirect to the API-hosted results page
        const redirectUrl = `http://127.0.0.1:8000${data.redirect_url}`;
        console.log("Redirecting to:", redirectUrl);
        window.location.href = redirectUrl;
      })
      .catch(error => {
        console.error("Error submitting content:", error);
        alert("Error submitting content: " + error.message);
      });
  }
})();

