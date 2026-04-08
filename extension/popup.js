/**
 * Popup script for RSS Submission Analyzer Extension.
 * Handles authentication, session storage, and UI interactions.
 * Uses shared ExtensionAPI from api-client.js for API calls.
 */

// Load state when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  await updateUI();
});

// Connect button handler
document.getElementById('connect').addEventListener('click', async () => {
  const token = document.getElementById('token').value.trim();

  if (!token) {
    showError('Please enter an API token');
    return;
  }

  const connectBtn = document.getElementById('connect');
  connectBtn.disabled = true;
  connectBtn.textContent = 'Connecting...';
  hideError();

  try {
    const data = await ExtensionAPI.login(token);

    // Clear token input for security
    document.getElementById('token').value = '';

    await updateUI();
  } catch (err) {
    showError(err.message);
  } finally {
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect';
  }
});

// Disconnect button handler
document.getElementById('disconnect').addEventListener('click', async () => {
  try {
    await ExtensionAPI.logout();

    // Reset form
    document.getElementById('token').value = '';
    await updateUI();
  } catch (err) {
    showError(`Logout error: ${err.message}`);
  }
});

// Open settings button handler
document.getElementById('openSettings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// Start selection button handler
document.getElementById('startSelection').addEventListener('click', async () => {
  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      showError('No active tab found');
      return;
    }

    // Inject content script and start selection
    await chrome.tabs.sendMessage(tab.id, { action: 'startSelection' });

    // Close popup
    window.close();
  } catch (err) {
    showError('Could not start selection. Make sure you are on a webpage.');
  }
});

// Open tokens page link handler
document.getElementById('openTokensPage').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: `${API_URL}/page/tokens` });
});

/**
 * Update UI based on connection state
 */
async function updateUI() {
  const { sessionToken, alias, isSuperuser } = await ExtensionAPI.getCredentials();

  const loginPanel = document.getElementById('loginPanel');
  const connectedPanel = document.getElementById('connectedPanel');
  const connectionStatus = document.getElementById('connectionStatus');
  const statusText = document.getElementById('statusText');

  if (sessionToken) {
    loginPanel.classList.remove('visible');
    connectedPanel.classList.add('visible');
    connectionStatus.classList.remove('disconnected');
    connectionStatus.classList.add('connected');
    const userType = isSuperuser ? 'Superuser' : (alias || 'User');
    statusText.textContent = `Connected as ${userType}`;
  } else {
    loginPanel.classList.add('visible');
    connectedPanel.classList.remove('visible');
    connectionStatus.classList.remove('connected');
    connectionStatus.classList.add('disconnected');
    statusText.textContent = 'Not connected';
  }
}

/**
 * Show error message
 */
function showError(message) {
  const errorMsg = document.getElementById('errorMsg');
  errorMsg.textContent = message;
  errorMsg.classList.add('visible');
}

/**
 * Hide error message
 */
function hideError() {
  const errorMsg = document.getElementById('errorMsg');
  errorMsg.classList.remove('visible');
}
