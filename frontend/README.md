# Frontend (React)

This frontend renders analysis pages and task/submission management views. It is served by FastAPI from `frontend/build` in production and can run standalone in development.

## Paths and Views

Main entry: `frontend/src/App.js`

Key pages:

- `/page/menu`: dashboard menu
- `/page/text/{submission_id}`: submission result view with live status polling
- `/page/tasks`: task queue management view
- `/page/texts`: submission list view
- `/page/topics`: topics cloud view
- `/page/themed-topic` and `/page/themed-topic/{topic}`: themed topic pages

## Development Commands

From `/app/frontend`:

```bash
npm install
npm start
```

Build production assets:

```bash
npm run build
```

## Test Commands

From `/app/frontend`:

```bash
npm test -- --watchAll=false
npm run test:coverage
```

Current tests include:

- safe HTML sanitization (`src/utils/sanitize.test.js`)
- topic/read-unread highlighting behavior (`src/components/TextDisplay.test.js`)

## Dockerized Frontend Tests

A dedicated test image exists at `frontend/Dockerfile.test`.

Build and run from `/app`:

```bash
docker build -f frontend/Dockerfile.test -t frontend-tests .
docker run --rm -v "$(pwd)/frontend:/app/frontend" frontend-tests
```

To run non-coverage test mode in the same image:

```bash
docker run --rm -v "$(pwd)/frontend:/app/frontend" frontend-tests \
  sh -lc "npm ci && npm test -- --watchAll=false"
```
