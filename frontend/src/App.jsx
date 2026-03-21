import React, { useEffect, useState } from 'react';
import CachePage from './components/CachePage';
import DiffPage from './components/DiffPage';
import GlobalTopicsPage from './components/GlobalTopicsPage';
import MainPage from './components/MainPage';
import TaskControlPage from './components/TaskControlPage';
import TextListPage from './components/TextListPage';
import TextPage from './components/TextPage';
import WordPage from './components/WordPage';
import './styles/App.css';

const navigationItems = [
  { title: 'Home', link: '/page/menu', badge: 'HM', description: 'Dashboard and uploads' },
  { title: 'Texts List', link: '/page/texts', badge: 'TX', description: 'Stored submissions' },
  { title: 'Task Control', link: '/page/tasks', badge: 'TK', description: 'Queue management' },
  { title: 'Diff', link: '/page/diff', badge: 'DF', description: 'Semantic comparison' },
  { title: 'LLM Cache', link: '/page/cache', badge: 'LC', description: 'Cached generations' },
  { title: 'Global Topics', link: '/page/topics', badge: 'GT', description: 'Cross-source topics' },
];

const PAGE_COMPONENTS = {
  cache: CachePage,
  diff: DiffPage,
  menu: MainPage,
  tasks: TaskControlPage,
  text: TextPage,
  texts: TextListPage,
  topics: GlobalTopicsPage,
  word: WordPage,
};

function getSaveHintText(saveState) {
  if (saveState === 'error') {
    return 'Save failed';
  }

  return '';
}

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
  const saveHintText = settings ? getSaveHintText(saveState) : '';

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
        {saveHintText ? <span className="llm-provider-badge__hint">{saveHintText}</span> : null}
      </div>
    );
  };

  const renderWithGlobalMenu = (content, pageKey) => {
    const currentPath = window.location.pathname;

    return (
      <div className={`app-shell${pageKey === 'menu' ? ' app-shell--home' : ''}`}>
        <div className="app-shell__main">
          <div className="app-shell__topbar">
            <nav className="app-shell__topnav" aria-label="Global navigation">
              {navigationItems.map((item) => {
                const isActive = currentPath === item.link || currentPath.startsWith(`${item.link}/`);
                return (
                  <a
                    key={item.link}
                    href={item.link}
                    className={`app-shell__nav-link${isActive ? ' active' : ''}`}
                  >
                    <span className="app-shell__nav-title">{item.title}</span>
                  </a>
                );
              })}
            </nav>
            <div className="app-shell__topbar-actions">
              <div id="global-menu-portal-target" className="app-shell__portal-target" />
              {renderLLMSelector()}
            </div>
          </div>
          <main className="global-page-content">
            <div className={`page-surface${pageKey === 'menu' ? ' page-surface--home' : ''}`}>
              {content}
            </div>
          </main>
        </div>
      </div>
    );
  };

  const requestedPageKey = window.location.pathname.split('/')[2] || 'menu';
  const pageKey = PAGE_COMPONENTS[requestedPageKey] ? requestedPageKey : 'notFound';

  if (pageKey === 'notFound') {
    return renderWithGlobalMenu(<div>Page not found</div>, pageKey);
  }

  const PageComponent = PAGE_COMPONENTS[pageKey];
  return renderWithGlobalMenu(<PageComponent />, pageKey);
}

export default App;
