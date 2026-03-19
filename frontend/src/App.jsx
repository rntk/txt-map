import React, { useEffect, useState } from 'react';
import TextPage from './components/TextPage';
import TaskControlPage from './components/TaskControlPage';
import TextListPage from './components/TextListPage';
import MainPage from './components/MainPage';
import DiffPage from './components/DiffPage';
import CachePage from './components/CachePage';
import GlobalTopicsPage from './components/GlobalTopicsPage';
import './styles/App.css';

const navigationItems = [
  { title: 'Home', link: '/page/menu', badge: 'HM', description: 'Dashboard and uploads' },
  { title: 'Texts List', link: '/page/texts', badge: 'TX', description: 'Stored submissions' },
  { title: 'Task Control', link: '/page/tasks', badge: 'TK', description: 'Queue management' },
  { title: 'Diff', link: '/page/diff', badge: 'DF', description: 'Semantic comparison' },
  { title: 'LLM Cache', link: '/page/cache', badge: 'LC', description: 'Cached generations' },
  { title: 'Global Topics', link: '/page/topics', badge: 'GT', description: 'Cross-source topics' },
];

const routeMeta = {
  menu: {
    eyebrow: 'Editorial workspace',
    title: 'Overview',
    subtitle: 'Upload new material and move through the analysis tools from one dashboard.'
  },
  texts: {
    eyebrow: 'Submissions',
    title: 'Texts List',
    subtitle: 'Review stored submissions, statuses, metadata, and jump into individual analysis.'
  },
  tasks: {
    eyebrow: 'Operations',
    title: 'Task Control',
    subtitle: 'Manage background processing, inspect queue state, and retry work when needed.'
  },
  diff: {
    eyebrow: 'Comparison',
    title: 'Semantic Diff',
    subtitle: 'Run and inspect topic-aware diffs between any two submissions.'
  },
  cache: {
    eyebrow: 'Operations',
    title: 'LLM Cache',
    subtitle: 'Inspect cached model responses and clear stale entries without leaving the workspace.'
  },
  topics: {
    eyebrow: 'Knowledge map',
    title: 'Global Topics',
    subtitle: 'Explore themes aggregated across submissions and compare topic evidence by source.'
  },
  text: {
    eyebrow: 'Submission detail',
    title: 'Text Analysis',
    subtitle: 'Read the article, inspect summaries, and navigate topics in one focused layout.'
  },
  notFound: {
    eyebrow: 'Navigation',
    title: 'Page not found',
    subtitle: 'The requested route does not exist in this workspace.'
  }
};

