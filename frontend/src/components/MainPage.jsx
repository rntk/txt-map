import React, { useCallback, useRef, useState } from "react";
import GlobalReadProgress from "./GlobalReadProgress";
import "../styles/MainPage.css";

/**
 * @typedef {Object} MenuItem
 * @property {string} title
 * @property {string} description
 * @property {string} link
 */

/**
 * @typedef {Object} ExtensionBrowser
 * @property {string} id
 * @property {string} label
 * @property {string} devUrl
 * @property {string[]} steps
 */

/**
 * @typedef {Object} CopyButtonProps
 * @property {string} text
 */

/** @type {readonly MenuItem[]} */
const menuItems = [
  {
    title: "Texts List",
    description:
      "Browse all submitted texts, their status, and available analysis results.",
    link: "/page/texts",
  },
  {
    title: "Diff",
    description:
      "Compare two documents with topic-aware matching and sentence-level links.",
    link: "/page/diff",
  },
  {
    title: "Global Topics",
    description:
      "Explore topics aggregated across all submissions and compare sources.",
    link: "/page/topics",
  },
  {
    title: "Task Control",
    description: "Monitor and manage background processing tasks and retries.",
    link: "/page/tasks",
  },
  {
    title: "LLM Cache",
    description: "Inspect and clear cached LLM responses when needed.",
    link: "/page/cache",
  },
];

/** @type {readonly string[]} */
const ACCEPTED_EXTENSIONS = [
  ".html",
  ".htm",
  ".txt",
  ".md",
  ".pdf",
  ".fb2",
  ".epub",
];
const ACCEPTED_MIME = [
  ".html",
  ".htm",
  ".txt",
  ".md",
  ".pdf",
  ".fb2",
  ".epub",
  "text/html",
  "text/plain",
  "text/markdown",
  "application/pdf",
  "application/x-fictionbook+xml",
  "application/epub+zip",
].join(",");

/**
 * @param {string} status
 * @param {string} errorMessage
 * @returns {string}
 */
function getUploadDescription(status, errorMessage) {
  if (status === "uploading") {
    return "Uploading...";
  }

  if (status === "error") {
    return errorMessage;
  }

  return "Drop a file here or click to browse. Supported: HTML, PDF, TXT, MD, FB2, EPUB.";
}

/** @type {readonly ExtensionBrowser[]} */
const EXTENSION_BROWSERS = [
  {
    id: "firefox",
    label: "Firefox",
    devUrl: "about:debugging#/runtime/this-firefox",
    steps: [
      "Open Firefox and navigate to the URL above",
      'Click "Load Temporary Add-on…"',
      "Select the manifest.json from the downloaded extension folder",
    ],
  },
  {
    id: "chrome",
    label: "Chrome / Edge",
    devUrl: "chrome://extensions/",
    steps: [
      "Open Chrome/Edge and navigate to the URL above",
      'Enable "Developer mode" (toggle in top-right)',
      'Click "Load unpacked" and select the downloaded extension folder',
    ],
  },
];

