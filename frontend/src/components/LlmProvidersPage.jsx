import React, { useCallback, useEffect, useState } from "react";
import "../styles/LlmProvidersPage.css";

/** @type {readonly {value: string, label: string}[]} */
const PROVIDER_TYPES = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai_comp", label: "OpenAI Compatible" },
];

/**
 * Format date string for display.
 * @param {string} dateString
 * @returns {string}
 */
function formatDate(dateString) {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  } catch {
    return dateString;
  }
}

/**
 * LLM Providers management page.
 * @returns {React.JSX.Element}
 */
function LlmProvidersPage() {
  const [providers, setProviders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [providerType, setProviderType] = useState("openai_comp");
  const [model, setModel] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const fetchProviders = useCallback(async () => {
    try {
      const response = await fetch("/api/llm-providers", {
        credentials: "include",
      });

      if (response.status === 403) {
        setIsSuperuser(false);
        setError("Access denied. Superuser privileges required.");
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch providers");
      }

      const data = await response.json();
      setProviders(data.providers || []);
      setEncryptionAvailable(data.encryption_available);
      setIsSuperuser(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const resetForm = () => {
    setName("");
    setProviderType("openai_comp");
    setModel("");
    setUrl("");
    setToken("");
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setIsCreating(true);
    setError("");

    try {
      const body = {
        name: name.trim(),
        type: providerType,
        model: model.trim(),
        token: token.trim() || null,
        url: url.trim() || null,
      };

      const response = await fetch("/api/llm-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to create provider");
      }

      resetForm();
      setShowCreateForm(false);
      await fetchProviders();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (providerId) => {
    if (!window.confirm("Are you sure you want to delete this provider?")) {
      return;
    }

    try {
      const response = await fetch(`/api/llm-providers/${providerId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to delete provider");
      }

      await fetchProviders();
    } catch (err) {
      setError(err.message);
    }
  };

  if (isLoading) {
    return (
      <div className="llm-providers-page">
        <div className="llm-providers-page__loading">Loading...</div>
      </div>
    );
  }

  if (!isSuperuser) {
    return (
      <div className="llm-providers-page">
        <div className="llm-providers-page__error">
          <h2>Access Denied</h2>
          <p>{error || "You need superuser privileges to access this page."}</p>
        </div>
      </div>
    );
  }

  const canCreate = name.trim() && model.trim();

  return (
    <div className="llm-providers-page">
      <div className="llm-providers-page__header">
        <span className="llm-providers-page__eyebrow">Administration</span>
        <h1 className="llm-providers-page__title">LLM Providers</h1>
        <p className="llm-providers-page__description">
          Add custom LLM providers with their API tokens encrypted at rest.
          Providers appear in the global model selector once created.
        </p>
      </div>

      {!encryptionAvailable && (
        <div className="llm-providers-page__warning" role="alert">
          The <code>LLM_PROVIDERS_SECRET</code> environment variable is not set.
          Provider management is disabled until it is configured.
        </div>
      )}

      {error && (
        <div className="llm-providers-page__alert" role="alert">
          {error}
        </div>
      )}

      {/* Create Form */}
      {showCreateForm && encryptionAvailable && (
        <div className="llm-providers-page__form-container">
          <h3 className="llm-providers-page__form-title">Add New Provider</h3>
          <form className="llm-providers-page__form" onSubmit={handleCreate}>
            <div className="llm-providers-page__form-row">
              <div className="llm-providers-page__form-group">
                <label
                  htmlFor="provider-name"
                  className="llm-providers-page__form-label"
                >
                  Name *
                </label>
                <input
                  id="provider-name"
                  type="text"
                  className="llm-providers-page__form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., My Llama Server"
                  disabled={isCreating}
                  required
                />
              </div>
              <div className="llm-providers-page__form-group">
                <label
                  htmlFor="provider-type"
                  className="llm-providers-page__form-label"
                >
                  Type *
                </label>
                <select
                  id="provider-type"
                  className="llm-providers-page__form-select"
                  value={providerType}
                  onChange={(e) => setProviderType(e.target.value)}
                  disabled={isCreating}
                >
                  {PROVIDER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <span className="llm-providers-page__form-hint">
                  openai/anthropic for official APIs, OpenAI Compatible for
                  llamacpp and similar
                </span>
              </div>
            </div>

            <div className="llm-providers-page__form-row">
              <div className="llm-providers-page__form-group">
                <label
                  htmlFor="provider-model"
                  className="llm-providers-page__form-label"
                >
                  Model *
                </label>
                <input
                  id="provider-model"
                  type="text"
                  className="llm-providers-page__form-input"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g., llama-3.2, gpt-4o"
                  disabled={isCreating}
                  required
                />
              </div>
              <div className="llm-providers-page__form-group">
                <label
                  htmlFor="provider-url"
                  className="llm-providers-page__form-label"
                >
                  Base URL
                </label>
                <input
                  id="provider-url"
                  type="url"
                  className="llm-providers-page__form-input"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="http://localhost:8080 (leave empty for SDK default)"
                  disabled={isCreating}
                />
              </div>
            </div>

            <div className="llm-providers-page__form-group">
              <label
                htmlFor="provider-token"
                className="llm-providers-page__form-label"
              >
                API Token
              </label>
              <input
                id="provider-token"
                type="password"
                className="llm-providers-page__form-input"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="sk-... (leave empty if not required)"
                disabled={isCreating}
              />
              <span className="llm-providers-page__form-hint">
                If provided, stored encrypted using LLM_PROVIDERS_SECRET
              </span>
            </div>

            <div className="llm-providers-page__form-actions">
              <button
                type="button"
                className="llm-providers-page__btn llm-providers-page__btn--secondary"
                onClick={() => {
                  setShowCreateForm(false);
                  resetForm();
                }}
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="llm-providers-page__btn llm-providers-page__btn--primary"
                disabled={isCreating || !canCreate}
              >
                {isCreating ? "Creating..." : "Add Provider"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Providers Table */}
      <div>
        <div className="llm-providers-page__toolbar">
          {!showCreateForm && encryptionAvailable && (
            <button
              type="button"
              className="llm-providers-page__btn llm-providers-page__btn--primary"
              onClick={() => setShowCreateForm(true)}
            >
              + Add Provider
            </button>
          )}
        </div>

        {providers.length === 0 ? (
          <div className="llm-providers-page__empty">
            <p>No custom providers configured yet.</p>
            {encryptionAvailable && (
              <p>Click &quot;Add Provider&quot; to register an LLM endpoint.</p>
            )}
          </div>
        ) : (
          <div className="llm-providers-page__table-container">
            <table className="llm-providers-page__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Remote ID</th>
                  <th>Type</th>
                  <th>Model</th>
                  <th>URL</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr key={provider._id}>
                    <td className="llm-providers-page__cell-name">
                      {provider.name}
                    </td>
                    <td className="llm-providers-page__cell-key">
                      custom:{provider._id}
                    </td>
                    <td>
                      <span className="llm-providers-page__type-badge">
                        {provider.type}
                      </span>
                    </td>
                    <td>{provider.model}</td>
                    <td className="llm-providers-page__cell-url">
                      {provider.url || "-"}
                    </td>
                    <td>{formatDate(provider.created_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="llm-providers-page__delete-btn"
                        onClick={() => handleDelete(provider._id)}
                        title="Delete provider"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default LlmProvidersPage;
