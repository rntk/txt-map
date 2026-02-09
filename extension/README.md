# Browser Extension

WebExtension for selecting a block of content from any webpage and submitting it to the local API.

## What It Does

- Injects a page toolbar when you click the extension icon
- Lets you pick one DOM block on the current page
- Sends selected HTML to `POST http://127.0.0.1:8000/api/submit`
- Opens the returned `redirect_url` in a new tab

## Files

- `manifest.json`: extension manifest and permissions
- `background.js`: icon click handling, API submit, open-tab action
- `content.js`: selection UI, block picking, payload creation
- `content.css`: toolbar + highlight styles

## Install (Firefox)

1. Open `about:debugging`
2. Select `This Firefox`
3. Click `Load Temporary Add-on`
4. Choose `extension/manifest.json`

## Install (Chromium-based)

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select the `extension/` directory

## Usage

1. Open any page
2. Click the extension icon
3. Click `Pick Block`, then click the content block
4. Click `Submit Block`
5. A new tab opens with `/page/text/{submission_id}`

## Requirements

- API server running at `http://127.0.0.1:8000`
- CORS is enabled in the backend for extension requests
