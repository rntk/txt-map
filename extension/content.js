// Content script - extracts page content
(function() {
  let selectionMode = false;
  let selectedElement = null;
  let selectionToolbar = null;
  let highlightOverlay = null;

  // Listen for messages from background script
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "extractContent") {
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

    // Create floating toolbar
    selectionToolbar = document.createElement('div');
    selectionToolbar.id = 'rsstag-selection-toolbar';
    selectionToolbar.innerHTML = `
      <span id="rsstag-toolbar-text">📝 Select content to analyze</span>
      <button id="rsstag-select-btn">🎯 Select Block</button>
      <button id="rsstag-fullpage-btn">📄 Analyze Full Page</button>
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
    
    // Add analyze button
    let analyzeBtn = document.getElementById('rsstag-analyze-btn');
    if (!analyzeBtn) {
      analyzeBtn = document.createElement('button');
      analyzeBtn.id = 'rsstag-analyze-btn';
      analyzeBtn.textContent = '🚀 Analyze Selection';
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
    // Extract text content from selected element or full page
    let pageContent;
    
    if (element) {
      pageContent = element.innerText || element.textContent;
      console.log("Extracting selected content...", pageContent.substring(0, 100));
    } else {
      pageContent = document.body.innerText || document.body.textContent;
      console.log("Extracting full page content...", pageContent.substring(0, 100));
    }

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

