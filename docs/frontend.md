# Frontend Architecture Guide

Overview of `rsstag` frontend architecture, patterns, and conventions.

## 1. Core Stack
- **Framework**: React 19 (Vite 8), D3 7 (Visualizations).
- **Quality**: Vitest, React Testing Library, ESLint, Prettier.

## 2. Structure & Components
- **`src/components/`**: Feature components (`grid/`, `shared/`).
- **`src/hooks/` & `src/utils/`**: Logic and helpers.
- **`src/styles/`**: CSS (BEM-style: `.block__element--modifier`).

### Key Pages
- `MainPage` (`/page/menu`): Dashboard.
- `TextPage` (`/page/text/:id`): Analysis.
- `GlobalTopicsPage` (`/page/topics`): Multi-source exploration.
- `TaskControlPage` (`/page/tasks`): Queue management.

## 3. Patterns

### Data Fetching
Use custom hooks (`useXxxData`) with `useState/useEffect`. Handle `loading`, `error`, and `data`.
```javascript
export function useData(id) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    fetch(`/api/${id}`).then(r => r.json())
      .then(data => setState({ data, loading: false, error: null }))
      .catch(err => setState({ data: null, loading: false, error: err.message }));
  }, [id]);
  return state;
}
```

### D3 Integration
React components manage the SVG lifecycle using `useRef` and `useEffect`. Use `useContainerSize` for responsiveness.

### Security (Crucial)
**Never** use `dangerouslySetInnerHTML` without `sanitizeHtml` from `utils/sanitize`.
```jsx
<div dangerouslySetInnerHTML={{ __html: sanitizeHtml(rawContent) }} />
```

## 4. Testing & Utilities
- **Tests**: Co-locate `.test.jsx` files. Focus on: Sanitization, Highlighting, and Chart data.
- **Utilities**: Pure functions preferred (`sanitize.js`, `textHighlight.js`, `requestUtils.js`).

## 5. LLM Settings
Global provider selector in `App.jsx`. Settings are stored via `/api/settings/llm` and apply to the next background task.

## 6. Development
- **Test**: `./frontend-test.sh` (or `npm test`)
- **Lint**: `./lint.sh` (or `npm run lint`)
- **Format**: `./lint.sh format` (or `npm run format`)

---
*Note: AI agents must follow security patterns (sanitization) and use established hooks.*
