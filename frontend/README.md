# Frontend (React)

This frontend renders analysis pages and task/submission management views. It is served by FastAPI from `frontend/build` in production and can run standalone in development.

## Paths and Views

Main entry: `frontend/src/App.jsx`

Key pages:

- `/page/menu`: dashboard menu
- `/page/text/{submission_id}`: submission result view with live status polling
- `/page/tasks`: task queue management view
- `/page/texts`: submission list view
- `/page/diff`: semantic diff view for comparing two submissions
- `/page/topics`: global topics view
- `/page/cache`: LLM cache management view

## Development Commands

From `/app/frontend`:

```bash
npm install
npm run dev
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

Using the helper script (recommended):

```bash
# From /app directory
./frontend-test.sh                    # Run all tests once
./frontend-test.sh src/App.test.jsx   # Run a specific test target
./frontend-test.sh --coverage         # Run with coverage report
./frontend-test.sh --rebuild          # Rebuild image and refresh cached deps when using Docker
```

The helper runs tests directly inside agent/container environments when local Node tooling is available, and otherwise uses Docker.

Current tests include (22 test files):

- **Components**: `ArticleStructureChart`, `CircularPackingChart`, `RadarChart`, `TextDisplay`, `TextPage`, `TopicList`, `TopicsBarChart`, `TopicsRiverChart`, `App`, and shared components (`RefreshButton`, `TopicLevelSwitcher`)
- **Hooks**: `useGlobalChartData`, `useTooltip`
- **Utils**: `chartConstants`, `diffRowBuilder`, `diffUtils`, `gridUtils`, `sanitize`, `summaryMatcher`, `summaryTimeline`, `textHighlight`, `topicTree`

## Linting and Formatting

From `/app/frontend`:

```bash
npm run lint          # Run ESLint
npm run lint:fix      # Auto-fix ESLint issues
npm run format        # Run Prettier formatting
```

Using the helper script (recommended):

```bash
# From /app directory
./lint.sh                # Run all lint checks
./lint.sh check frontend # Frontend lint checks only
./lint.sh fix frontend   # Auto-fix frontend lint issues
./lint.sh format         # Format backend and frontend code
```

The helper runs local tools directly inside agent/container environments when available.

## Dockerized Frontend Tests

A dedicated test image exists at `frontend/Dockerfile.test`.

Build and run from `/app`:

```bash
docker build -f frontend/Dockerfile.test -t frontend-tests .
./frontend-test.sh --rebuild
```

For uncommon Vitest flags, run directly from `/app/frontend`:

```bash
npm test -- --watchAll=false
```
