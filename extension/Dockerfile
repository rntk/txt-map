# Dockerfile for building the Firefox extension with volume mounting

FROM node:22-alpine

WORKDIR /workspace

# Install dependencies and build the extension
CMD ["sh", "-c", "cd extension && npm install && npm run build && touch app-bundle.css && echo 'Build complete!'"]