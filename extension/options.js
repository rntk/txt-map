/**
 * Options page script for RSS Submission Analyzer Extension.
 * Handles authentication and session management.
 * Uses shared ExtensionAPI from api-client.js for API calls.
 */

// Load saved settings on page load
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
});

// Save button handler
document.getElementById('save').addEventListener('click', async () => {
  const token = document.getElementById('token').value.trim();

  if (!token) {
    showStatus('Please enter an API token', 'error');
    return;
  }

  showStatus('Connecting...', 'info');

  try {
    const data = await ExtensionAPI.login(token);

    showStatus(
      `Connected successfully as ${data.is_superuser ? 'superuser' : (data.alias || 'user')}`,
      'success'
    );

    // Clear token input for security
    document.getElementById('token').value = '';

    await displaySessionInfo();
  } catch (err) {
    showStatus(err.message, 'error');
  }
});

// Logout button handler
document.getElementById('logout').addEventListener('click', async () => {
  try {
    await ExtensionAPI.logout();

    document.getElementById('token').value = '';
    hideSessionInfo();
    showStatus('Logged out successfully', 'success');
  } catch (err) {
    showStatus(`Logout error: ${err.message}`, 'error');
  }
});

/**
 * Load saved settings from storage
 */
async function loadSettings() {
  const { alias, isSuperuser } = await ExtensionAPI.getCredentials();

  if (alias || isSuperuser !== undefined) {
    await displaySessionInfo();
  }
}

/**
 * Display current session information
 */
async function displaySessionInfo() {
  const { alias, isSuperuser } = await ExtensionAPI.getCredentials();

  const sessionInfo = document.getElementById('sessionInfo');
  const sessionDetails = document.getElementById('sessionDetails');

  const userType = isSuperuser ? 'Superuser' : (alias || 'User');
  sessionDetails.innerHTML = `
    <strong>Connected as:</strong> ${userType}<br>
    <strong>API URL:</strong> ${API_URL}
  `;

  sessionInfo.style.display = 'block';
}

/**
 * Hide session information
 */
function hideSessionInfo() {
  document.getElementById('sessionInfo').style.display = 'none';
}

/**
 * Show status message
 */
function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status visible ${type}`;

  if (type === 'success') {
    setTimeout(() => {
      status.classList.remove('visible');
    }, 5000);
  }
}
