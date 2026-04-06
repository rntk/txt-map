import React, { useState } from "react";
import "../styles/LoginPage.css";

/**
 * @typedef {Object} LoginPageProps
 * @property {() => void} [onLoginSuccess] - Callback after successful login
 */

/**
 * Login page component for token-based authentication.
 * @param {LoginPageProps} props
 * @returns {React.JSX.Element}
 */
function LoginPage({ onLoginSuccess }) {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedToken = token.trim();

    if (!trimmedToken) {
      setError("Please enter a token");
      return;
    }

    setStatus("loading");
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: trimmedToken }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Invalid token");
      }

      const data = await response.json();

      if (data.success) {
        setStatus("success");
        if (onLoginSuccess) {
          onLoginSuccess();
        } else {
          // Redirect to home page
          window.location.href = "/page/menu";
        }
      } else {
        throw new Error("Login failed");
      }
    } catch (err) {
      setStatus("error");
      setError(err.message || "Login failed. Please check your token.");
    }
  };

  return (
    <div className="login-page">
      <div className="login-page__card">
        <div className="login-page__header">
          <span className="login-page__eyebrow">Authentication</span>
          <h1 className="login-page__title">Enter Access Token</h1>
          <p className="login-page__description">
            Please enter your access token to continue. Contact your
            administrator if you need a token.
          </p>
        </div>

        <form className="login-page__form" onSubmit={handleSubmit}>
          <div className="login-page__input-group">
            <label htmlFor="token-input" className="login-page__label">
              Access Token
            </label>
            <input
              id="token-input"
              type="password"
              className="login-page__input"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                if (error) setError("");
              }}
              placeholder="Enter your token..."
              disabled={status === "loading"}
              autoComplete="off"
              aria-describedby={error ? "token-error" : undefined}
            />
          </div>

          {error && (
            <div id="token-error" className="login-page__error" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="login-page__submit"
            disabled={status === "loading" || !token.trim()}
          >
            {status === "loading" ? "Verifying..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
