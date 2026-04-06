import React, { useCallback, useEffect, useState } from "react";
import CachePage from "./components/CachePage";
import DiffPage from "./components/DiffPage";
import GlobalTopicsPage from "./components/GlobalTopicsPage";
import LoginPage from "./components/LoginPage";
import MainPage from "./components/MainPage";
import TaskControlPage from "./components/TaskControlPage";
import LlmTaskControlPage from "./components/LlmTaskControlPage";
import TextListPage from "./components/TextListPage";
import TextPage from "./components/TextPage";
import TokensPage from "./components/TokensPage";
import WordPage from "./components/WordPage";
import TopicAnalysisPage from "./components/TopicAnalysisPage";

/**
 * @typedef {Object} NavigationItem
 * @property {string} title
 * @property {string} link
 * @property {string} badge
 * @property {string} description
 */

/**
 * @typedef {Object} LlmProvider
 * @property {string} key
 * @property {string} name
 * @property {string[]} models
 * @property {string} default_model
 */

/**
 * @typedef {Object} LlmSettings
 * @property {string} llm_provider
 * @property {string} llm_model
 * @property {LlmProvider[]} [llm_available_providers]
 */

/**
 * @typedef {Object} ShellLinkProps
 * @property {NavigationItem} item
 * @property {string} currentPath
 */

/**
 * @typedef {Object} LlmSelectorProps
 * @property {LlmSettings | null} settings
 * @property {string} draftProvider
 * @property {string} draftModel
 * @property {string} saveState
 * @property {boolean} hasPendingChanges
 * @property {(event: React.ChangeEvent<HTMLSelectElement>) => void} onProviderChange
 * @property {(event: React.ChangeEvent<HTMLSelectElement>) => void} onModelChange
 * @property {() => Promise<void>} onApply
 */

/**
 * @typedef {Object} AppShellProps
 * @property {string} pageKey
 * @property {string} currentPath
 * @property {React.ReactNode} content
 * @property {React.ReactNode} [actions]
 * @property {boolean} isAuthenticated
 * @property {boolean} isSuperuser
 * @property {() => void} onLogout
 */

/**
 * @typedef {Object} AuthState
 * @property {boolean} isAuthenticated
 * @property {boolean} isSuperuser
 * @property {string | null} alias
 * @property {boolean} isLoading
 * @property {boolean} authEnabled
 */

/** @type {readonly NavigationItem[]} */
const navigationItems = [
  {
    title: "Home",
    link: "/page/menu",
    badge: "HM",
    description: "Dashboard and uploads",
  },
  {
    title: "Texts List",
    link: "/page/texts",
    badge: "TX",
    description: "Stored submissions",
  },
  {
    title: "Task Control",
    link: "/page/tasks",
    badge: "TK",
    description: "Queue management",
  },
  {
    title: "LLM Tasks",
    link: "/page/llm-tasks",
    badge: "LT",
    description: "LLM queue management",
  },
  {
    title: "Diff",
    link: "/page/diff",
    badge: "DF",
    description: "Semantic comparison",
  },
  {
    title: "LLM Cache",
    link: "/page/cache",
    badge: "LC",
    description: "Cached generations",
  },
  {
    title: "Global Topics",
    link: "/page/topics",
    badge: "GT",
    description: "Cross-source topics",
  },
];

const PAGE_COMPONENTS = {
  cache: CachePage,
  diff: DiffPage,
  login: LoginPage,
  menu: MainPage,
  tasks: TaskControlPage,
  "llm-tasks": LlmTaskControlPage,
  text: TextPage,
  texts: TextListPage,
  tokens: TokensPage,
  topics: GlobalTopicsPage,
  word: WordPage,
  "topic-analysis": TopicAnalysisPage,
};

/**
 * @param {string} saveState
 * @returns {string}
 */
function getSaveHintText(saveState) {
  if (saveState === "error") {
    return "Save failed";
  }

  return "";
}

/**
 * @param {ShellLinkProps} props
 * @returns {React.JSX.Element}
 */
function ShellNavLink({ item, currentPath }) {
  const isActive =
    currentPath === item.link || currentPath.startsWith(`${item.link}/`);

  return (
    <a
      href={item.link}
      className={`app-shell__nav-link${isActive ? " active" : ""}`}
      aria-current={isActive ? "page" : undefined}
    >
      <span className="app-shell__nav-title">{item.title}</span>
    </a>
  );
}

