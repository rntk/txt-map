import React, { useCallback, useEffect, useState } from "react";
import "../styles/TokensPage.css";

/**
 * @typedef {Object} Token
 * @property {string} id
 * @property {string} alias
 * @property {string} notes
 * @property {string} created_at
 * @property {string} created_by
 */

/**
 * @typedef {Object} NewTokenResult
 * @property {string} token
 * @property {string} alias
 * @property {string} notes
 * @property {string} created_at
 */

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
 * Copy text to clipboard.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tokens management page for superusers.
 * @returns {React.JSX.Element}
 */
function TokensPage() {
  const [tokens, setTokens] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newToken, setNewToken] = useState(null);
  const [copied, setCopied] = useState(false);

  // Form state
  const [alias, setAlias] = useState("");
  const [notes, setNotes] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Fetch tokens
  const fetchTokens = useCallback(async () => {
    try {
      const response = await fetch("/api/tokens", {
        credentials: "include",
      });

      if (response.status === 403) {
        setIsSuperuser(false);
        setError("Access denied. Superuser privileges required.");
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch tokens");
      }

      const data = await response.json();
      setTokens(data.tokens || []);
      setIsSuperuser(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  // Check auth config
  useEffect(() => {
    fetch("/api/auth/config", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (!data.enabled) {
          setError(
            "Authentication is disabled. Token management is not available.",
          );
        }
      })
      .catch(() => {});
  }, []);

  const handleCreateToken = async (event) => {
    event.preventDefault();
    const trimmedAlias = alias.trim();

    if (!trimmedAlias) {
      setError("Please enter an alias for the token");
      return;
    }

    setIsCreating(true);
    setError("");

    try {
      const response = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          alias: trimmedAlias,
          notes: notes.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to create token");
      }

      const data = await response.json();
      setNewToken(data);
      setAlias("");
      setNotes("");
      setShowCreateForm(false);
      await fetchTokens();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteToken = async (tokenId) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this token? This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/tokens/${tokenId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to delete token");
      }

      await fetchTokens();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCopyToken = async () => {
    if (!newToken?.token) return;
    const success = await copyToClipboard(newToken.token);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCloseNewToken = () => {
    setNewToken(null);
  };

  if (isLoading) {
    return (
      <div className="tokens-page">
        <div className="tokens-page__loading">Loading...</div>
      </div>
    );
  }

  if (!isSuperuser) {
    return (
      <div className="tokens-page">
        <div className="tokens-page__error">
          <h2>Access Denied</h2>
          <p>{error || "You need superuser privileges to access this page."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tokens-page">
      <div className="tokens-page__header">
        <span className="tokens-page__eyebrow">Administration</span>
        <h1 className="tokens-page__title">Token Management</h1>
        <p className="tokens-page__description">
          Create and manage access tokens for other users. Each token can only
          be viewed once upon creation.
        </p>
      </div>

      {error && (
        <div className="tokens-page__alert" role="alert">
          {error}
        </div>
      )}

      {/* New Token Display Modal */}
      {newToken && (
        <div className="tokens-page__modal-overlay">
          <div className="tokens-page__modal">
            <h3 className="tokens-page__modal-title">
              Token Created Successfully
            </h3>
            <p className="tokens-page__modal-description">
              Copy this token now. It will not be shown again.
            </p>
            <div className="tokens-page__token-display">
              <code className="tokens-page__token-value">{newToken.token}</code>
              <button
                type="button"
                className="tokens-page__copy-btn"
                onClick={handleCopyToken}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="tokens-page__token-meta">
              <span>
                <strong>Alias:</strong> {newToken.alias}
              </span>
              <span>
                <strong>Notes:</strong> {newToken.notes || "-"}
              </span>
            </div>
            <button
              type="button"
              className="tokens-page__modal-close"
              onClick={handleCloseNewToken}
            >
              I&apos;ve copied the token
            </button>
          </div>
        </div>
      )}

      {/* Create Token Form */}
      {showCreateForm && (
        <div className="tokens-page__form-container">
          <h3 className="tokens-page__form-title">Create New Token</h3>
          <form className="tokens-page__form" onSubmit={handleCreateToken}>
            <div className="tokens-page__form-group">
              <label htmlFor="token-alias" className="tokens-page__form-label">
                Alias / User Name *
              </label>
              <input
                id="token-alias"
                type="text"
                className="tokens-page__form-input"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="e.g., John Doe, External Collaborator"
                disabled={isCreating}
                required
              />
            </div>
            <div className="tokens-page__form-group">
              <label htmlFor="token-notes" className="tokens-page__form-label">
                Notes (optional)
              </label>
              <textarea
                id="token-notes"
                className="tokens-page__form-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional information about this token..."
                disabled={isCreating}
                rows={3}
              />
            </div>
            <div className="tokens-page__form-actions">
              <button
                type="button"
                className="tokens-page__btn tokens-page__btn--secondary"
                onClick={() => setShowCreateForm(false)}
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="tokens-page__btn tokens-page__btn--primary"
                disabled={isCreating || !alias.trim()}
              >
                {isCreating ? "Creating..." : "Create Token"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tokens Table */}
      <div className="tokens-page__content">
        <div className="tokens-page__toolbar">
          {!showCreateForm && (
            <button
              type="button"
              className="tokens-page__btn tokens-page__btn--primary"
              onClick={() => setShowCreateForm(true)}
            >
              + Create New Token
            </button>
          )}
        </div>

        {tokens.length === 0 ? (
          <div className="tokens-page__empty">
            <p>No tokens created yet.</p>
            <p>Click &quot;Create New Token&quot; to add your first token.</p>
          </div>
        ) : (
          <div className="tokens-page__table-container">
            <table className="tokens-page__table">
              <thead>
                <tr>
                  <th>Alias</th>
                  <th>Notes</th>
                  <th>Created By</th>
                  <th>Created At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.id}>
                    <td className="tokens-page__cell-alias">{token.alias}</td>
                    <td className="tokens-page__cell-notes">
                      {token.notes || "-"}
                    </td>
                    <td>{token.created_by || "-"}</td>
                    <td>{formatDate(token.created_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="tokens-page__delete-btn"
                        onClick={() => handleDeleteToken(token.id)}
                        title="Delete token"
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

export default TokensPage;
