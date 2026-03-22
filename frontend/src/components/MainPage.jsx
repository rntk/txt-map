import React, { useRef, useState } from 'react';
import GlobalReadProgress from './GlobalReadProgress';
import '../styles/MainPage.css';

const menuItems = [
  {
    title: 'Texts List',
    description: 'Browse all submitted texts, their status, and available analysis results.',
    link: '/page/texts',
  },
  {
    title: 'Diff',
    description: 'Compare two documents with topic-aware matching and sentence-level links.',
    link: '/page/diff',
  },
  {
    title: 'Global Topics',
    description: 'Explore topics aggregated across all submissions and compare sources.',
    link: '/page/topics',
  },
  {
    title: 'Task Control',
    description: 'Monitor and manage background processing tasks and retries.',
    link: '/page/tasks',
  },
  {
    title: 'LLM Cache',
    description: 'Inspect and clear cached LLM responses when needed.',
    link: '/page/cache',
  }
];

const ACCEPTED_EXTENSIONS = ['.html', '.htm', '.txt', '.md', '.pdf', '.fb2', '.epub'];
const ACCEPTED_MIME = [
  '.html', '.htm', '.txt', '.md', '.pdf', '.fb2', '.epub',
  'text/html', 'text/plain', 'text/markdown', 'application/pdf',
  'application/x-fictionbook+xml', 'application/epub+zip',
].join(',');

function getUploadDescription(status, errorMessage) {
  if (status === 'uploading') {
    return 'Uploading...';
  }

  if (status === 'error') {
    return errorMessage;
  }

  return 'Drop a file here or click to browse. Supported: HTML, PDF, TXT, MD, FB2, EPUB.';
}

function UploadCard() {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const uploadDescription = getUploadDescription(status, errorMsg);
  const uploadCardClassName = [
    'main-page-card',
    'main-page-card--upload',
    dragging ? 'main-page-card--dragging' : '',
    status === 'uploading' ? 'main-page-card--uploading' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const isValidFile = (file) => {
    const name = file.name || '';
    const ext = name.includes('.') ? `.${name.split('.').pop().toLowerCase()}` : '';
    return ACCEPTED_EXTENSIONS.includes(ext);
  };

  const upload = async (file) => {
    if (!isValidFile(file)) {
      setStatus('error');
      setErrorMsg(`Unsupported type. Allowed: ${ACCEPTED_EXTENSIONS.join(', ')}`);
      return;
    }

    setStatus('uploading');
    setErrorMsg('');

    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Server error ${res.status}`);
      }
      const { redirect_url } = await res.json();
      window.location.href = redirect_url;
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Upload failed');
    }
  };

  const onFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      upload(file);
    }
    event.target.value = '';
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
    if (status !== 'uploading') {
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

function MainPage() {
  return (
    <div className="main-page">
      <div className="main-page-intro main-page-intro--split">
        <div className="main-page-intro__content">
          <span className="main-page-intro__eyebrow">Workspace</span>
          <h2 className="main-page-intro__title">Choose a workflow</h2>
          <p className="main-page-intro__description">
            The home page keeps the original straightforward layout: quick entry points plus upload.
          </p>
        </div>
        <GlobalReadProgress size={160} />
      </div>

      <div className="main-page-grid">
        {menuItems.map((item) => (
          <a key={item.link} href={item.link} className="main-page-card">
            <span className="main-page-card__eyebrow">Open</span>
            <span className="main-page-card__title">{item.title}</span>
            <span className="main-page-card__description">{item.description}</span>
          </a>
        ))}
        <UploadCard />
      </div>
    </div>
  );
}

export default MainPage;