/**
 * @param {LlmSelectorProps} props
 * @returns {React.JSX.Element | null}
 */
function LlmSelector({
  settings,
  draftProvider,
  draftModel,
  saveState,
  hasPendingChanges,
  onProviderChange,
  onModelChange,
  onApply,
}) {
  const providerOptions = settings?.llm_available_providers || [];
  const selectedProvider =
    providerOptions.find((provider) => provider.name === draftProvider) || null;
  const modelOptions = selectedProvider?.models || [];
  const saveHintText = settings ? getSaveHintText(saveState) : "";

  if (!settings || providerOptions.length === 0) {
    return null;
  }

  return (
    <div className="llm-provider-badge" aria-label="LLM settings">
      <select
        aria-label="LLM provider"
        className="llm-provider-badge__select"
        value={draftProvider}
        onChange={onProviderChange}
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
        onChange={onModelChange}
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
        onClick={onApply}
        disabled={
          !hasPendingChanges ||
          saveState === "saving" ||
          !draftProvider ||
          !draftModel
        }
      >
        {saveState === "saving" ? "Saving..." : "Apply"}
      </button>
      {saveHintText ? (
        <span className="llm-provider-badge__hint">{saveHintText}</span>
      ) : null}
    </div>
  );
}

/**
 * @param {AppShellProps} props
 * @returns {React.JSX.Element}
 */
function AppShell({
  pageKey,
  currentPath,
  content,
  actions,
  isAuthenticated,
  isSuperuser,
  onLogout,
}) {
  // Build navigation items based on auth state
  const navItems = [...navigationItems];

  // Add Tokens page for superuser
  if (isSuperuser) {
    navItems.push({
      title: "Tokens",
      link: "/page/tokens",
      badge: "TK",
      description: "Token management",
    });
  }

  return (
    <div className={`app-shell${pageKey === "menu" ? " app-shell--home" : ""}`}>
      <div className="app-shell__main">
        <div className="app-shell__topbar">
          <nav className="app-shell__topnav" aria-label="Global navigation">
            {navItems.map((item) => (
              <ShellNavLink
                key={item.link}
                item={item}
                currentPath={currentPath}
              />
            ))}
          </nav>
          <div className="app-shell__topbar-actions">
            <div
              id="global-menu-portal-target"
              className="app-shell__portal-target"
            />
            {actions}
            {isAuthenticated && (
              <button
                type="button"
                className="app-shell__logout-btn"
                onClick={onLogout}
                title="Sign out"
              >
                Logout
              </button>
            )}
          </div>
        </div>
        <main className="global-page-content">
          <div
            className={`page-surface${pageKey === "menu" ? " page-surface--home" : ""}`}
          >
            {content}
          </div>
        </main>
      </div>
    </div>
  );
}

