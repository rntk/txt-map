import React from 'react';
import ReactDOM from 'react-dom/client';
import ExtensionApp from './ExtensionApp';

console.log('index.js loaded');

// Ensure DOM is ready before rendering
function renderApp() {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('Root element not found!');
    setTimeout(renderApp, 100); // Retry
    return;
  }

  try {
    console.log('Creating React root and rendering ExtensionApp');
    const root = ReactDOM.createRoot(rootElement);
    root.render(<ExtensionApp />);
    console.log('React app rendered successfully');
  } catch (error) {
    console.error('Error rendering React app:', error);
  }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderApp);
} else {
  renderApp();
}
