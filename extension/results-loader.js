// Load results from storage and display them
(function() {
  console.log('Results page loaded');
  
  // Get the results from storage
  browser.storage.local.get(['analysisResults', 'timestamp']).then(result => {
    console.log('Retrieved from storage:', result);
    
    if (!result.analysisResults) {
      showError('No analysis results found. Please try analyzing a page again.');
      return;
    }
    
    // Check if results are too old (more than 5 minutes)
    const now = Date.now();
    const age = now - (result.timestamp || 0);
    if (age > 5 * 60 * 1000) {
      showError('Analysis results have expired. Please analyze the page again.');
      return;
    }
    
    // Send the data to the React app
    window.postMessage({
      type: 'RSSTAG_DATA',
      data: result.analysisResults
    }, '*');
    
    // Clear the results from storage after loading
    browser.storage.local.remove(['analysisResults', 'timestamp']);
    
  }).catch(error => {
    console.error('Error loading results:', error);
    showError('Error loading results: ' + error.message);
  });
  
  function showError(message) {
    const root = document.getElementById('root');
    root.innerHTML = `
      <div class="error">
        <h2>Error</h2>
        <p>${message}</p>
      </div>
    `;
  }
})();
