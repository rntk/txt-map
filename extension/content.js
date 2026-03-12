// Content script - handles block selection and submission
(function () {
  let selectionToolbar = null;
  let selectionMode = false;
  let selectedElements = []; // ordered list of { el, originalNumber } objects
  let pickCounter = 0;
  let dragSrcIndex = null;

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
      <div id="rsstag-toolbar-top">
        <button id="rsstag-pick-btn" type="button">Pick Block</button>
        <button id="rsstag-submit-btn" type="button" disabled>Submit</button>
        <button id="rsstag-cancel-btn" type="button">Cancel</button>
      </div>
      <ul id="rsstag-block-list"></ul>
    `;

    document.body.appendChild(selectionToolbar);

    document.getElementById('rsstag-pick-btn').addEventListener('click', toggleSelectionMode);
    document.getElementById('rsstag-submit-btn').addEventListener('click', submitSelection);
    document.getElementById('rsstag-cancel-btn').addEventListener('click', cleanupSelection);

    renderBlockList();
  }

  function toggleSelectionMode() {
    selectionMode = !selectionMode;
    const pickBtn = document.getElementById('rsstag-pick-btn');

    if (selectionMode) {
      pickBtn.classList.add('active');
      pickBtn.textContent = 'Picking…';
      enableSelection();
    } else {
      pickBtn.classList.remove('active');
      pickBtn.textContent = 'Pick Block';
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
    const el = event.target;
    if (el && el !== document.body && el !== document.documentElement) {
      el.classList.add('rsstag-element-highlight');
    }
  }

  function unhighlightElement(event) {
    if (!selectionMode) return;
    if (event.target.closest('#rsstag-selection-toolbar')) return;
    const el = event.target;
    if (el && !selectedElements.some(entry => entry.el === el)) {
      el.classList.remove('rsstag-element-highlight');
    }
  }

  function selectElement(event) {
    if (!selectionMode) return;
    if (event.target.closest('#rsstag-selection-toolbar')) return;

    event.preventDefault();
    event.stopPropagation();

    const el = event.target;
    el.classList.add('rsstag-selected');
    pickCounter += 1;
    selectedElements.push({ el, originalNumber: pickCounter });

    selectionMode = false;
    disableSelection();

    const pickBtn = document.getElementById('rsstag-pick-btn');
    pickBtn.classList.remove('active');
    pickBtn.textContent = 'Pick Block';

    renderBlockList();
    updateSubmitState();
  }

  function renderBlockList() {
    const list = document.getElementById('rsstag-block-list');
    if (!list) return;
    list.innerHTML = '';

    selectedElements.forEach(({ el, originalNumber }, index) => {
      const item = document.createElement('li');
      item.className = 'rsstag-block-item';
      item.draggable = true;
      item.dataset.index = index;

      item.innerHTML = `
        <span class="rsstag-drag-handle" title="Drag to reorder">&#9776;</span>
        <span class="rsstag-block-label">Block ${originalNumber}</span>
        <button class="rsstag-remove-btn" type="button" title="Remove block">&#10005;</button>
      `;

      item.querySelector('.rsstag-remove-btn').addEventListener('click', () => removeBlock(index));

      item.addEventListener('dragstart', onDragStart);
      item.addEventListener('dragover', onDragOver);
      item.addEventListener('drop', onDrop);
      item.addEventListener('dragend', onDragEnd);

      list.appendChild(item);
    });
  }

  function removeBlock(index) {
    const entry = selectedElements[index];
    if (entry) {
      entry.el.classList.remove('rsstag-selected');
    }
    selectedElements.splice(index, 1);
    renderBlockList();
    updateSubmitState();
  }

  // --- Drag and drop ---

  function onDragStart(event) {
    dragSrcIndex = parseInt(event.currentTarget.dataset.index);
    event.currentTarget.classList.add('rsstag-dragging');
    event.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const target = event.currentTarget;
    document.querySelectorAll('.rsstag-block-item').forEach(i => i.classList.remove('rsstag-drag-over'));
    if (parseInt(target.dataset.index) !== dragSrcIndex) {
      target.classList.add('rsstag-drag-over');
    }
  }

  function onDrop(event) {
    event.preventDefault();
    const destIndex = parseInt(event.currentTarget.dataset.index);
    if (dragSrcIndex === null || dragSrcIndex === destIndex) return;

    const moved = selectedElements.splice(dragSrcIndex, 1)[0];
    selectedElements.splice(destIndex, 0, moved);

    renderBlockList();
    updateSubmitState();
  }

  function onDragEnd(event) {
    dragSrcIndex = null;
    document.querySelectorAll('.rsstag-block-item').forEach(i => {
      i.classList.remove('rsstag-dragging', 'rsstag-drag-over');
    });
  }

  // --- Submit / state ---

  function updateSubmitState() {
    const submitBtn = document.getElementById('rsstag-submit-btn');
    if (!submitBtn) return;
    const count = selectedElements.length;
    submitBtn.disabled = count === 0;
    submitBtn.textContent = count > 0 ? `Submit (${count})` : 'Submit';
  }

  function submitSelection(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (selectedElements.length === 0) {
      alert('Please pick at least one block first.');
      return;
    }

    const sourceUrl = window.location.href;
    const html = selectedElements.map(({ el }) => el.innerHTML).join('\n');

    browser.runtime.sendMessage({
      action: "submitSelection",
      payload: { html, source_url: sourceUrl }
    })
      .then(result => {
        if (!result || !result.ok) {
          throw new Error(result && result.error ? result.error : "Unknown error");
        }
        const data = result.data;
        if (!data || !data.redirect_url) {
          throw new Error('Missing redirect_url in response');
        }
        const redirectUrl = `http://127.0.0.1:8000${data.redirect_url}`;
        browser.runtime.sendMessage({ action: "openNewTab", url: redirectUrl });
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

    selectedElements.forEach(({ el }) => el.classList.remove('rsstag-selected'));
    selectedElements = [];
    pickCounter = 0;

    selectionMode = false;
    disableSelection();
  }
})();
