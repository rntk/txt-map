// Externalized script for overlay.html to satisfy CSP (no inline scripts)
(function(){
  // Close button handler
  const closeButton = document.getElementById('close-button');
  console.log('Close button element:', closeButton);

  if (closeButton) {
    closeButton.addEventListener('click', (e) => {
      console.log('Close button clicked', e);
      console.log('Sending RSSTAG_CLOSE message to parent');
      console.log('window.parent:', window.parent);
      console.log('window.top:', window.top);

      // Try both parent and top
      if (window.parent) {
        window.parent.postMessage({ type: 'RSSTAG_CLOSE' }, '*');
      }
      if (window.top && window.top !== window.parent) {
        window.top.postMessage({ type: 'RSSTAG_CLOSE' }, '*');
      }
    });
    console.log('Close button event listener attached');
  } else {
    console.error('Close button not found!');
  }
})();