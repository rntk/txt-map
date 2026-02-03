import React from 'react';
import '../styles/MainPage.css';

const menuItems = [
    {
        title: 'Texts List',
        description: 'Browse all submitted texts, view their status, processing results, and details.',
        icon: '📚',
        link: '/page/texts'
    },
    {
        title: 'Task Control',
        description: 'Monitor and manage background processing tasks. Check status and retry failed jobs.',
        icon: '⚙️',
        link: '/page/tasks'
    },
    {
        title: 'Clustered Posts',
        description: 'View posts grouped by their semantic clusters. Discover related content automatically.',
        icon: '🧩',
        link: '/page/clustered-post'
    },
    {
        title: 'Topics Cloud',
        description: 'Explore the global topic visualization. See what themes are trending across all texts.',
        icon: '☁️',
        link: '/page/topics'
    },
    {
        title: 'Themed Posts',
        description: 'Browse posts organized by specific themes and manual categorizations.',
        icon: '🏷️',
        link: '/page/themed-post'
    }
];

function MainPage() {
    return (
        <div className="main-page">
            <div className="main-container">
                <h1 className="main-title">RSSTag Dashboard</h1>
                <div className="menu-grid">
                    {menuItems.map((item, index) => (
                        <a key={index} href={item.link} className="menu-card">
                            <div className="card-icon">{item.icon}</div>
                            <div className="card-title">{item.title}</div>
                            <div className="card-description">{item.description}</div>
                        </a>
                    ))}
                </div>
                <div className="menu-footer">
                    &copy; 2026 RSSTag System. All rights reserved.
                </div>
            </div>
        </div>
    );
}

export default MainPage;
