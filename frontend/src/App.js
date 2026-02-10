import React from 'react';
import TextPage from './components/TextPage';
import TaskControlPage from './components/TaskControlPage';
import TextListPage from './components/TextListPage';
import MainPage from './components/MainPage';
import './styles/App.css';

const globalMenuItems = [
  { title: 'Home', link: '/page/menu' },
  { title: 'Texts List', link: '/page/texts' },
  { title: 'Task Control', link: '/page/tasks' }
];

function App() {
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

  // Text submission page
  if (pageType === 'text') {
    return renderWithGlobalMenu(<TextPage />);
  }

  // Default fallback
  return renderWithGlobalMenu(<div>Page not found</div>);
}

export default App;
