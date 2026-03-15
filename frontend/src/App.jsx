import React, { useState, useEffect } from 'react';
import TextPage from './components/TextPage';
import TaskControlPage from './components/TaskControlPage';
import TextListPage from './components/TextListPage';
import MainPage from './components/MainPage';
import DiffPage from './components/DiffPage';
import CachePage from './components/CachePage';
import './styles/App.css';

const globalMenuItems = [
  { title: 'Home', link: '/page/menu' },
  { title: 'Texts List', link: '/page/texts' },
  { title: 'Task Control', link: '/page/tasks' },
  { title: 'Diff', link: '/page/diff' },
  { title: 'LLM Cache', link: '/page/cache' },
];

function App() {
  const [llmProvider, setLlmProvider] = useState(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => setLlmProvider(data.llm_provider))
      .catch(() => {});
  }, []);

  const renderWithGlobalMenu = (content) => {
    const currentPath = window.location.pathname;

    return (
      <>
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
          {llmProvider && (
            <span className="llm-provider-badge" style={{ marginLeft: '10px' }}>LLM: {llmProvider}</span>
          )}
        </nav>
        <main className="global-page-content">{content}</main>
      </>
    );
  };

  // Determine which page to render based on URL
  const pathname = window.location.pathname;
  const pathParts = pathname.split('/');
  const pageType = pathParts[2];

  // Home page
  if (!pageType || pageType === 'menu') {
    return <MainPage />;
  }

  // Task control page
  if (pageType === 'tasks') {
    return renderWithGlobalMenu(<TaskControlPage />);
  }

  // Texts list page
  if (pageType === 'texts') {
    return renderWithGlobalMenu(<TextListPage />);
  }

  // Diff page
  if (pageType === 'diff') {
    return renderWithGlobalMenu(<DiffPage />);
  }

  // LLM Cache page
  if (pageType === 'cache') {
    return renderWithGlobalMenu(<CachePage />);
  }

  // Text submission page
  if (pageType === 'text') {
    return renderWithGlobalMenu(<TextPage />);
  }

  // Default fallback
  return renderWithGlobalMenu(<div>Page not found</div>);
}

export default App;
