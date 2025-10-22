# RSS Tag Firefox Extension

A Firefox extension that analyzes the content of any web page and extracts topics/themes using AI.

## Features

- Click the extension icon to analyze the current page
- Extracts all text content from the page
- Sends content to the local API for theme analysis
- Opens results in a new browser tab with:
  - Topic list on the left
  - Full text with highlighted topics on the right
  - Interactive topic filtering and selection
  - Mark topics and articles as read
- No modification to the original page content

## Installation

### Prerequisites

1. Make sure your backend API is running at `http://127.0.0.1:8000`
2. Node.js and npm installed

### Build Steps

1. Navigate to the extension directory:
   ```bash
   cd extension
   ```

2. Run the build script:
   ```bash
   ./build.sh
   ```

   Or manually:
   ```bash
   npm install
   npm run build
   ```

3. Create icon files (optional, but recommended):
   - `icons/icon-16.png` (16x16 pixels)
   - `icons/icon-48.png` (48x48 pixels)
   - `icons/icon-96.png` (96x96 pixels)

### Load in Firefox

1. Open Firefox
2. Navigate to `about:debugging`
3. Click "This Firefox" in the left sidebar
4. Click "Load Temporary Add-on"
5. Navigate to the extension directory and select `manifest.json`

## Usage

1. Navigate to any web page you want to analyze
2. Click the extension icon in the toolbar
3. Wait for the analysis to complete
4. A new tab will open showing:
   - Topics extracted from the page (left panel)
   - The full content with interactive highlighting (right panel)
5. Click topics to highlight them in the text
6. Close the tab when finished

## Architecture

### Files

- **manifest.json**: Extension configuration and permissions
- **background.js**: Handles extension icon clicks and opens results tab
- **content.js**: Extracts page content and calls API
- **results.html**: Standalone results page (opens in new tab)
- **overlay.html**: Legacy overlay (kept for compatibility)
- **ExtensionApp.js**: Modified React app for extension use
- **index.js**: React app entry point
- **webpack.config.js**: Bundles React app for extension
- **app-bundle.js**: Compiled React app (generated)

### Data Flow

1. User clicks extension icon
2. background.js sends message to content.js
3. content.js extracts page content
4. content.js sends POST to `/api/themed-post`
5. API returns analyzed data (sentences + topics)
6. content.js sends results to background.js
7. background.js stores results in local storage
8. background.js opens results.html in new tab
9. results.html loads data from storage and displays it
10. ExtensionApp renders the UI with the data

## Development

To rebuild after making changes:

```bash
npm run build
```

For development with auto-rebuild:

```bash
npm run dev
```

After rebuilding, you'll need to reload the extension in Firefox:
1. Go to `about:debugging`
2. Click "Reload" next to your extension

## API Endpoint

The extension expects a POST endpoint at:
```
http://127.0.0.1:8000/api/themed-post
```

Request body:
```json
{
  "article": "Full page text content..."
}
```

Response:
```json
{
  "sentences": ["Sentence 1", "Sentence 2", ...],
  "topics": [
    {
      "name": "topic_name",
      "sentences": [1, 3, 5]
    }
  ]
}
```

## Notes

- The extension uses the React components from `../frontend/src`
- All styling is inherited from the main app's CSS
- The results page runs in a separate tab, avoiding any interference with the original page
- Results are stored temporarily in browser local storage (cleared after loading)
- Extension only works on http/https pages (not on about: or file: URLs)
- Results expire after 5 minutes for security
