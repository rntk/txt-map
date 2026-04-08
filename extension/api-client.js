/**
 * Shared API client for RSS Submission Analyzer Extension.
 * Provides authentication, session management, and API request helpers.
 * Used by both popup.js and options.js.
 * Depends on config.js being loaded first (provides API_URL constant).
 */

const ExtensionAPI = {
  /**
   * Get stored session credentials from chrome.storage.local
   * @returns {Promise<{sessionToken?: string, isSuperuser?: boolean, alias?: string}>}
   */
  async getCredentials() {
    return await chrome.storage.local.get(['sessionToken', 'isSuperuser', 'alias']);
  },

  /**
   * Make authenticated API request
   * @param {string} endpoint - API endpoint (e.g., '/api/auth/verify')
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>}
   * @throws {Error} If not authenticated or session expired
   */
  async request(endpoint, options = {}) {
    const { sessionToken } = await this.getCredentials();

    if (!sessionToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (response.status === 401) {
      await this.logout();
      throw new Error('Session expired. Please login again.');
    }

    return response;
  },

  /**
   * Login with API token
   * @param {string} token - User API token
   * @returns {Promise<{success: boolean, is_superuser: boolean, alias?: string, session_token: string}>}
   * @throws {Error} If login fails
   */
  async login(token) {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.detail || 'Invalid token');
    }

    await chrome.storage.local.set({
      sessionToken: data.session_token,
      isSuperuser: data.is_superuser,
      alias: data.alias || null
    });

    return data;
  },

  /**
   * Logout and clear stored credentials.
   * Attempts to notify the server, then clears local storage.
   */
  async logout() {
    const { sessionToken } = await this.getCredentials();

    if (sessionToken) {
      try {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        // Ignore network errors during logout
      }
    }

    await chrome.storage.local.remove(['sessionToken', 'isSuperuser', 'alias']);
  }
};
