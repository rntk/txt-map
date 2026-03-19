import React, { useRef, useState } from 'react';
import '../styles/MainPage.css';

const menuItems = [
    {
        title: 'Texts List',
        description: 'Browse all submitted texts, view their status, processing results, and details.',
        link: '/page/texts',
        sizeClass: 'cloud-size-1'
    },
    {
        title: 'Diff',
        description: 'Compare two documents with topic-aware semantic matching and sentence-level links.',
        link: '/page/diff',
        sizeClass: 'cloud-size-2'
    },
    {
        title: 'Global Topics',
        description: 'Explore topics aggregated across all submissions. See sentences from multiple sources grouped by topic.',
        link: '/page/topics',
        sizeClass: 'cloud-size-2'
    },
    {
        title: 'Task Control',
        description: 'Monitor and manage background processing tasks. Check status and retry failed jobs.',
        link: '/page/tasks',
        sizeClass: 'cloud-size-3'
    },
    {
        title: 'LLM Cache',
        description: 'Browse, filter, and delete cached LLM responses to save compute and speed up reprocessing.',
        link: '/page/cache',
        sizeClass: 'cloud-size-3'
    }
];

const ACCEPTED_EXTENSIONS = ['.html', '.htm', '.txt', '.md', '.pdf'];
const ACCEPTED_MIME = [
    '.html', '.htm', '.txt', '.md', '.pdf',
    'text/html', 'text/plain', 'text/markdown', 'application/pdf',
].join(',');

function UploadCard() {
    const inputRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [status, setStatus] = useState('idle'); // idle | uploading | error
    const [errorMsg, setErrorMsg] = useState('');

    const isValidFile = (file) => {
        const name = file.name || '';
        const ext = name.includes('.') ? '.' + name.split('.').pop().toLowerCase() : '';
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

    const onFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) upload(file);
        e.target.value = '';
    };

    const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
    const onDragLeave = () => setDragging(false);
    const onDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) upload(file);
    };

    const onClick = () => {
        if (status !== 'uploading') inputRef.current?.click();
    };

    return (
        <div
            className={`cloud-item cloud-upload${dragging ? ' cloud-upload--dragging' : ''}${status === 'uploading' ? ' cloud-upload--uploading' : ''}`}
            onClick={onClick}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onClick()}
            aria-label="Upload a file"
        >
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_MIME}
                style={{ display: 'none' }}
                onChange={onFileChange}
            />
            <div className="cloud-title cloud-size-2 cloud-upload__icon">
                {status === 'uploading' ? '⏳ ' : dragging ? '📂 ' : '📤 '}Upload File
            </div>
            <div className="cloud-description">
                {status === 'uploading' && 'Uploading…'}
                {status === 'error' && <span className="cloud-upload__error">{errorMsg}</span>}
                {status === 'idle' && <>Drop a file here or click to browse.<br />Supported: HTML, PDF, TXT, MD</>}
            </div>
        </div>
    );
}

function MainPage() {
    return (
        <div className="main-page">
            <div className="tag-cloud">
                {menuItems.map((item, index) => (
                    <a key={index} href={item.link} className="cloud-item">
                        <div className={`cloud-title ${item.sizeClass}`}>{item.title}</div>
                        <div className="cloud-description">{item.description}</div>
                    </a>
                ))}
                <UploadCard />
            </div>
        </div>
    );
}

export default MainPage;
