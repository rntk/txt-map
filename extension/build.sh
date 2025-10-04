#!/bin/bash

# Build script for the Firefox extension

echo "Building RSS Tag Extension..."

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Build the React app bundle
echo "Building React app..."
npm run build

# Create a simple CSS file (since style-loader injects CSS, we need an empty file)
touch app-bundle.css

echo "Build complete!"
echo ""
echo "To install in Firefox:"
echo "1. Open Firefox and go to about:debugging"
echo "2. Click 'This Firefox'"
echo "3. Click 'Load Temporary Add-on'"
echo "4. Navigate to the extension directory and select manifest.json"
echo ""
echo "Note: You'll need to create icon files in the icons/ directory:"
echo "  - icons/icon-16.png (16x16)"
echo "  - icons/icon-48.png (48x48)"
echo "  - icons/icon-96.png (96x96)"