/**
 * @param {CopyButtonProps} props
 * @returns {React.JSX.Element}
 */
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (event) => {
      event.stopPropagation();
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      });
    },
    [text],
  );

  return (
    <button type="button" className="main-page-copy-btn" onClick={handleCopy}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

/**
 * @returns {React.JSX.Element}
 */
function ExtensionCard() {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("firefox");

  const activeBrowser = EXTENSION_BROWSERS.find((b) => b.id === activeTab);

  const handleCardClick = () => {
    if (!expanded) setExpanded(true);
  };

  const handleClose = (event) => {
    event.stopPropagation();
    setExpanded(false);
  };

  const handleTabClick = useCallback((event, id) => {
    event.stopPropagation();
    setActiveTab(id);
  }, []);

  const cardClassName = [
    "main-page-card",
    "main-page-card--extension",
    expanded ? "main-page-card--extension-expanded" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!expanded) {
    return (
      <button type="button" className={cardClassName} onClick={handleCardClick}>
        <span className="main-page-card__eyebrow">Install</span>
        <span className="main-page-card__title">Browser Extension</span>
        <span className="main-page-card__description">
          Add the extension to Firefox or Chrome to submit any webpage block
          directly to the API.
        </span>
      </button>
    );
  }

  return (
    <div
      className={cardClassName}
      role="region"
      aria-label="Browser Extension Install"
    >
      <div className="main-page-extension-header">
        <span className="main-page-card__eyebrow">Install</span>
        <button
          type="button"
          className="main-page-extension-close"
          onClick={handleClose}
        >
          ✕
        </button>
      </div>
      <span className="main-page-card__title">Browser Extension</span>

      <div className="main-page-extension-tabs">
        {EXTENSION_BROWSERS.map((browser) => (
          <button
            key={browser.id}
            type="button"
            className={[
              "main-page-extension-tab",
              activeTab === browser.id ? "main-page-extension-tab--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={(e) => handleTabClick(e, browser.id)}
          >
            {browser.label}
          </button>
        ))}
      </div>

      {activeBrowser && (
        <div className="main-page-extension-body">
          <p className="main-page-extension-note">
            Paste this URL in your browser address bar:
          </p>
          <div className="main-page-extension-url-row">
            <code className="main-page-extension-url">
              {activeBrowser.devUrl}
            </code>
            <CopyButton text={activeBrowser.devUrl} />
          </div>
          <ol className="main-page-extension-steps">
            {activeBrowser.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <a
            href="/api/extension/download"
            className="main-page-extension-download"
            onClick={(e) => e.stopPropagation()}
          >
            ↓ Download extension ZIP
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * @returns {React.JSX.Element}
 */
function UploadCard() {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const uploadDescription = getUploadDescription(status, errorMsg);
  const uploadCardClassName = [
    "main-page-card",
    "main-page-card--upload",
    dragging ? "main-page-card--dragging" : "",
    status === "uploading" ? "main-page-card--uploading" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const isValidFile = (file) => {
    const name = file.name || "";
    const ext = name.includes(".")
      ? `.${name.split(".").pop().toLowerCase()}`
      : "";
    return ACCEPTED_EXTENSIONS.includes(ext);
  };

  const upload = async (file) => {
    if (!isValidFile(file)) {
      setStatus("error");
      setErrorMsg(
        `Unsupported type. Allowed: ${ACCEPTED_EXTENSIONS.join(", ")}`,
      );
      return;
    }

    setStatus("uploading");
    setErrorMsg("");

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Server error ${res.status}`);
      }
      const { redirect_url } = await res.json();
      window.location.href = redirect_url;
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message || "Upload failed");
    }
  };

  const onFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      upload(file);
    }
    event.target.value = "";
  };

  const onDragOver = (event) => {
    event.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      upload(file);
    }
  };

  const onClick = () => {
    if (status !== "uploading") {
      inputRef.current?.click();
    }
  };

  return (
    <button
      type="button"
      className={uploadCardClassName}
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_MIME}
        className="main-page-upload-input"
        onChange={onFileChange}
      />
      <span className="main-page-card__eyebrow">Upload</span>
      <span className="main-page-card__title">Upload File</span>
      <span className="main-page-card__description">{uploadDescription}</span>
    </button>
  );
}

/**
 * @returns {React.JSX.Element}
 */
function UrlCard() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    if (!/^https?:\/\//i.test(trimmed)) {
      setStatus("error");
      setErrorMsg("URL must start with http:// or https://");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Server error ${res.status}`);
      }
      const { redirect_url } = await res.json();
      window.location.href = redirect_url;
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message || "Failed to fetch URL");
    }
  };

  const cardClassName = [
    "main-page-card",
    "main-page-card--url",
    status === "loading" ? "main-page-card--uploading" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cardClassName}>
      <span className="main-page-card__eyebrow">Fetch</span>
      <span className="main-page-card__title">Load from URL</span>
      <span className="main-page-card__description">
        Paste any URL to fetch and analyse the page or document (HTML, PDF).
      </span>
      <form className="main-page-url-form" onSubmit={handleSubmit}>
        <input
          className="main-page-url-input"
          type="url"
          placeholder="https://example.com/article"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (status !== "idle") {
              setStatus("idle");
              setErrorMsg("");
            }
          }}
          disabled={status === "loading"}
          aria-label="URL to fetch"
        />
        <button
          type="submit"
          className="main-page-url-submit"
          disabled={status === "loading" || !url.trim()}
        >
          {status === "loading" ? "Loading…" : "Load"}
        </button>
      </form>
      {status === "error" && (
        <span className="main-page-url-error">{errorMsg}</span>
      )}
    </div>
  );
}

function MainPage() {
  return (
    <div className="main-page">
      <div className="main-page-intro main-page-intro--split">
        <div className="main-page-intro__content">
          <span className="main-page-intro__eyebrow">Workspace</span>
          <h2 className="main-page-intro__title">Choose a workflow</h2>
          <p className="main-page-intro__description">
            Submit content for analysis or navigate to browse and manage your
            data.
          </p>
        </div>
        <GlobalReadProgress size={160} />
      </div>

      <section className="main-page-section">
        <div className="main-page-section__header">
          <span className="main-page-section__eyebrow">Tools</span>
          <h3 className="main-page-section__title">Submit Content</h3>
        </div>
        <div className="main-page-grid">
          <UploadCard />
          <UrlCard />
          <ExtensionCard />
        </div>
      </section>

      <section className="main-page-section">
        <div className="main-page-section__header">
          <span className="main-page-section__eyebrow">Navigation</span>
          <h3 className="main-page-section__title">Browse & Manage</h3>
        </div>
        <div className="main-page-grid">
          {menuItems.map((item) => (
            <a key={item.link} href={item.link} className="main-page-card">
              <span className="main-page-card__eyebrow">Open</span>
              <span className="main-page-card__title">{item.title}</span>
              <span className="main-page-card__description">
                {item.description}
              </span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

export default MainPage;
