import React, { useEffect, useState } from 'react';
import TextPage from './components/TextPage';
import TaskControlPage from './components/TaskControlPage';
import TextListPage from './components/TextListPage';
import MainPage from './components/MainPage';
import DiffPage from './components/DiffPage';
import CachePage from './components/CachePage';
import GlobalTopicsPage from './components/GlobalTopicsPage';
import './styles/App.css';

const globalMenuItems = [
  { title: 'Home', link: '/page/menu' },
  { title: 'Texts List', link: '/page/texts' },
  { title: 'Task Control', link: '/page/tasks' },
  { title: 'Diff', link: '/page/diff' },
  { title: 'LLM Cache', link: '/page/cache' },
  { title: 'Global Topics', link: '/page/topics' },
];

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
      <div className="llm-provider-badge">
        <span className="llm-provider-badge__label">LLM</span>
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

  const renderWithGlobalMenu = (content) => {
    const currentPath = window.location.pathname;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <nav className="global-menu" aria-label="Global navigation">
          <div className="global-menu-links">
            {globalMenuItems.map((item) => {
              const isActive = currentPath === item.link || currentPath.startsWith(`${item.link}/`);
              return (
                <a
                  key={item.link}
                  href={item.link}
                  className={`global-menu-link${isActive ? ' active' : ''}`}
                >
                  {item.title}
                </a>
              );
            })}
          </div>
          <div id="global-menu-portal-target" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}></div>
          {renderLLMSelector()}
        </nav>
        <main className="global-page-content">{content}</main>
      </div>
    );
  };

  const pathname = window.location.pathname;
  const pathParts = pathname.split('/');
  const pageType = pathParts[2];

  if (!pageType || pageType === 'menu') {
    return <MainPage />;
  }

  if (pageType === 'tasks') {
    return renderWithGlobalMenu(<TaskControlPage />);
  }

  if (pageType === 'texts') {
    return renderWithGlobalMenu(<TextListPage />);
  }

  if (pageType === 'diff') {
    return renderWithGlobalMenu(<DiffPage />);
  }

  if (pageType === 'cache') {
    return renderWithGlobalMenu(<CachePage />);
  }

  if (pageType === 'topics') {
    return renderWithGlobalMenu(<GlobalTopicsPage />);
  }

  if (pageType === 'text') {
    return renderWithGlobalMenu(<TextPage />);
  }

  return renderWithGlobalMenu(<div>Page not found</div>);
}

export default App;
