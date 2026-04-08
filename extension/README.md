# RSS Submission Analyzer Extension

A browser extension for connecting to the RSS Submission Analyzer API.

## Features

- **Token-based Authentication**: Enter your API token to get a session token
- **Session Storage**: Session token is securely stored in browser storage
- **Quick Connect**: Popup interface for fast login/logout
- **Settings Page**: Full settings page for configuration
- **Firefox & Chrome Compatible**: Uses `background.scripts` for Firefox compatibility

## Installation

### Firefox

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" → "Load Temporary Add-on"
3. Select the `manifest.json` file from the extension folder
4. The extension icon will appear in your toolbar

### Chrome/Edge

1. Open `chrome://extensions` or `edge://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the extension folder
5. The extension icon will appear in your toolbar

## Configuration

1. Click the extension icon to open the popup
2. Enter your API URL (default: `http://localhost:8000`)
3. Enter your API token (get this from the web UI Tokens page)
4. Click "Connect"

Alternatively, right-click the extension icon and select "Manage Extension" → "Preferences" (Firefox) or "Options" (Chrome).

## How It Works

### User Flow

1. **First time**: Click extension icon → Enter API URL and token → Click Connect
2. **After login**: Click extension icon → Click "Start Selection"
3. **Selection UI**: Pick blocks on the page → Click Submit
4. **Result**: New tab opens with the submitted article

### Authentication Flow

1. User enters API URL and token in popup/options
2. Extension calls `/api/auth/login` with the token
3. Server returns `session_token` in response
4. Extension stores in `chrome.storage.local`:
   - `sessionToken` - used for all API requests
   - `apiUrl` - the API server URL
   - `alias` - user alias (if not superuser)
   - `isSuperuser` - superuser status
5. Content script uses stored credentials to submit articles

### Content Script Flow

1. User clicks "Start Selection" in popup
2. Popup sends `startSelection` message to content script
3. Content script shows Pick/Submit/Cancel toolbar
4. User selects blocks and clicks Submit
5. Content script gets credentials from storage
6. Content script submits to API with `Authorization: Bearer <token>`
7. Opens result in new tab

```javascript
// Check if authenticated
const { sessionToken } = await chrome.storage.local.get('sessionToken');
if (sessionToken) {
  // Make authenticated request
  const response = await fetch(`${apiUrl}/api/submissions`, {
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json'
    }
  });
}
```

## File Structure

```
extension/
├── manifest.json      # Extension manifest (v3, Firefox compatible)
├── popup.html         # Popup UI
├── popup.js           # Popup logic (uses shared API client)
├── options.html       # Settings page UI
├── options.js         # Settings page logic (uses shared API client)
├── api-client.js      # Shared API helper (auth, session, requests)
├── background.js      # Background script for cross-origin requests
├── content.js         # Content script for page selection
├── content.css        # Styles for selection UI
├── README.md          # Documentation
└── icons/
    ├── icon-16.png    # Icon (16x16)
    ├── icon-48.png    # Icon (48x48)
    └── icon-96.png    # Icon (96x96)
```

## Permissions

- `storage`: Store session token and settings
- `activeTab`: Access current tab (for content script features)
- `host_permissions`: Access to any HTTP/HTTPS server (required for configurable API URL)

## Development

### Making Changes

1. Edit the source files
2. Reload the extension:
   - Firefox: Click "Reload" in `about:debugging`
   - Chrome: Click refresh icon on extension card

### Testing Authentication

1. Open extension popup
2. Enter API URL and valid/invalid token
3. Check UI feedback
4. Verify session persists across browser restarts
5. Check logout clears storage

## Security Notes

- API tokens are only used once during login
- Session tokens stored in `chrome.storage.local` (sandboxed per extension, not encrypted)
- Session expires after 7 days (configurable on server)
- 401 responses trigger automatic logout
- `host_permissions` allows connections to any HTTP/HTTPS server — only connect to trusted API instances