function App() {
  const [settings, setSettings] = useState(null);
  const [draftProvider, setDraftProvider] = useState('');
  const [draftModel, setDraftModel] = useState('');
  const [saveState, setSaveState] = useState('idle');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
        setDraftProvider(data.llm_provider || '');
        setDraftModel(data.llm_model || '');
      })
      .catch(() => {});
  }, []);

  const providerOptions = settings?.llm_available_providers || [];
  const selectedProvider = providerOptions.find((provider) => provider.name === draftProvider) || null;
  const modelOptions = selectedProvider?.models || [];

  const hasPendingChanges = Boolean(
    settings &&
    (draftProvider !== settings.llm_provider || draftModel !== settings.llm_model)
  );

  const handleProviderChange = (event) => {
    const nextProviderName = event.target.value;
    const provider = providerOptions.find((item) => item.name === nextProviderName);
    setDraftProvider(nextProviderName);
    setDraftModel(provider?.default_model || '');
    setSaveState('idle');
  };

  const handleModelChange = (event) => {
    setDraftModel(event.target.value);
    setSaveState('idle');
  };

  const handleApply = async () => {
    if (!draftProvider || !draftModel) {
      return;
    }

    setSaveState('saving');
    try {
      const response = await fetch('/api/settings/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: draftProvider, model: draftModel }),
      });
      if (!response.ok) {
        throw new Error('Failed to update LLM settings');
      }
      const data = await response.json();
      setSettings(data);
      setDraftProvider(data.llm_provider || '');
      setDraftModel(data.llm_model || '');
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  };

  const renderLLMSelector = () => {
    if (!settings || providerOptions.length === 0) {
      return null;
    }

    return (
      <div className="llm-provider-badge" aria-label="LLM settings">
        <span className="llm-provider-badge__label">Model</span>
        <select
          aria-label="LLM provider"
          className="llm-provider-badge__select"
          value={draftProvider}
          onChange={handleProviderChange}
        >
          {providerOptions.map((provider) => (
            <option key={provider.key} value={provider.name}>
              {provider.name}
            </option>
          ))}
        </select>
        <select
          aria-label="LLM model"
          className="llm-provider-badge__select llm-provider-badge__select--model"
          value={draftModel}
          onChange={handleModelChange}
        >
          {modelOptions.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="llm-provider-badge__button"
          onClick={handleApply}
          disabled={!hasPendingChanges || saveState === 'saving' || !draftProvider || !draftModel}
        >
          {saveState === 'saving' ? 'Saving...' : 'Apply'}
        </button>
        <span className="llm-provider-badge__hint">
          {saveState === 'error'
            ? 'Save failed'
            : settings.llm_applies_on_next_task
              ? 'Applies on next task'
              : ''}
        </span>
      </div>
    );
  };

  const renderWithGlobalMenu = (content, pageKey) => {
    const currentPath = window.location.pathname;
    const meta = routeMeta[pageKey] || routeMeta.notFound;

    return (
        <div className={`app-shell${pageKey === 'menu' ? ' app-shell--home' : ''}`}>
        <div className="app-shell__main">
          <nav className="app-shell__topbar" aria-label="Global navigation">
            <div className="app-shell__topnav">
            {navigationItems.map((item) => {
              const isActive = currentPath === item.link || currentPath.startsWith(`${item.link}/`);
              return (
                <a
                  key={item.link}
                  href={item.link}
                  className={`app-shell__nav-link${isActive ? ' active' : ''}`}
                >
                  <span className="app-shell__nav-icon" aria-hidden="true">{item.badge}</span>
                  <span className="app-shell__nav-title">{item.title}</span>
                </a>
              );
            })}
            </div>
          </nav>
          <header className="app-shell__header">
            <div className="app-shell__header-main">
              <div className="app-shell__title-group">
                <span className="app-shell__eyebrow">{meta.eyebrow}</span>
                <h1 className="app-shell__title">{meta.title}</h1>
                <p className="app-shell__subtitle">{meta.subtitle}</p>
              </div>
            </div>
            <div className="app-shell__header-actions">
              <div id="global-menu-portal-target" className="app-shell__portal-target" />
              {renderLLMSelector()}
            </div>
          </header>
          <main className="global-page-content">
            <div className={`page-surface${pageKey === 'menu' ? ' page-surface--home' : ''}`}>
              {content}
            </div>
          </main>
        </div>
      </div>
    );
  };

  const pathname = window.location.pathname;
  const pathParts = pathname.split('/');
  const pageType = pathParts[2];

  if (!pageType || pageType === 'menu') {
    return renderWithGlobalMenu(<MainPage />, 'menu');
  }

  if (pageType === 'tasks') {
    return renderWithGlobalMenu(<TaskControlPage />, 'tasks');
  }

  if (pageType === 'texts') {
    return renderWithGlobalMenu(<TextListPage />, 'texts');
  }

  if (pageType === 'diff') {
    return renderWithGlobalMenu(<DiffPage />, 'diff');
  }

  if (pageType === 'cache') {
    return renderWithGlobalMenu(<CachePage />, 'cache');
  }

  if (pageType === 'topics') {
    return renderWithGlobalMenu(<GlobalTopicsPage />, 'topics');
  }

  if (pageType === 'text') {
    return renderWithGlobalMenu(<TextPage />, 'text');
  }

  return renderWithGlobalMenu(<div>Page not found</div>, 'notFound');
}

export default App;
