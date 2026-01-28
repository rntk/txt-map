// Content script - handles block selection and submission
(function () {
  let selectionToolbar = null;
  let selectionMode = false;
  let selectedElement = null;

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "startSelection") {
      showSelectionToolbar();
      sendResponse({ status: "ready" });
    }
    return true;
  });

  function showSelectionToolbar() {
    if (selectionToolbar) {
      selectionToolbar.remove();
    }

    selectionToolbar = document.createElement('div');
    selectionToolbar.id = 'rsstag-selection-toolbar';
    selectionToolbar.innerHTML = `
      <span id="rsstag-toolbar-text">Pick a block on the page.</span>
      <button id="rsstag-pick-btn">Pick Block</button>
      <button id="rsstag-submit-btn" disabled>Submit</button>
      <button id="rsstag-cancel-btn">Cancel</button>
    `;

    document.body.appendChild(selectionToolbar);

    const pickBtn = document.getElementById('rsstag-pick-btn');
    const submitBtn = document.getElementById('rsstag-submit-btn');
    const cancelBtn = document.getElementById('rsstag-cancel-btn');

    pickBtn.addEventListener('click', toggleSelectionMode);
    submitBtn.addEventListener('click', submitSelection);
    cancelBtn.addEventListener('click', cleanupSelection);

    updateSubmitState();
  }

  function toggleSelectionMode() {
    selectionMode = !selectionMode;
    const pickBtn = document.getElementById('rsstag-pick-btn');
    const toolbarText = document.getElementById('rsstag-toolbar-text');

    if (selectionMode) {
      pickBtn.classList.add('active');
      pickBtn.textContent = 'Picking...';
      toolbarText.textContent = 'Click a block to select it.';
      enableSelection();
    } else {
      pickBtn.classList.remove('active');
      pickBtn.textContent = 'Pick Block';
      toolbarText.textContent = selectedElement ? 'Block selected. Submit when ready.' : 'Pick a block on the page.';
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

    document.querySelectorAll('.rsstag-element-highlight').forEach(el => {
      el.classList.remove('rsstag-element-highlight');
    });
  }

  function highlightElement(event) {
    if (!selectionMode) return;
    if (event.target.closest('#rsstag-selection-toolbar')) return;

    const element = event.target;
    if (element && element !== document.body && element !== document.documentElement) {
      element.classList.add('rsstag-element-highlight');
    }
  }

  function unhighlightElement(event) {
    if (!selectionMode) return;
    if (event.target.closest('#rsstag-selection-toolbar')) return;

    const element = event.target;
    if (element && !element.classList.contains('rsstag-selected')) {
      element.classList.remove('rsstag-element-highlight');
    }
  }

  function selectElement(event) {
    if (!selectionMode) return;
    if (event.target.closest('#rsstag-selection-toolbar')) return;

    event.preventDefault();
    event.stopPropagation();

    if (selectedElement) {
      selectedElement.classList.remove('rsstag-selected');
    }

    selectedElement = event.target;
    selectedElement.classList.add('rsstag-selected');

    const toolbarText = document.getElementById('rsstag-toolbar-text');
    toolbarText.textContent = 'Block selected. Submit when ready.';

    selectionMode = false;
    disableSelection();

    const pickBtn = document.getElementById('rsstag-pick-btn');
    pickBtn.classList.remove('active');
    pickBtn.textContent = 'Pick Another';

    updateSubmitState();
  }

  function updateSubmitState() {
    const submitBtn = document.getElementById('rsstag-submit-btn');
    if (!submitBtn) return;
    const hasSelection = !!selectedElement;
    submitBtn.disabled = !hasSelection;
    submitBtn.textContent = hasSelection ? 'Submit Block' : 'Submit';
  }

  function submitSelection() {
    if (!selectedElement) {
      alert('Please pick a block first.');
      return;
    }

    const sourceUrl = window.location.href;
    const html = selectedElement.innerHTML;

    fetch("http://127.0.0.1:8000/api/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        html: html,
        source_url: sourceUrl
      })
    })
      .then(response => response.json())
      .then(data => {
        if (!data || !data.redirect_url) {
          throw new Error('Missing redirect_url in response');
        }
        const redirectUrl = `http://127.0.0.1:8000${data.redirect_url}`;
        browser.runtime.sendMessage({
          action: "openNewTab",
          url: redirectUrl
        });
      })
      .catch(error => {
        console.error("Error submitting content:", error);
        alert("Error submitting content: " + error.message);
      })
      .finally(() => {
        cleanupSelection();
      });
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
})();
