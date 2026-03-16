import React from 'react';

function Breadcrumbs({ scopePath, onNavigate, classPrefix = 'article-structure-' }) {
    return (
        <div className={`${classPrefix}breadcrumbs`}>
            <button
                type="button"
                className={`${classPrefix}breadcrumb-link${scopePath.length === 0 ? ' current' : ''}`}
                onClick={() => onNavigate([])}
                disabled={scopePath.length === 0}
            >
                All Topics
            </button>
            {scopePath.map((segment, index) => {
                const isCurrent = index === scopePath.length - 1;
                return (
                    <React.Fragment key={`${segment}-${index}`}>
                        <span className={`${classPrefix}breadcrumb-separator`}>&gt;</span>
                        <button
                            type="button"
                            className={`${classPrefix}breadcrumb-link${isCurrent ? ' current' : ''}`}
                            onClick={() => onNavigate(scopePath.slice(0, index + 1))}
                            disabled={isCurrent}
                        >
                            {segment}
                        </button>
                    </React.Fragment>
                );
            })}
        </div>
    );
}

export default Breadcrumbs;
