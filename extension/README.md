# RSS Tag Firefox Extension

A lightweight Firefox extension that submits selected text to the local API and opens the redirect page.

## Features

- Click the extension icon to start selection
- Select any text on the page
- Submit the selection to `http://127.0.0.1:8000/api/submit`
- Opens the API-provided redirect URL in a new tab

## Installation

1. Ensure the backend API is running at `http://127.0.0.1:8000`
2. Open Firefox and go to `about:debugging`
3. Click "This Firefox" in the left sidebar
4. Click "Load Temporary Add-on"
5. Select `manifest.json` from this directory

## Usage

1. Navigate to any web page
2. Click the extension icon in the toolbar
3. Select the text you want to submit
4. Click "Submit" in the toolbar

## Architecture

- `manifest.json`: Extension configuration and permissions
- `background.js`: Handles icon clicks and opens the redirect tab
- `content.js`: Manages selection UI and submits text
- `content.css`: Styles for the selection toolbar