function App() {
  const currentPath = window.location.pathname;
  const [settings, setSettings] = useState(null);
  const [draftProvider, setDraftProvider] = useState("");
  const [draftModel, setDraftModel] = useState("");
  const [saveState, setSaveState] = useState("idle");

  // Auth state
  const [auth, setAuth] = useState({
    isAuthenticated: false,
    isSuperuser: false,
    alias: null,
    isLoading: true,
    authEnabled: false,
  });

  // Check authentication status
  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/verify", {
        credentials: "include",
      });

      if (!response.ok) {
        // Check if auth is enabled
        const configResponse = await fetch("/api/auth/config", {
          credentials: "include",
        });
        const config = await configResponse.json();

        setAuth({
          isAuthenticated: false,
          isSuperuser: false,
          alias: null,
          isLoading: false,
          authEnabled: config.enabled,
        });
        return;
      }

      const data = await response.json();
      setAuth({
        isAuthenticated: data.authenticated,
        isSuperuser: data.is_superuser,
        alias: data.alias,
        isLoading: false,
        authEnabled: true,
      });
    } catch {
      // On network error, assume auth is enabled to be safe.
      // This prevents bypassing auth due to transient errors.
      // Keep isLoading true to prevent flashing unauthenticated UI.
      setAuth({
        isAuthenticated: false,
        isSuperuser: false,
        alias: null,
        isLoading: true,
        authEnabled: true,
      });
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Handle redirect to login in useEffect, not during render
  useEffect(() => {
    if (auth.authEnabled && !auth.isAuthenticated && !auth.isLoading) {
      const requestedPageKey = window.location.pathname.split("/")[2] || "menu";
      if (requestedPageKey !== "login") {
        window.location.href = "/page/login";
      }
    }
  }, [auth.authEnabled, auth.isAuthenticated, auth.isLoading]);

  // Load LLM settings
  useEffect(() => {
    fetch("/api/settings", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
        setDraftProvider(data.llm_provider || "");
        setDraftModel(data.llm_model || "");
      })
      .catch(() => {});
  }, []);

  const hasPendingChanges = Boolean(
    settings &&
    (draftProvider !== settings.llm_provider ||
      draftModel !== settings.llm_model),
  );

  /**
   * @param {React.ChangeEvent<HTMLSelectElement>} event
   * @returns {void}
   */
  const handleProviderChange = (event) => {
    const nextProviderName = event.target.value;
    const provider = settings?.llm_available_providers?.find(
      (item) => item.name === nextProviderName,
    );
    setDraftProvider(nextProviderName);
    setDraftModel(provider?.default_model || "");
    setSaveState("idle");
  };

  /**
   * @param {React.ChangeEvent<HTMLSelectElement>} event
   * @returns {void}
   */
  const handleModelChange = (event) => {
    setDraftModel(event.target.value);
    setSaveState("idle");
  };

  /**
   * @returns {Promise<void>}
   */
  const handleApply = async () => {
    if (!draftProvider || !draftModel) {
      return;
    }

    setSaveState("saving");
    try {
      const response = await fetch("/api/settings/llm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider: draftProvider, model: draftModel }),
      });
      if (!response.ok) {
        throw new Error("Failed to update LLM settings");
      }
      const data = await response.json();
      setSettings(data);
      setDraftProvider(data.llm_provider || "");
      setDraftModel(data.llm_model || "");
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  /**
   * Handle logout
   * @returns {Promise<void>}
   */
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Ignore errors
    }
    // Clear auth state and redirect to login
    setAuth({
      isAuthenticated: false,
      isSuperuser: false,
      alias: null,
      isLoading: false,
      authEnabled: auth.authEnabled,
    });
    window.location.href = "/page/login";
  };

  /**
   * Handle successful login
   */
  const handleLoginSuccess = () => {
    checkAuth();
  };

  const requestedPageKey = currentPath.split("/")[2] || "menu";
  const pageKey = PAGE_COMPONENTS[requestedPageKey]
    ? requestedPageKey
    : "notFound";

  // Show loading state
  if (auth.isLoading) {
    return (
      <div className="app-shell">
        <div className="app-shell__main">
          <div className="page-surface page-surface--centered">
            <div className="loading-message">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  // Show redirecting state if auth is required but user is not authenticated.
  // The actual redirect is handled by useEffect.
  if (auth.authEnabled && !auth.isAuthenticated && pageKey !== "login") {
    return (
      <div className="app-shell">
        <div className="app-shell__main">
          <div className="page-surface page-surface--centered">
            <div className="loading-message">Redirecting to login...</div>
          </div>
        </div>
      </div>
    );
  }

  if (pageKey === "notFound") {
    return (
      <AppShell
        currentPath={currentPath}
        pageKey={pageKey}
        content={<div>Page not found</div>}
        isAuthenticated={auth.isAuthenticated}
        isSuperuser={auth.isSuperuser}
        onLogout={handleLogout}
      />
    );
  }

  const PageComponent = PAGE_COMPONENTS[pageKey];

  // Pass auth props to MainPage
  const pageProps =
    pageKey === "menu"
      ? {
          isSuperuser: auth.isSuperuser,
          isAuthenticated: auth.isAuthenticated,
          onLogout: handleLogout,
        }
      : pageKey === "login"
        ? { onLoginSuccess: handleLoginSuccess }
        : {};

  const llmSelector = (
    <LlmSelector
      settings={settings}
      draftProvider={draftProvider}
      draftModel={draftModel}
      saveState={saveState}
      hasPendingChanges={hasPendingChanges}
      onProviderChange={handleProviderChange}
      onModelChange={handleModelChange}
      onApply={handleApply}
    />
  );

  return (
    <AppShell
      currentPath={currentPath}
      pageKey={pageKey}
      actions={llmSelector}
      content={<PageComponent {...pageProps} />}
      isAuthenticated={auth.isAuthenticated}
      isSuperuser={auth.isSuperuser}
      onLogout={handleLogout}
    />
  );
}

export default App;
